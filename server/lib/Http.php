<?php
/*
 * JSON request/response helpers for the API.
 */
declare(strict_types=1);

/** Thrown to send a specific error status and message to the client. */
final class ApiError extends RuntimeException
{
    public int $status;
    public string $errorCode;
    public array $fields;

    public function __construct(int $status, string $errorCode, string $message, array $fields = [])
    {
        parent::__construct($message);
        $this->status = $status;
        $this->errorCode = $errorCode;
        $this->fields = $fields;
    }
}

final class Http
{
    public static function isHttps(): bool
    {
        if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') return true;
        if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) return true;
        // Common on shared hosts behind a proxy / Cloudflare.
        return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    }

    public static function method(): string
    {
        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        // Some shared hosts block PUT/DELETE; allow POST with an override header.
        if ($method === 'POST') {
            $override = strtoupper((string) ($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? ''));
            if (in_array($override, ['PUT', 'PATCH', 'DELETE'], true)) return $override;
        }
        return $method;
    }

    public static function clientIp(): string
    {
        // REMOTE_ADDR by default: forwarded headers are client-controlled and would let attackers dodge rate limits.
        // Behind a proxy that overwrites a header itself (Vercel sets X-Real-IP), that header can be configured.
        $header = (string) Config::get('client_ip_header', '');
        $ip = $header !== '' && !empty($_SERVER[$header]) ? (string) $_SERVER[$header] : (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
        $ip = trim(explode(',', $ip)[0]);
        return substr($ip, 0, 45);
    }

    /** Decoded JSON body (objects as arrays). Empty body => []. */
    public static function jsonBody(): array
    {
        static $cache = null;
        if ($cache !== null) return $cache;
        $raw = file_get_contents('php://input', false, null, 0, 2 * 1024 * 1024 + 1);
        if ($raw === false || trim($raw) === '') return $cache = [];
        if (strlen($raw) > 2 * 1024 * 1024) throw new ApiError(413, 'too_large', 'Request is too large.');
        $data = json_decode($raw, true);
        if (!is_array($data)) throw new ApiError(400, 'bad_json', 'Request body must be a JSON object.');
        return $cache = $data;
    }

    public static function securityHeaders(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: same-origin');
        header('X-Frame-Options: DENY');
    }

    public static function send(int $status, array $payload, array $headers = []): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        foreach ($headers as $h) header($h);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    }

    public static function ok($data = null, int $status = 200): void
    {
        self::send($status, ['ok' => true, 'data' => $data]);
    }

    public static function error(ApiError $e): void
    {
        $body = ['ok' => false, 'error' => ['code' => $e->errorCode, 'message' => $e->getMessage()]];
        if ($e->fields) $body['error']['fields'] = $e->fields;
        $headers = [];
        if ($e->status === 429 && isset($e->fields['retry_after'])) $headers[] = 'Retry-After: ' . (int) $e->fields['retry_after'];
        self::send($e->status, $body, $headers);
    }
}
