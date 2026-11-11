<?php
/*
 * Records who changed what, for the dashboard's "Recent updates" list.
 */
declare(strict_types=1);

final class Activity
{
    public static function log(?int $adminId, string $action, string $entityType, ?string $entityId, string $summary): void
    {
        try {
            Db::run('INSERT INTO activity_log (admin_id, action, entity_type, entity_id, summary) VALUES (?, ?, ?, ?, ?)',
                [$adminId, substr($action, 0, 20), substr($entityType, 0, 40), $entityId === null ? null : substr($entityId, 0, 60), mb_substr($summary, 0, 255)]);
        } catch (Throwable $e) {
            error_log('activity log failed: ' . $e->getMessage()); // never block the real change
        }
    }

    public static function recent(int $limit = 10): array
    {
        return Db::all(
            'SELECT a.id, a.action, a.entity_type, a.entity_id, a.summary, a.created_at, ad.username
             FROM activity_log a LEFT JOIN admins ad ON ad.id = a.admin_id
             WHERE a.action <> \'login\' ORDER BY a.id DESC LIMIT ' . max(1, min(50, $limit))
        );
    }
}
