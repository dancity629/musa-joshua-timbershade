<?php
/*
 * One-time browser installer for hosts without SSH access.
 * Visit https://yourdomain/install.php after uploading the files and creating server/config.php.
 * It refuses to run once an admin account exists. Delete this file after installing.
 */
declare(strict_types=1);
require __DIR__ . '/server/bootstrap.php';
require __DIR__ . '/server/Installer.php';

header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');

function page(string $title, string $body): void
{
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
        . '<title>' . htmlspecialchars($title) . '</title>'
        . '<style>body{font-family:system-ui,sans-serif;background:#F5F0E6;color:#252525;margin:0;padding:2rem 1rem}main{max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:2rem;box-shadow:0 6px 20px rgba(20,51,38,.1)}h1{color:#143326;margin-top:0}button,a.btn{background:#1B4332;color:#fff;border:0;border-radius:8px;padding:.75rem 1.25rem;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}.err{color:#A12C1F}</style>'
        . '</head><body><main><h1>' . htmlspecialchars($title) . '</h1>' . $body . '</main></body></html>';
}

try {
    $config = Config::all();
} catch (Throwable $e) {
    page('Setup needed', '<p class="err">' . htmlspecialchars($e->getMessage()) . '</p>');
    exit;
}

if (!($config['allow_web_install'] ?? false)) {
    http_response_code(404);
    page('Not available', '<p>The browser installer is switched off in server/config.php.</p>');
    exit;
}

try {
    Db::pdo();
} catch (Throwable $e) {
    page('Database connection failed', '<p class="err">Check the database name, user and password in server/config.php.</p>');
    exit;
}

if (Installer::isInstalled()) {
    page('Already installed', '<p>The website is already set up. Please delete <code>install.php</code> from the server.</p><p><a class="btn" href="admin/">Go to the admin dashboard</a></p>');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $log = Installer::run();
        $items = implode('', array_map(fn ($l) => '<li>' . htmlspecialchars($l) . '</li>', $log));
        page('Installed', "<ul>$items</ul><p><strong>Next:</strong> log in with username <code>Admin</code> and password <code>Admin</code>. You will be asked to choose a new password before you can change anything.</p><p><strong>Then delete <code>install.php</code></strong> and set <code>allow_web_install</code> to <code>false</code> in server/config.php.</p><p><a class=\"btn\" href=\"admin/\">Go to the admin dashboard</a></p>");
    } catch (Throwable $e) {
        error_log('[mjt install] ' . $e->getMessage());
        page('Install failed', '<p class="err">' . htmlspecialchars(($config['debug'] ?? false) ? $e->getMessage() : 'The installer could not finish. Check that the database is empty and try again.') . '</p>');
    }
    exit;
}

page('Set up Musa Joshua Timbershade', '<p>This creates the database tables and copies the current website content (products, categories, homepage text and contact details) into the database.</p><form method="post"><button type="submit">Install now</button></form>');
