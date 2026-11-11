<?php
/*
 * REST API front controller. Every request under /api/ comes here
 * (see api/.htaccess). Routes are defined in server/Api.php.
 *
 *   GET  api/public/site        public content for the website (no login)
 *   *    api/auth/...           login, logout, session, password change
 *   *    api/<resource>[/id]    admin CRUD (login + CSRF required)
 */
declare(strict_types=1);

require dirname(__DIR__) . '/server/bootstrap.php';
require dirname(__DIR__) . '/server/Api.php';

Http::securityHeaders();

try {
    $route = $_GET['route'] ?? ($_SERVER['PATH_INFO'] ?? '');
    $route = trim((string) $route, '/');
    Api::dispatch(Http::method(), $route);
} catch (ApiError $e) {
    Http::error($e);
} catch (PDOException $e) {
    error_log('[mjt api] database error: ' . $e->getMessage());
    $debug = false;
    try { $debug = (bool) Config::get('debug', false); } catch (Throwable $ignored) {}
    // 23000 = integrity constraint (duplicate key, foreign key)
    if ($e->getCode() === '23000') {
        Http::error(new ApiError(409, 'conflict', 'This change conflicts with existing data (for example a duplicate ID or an item still in use).'));
    } else {
        Http::error(new ApiError(500, 'server_error', $debug ? $e->getMessage() : 'Something went wrong on the server. Please try again.'));
    }
} catch (Throwable $e) {
    error_log('[mjt api] ' . get_class($e) . ': ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    $debug = false;
    try { $debug = (bool) Config::get('debug', false); } catch (Throwable $ignored) {}
    Http::error(new ApiError(500, 'server_error', $debug ? $e->getMessage() : 'Something went wrong on the server. Please try again.'));
}
