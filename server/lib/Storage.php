<?php
/*
 * Vercel Blob storage for uploaded images, used when 'blob_token' is configured
 * (BLOB_READ_WRITE_TOKEN on Vercel). Serverless functions have no lasting disk,
 * so uploads go to Blob and the media row stores the file's public https URL.
 * The token stays on the server; it is never sent to the browser.
 */
declare(strict_types=1);

final class Storage
{
    private const API = 'https://vercel.com/api/blob';
    private const API_VERSION = '13';

    private static function api(): string
    {
        // Overridable only so tests can point at a local stand-in.
        return rtrim((string) (Config::get('blob_api_url', '') ?: self::API), '/');
    }

    public static function usesBlob(): bool
    {
        return (string) Config::get('blob_token', '') !== '';
    }

    /** Only URLs on Vercel's public Blob host count as files we may delete. */
    public static function isBlobUrl(string $path): bool
    {
        return (bool) preg_match('#^https://[a-z0-9-]+\.public\.blob\.vercel-storage\.com/uploads/\d{4}/\d{2}/[a-f0-9]{24}\.(jpg|png|webp)$#', $path);
    }

    /** Upload a local file; returns its public URL. */
    public static function put(string $pathname, string $localFile, string $mime): string
    {
        $body = file_get_contents($localFile);
        if ($body === false) throw new RuntimeException('Cannot read uploaded file.');
        $res = self::request('PUT', self::api() . '/?pathname=' . rawurlencode($pathname), $body, [
            'x-vercel-blob-access: public',
            'x-content-type: ' . $mime,
            'x-add-random-suffix: 0',
            'x-cache-control-max-age: 31536000',
        ]);
        $url = (string) ($res['url'] ?? '');
        if (!self::isBlobUrl($url)) throw new RuntimeException('Blob upload returned an unexpected URL.');
        return $url;
    }

    public static function delete(string $url): void
    {
        if (!self::isBlobUrl($url)) return;
        try {
            self::request('POST', self::api() . '/delete', json_encode(['urls' => [$url]]), ['content-type: application/json']);
        } catch (Throwable $e) {
            // A leftover file is harmless; never fail the admin's action over it.
            error_log('[mjt blob] delete failed: ' . $e->getMessage());
        }
    }

    private static function request(string $method, string $url, string $body, array $headers): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => array_merge([
                'authorization: Bearer ' . Config::get('blob_token'),
                'x-api-version: ' . self::API_VERSION,
            ], $headers),
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        if ($raw === false) throw new RuntimeException('Blob request failed: ' . $error);
        if ($status < 200 || $status >= 300) throw new RuntimeException("Blob request returned HTTP $status: " . substr((string) $raw, 0, 300));
        $json = json_decode((string) $raw, true);
        return is_array($json) ? $json : [];
    }
}
