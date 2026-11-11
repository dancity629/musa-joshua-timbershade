<?php
/*
 * Command-line installer: php server/cli-install.php
 * Creates the tables and copies the current website content into the database.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/Installer.php';

try {
    foreach (Installer::run() as $line) echo "- $line\n";
    echo "\nDone. Log in at /admin/ with username Admin and password Admin, then set a new password (required).\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Install failed: ' . $e->getMessage() . "\n");
    exit(1);
}
