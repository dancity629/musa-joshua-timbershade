<?php
/*
 * Admin authentication: server-side PHP sessions, password hashing,
 * login rate limiting, session expiry and CSRF tokens.
 */
declare(strict_types=1);

final class Auth
{
    public const SESSION_NAME = 'mjt_admin';
    public const MIN_PASSWORD_LENGTH = 10;

    /** Start (or resume) the admin session with hardened cookie settings. */
    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) return;
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_trans_sid', '0');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.sid_length', '48');
        ini_set('session.sid_bits_per_character', '6');
        ini_set('session.gc_maxlifetime', (string) max(1800, (int) Config::get('session_absolute_seconds', 28800)));
        session_name(self::SESSION_NAME);
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => Http::isHttps(),
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_start();
    }

    /** The logged-in admin row, or null. Enforces idle and absolute timeouts. */
    public static function current(): ?array
    {
        self::startSession();
        $id = $_SESSION['admin_id'] ?? null;
        if (!$id) return null;

        $now = time();
        $idle = (int) Config::get('session_idle_seconds', 1800);
        $absolute = (int) Config::get('session_absolute_seconds', 28800);
        if ($now - (int) ($_SESSION['last_seen'] ?? 0) > $idle || $now - (int) ($_SESSION['started'] ?? 0) > $absolute) {
            self::destroy();
            return null;
        }
        $admin = Db::one('SELECT id, username, must_change_password, last_login_at, password_changed_at FROM admins WHERE id = ?', [$id]);
        if (!$admin) { self::destroy(); return null; }
        // A password change elsewhere invalidates older sessions.
        if ((string) ($admin['password_changed_at'] ?? '') !== (string) ($_SESSION['pw_changed'] ?? '')) {
            self::destroy();
            return null;
        }
        $_SESSION['last_seen'] = $now;
        $admin['must_change_password'] = (bool) $admin['must_change_password'];
        return $admin;
    }

    /**
     * Require a logged-in admin for an API call. Unless $allowPending, an admin
     * who still has the default password cannot do anything else.
     */
    public static function requireAdmin(bool $allowPending = false): array
    {
        $admin = self::current();
        if (!$admin) throw new ApiError(401, 'unauthenticated', 'Your session has ended. Please log in again.');
        if (!$allowPending && $admin['must_change_password']) {
            throw new ApiError(403, 'password_change_required', 'Please change the default password before making changes.');
        }
        return $admin;
    }

    public static function csrfToken(): string
    {
        self::startSession();
        if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
        return $_SESSION['csrf'];
    }

    /** Every state-changing request must send the session's token in X-CSRF-Token. */
    public static function requireCsrf(): void
    {
        self::startSession();
        $sent = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf'] ?? ''));
        $expected = (string) ($_SESSION['csrf'] ?? '');
        if ($expected === '' || $sent === '' || !hash_equals($expected, $sent)) {
            throw new ApiError(403, 'csrf', 'Security check failed. Please reload the page and try again.');
        }
    }

    /* ---------- Login ---------- */

    private static function lockSeconds(string $ip, string $username): int
    {
        $window = (int) Config::get('login_window_seconds', 900);
        $maxPair = (int) Config::get('login_max_attempts', 5);
        $maxIp = (int) Config::get('login_max_attempts_per_ip', 20);

        $pair = Db::one(
            'SELECT COUNT(*) AS n, MIN(attempted_at) AS first_at FROM login_attempts
             WHERE success = 0 AND ip_address = ? AND username = ? AND attempted_at > (NOW() - INTERVAL ? SECOND)',
            [$ip, $username, $window]
        );
        $byIp = Db::one(
            'SELECT COUNT(*) AS n, MIN(attempted_at) AS first_at FROM login_attempts
             WHERE success = 0 AND ip_address = ? AND attempted_at > (NOW() - INTERVAL ? SECOND)',
            [$ip, $window]
        );
        $wait = 0;
        foreach ([[$pair, $maxPair], [$byIp, $maxIp]] as [$row, $max]) {
            if ((int) $row['n'] >= $max) {
                $elapsed = (int) Db::value('SELECT TIMESTAMPDIFF(SECOND, ?, NOW())', [$row['first_at']]);
                $wait = max($wait, $window - $elapsed);
            }
        }
        return max(0, $wait);
    }

    public static function login(string $username, string $password): array
    {
        $ip = Http::clientIp();
        $usernameKey = mb_strtolower(mb_substr(trim($username), 0, 60));

        $wait = self::lockSeconds($ip, $usernameKey);
        if ($wait > 0) {
            $minutes = (int) ceil($wait / 60);
            throw new ApiError(429, 'locked', "Too many failed attempts. Please wait $minutes minute(s) and try again.", ['retry_after' => $wait]);
        }

        $admin = Db::one('SELECT id, username, password_hash, must_change_password, password_changed_at FROM admins WHERE LOWER(username) = ?', [$usernameKey]);
        // Verify against a dummy hash when the user does not exist so timing does not reveal valid usernames.
        $hash = $admin['password_hash'] ?? '$2y$10$PdIRodiZZMDznTOM45CFjOIPEFrpRHATU285C880aIRhRPY0rO0gG';
        $valid = password_verify($password, $hash) && $admin !== null;

        Db::run('INSERT INTO login_attempts (ip_address, username, success) VALUES (?, ?, ?)', [$ip, $usernameKey, $valid ? 1 : 0]);
        // Keep the attempts table small.
        if (random_int(1, 50) === 1) Db::run('DELETE FROM login_attempts WHERE attempted_at < (NOW() - INTERVAL 30 DAY)');

        if (!$valid) {
            throw new ApiError(401, 'invalid_credentials', 'Incorrect username or password.');
        }

        if (password_needs_rehash($admin['password_hash'], PASSWORD_DEFAULT)) {
            Db::run('UPDATE admins SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $admin['id']]);
        }
        Db::run('DELETE FROM login_attempts WHERE success = 0 AND ip_address = ? AND username = ?', [$ip, $usernameKey]);
        Db::run('UPDATE admins SET last_login_at = NOW() WHERE id = ?', [$admin['id']]);

        self::startSession();
        session_regenerate_id(true); // prevent session fixation
        $_SESSION = [
            'admin_id' => (int) $admin['id'],
            'started' => time(),
            'last_seen' => time(),
            'pw_changed' => (string) ($admin['password_changed_at'] ?? ''),
            'csrf' => bin2hex(random_bytes(32)),
        ];
        Activity::log((int) $admin['id'], 'login', 'session', null, 'Logged in');
        return self::current() ?? [];
    }

    public static function destroy(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) self::startSession();
        $_SESSION = [];
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 3600, 'path' => $params['path'], 'secure' => $params['secure'],
            'httponly' => true, 'samesite' => 'Strict',
        ]);
        session_destroy();
    }

    /** Returns an error message, or null when the new password is acceptable. */
    public static function passwordProblem(string $new, string $username): ?string
    {
        if (mb_strlen($new) < self::MIN_PASSWORD_LENGTH) return 'Use at least ' . self::MIN_PASSWORD_LENGTH . ' characters.';
        if (mb_strlen($new) > 200) return 'Use 200 characters or fewer.';
        $lower = mb_strtolower($new);
        if (in_array($lower, ['admin', 'password', 'password123', 'admin12345', '1234567890', 'timbershade'], true)) return 'This password is too common.';
        if ($lower === mb_strtolower($username)) return 'The password cannot be the same as the username.';
        if (preg_match('/^(.)\1+$/u', $new)) return 'Do not repeat one character.';
        return null;
    }

    public static function changePassword(array $admin, string $current, string $new, string $confirm): void
    {
        $row = Db::one('SELECT password_hash FROM admins WHERE id = ?', [$admin['id']]);
        $errors = [];
        if (!$row || !password_verify($current, $row['password_hash'])) $errors['current_password'] = 'Current password is incorrect.';
        if ($problem = self::passwordProblem($new, $admin['username'])) $errors['new_password'] = $problem;
        elseif ($row && password_verify($new, $row['password_hash'])) $errors['new_password'] = 'Choose a password different from the current one.';
        if ($new !== $confirm) $errors['confirm_password'] = 'The two new passwords do not match.';
        if ($errors) throw new ApiError(422, 'validation', 'Please correct the highlighted fields.', $errors);

        Db::run('UPDATE admins SET password_hash = ?, must_change_password = 0, password_changed_at = NOW() WHERE id = ?',
            [password_hash($new, PASSWORD_DEFAULT), $admin['id']]);
        $changedAt = (string) Db::value('SELECT password_changed_at FROM admins WHERE id = ?', [$admin['id']]);
        session_regenerate_id(true);
        $_SESSION['pw_changed'] = $changedAt;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        Activity::log((int) $admin['id'], 'update', 'account', (string) $admin['id'], 'Changed the admin password');
    }
}
