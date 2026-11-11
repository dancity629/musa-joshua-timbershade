<?php
/*
 * Input validation. Each reader trims, checks and returns a clean value,
 * collecting field errors so the dashboard can show them next to the inputs.
 * Text is stored as plain text; the public site always inserts it with
 * textContent, so no HTML is ever interpreted.
 */
declare(strict_types=1);

final class Input
{
    private array $data;
    private array $errors = [];

    public function __construct(array $data)
    {
        $this->data = $data;
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->data);
    }

    public function raw(string $key)
    {
        return $this->data[$key] ?? null;
    }

    public function fail(string $key, string $message): void
    {
        if (!isset($this->errors[$key])) $this->errors[$key] = $message;
    }

    /** Throws a 422 with all collected field errors, if any. */
    public function check(): void
    {
        if ($this->errors) {
            throw new ApiError(422, 'validation', 'Please correct the highlighted fields.', $this->errors);
        }
    }

    public static function cleanText($value, int $max, bool $multiline = false): string
    {
        $s = is_scalar($value) ? (string) $value : '';
        if (!mb_check_encoding($s, 'UTF-8')) $s = mb_convert_encoding($s, 'UTF-8', 'UTF-8');
        // Strip control characters (keep newlines/tabs in multi-line text).
        $s = preg_replace($multiline ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u' : '/[\x00-\x1F\x7F]/u', '', $s) ?? '';
        $s = str_replace("\r\n", "\n", $s);
        $s = trim($s);
        if (mb_strlen($s) > $max) $s = mb_substr($s, 0, $max);
        return $s;
    }

    public function str(string $key, int $max, bool $required = false, string $label = 'This field', bool $multiline = false): string
    {
        $raw = $this->data[$key] ?? '';
        if (!is_scalar($raw) && $raw !== null) { $this->fail($key, "$label must be text."); return ''; }
        $original = trim((string) $raw);
        if (mb_strlen($original) > $max) $this->fail($key, "$label must be $max characters or fewer.");
        $s = self::cleanText($raw, $max, $multiline);
        if ($required && $s === '') $this->fail($key, "$label is required.");
        return $s;
    }

    public function bool(string $key, bool $default = false): bool
    {
        if (!array_key_exists($key, $this->data)) return $default;
        $v = $this->data[$key];
        return $v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 'on';
    }

    /** Integer or null when empty. */
    public function intOrNull(string $key, int $min, int $max, string $label = 'This field'): ?int
    {
        $v = $this->data[$key] ?? null;
        if ($v === null || $v === '') return null;
        if (is_int($v) || (is_string($v) && preg_match('/^-?\d+$/', trim($v)))) {
            $n = (int) $v;
            if ($n < $min || $n > $max) { $this->fail($key, "$label must be between $min and $max."); return null; }
            return $n;
        }
        if (is_float($v) && floor($v) === $v) return $this->intOrNull($key, $min, $max, $label);
        $this->fail($key, "$label must be a whole number.");
        return null;
    }

    public function int(string $key, int $min, int $max, int $default, string $label = 'This field'): int
    {
        $n = $this->intOrNull($key, $min, $max, $label);
        return $n ?? $default;
    }

    /** Money in naira, up to 2 decimals. Accepts "12,500" or 12500.5. */
    public function money(string $key, string $label = 'Price'): ?string
    {
        $v = $this->data[$key] ?? null;
        if ($v === null || $v === '') return null;
        $s = is_scalar($v) ? str_replace([',', ' ', '₦'], '', (string) $v) : '';
        if (!preg_match('/^\d{1,10}(\.\d{1,2})?$/', $s)) {
            $this->fail($key, "$label must be an amount in naira, e.g. 12500 or 12500.50.");
            return null;
        }
        return number_format((float) $s, 2, '.', '');
    }

    /** One of a fixed list of values. */
    public function oneOf(string $key, array $allowed, string $default): string
    {
        $v = $this->data[$key] ?? $default;
        if (!is_string($v) || !in_array($v, $allowed, true)) {
            if (array_key_exists($key, $this->data)) $this->fail($key, 'Please choose a valid option.');
            return $default;
        }
        return $v;
    }

    /**
     * A link the public site can use: a relative page (products.html, #section,
     * products.html?category=nails), an https/http URL, mailto: or tel:.
     * javascript:, data: and other schemes are rejected.
     */
    public function link(string $key, int $max = 500, bool $required = false, string $label = 'Link'): string
    {
        $s = $this->str($key, $max, $required, $label);
        if ($s === '') return '';
        if (!self::isSafeLink($s)) {
            $this->fail($key, "$label must be a page on this site (e.g. products.html) or a full https:// address.");
            return '';
        }
        return $s;
    }

    public static function isSafeLink(string $s): bool
    {
        if (preg_match('/[\s<>"\'`]/', $s)) return false;
        if (preg_match('/^(https?:\/\/)[^\s\/$.?#].[^\s]*$/i', $s)) return true;
        if (preg_match('/^(mailto|tel):[^\s]+$/i', $s)) return true;
        if (preg_match('/^[a-z][a-z0-9+.-]*:/i', $s)) return false; // any other scheme
        if (str_starts_with($s, '//')) return false;
        return (bool) preg_match('/^[a-zA-Z0-9._\-\/#?=&%+]+$/', $s);
    }

    public function httpsUrl(string $key, int $max = 500, string $label = 'Address'): string
    {
        $s = $this->str($key, $max, false, $label);
        if ($s === '') return '';
        if (!preg_match('/^https?:\/\/[^\s<>"\'`]+$/i', $s) || filter_var($s, FILTER_VALIDATE_URL) === false) {
            $this->fail($key, "$label must be a full web address starting with https://.");
            return '';
        }
        return $s;
    }

    public function email(string $key, string $label = 'Email'): string
    {
        $s = $this->str($key, 150, false, $label);
        if ($s !== '' && filter_var($s, FILTER_VALIDATE_EMAIL) === false) {
            $this->fail($key, "$label is not a valid email address.");
            return '';
        }
        return $s;
    }

    /** Phone in international format; returns digits only (e.g. 2348024694963). */
    public function phoneDigits(string $key, bool $required = false, string $label = 'Phone number'): string
    {
        $s = $this->str($key, 30, $required, $label);
        if ($s === '') return '';
        $digits = preg_replace('/\D+/', '', $s) ?? '';
        if (str_starts_with($digits, '0') && strlen($digits) === 11) $digits = '234' . substr($digits, 1); // 0802... => 234802...
        if (strlen($digits) < 8 || strlen($digits) > 15) {
            $this->fail($key, "$label must be in international format, e.g. +234 802 469 4963.");
            return '';
        }
        return $digits;
    }

    public function hexColor(string $key, string $default, string $label = 'Colour'): string
    {
        $s = $this->str($key, 7, false, $label);
        if ($s === '') return $default;
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $s)) {
            $this->fail($key, "$label must be a colour like #1B4332.");
            return $default;
        }
        return strtoupper($s);
    }

    /** Media library ID that must exist, or null. */
    public function mediaId(string $key, string $label = 'Image'): ?int
    {
        $v = $this->data[$key] ?? null;
        if ($v === null || $v === '' || $v === 0 || $v === '0') return null;
        if (!(is_int($v) || (is_string($v) && ctype_digit($v)))) { $this->fail($key, "$label is not valid."); return null; }
        $id = (int) $v;
        if (!Db::value('SELECT 1 FROM media_library WHERE id = ?', [$id])) {
            $this->fail($key, "$label no longer exists in the Media Library.");
            return null;
        }
        return $id;
    }

    /** List of existing media IDs (order kept, duplicates removed). */
    public function mediaIds(string $key, int $maxItems = 12, string $label = 'Images'): array
    {
        $v = $this->data[$key] ?? [];
        if (!is_array($v)) { $this->fail($key, "$label must be a list."); return []; }
        $ids = [];
        foreach ($v as $item) {
            if (!(is_int($item) || (is_string($item) && ctype_digit($item)))) continue;
            $ids[(int) $item] = true;
        }
        $ids = array_keys($ids);
        if (count($ids) > $maxItems) { $this->fail($key, "$label: at most $maxItems images."); return []; }
        if (!$ids) return [];
        $in = implode(',', array_fill(0, count($ids), '?'));
        $found = array_map('intval', array_column(Db::all("SELECT id FROM media_library WHERE id IN ($in)", $ids), 'id'));
        return array_values(array_filter($ids, fn ($id) => in_array($id, $found, true)));
    }

    /** List of short strings (e.g. paragraphs, bullet points). */
    public function strList(string $key, int $maxItems, int $maxLen, string $label = 'List'): array
    {
        $v = $this->data[$key] ?? [];
        if (!is_array($v)) { $this->fail($key, "$label must be a list."); return []; }
        $out = [];
        foreach ($v as $item) {
            $s = self::cleanText($item, $maxLen, true);
            if ($s !== '') $out[] = $s;
        }
        if (count($out) > $maxItems) { $this->fail($key, "$label: at most $maxItems items."); $out = array_slice($out, 0, $maxItems); }
        return $out;
    }

    /** List of objects, each validated by $fn(Input $item): array. */
    public function objList(string $key, int $maxItems, callable $fn, string $label = 'Items'): array
    {
        $v = $this->data[$key] ?? [];
        if (!is_array($v)) { $this->fail($key, "$label must be a list."); return []; }
        if (count($v) > $maxItems) { $this->fail($key, "$label: at most $maxItems items."); $v = array_slice($v, 0, $maxItems); }
        $out = [];
        foreach (array_values($v) as $i => $item) {
            $sub = new Input(is_array($item) ? $item : []);
            $clean = $fn($sub);
            foreach ($sub->errors as $f => $msg) $this->fail("$key.$i.$f", $msg);
            if ($clean !== null) $out[] = $clean;
        }
        return $out;
    }
}

function slugify(string $text, int $max = 60): string
{
    $s = strtolower(trim($text));
    $s = str_replace(['"', '″', '“', '”', "'"], ['in', 'in', '', '', ''], $s);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
    $s = trim($s, '-');
    if (strlen($s) > $max) $s = rtrim(substr($s, 0, $max), '-');
    return $s;
}
