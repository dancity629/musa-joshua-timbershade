<?php
/*
 * Stores admin sessions in the database instead of files.
 *
 * On serverless hosting (Vercel) each request can run on a different machine,
 * so file sessions would log the admin out at random. The database is shared,
 * so this works everywhere, including normal shared hosting.
 */
declare(strict_types=1);

final class DbSessionHandler implements SessionHandlerInterface, SessionUpdateTimestampHandlerInterface
{
    public function open(string $path, string $name): bool { return true; }

    public function close(): bool { return true; }

    public function read(string $id): string|false
    {
        $row = Db::one('SELECT data FROM admin_sessions WHERE id = ?', [hash('sha256', $id)]);
        return $row ? (string) $row['data'] : '';
    }

    public function write(string $id, string $data): bool
    {
        // Session IDs are stored hashed, so a database leak does not hand out live sessions.
        Db::run('INSERT INTO admin_sessions (id, data, updated_at) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)',
            [hash('sha256', $id), $data, time()]);
        return true;
    }

    public function destroy(string $id): bool
    {
        Db::run('DELETE FROM admin_sessions WHERE id = ?', [hash('sha256', $id)]);
        return true;
    }

    public function gc(int $max_lifetime): int|false
    {
        return Db::run('DELETE FROM admin_sessions WHERE updated_at < ?', [time() - $max_lifetime])->rowCount();
    }

    public function validateId(string $id): bool
    {
        // Strict mode: only accept IDs this server issued.
        return (bool) Db::value('SELECT 1 FROM admin_sessions WHERE id = ?', [hash('sha256', $id)]);
    }

    public function updateTimestamp(string $id, string $data): bool
    {
        return $this->write($id, $data);
    }
}
