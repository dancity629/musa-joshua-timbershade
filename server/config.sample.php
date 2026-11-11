<?php
/*
 * Copy this file to server/config.php and fill in your hosting details.
 * server/config.php is ignored by git and blocked from the web by server/.htaccess.
 *
 * For extra safety you can keep the real config outside public_html and point to it
 * with the MJT_CONFIG environment variable (e.g. in .htaccess: SetEnv MJT_CONFIG /home/you/mjt-config.php).
 */
return [
    'db' => [
        'host'    => 'localhost',
        'port'    => 3306,
        'name'    => 'your_database_name',
        'user'    => 'your_database_user',
        'pass'    => 'your_database_password',
    ],

    // Show detailed errors. Keep false on the live site.
    'debug' => false,

    // Admin sessions: log out after this many seconds without activity, and after this many seconds in total.
    'session_idle_seconds'     => 1800,   // 30 minutes
    'session_absolute_seconds' => 28800,  // 8 hours

    // Login rate limiting: this many failed attempts within the window locks that IP + username.
    'login_max_attempts'   => 5,
    'login_window_seconds' => 900,        // 15 minutes
    // Failed attempts from one IP (any username) before that IP is locked for the window.
    'login_max_attempts_per_ip' => 20,

    // Largest image upload, in bytes. Shared hosts often cap uploads at 8 MB (upload_max_filesize).
    'upload_max_bytes' => 5 * 1024 * 1024,

    // Only needed if the public pages are served from a different site than this API
    // (e.g. GitHub Pages). Lists origins allowed to read the public content endpoint.
    // Example: ['https://dancity629.github.io']
    'public_cors_origins' => [],

    // Allow the browser installer (install.php) to run. It refuses to run once an admin exists.
    'allow_web_install' => true,
];
