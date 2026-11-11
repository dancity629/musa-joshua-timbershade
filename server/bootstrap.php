<?php
/*
 * Loads configuration and the small library every PHP entry point uses.
 * Entry points: api/index.php, admin/index.php, admin/login.php, install.php.
 */
declare(strict_types=1);

define('MJT_ROOT', dirname(__DIR__));
define('MJT_SERVER', __DIR__);

require_once __DIR__ . '/lib/Http.php';
require_once __DIR__ . '/lib/Db.php';
require_once __DIR__ . '/lib/Validate.php';
require_once __DIR__ . '/lib/Auth.php';
require_once __DIR__ . '/lib/Media.php';
require_once __DIR__ . '/lib/Content.php';
require_once __DIR__ . '/lib/Activity.php';

final class Config
{
    private static ?array $data = null;

    public static function all(): array
    {
        if (self::$data === null) {
            $path = getenv('MJT_CONFIG') ?: (MJT_SERVER . '/config.php');
            if (!is_file($path)) {
                throw new RuntimeException('Configuration missing: copy server/config.sample.php to server/config.php.');
            }
            $loaded = require $path;
            if (!is_array($loaded)) {
                throw new RuntimeException('server/config.php must return an array.');
            }
            self::$data = $loaded;
        }
        return self::$data;
    }

    public static function get(string $key, $default = null)
    {
        $all = self::all();
        return array_key_exists($key, $all) ? $all[$key] : $default;
    }
}

ini_set('display_errors', '0');
error_reporting(E_ALL);
date_default_timezone_set('Africa/Lagos');
