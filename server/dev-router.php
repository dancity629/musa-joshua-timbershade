<?php
/*
 * Router for PHP's built-in server, for local testing only:
 *   php -S localhost:8000 server/dev-router.php
 * Mirrors the .htaccess rules used on Apache hosts.
 */
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$root = dirname(__DIR__);

if (preg_match('#^/server(/|$)#', $path) || preg_match('#^/uploads/.*\.(php\d?|phtml|phar)$#i', $path)) {
    http_response_code(403);
    echo 'Forbidden';
    return true;
}
if (preg_match('#^/api(/.*)?$#', $path, $m)) {
    if (($m[1] ?? '') !== '/index.php') $_GET['route'] = ltrim($m[1] ?? '', '/');
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require $root . '/api/index.php';
    return true;
}
if ($path === '/admin' ) { header('Location: /admin/'); return true; }
if ($path === '/admin/') {
    $_SERVER['SCRIPT_NAME'] = '/admin/index.php';
    require $root . '/admin/index.php';
    return true;
}
return false; // serve static files as-is
