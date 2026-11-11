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
require_once __DIR__ . '/lib/Session.php';
require_once __DIR__ . '/lib/Storage.php';

final class Config
{
    private static ?array $data = null;

    public static function all(): array
    {
        if (self::$data === null) {
            $path = getenv('MJT_CONFIG') ?: (MJT_SERVER . '/config.php');
            if (!is_file($path) && self::env('DB_HOST') !== null) {
                // Serverless hosting (e.g. Vercel): settings come from environment variables.
                return self::$data = self::fromEnv();
            }
            if (!is_file($path)) {
                throw new RuntimeException('Configuration missing: copy server/config.sample.php to server/config.php, or set the DB_* environment variables.');
            }
            $loaded = require $path;
            if (!is_array($loaded)) {
                throw new RuntimeException('server/config.php must return an array.');
            }
            self::$data = $loaded;
        }
        return self::$data;
    }

    private static function env(string $key): ?string
    {
        $v = getenv($key);
        if ($v === false) $v = $_ENV[$key] ?? $_SERVER[$key] ?? null;
        return $v === null || $v === '' ? null : (string) $v;
    }

    /** Configuration from environment variables (see docs/VERCEL.md). */
    private static function fromEnv(): array
    {
        $defaults = require MJT_SERVER . '/config.sample.php';
        $bool = fn (?string $v, bool $d) => $v === null ? $d : in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
        return array_merge($defaults, [
            'db' => [
                'host' => self::env('DB_HOST'),
                'port' => (int) (self::env('DB_PORT') ?? 3306),
                'name' => self::env('DB_NAME') ?? '',
                'user' => self::env('DB_USER') ?? '',
                'pass' => self::env('DB_PASSWORD') ?? '',
                // Cloud MySQL providers require encrypted connections.
                'ssl' => $bool(self::env('DB_SSL'), true),
                'ssl_ca' => self::env('DB_SSL_CA'),
            ],
            'debug' => $bool(self::env('APP_DEBUG'), false),
            'install_token' => self::env('INSTALL_TOKEN') ?? '',
            // Without a token the browser installer stays off on serverless hosting.
            'allow_web_install' => self::env('INSTALL_TOKEN') !== null,
            'blob_token' => self::env('BLOB_READ_WRITE_TOKEN') ?? '',
            'blob_api_url' => self::env('BLOB_API_URL') ?? '',
            'public_base_url' => self::env('PUBLIC_BASE_URL') ?? '',
            'upload_max_bytes' => (int) (self::env('UPLOAD_MAX_BYTES') ?? 4 * 1024 * 1024),
            // Vercel's edge sets X-Real-IP to the visitor's address and does not let clients override it.
            'client_ip_header' => self::env('VERCEL') !== null ? 'HTTP_X_REAL_IP' : (self::env('CLIENT_IP_HEADER') ?? ''),
        ]);
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
