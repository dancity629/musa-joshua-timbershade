<?php
/*
 * Media Library: validated image uploads stored on the server under uploads/,
 * with one database row per image so any section can reuse it by ID.
 */
declare(strict_types=1);

final class Media
{
    public const ALLOWED = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];
    public const MAX_DIMENSION = 8000;

    /** Root-relative URL prefix of the site, e.g. '' or '/shop'. */
    public static function basePath(): string
    {
        $configured = (string) Config::get('public_base_url', '');
        if ($configured !== '') return rtrim($configured, '/');
        $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
        // Entry points live one folder below the site root (api/, admin/) or at the root (install.php).
        $dir = dirname($script);
        if (preg_match('#/(api|admin)$#', $dir)) $dir = dirname($dir);
        $dir = rtrim($dir, '/');
        return $dir === '.' ? '' : $dir;
    }

    public static function url(?string $path): ?string
    {
        if ($path === null || $path === '') return null;
        if (str_starts_with($path, 'https://')) return $path; // stored on Vercel Blob
        return self::basePath() . '/' . ltrim($path, '/');
    }

    public static function toArray(?array $row): ?array
    {
        if (!$row) return null;
        return [
            'id' => (int) $row['id'],
            'url' => self::url($row['file_path']),
            'path' => $row['file_path'],
            'title' => $row['title'],
            'alt' => $row['alt_text'],
            'original_name' => $row['original_name'],
            'mime' => $row['mime_type'],
            'size' => (int) $row['size_bytes'],
            'width' => $row['width'] === null ? null : (int) $row['width'],
            'height' => $row['height'] === null ? null : (int) $row['height'],
            'builtin' => (bool) $row['is_builtin'],
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }

    public static function find(int $id): ?array
    {
        return Db::one('SELECT * FROM media_library WHERE id = ?', [$id]);
    }

    /** Map of id => media array for a set of IDs (one query). */
    public static function many(array $ids): array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        if (!$ids) return [];
        $in = implode(',', array_fill(0, count($ids), '?'));
        $out = [];
        foreach (Db::all("SELECT * FROM media_library WHERE id IN ($in)", $ids) as $row) $out[(int) $row['id']] = self::toArray($row);
        return $out;
    }

    /**
     * Validate an uploaded file from $_FILES and move it into uploads/YYYY/MM/.
     * Returns [relativePath, mime, size, width, height, originalName].
     */
    public static function storeUpload(array $file): array
    {
        $err = $file['error'] ?? UPLOAD_ERR_NO_FILE;
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) throw new ApiError(413, 'too_large', 'The image is larger than the server allows.');
        if ($err === UPLOAD_ERR_NO_FILE) throw new ApiError(422, 'no_file', 'Please choose an image to upload.');
        if ($err !== UPLOAD_ERR_OK || !is_uploaded_file((string) ($file['tmp_name'] ?? ''))) throw new ApiError(400, 'upload_failed', 'The upload did not complete. Please try again.');

        $max = (int) Config::get('upload_max_bytes', 5 * 1024 * 1024);
        $size = (int) filesize($file['tmp_name']);
        if ($size <= 0) throw new ApiError(422, 'empty', 'The file is empty.');
        if ($size > $max) throw new ApiError(413, 'too_large', sprintf('Images must be %s MB or smaller.', round($max / 1048576, 1)));

        // Trust the file's actual bytes, never the browser-supplied type or name.
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string) $finfo->file($file['tmp_name']);
        if (!isset(self::ALLOWED[$mime])) throw new ApiError(415, 'bad_type', 'Only JPG, JPEG, PNG and WebP images are allowed.');
        $info = @getimagesize($file['tmp_name']);
        if ($info === false || ($info['mime'] ?? '') !== $mime) throw new ApiError(415, 'bad_image', 'This file is not a valid image.');
        [$w, $h] = [(int) $info[0], (int) $info[1]];
        if ($w < 1 || $h < 1 || $w > self::MAX_DIMENSION || $h > self::MAX_DIMENSION) {
            throw new ApiError(422, 'bad_dimensions', 'Images must be at most ' . self::MAX_DIMENSION . ' pixels wide and tall.');
        }

        $sub = 'uploads/' . date('Y') . '/' . date('m');
        $original = Input::cleanText(basename((string) ($file['name'] ?? 'image')), 200);
        if (Storage::usesBlob()) {
            $name = bin2hex(random_bytes(12)) . '.' . self::ALLOWED[$mime];
            return [Storage::put($sub . '/' . $name, $file['tmp_name'], $mime), $mime, $size, $w, $h, $original];
        }
        $dir = MJT_ROOT . '/' . $sub;
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) throw new RuntimeException('Cannot create upload folder ' . $sub);
        $name = bin2hex(random_bytes(12)) . '.' . self::ALLOWED[$mime];
        $target = $dir . '/' . $name;
        if (!move_uploaded_file($file['tmp_name'], $target)) throw new RuntimeException('Cannot save uploaded file.');
        @chmod($target, 0644);
        return [$sub . '/' . $name, $mime, $size, $w, $h, $original];
    }

    public static function titleFromFilename(string $name): string
    {
        $base = pathinfo($name, PATHINFO_FILENAME);
        $base = trim(preg_replace('/[_\-]+/', ' ', $base) ?? '');
        return $base !== '' ? mb_substr($base, 0, 150) : 'Image';
    }

    /** Delete a stored file, but only one we uploaded (never the built-in assets). */
    public static function deleteFile(string $path): void
    {
        if (Storage::isBlobUrl($path)) { Storage::delete($path); return; }
        if (!preg_match('#^uploads/\d{4}/\d{2}/[a-f0-9]{24}\.(jpg|png|webp)$#', $path)) return;
        $full = MJT_ROOT . '/' . $path;
        if (is_file($full)) @unlink($full);
    }

    /** Where an image is used, as readable labels (for warnings before deleting). */
    public static function usage(int $id): array
    {
        $uses = [];
        foreach (Db::all('SELECT name FROM products WHERE image_id = ?', [$id]) as $r) $uses[] = 'Product: ' . $r['name'] . ' (main image)';
        foreach (Db::all('SELECT p.name FROM product_images pi JOIN products p ON p.id = pi.product_id WHERE pi.media_id = ?', [$id]) as $r) $uses[] = 'Product: ' . $r['name'] . ' (gallery)';
        foreach (Db::all('SELECT name FROM categories WHERE image_id = ?', [$id]) as $r) $uses[] = 'Category: ' . $r['name'];
        foreach (Db::all('SELECT customer_name FROM testimonials WHERE image_id = ?', [$id]) as $r) $uses[] = 'Testimonial: ' . $r['customer_name'];
        foreach (Content::settingMediaKeys() as $key => $label) {
            if ((int) (Content::setting($key) ?? 0) === $id) $uses[] = 'Branding: ' . $label;
        }
        foreach (Db::all('SELECT section_key, content FROM homepage_sections') as $r) {
            if (in_array($id, Content::mediaIdsIn(json_decode($r['content'], true) ?: []), true)) $uses[] = 'Homepage: ' . Content::sectionLabel($r['section_key']);
        }
        foreach (Db::all('SELECT slug, content FROM pages') as $r) {
            if (in_array($id, Content::mediaIdsIn(json_decode($r['content'], true) ?: []), true)) $uses[] = ucfirst($r['slug']) . ' page';
        }
        return $uses;
    }
}
