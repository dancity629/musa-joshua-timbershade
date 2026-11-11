<?php
/*
 * API routes and handlers.
 *
 * Security model:
 *   - public/site is the only endpoint that works without logging in, and it is read-only.
 *   - Every other endpoint calls Auth::requireAdmin() on the server.
 *   - Every request that changes data also calls Auth::requireCsrf().
 *   - Until the default password is changed, only auth endpoints work.
 */
declare(strict_types=1);

final class Api
{
    public static function dispatch(string $method, string $route): void
    {
        $routes = [
            ['GET', 'public/site', [self::class, 'publicSite']],

            ['GET', 'auth/me', [self::class, 'me']],
            ['POST', 'auth/login', [self::class, 'login']],
            ['POST', 'auth/logout', [self::class, 'logout']],
            ['POST', 'auth/password', [self::class, 'changePassword']],

            ['GET', 'dashboard', [self::class, 'dashboard']],

            ['GET', 'products', [Products::class, 'list']],
            ['POST', 'products', [Products::class, 'create']],
            ['POST', 'products/reorder', [Products::class, 'reorder']],
            ['PUT', 'products/featured', [Products::class, 'setFeatured']],
            ['GET', 'products/(\d+)', [Products::class, 'get']],
            ['PUT', 'products/(\d+)', [Products::class, 'update']],
            ['DELETE', 'products/(\d+)', [Products::class, 'delete']],

            ['GET', 'categories', [Categories::class, 'list']],
            ['POST', 'categories', [Categories::class, 'create']],
            ['POST', 'categories/reorder', [Categories::class, 'reorder']],
            ['PUT', 'categories/(\d+)', [Categories::class, 'update']],
            ['DELETE', 'categories/(\d+)', [Categories::class, 'delete']],

            ['GET', 'media', [MediaApi::class, 'list']],
            ['POST', 'media', [MediaApi::class, 'upload']],
            ['GET', 'media/(\d+)', [MediaApi::class, 'get']],
            ['PUT', 'media/(\d+)', [MediaApi::class, 'update']],
            ['POST', 'media/(\d+)/replace', [MediaApi::class, 'replace']],
            ['DELETE', 'media/(\d+)', [MediaApi::class, 'delete']],

            ['GET', 'testimonials', [Testimonials::class, 'list']],
            ['POST', 'testimonials', [Testimonials::class, 'create']],
            ['POST', 'testimonials/reorder', [Testimonials::class, 'reorder']],
            ['PUT', 'testimonials/(\d+)', [Testimonials::class, 'update']],
            ['DELETE', 'testimonials/(\d+)', [Testimonials::class, 'delete']],

            ['GET', 'content/home', [ContentApi::class, 'home']],
            ['PUT', 'content/home/([a-z]+)', [ContentApi::class, 'saveSection']],
            ['GET', 'content/pages/([a-z]+)', [ContentApi::class, 'page']],
            ['PUT', 'content/pages/([a-z]+)', [ContentApi::class, 'savePage']],

            ['GET', 'settings', [ContentApi::class, 'settings']],
            ['PUT', 'settings/([a-z]+)', [ContentApi::class, 'saveSettings']],
        ];

        $pathMatched = false;
        foreach ($routes as [$m, $pattern, $handler]) {
            if (!preg_match('#^' . $pattern . '$#', $route, $args)) continue;
            $pathMatched = true;
            if ($m !== $method) continue;
            array_shift($args);
            if ($method !== 'GET') {
                // Every state-changing request needs the CSRF token (login included).
                Auth::requireCsrf();
            }
            if ($route !== 'public/site') header('Cache-Control: no-store');
            call_user_func_array($handler, $args);
            return;
        }
        if ($pathMatched) throw new ApiError(405, 'method_not_allowed', 'Method not allowed.');
        throw new ApiError(404, 'not_found', 'Unknown API endpoint.');
    }

    /* ---------- Public ---------- */

    public static function publicSite(): void
    {
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        if ($origin !== '' && in_array($origin, (array) Config::get('public_cors_origins', []), true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
        }
        $payload = ['ok' => true, 'data' => Content::publicSite()];
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $etag = '"' . substr(sha1((string) $json), 0, 20) . '"';
        // Always revalidate so dashboard changes show up on the next page load.
        header('Cache-Control: no-cache');
        header('ETag: ' . $etag);
        if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
            http_response_code(304);
            return;
        }
        header('Content-Type: application/json; charset=utf-8');
        echo $json;
    }

    /* ---------- Auth ---------- */

    public static function me(): void
    {
        $admin = Auth::current();
        Http::ok([
            'authenticated' => (bool) $admin,
            'admin' => $admin ? ['username' => $admin['username'], 'must_change_password' => $admin['must_change_password'], 'last_login_at' => $admin['last_login_at']] : null,
            'csrf' => Auth::csrfToken(),
            'session_idle_seconds' => (int) Config::get('session_idle_seconds', 1800),
            'upload_max_bytes' => (int) Config::get('upload_max_bytes', 5 * 1024 * 1024),
        ]);
    }

    public static function login(): void
    {
        $in = Http::jsonBody();
        $username = is_string($in['username'] ?? null) ? $in['username'] : '';
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';
        if (trim($username) === '' || $password === '') throw new ApiError(422, 'validation', 'Enter your username and password.');
        if (strlen($password) > 500) throw new ApiError(401, 'invalid_credentials', 'Incorrect username or password.');
        $admin = Auth::login($username, $password);
        Http::ok([
            'admin' => ['username' => $admin['username'], 'must_change_password' => $admin['must_change_password']],
            'csrf' => Auth::csrfToken(),
        ]);
    }

    public static function logout(): void
    {
        $admin = Auth::current();
        if ($admin) Activity::log((int) $admin['id'], 'logout', 'session', null, 'Logged out');
        Auth::destroy();
        Http::ok(['authenticated' => false]);
    }

    public static function changePassword(): void
    {
        $admin = Auth::requireAdmin(true);
        $in = Http::jsonBody();
        $s = fn ($k) => is_string($in[$k] ?? null) ? $in[$k] : '';
        Auth::changePassword($admin, $s('current_password'), $s('new_password'), $s('confirm_password'));
        Http::ok(['csrf' => Auth::csrfToken()]);
    }

    /* ---------- Overview ---------- */

    public static function dashboard(): void
    {
        Auth::requireAdmin();
        $n = fn (string $sql) => (int) Db::value($sql);
        Http::ok([
            'products' => $n('SELECT COUNT(*) FROM products'),
            'categories' => $n('SELECT COUNT(*) FROM categories'),
            'featured' => $n('SELECT COUNT(*) FROM products WHERE is_featured = 1'),
            'available' => $n('SELECT COUNT(*) FROM products WHERE is_available = 1 AND (stock IS NULL OR stock > 0)'),
            'unavailable' => $n('SELECT COUNT(*) FROM products WHERE is_available = 0 OR stock = 0'),
            'media' => $n('SELECT COUNT(*) FROM media_library'),
            'testimonials' => $n('SELECT COUNT(*) FROM testimonials WHERE is_published = 1'),
            'price_mode' => Content::setting('price_mode') ?? 'contact',
            'whatsapp_display' => Content::setting('whatsapp_display') ?? '',
            'recent' => Activity::recent(10),
        ]);
    }
}

/* ======================================================================
   Products
   ====================================================================== */

final class Products
{
    private static function row(array $p, array $media, array $gallery): array
    {
        return [
            'id' => (int) $p['id'],
            'code' => $p['code'],
            'name' => $p['name'],
            'category_id' => $p['category_id'] === null ? null : (int) $p['category_id'],
            'category_name' => $p['category_name'] ?? null,
            'description' => (string) $p['description'],
            'image_id' => $p['image_id'] === null ? null : (int) $p['image_id'],
            'image' => $p['image_id'] ? ($media[(int) $p['image_id']] ?? null) : null,
            'gallery' => array_values(array_filter(array_map(fn ($id) => $media[$id] ?? null, $gallery))),
            'price' => $p['price'] === null ? null : (float) $p['price'],
            'unit' => $p['unit'],
            'size_spec' => $p['size_spec'],
            'stock' => $p['stock'] === null ? null : (int) $p['stock'],
            'is_available' => (bool) $p['is_available'],
            'is_featured' => (bool) $p['is_featured'],
            'featured_order' => (int) $p['featured_order'],
            'sort_order' => (int) $p['sort_order'],
            'updated_at' => $p['updated_at'],
        ];
    }

    private static function galleryFor(array $productIds): array
    {
        if (!$productIds) return [];
        $in = implode(',', array_fill(0, count($productIds), '?'));
        $out = [];
        foreach (Db::all("SELECT product_id, media_id FROM product_images WHERE product_id IN ($in) ORDER BY sort_order, id", $productIds) as $g) {
            $out[(int) $g['product_id']][] = (int) $g['media_id'];
        }
        return $out;
    }

    private static function hydrate(array $rows): array
    {
        $ids = array_map(fn ($r) => (int) $r['id'], $rows);
        $gallery = self::galleryFor($ids);
        $mediaIds = array_merge(array_column($rows, 'image_id'), ...array_values($gallery ?: [[]]));
        $media = Media::many($mediaIds);
        return array_map(fn ($r) => self::row($r, $media, $gallery[(int) $r['id']] ?? []), $rows);
    }

    public static function list(): void
    {
        Auth::requireAdmin();
        $where = [];
        $params = [];
        $q = Input::cleanText($_GET['q'] ?? '', 80);
        if ($q !== '') {
            $where[] = '(p.name LIKE ? OR p.code LIKE ? OR p.description LIKE ? OR p.size_spec LIKE ?)';
            $like = '%' . addcslashes($q, '%_\\') . '%';
            array_push($params, $like, $like, $like, $like);
        }
        if (!empty($_GET['category']) && ctype_digit((string) $_GET['category'])) {
            $where[] = 'p.category_id = ?';
            $params[] = (int) $_GET['category'];
        }
        switch ($_GET['status'] ?? '') {
            case 'available': $where[] = 'p.is_available = 1 AND (p.stock IS NULL OR p.stock > 0)'; break;
            case 'unavailable': $where[] = '(p.is_available = 0 OR p.stock = 0)'; break;
            case 'featured': $where[] = 'p.is_featured = 1'; break;
        }
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $perPage = max(1, min(100, (int) ($_GET['per_page'] ?? 20)));
        $total = (int) Db::value("SELECT COUNT(*) FROM products p $whereSql", $params);
        $pages = max(1, (int) ceil($total / $perPage));
        $page = max(1, min($pages, (int) ($_GET['page'] ?? 1)));
        $offset = ($page - 1) * $perPage;
        $rows = Db::all(
            "SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
             $whereSql ORDER BY p.sort_order, p.name LIMIT $perPage OFFSET $offset", $params
        );
        Http::ok(['items' => self::hydrate($rows), 'total' => $total, 'page' => $page, 'pages' => $pages, 'per_page' => $perPage]);
    }

    private static function load(int $id): array
    {
        $row = Db::one('SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?', [$id]);
        if (!$row) throw new ApiError(404, 'not_found', 'This product no longer exists.');
        return self::hydrate([$row])[0];
    }

    public static function get(string $id): void
    {
        Auth::requireAdmin();
        Http::ok(self::load((int) $id));
    }

    private static function validate(array $data, ?int $existingId): array
    {
        $in = new Input($data);
        $v = [
            'name' => $in->str('name', 150, true, 'Product name'),
            'code' => strtolower($in->str('code', 60, false, 'Product ID')),
            'category_id' => $in->intOrNull('category_id', 1, PHP_INT_MAX, 'Category'),
            'description' => $in->str('description', 2000, false, 'Description', true),
            'image_id' => $in->mediaId('image_id', 'Main image'),
            'gallery_ids' => $in->mediaIds('gallery_ids', 12, 'Gallery images'),
            'price' => $in->money('price'),
            'unit' => $in->str('unit', 30, true, 'Unit'),
            'size_spec' => $in->str('size_spec', 150, false, 'Size / specification'),
            'stock' => $in->intOrNull('stock', 0, 10000000, 'Stock quantity'),
            'is_available' => $in->bool('is_available', true),
            'is_featured' => $in->bool('is_featured', false),
            'sort_order' => $in->intOrNull('sort_order', -100000, 100000, 'Display order'),
        ];
        if ($v['category_id'] === null) $in->fail('category_id', 'Please choose a category.');
        elseif (!Db::value('SELECT 1 FROM categories WHERE id = ?', [$v['category_id']])) $in->fail('category_id', 'This category no longer exists.');
        if ($v['unit'] !== '' && !preg_match('/^[\p{L} .\-\/]{1,30}$/u', $v['unit'])) $in->fail('unit', 'Unit should be a word like piece, length or bundle.');

        if ($v['code'] === '' && $v['name'] !== '') {
            $base = slugify($v['name'], 50) ?: 'product';
            $code = $base;
            for ($i = 2; Db::value('SELECT 1 FROM products WHERE code = ? AND id <> ?', [$code, $existingId ?? 0]); $i++) $code = $base . '-' . $i;
            $v['code'] = $code;
        } elseif ($v['code'] !== '') {
            if (!preg_match('/^[a-z0-9][a-z0-9-]{1,59}$/', $v['code'])) $in->fail('code', 'Use lower-case letters, numbers and dashes only, e.g. rw-2x3.');
            elseif (Db::value('SELECT 1 FROM products WHERE code = ? AND id <> ?', [$v['code'], $existingId ?? 0])) $in->fail('code', 'Another product already uses this ID.');
        }
        $in->check();
        $v['gallery_ids'] = array_values(array_filter($v['gallery_ids'], fn ($id) => $id !== $v['image_id']));
        return $v;
    }

    private static function saveGallery(int $productId, array $ids): void
    {
        Db::run('DELETE FROM product_images WHERE product_id = ?', [$productId]);
        foreach ($ids as $i => $mid) {
            Db::run('INSERT INTO product_images (product_id, media_id, sort_order) VALUES (?, ?, ?)', [$productId, $mid, $i]);
        }
    }

    public static function create(): void
    {
        $admin = Auth::requireAdmin();
        $v = self::validate(Http::jsonBody(), null);
        $id = Db::tx(function () use ($v) {
            $featuredOrder = $v['is_featured'] ? (int) Db::value('SELECT COALESCE(MAX(featured_order), 0) + 1 FROM products') : 0;
            $sort = $v['sort_order'] ?? (int) Db::value('SELECT COALESCE(MAX(sort_order), 0) + 10 FROM products');
            $id = Db::insert(
                'INSERT INTO products (code, name, category_id, description, image_id, price, unit, size_spec, stock, is_available, is_featured, featured_order, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$v['code'], $v['name'], $v['category_id'], $v['description'], $v['image_id'], $v['price'], $v['unit'], $v['size_spec'],
                 $v['stock'], (int) $v['is_available'], (int) $v['is_featured'], $featuredOrder, $sort]
            );
            self::saveGallery($id, $v['gallery_ids']);
            return $id;
        });
        Activity::log((int) $admin['id'], 'create', 'product', (string) $id, 'Added product "' . $v['name'] . '"');
        Http::ok(self::load($id), 201);
    }

    public static function update(string $id): void
    {
        $admin = Auth::requireAdmin();
        $id = (int) $id;
        $current = Db::one('SELECT * FROM products WHERE id = ?', [$id]);
        if (!$current) throw new ApiError(404, 'not_found', 'This product no longer exists.');
        $v = self::validate(Http::jsonBody(), $id);
        Db::tx(function () use ($v, $id, $current) {
            $featuredOrder = (int) $current['featured_order'];
            if ($v['is_featured'] && !$current['is_featured']) $featuredOrder = (int) Db::value('SELECT COALESCE(MAX(featured_order), 0) + 1 FROM products');
            if (!$v['is_featured']) $featuredOrder = 0;
            Db::run(
                'UPDATE products SET code = ?, name = ?, category_id = ?, description = ?, image_id = ?, price = ?, unit = ?, size_spec = ?,
                 stock = ?, is_available = ?, is_featured = ?, featured_order = ?, sort_order = ? WHERE id = ?',
                [$v['code'], $v['name'], $v['category_id'], $v['description'], $v['image_id'], $v['price'], $v['unit'], $v['size_spec'],
                 $v['stock'], (int) $v['is_available'], (int) $v['is_featured'], $featuredOrder, $v['sort_order'] ?? (int) $current['sort_order'], $id]
            );
            self::saveGallery($id, $v['gallery_ids']);
        });
        Activity::log((int) $admin['id'], 'update', 'product', (string) $id, 'Updated product "' . $v['name'] . '"');
        Http::ok(self::load($id));
    }

    public static function delete(string $id): void
    {
        $admin = Auth::requireAdmin();
        $row = Db::one('SELECT name FROM products WHERE id = ?', [(int) $id]);
        if (!$row) throw new ApiError(404, 'not_found', 'This product no longer exists.');
        Db::run('DELETE FROM products WHERE id = ?', [(int) $id]);
        Activity::log((int) $admin['id'], 'delete', 'product', $id, 'Deleted product "' . $row['name'] . '"');
        Http::ok(['deleted' => (int) $id]);
    }

    /** Body: {"ids": [3, 1, 2]} sets display order to that sequence. */
    public static function reorder(): void
    {
        $admin = Auth::requireAdmin();
        $ids = array_values(array_unique(array_map('intval', (array) (Http::jsonBody()['ids'] ?? []))));
        Db::tx(function () use ($ids) {
            foreach ($ids as $i => $id) Db::run('UPDATE products SET sort_order = ? WHERE id = ?', [($i + 1) * 10, $id]);
        });
        Activity::log((int) $admin['id'], 'update', 'product', null, 'Changed product display order');
        Http::ok(['ok' => true]);
    }

    /** Body: {"ids": [...]} — exactly these products are featured, in this order. */
    public static function setFeatured(): void
    {
        $admin = Auth::requireAdmin();
        $ids = array_values(array_unique(array_filter(array_map('intval', (array) (Http::jsonBody()['ids'] ?? [])))));
        if (count($ids) > 24) throw new ApiError(422, 'validation', 'Feature at most 24 products.');
        Db::tx(function () use ($ids) {
            Db::run('UPDATE products SET is_featured = 0, featured_order = 0');
            foreach ($ids as $i => $id) Db::run('UPDATE products SET is_featured = 1, featured_order = ? WHERE id = ?', [$i + 1, $id]);
        });
        Activity::log((int) $admin['id'], 'update', 'homepage', 'featured', 'Updated featured products');
        Http::ok(['featured' => $ids]);
    }
}

/* ======================================================================
   Categories
   ====================================================================== */

final class Categories
{
    private static function all(): array
    {
        $rows = Db::all(
            'SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
             FROM categories c ORDER BY c.sort_order, c.name'
        );
        $media = Media::many(array_column($rows, 'image_id'));
        return array_map(fn ($c) => [
            'id' => (int) $c['id'],
            'slug' => $c['slug'],
            'name' => $c['name'],
            'description' => $c['description'],
            'image_id' => $c['image_id'] === null ? null : (int) $c['image_id'],
            'image' => $c['image_id'] ? ($media[(int) $c['image_id']] ?? null) : null,
            'sort_order' => (int) $c['sort_order'],
            'product_count' => (int) $c['product_count'],
        ], $rows);
    }

    public static function list(): void
    {
        Auth::requireAdmin();
        Http::ok(self::all());
    }

    private static function validate(array $data, ?int $id): array
    {
        $in = new Input($data);
        $v = [
            'name' => $in->str('name', 100, true, 'Category name'),
            'slug' => strtolower($in->str('slug', 80, false, 'Web address name')),
            'description' => $in->str('description', 500, false, 'Description', true),
            'image_id' => $in->mediaId('image_id', 'Category image'),
        ];
        if ($v['slug'] === '') $v['slug'] = slugify($v['name'], 80);
        if ($v['slug'] === '' || !preg_match('/^[a-z0-9][a-z0-9-]{0,79}$/', $v['slug'])) $in->fail('slug', 'Use lower-case letters, numbers and dashes only.');
        elseif (Db::value('SELECT 1 FROM categories WHERE slug = ? AND id <> ?', [$v['slug'], $id ?? 0])) $in->fail('slug', 'Another category already uses this web address name.');
        if ($v['name'] !== '' && Db::value('SELECT 1 FROM categories WHERE LOWER(name) = LOWER(?) AND id <> ?', [$v['name'], $id ?? 0])) $in->fail('name', 'A category with this name already exists.');
        $in->check();
        return $v;
    }

    public static function create(): void
    {
        $admin = Auth::requireAdmin();
        $v = self::validate(Http::jsonBody(), null);
        $sort = (int) Db::value('SELECT COALESCE(MAX(sort_order), 0) + 10 FROM categories');
        $id = Db::insert('INSERT INTO categories (slug, name, description, image_id, sort_order) VALUES (?, ?, ?, ?, ?)',
            [$v['slug'], $v['name'], $v['description'], $v['image_id'], $sort]);
        Activity::log((int) $admin['id'], 'create', 'category', (string) $id, 'Added category "' . $v['name'] . '"');
        Http::ok(self::find($id), 201);
    }

    private static function find(int $id): array
    {
        foreach (self::all() as $c) if ($c['id'] === $id) return $c;
        throw new ApiError(404, 'not_found', 'This category no longer exists.');
    }

    public static function update(string $id): void
    {
        $admin = Auth::requireAdmin();
        $id = (int) $id;
        self::find($id);
        $v = self::validate(Http::jsonBody(), $id);
        Db::run('UPDATE categories SET slug = ?, name = ?, description = ?, image_id = ? WHERE id = ?',
            [$v['slug'], $v['name'], $v['description'], $v['image_id'], $id]);
        Activity::log((int) $admin['id'], 'update', 'category', (string) $id, 'Updated category "' . $v['name'] . '"');
        Http::ok(self::find($id));
    }

    public static function delete(string $id): void
    {
        $admin = Auth::requireAdmin();
        $cat = self::find((int) $id);
        if ($cat['product_count'] > 0) {
            throw new ApiError(409, 'in_use', 'This category still has ' . $cat['product_count'] . ' product(s). Move them to another category or delete them first.');
        }
        Db::run('DELETE FROM categories WHERE id = ?', [(int) $id]);
        Activity::log((int) $admin['id'], 'delete', 'category', $id, 'Deleted category "' . $cat['name'] . '"');
        Http::ok(['deleted' => (int) $id]);
    }

    public static function reorder(): void
    {
        $admin = Auth::requireAdmin();
        $ids = array_values(array_unique(array_map('intval', (array) (Http::jsonBody()['ids'] ?? []))));
        Db::tx(function () use ($ids) {
            foreach ($ids as $i => $id) Db::run('UPDATE categories SET sort_order = ? WHERE id = ?', [($i + 1) * 10, $id]);
        });
        Activity::log((int) $admin['id'], 'update', 'category', null, 'Changed category order');
        Http::ok(self::all());
    }
}

/* ======================================================================
   Media Library
   ====================================================================== */

final class MediaApi
{
    public static function list(): void
    {
        Auth::requireAdmin();
        $params = [];
        $where = '';
        $q = Input::cleanText($_GET['q'] ?? '', 80);
        if ($q !== '') {
            $where = 'WHERE title LIKE ? OR original_name LIKE ? OR alt_text LIKE ?';
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $params = [$like, $like, $like];
        }
        $perPage = max(1, min(100, (int) ($_GET['per_page'] ?? 24)));
        $total = (int) Db::value("SELECT COUNT(*) FROM media_library $where", $params);
        $pages = max(1, (int) ceil($total / $perPage));
        $page = max(1, min($pages, (int) ($_GET['page'] ?? 1)));
        $offset = ($page - 1) * $perPage;
        $rows = Db::all("SELECT * FROM media_library $where ORDER BY id DESC LIMIT $perPage OFFSET $offset", $params);
        Http::ok(['items' => array_map([Media::class, 'toArray'], $rows), 'total' => $total, 'page' => $page, 'pages' => $pages]);
    }

    private static function load(int $id): array
    {
        $row = Media::find($id);
        if (!$row) throw new ApiError(404, 'not_found', 'This image no longer exists.');
        return $row;
    }

    public static function get(string $id): void
    {
        Auth::requireAdmin();
        $m = Media::toArray(self::load((int) $id));
        $m['used_in'] = Media::usage((int) $id);
        Http::ok($m);
    }

    public static function upload(): void
    {
        $admin = Auth::requireAdmin();
        if (empty($_FILES['file'])) {
            throw new ApiError(422, 'no_file', 'Please choose an image to upload. (If you did, it may be larger than the server allows.)');
        }
        [$path, $mime, $size, $w, $h, $original] = Media::storeUpload($_FILES['file']);
        $title = Input::cleanText($_POST['title'] ?? '', 150) ?: Media::titleFromFilename($original);
        $alt = Input::cleanText($_POST['alt'] ?? '', 255);
        try {
            $id = Db::insert(
                'INSERT INTO media_library (file_path, title, alt_text, original_name, mime_type, size_bytes, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$path, $title, $alt, $original, $mime, $size, $w, $h]
            );
        } catch (Throwable $e) {
            Media::deleteFile($path);
            throw $e;
        }
        Activity::log((int) $admin['id'], 'create', 'media', (string) $id, 'Uploaded image "' . $title . '"');
        Http::ok(Media::toArray(self::load($id)), 201);
    }

    public static function update(string $id): void
    {
        $admin = Auth::requireAdmin();
        self::load((int) $id);
        $in = new Input(Http::jsonBody());
        $title = $in->str('title', 150, true, 'Name');
        $alt = $in->str('alt', 255, false, 'Description');
        $in->check();
        Db::run('UPDATE media_library SET title = ?, alt_text = ? WHERE id = ?', [$title, $alt, (int) $id]);
        Activity::log((int) $admin['id'], 'update', 'media', $id, 'Renamed image to "' . $title . '"');
        Http::ok(Media::toArray(self::load((int) $id)));
    }

    /** Upload a new file for an existing image: every place using it updates. */
    public static function replace(string $id): void
    {
        $admin = Auth::requireAdmin();
        $old = self::load((int) $id);
        if (empty($_FILES['file'])) throw new ApiError(422, 'no_file', 'Please choose an image to upload.');
        [$path, $mime, $size, $w, $h, $original] = Media::storeUpload($_FILES['file']);
        try {
            Db::run('UPDATE media_library SET file_path = ?, mime_type = ?, size_bytes = ?, width = ?, height = ?, original_name = ?, is_builtin = 0 WHERE id = ?',
                [$path, $mime, $size, $w, $h, $original, (int) $id]);
        } catch (Throwable $e) {
            Media::deleteFile($path);
            throw $e;
        }
        Media::deleteFile($old['file_path']);
        Activity::log((int) $admin['id'], 'update', 'media', $id, 'Replaced image "' . $old['title'] . '"');
        Http::ok(Media::toArray(self::load((int) $id)));
    }

    public static function delete(string $id): void
    {
        $admin = Auth::requireAdmin();
        $row = self::load((int) $id);
        $uses = Media::usage((int) $id);
        if ($uses && ($_GET['force'] ?? '') !== '1') {
            throw new ApiError(409, 'in_use', 'This image is still used on the website.', ['used_in' => $uses]);
        }
        Db::tx(function () use ($id) {
            // Clear references kept inside JSON content and settings.
            $mid = (int) $id;
            foreach (Content::settingMediaKeys() as $key => $_) {
                if ((int) (Content::setting($key) ?? 0) === $mid) Content::saveSettings([$key => null]);
            }
            foreach ([['homepage_sections', 'section_key'], ['pages', 'slug']] as [$table, $pk]) {
                foreach (Db::all("SELECT $pk AS k, content FROM $table") as $r) {
                    $data = json_decode($r['content'], true) ?: [];
                    $clean = self::stripMedia($data, $mid);
                    if ($clean !== $data) Db::run("UPDATE $table SET content = ? WHERE $pk = ?", [json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $r['k']]);
                }
            }
            Db::run('DELETE FROM media_library WHERE id = ?', [$mid]);
        });
        Media::deleteFile($row['file_path']);
        Activity::log((int) $admin['id'], 'delete', 'media', $id, 'Deleted image "' . $row['title'] . '"');
        Http::ok(['deleted' => (int) $id]);
    }

    private static function stripMedia($data, int $mid)
    {
        if (!is_array($data)) return $data;
        foreach ($data as $k => $v) {
            if ($k === 'image_id' && $v === $mid) $data[$k] = null;
            elseif ($k === 'image_ids' && is_array($v)) $data[$k] = array_values(array_filter($v, fn ($x) => $x !== $mid));
            elseif (is_array($v)) $data[$k] = self::stripMedia($v, $mid);
        }
        return $data;
    }
}

/* ======================================================================
   Testimonials
   ====================================================================== */

final class Testimonials
{
    private static function all(): array
    {
        $rows = Db::all('SELECT * FROM testimonials ORDER BY sort_order, id');
        $media = Media::many(array_column($rows, 'image_id'));
        return array_map(fn ($t) => [
            'id' => (int) $t['id'],
            'customer_name' => $t['customer_name'],
            'quote' => $t['quote'],
            'context' => $t['context'],
            'image_id' => $t['image_id'] === null ? null : (int) $t['image_id'],
            'image' => $t['image_id'] ? ($media[(int) $t['image_id']] ?? null) : null,
            'is_published' => (bool) $t['is_published'],
            'sort_order' => (int) $t['sort_order'],
            'updated_at' => $t['updated_at'],
        ], $rows);
    }

    public static function list(): void
    {
        Auth::requireAdmin();
        Http::ok(self::all());
    }

    private static function validate(array $data): array
    {
        $in = new Input($data);
        $v = [
            'customer_name' => $in->str('customer_name', 100, true, 'Customer name'),
            'quote' => $in->str('quote', 1000, true, 'Review text', true),
            'context' => $in->str('context', 150, false, 'Details'),
            'image_id' => $in->mediaId('image_id', 'Photo'),
            'is_published' => $in->bool('is_published', false),
        ];
        $in->check();
        return $v;
    }

    private static function find(int $id): array
    {
        foreach (self::all() as $t) if ($t['id'] === $id) return $t;
        throw new ApiError(404, 'not_found', 'This testimonial no longer exists.');
    }

    public static function create(): void
    {
        $admin = Auth::requireAdmin();
        $v = self::validate(Http::jsonBody());
        $sort = (int) Db::value('SELECT COALESCE(MAX(sort_order), 0) + 10 FROM testimonials');
        $id = Db::insert('INSERT INTO testimonials (customer_name, quote, context, image_id, is_published, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
            [$v['customer_name'], $v['quote'], $v['context'], $v['image_id'], (int) $v['is_published'], $sort]);
        Activity::log((int) $admin['id'], 'create', 'testimonial', (string) $id, 'Added testimonial from ' . $v['customer_name']);
        Http::ok(self::find($id), 201);
    }

    public static function update(string $id): void
    {
        $admin = Auth::requireAdmin();
        self::find((int) $id);
        $v = self::validate(Http::jsonBody());
        Db::run('UPDATE testimonials SET customer_name = ?, quote = ?, context = ?, image_id = ?, is_published = ? WHERE id = ?',
            [$v['customer_name'], $v['quote'], $v['context'], $v['image_id'], (int) $v['is_published'], (int) $id]);
        Activity::log((int) $admin['id'], 'update', 'testimonial', $id, ($v['is_published'] ? 'Updated' : 'Updated (hidden)') . ' testimonial from ' . $v['customer_name']);
        Http::ok(self::find((int) $id));
    }

    public static function delete(string $id): void
    {
        $admin = Auth::requireAdmin();
        $t = self::find((int) $id);
        Db::run('DELETE FROM testimonials WHERE id = ?', [(int) $id]);
        Activity::log((int) $admin['id'], 'delete', 'testimonial', $id, 'Deleted testimonial from ' . $t['customer_name']);
        Http::ok(['deleted' => (int) $id]);
    }

    public static function reorder(): void
    {
        $admin = Auth::requireAdmin();
        $ids = array_values(array_unique(array_map('intval', (array) (Http::jsonBody()['ids'] ?? []))));
        Db::tx(function () use ($ids) {
            foreach ($ids as $i => $id) Db::run('UPDATE testimonials SET sort_order = ? WHERE id = ?', [($i + 1) * 10, $id]);
        });
        Activity::log((int) $admin['id'], 'update', 'testimonial', null, 'Changed testimonial order');
        Http::ok(self::all());
    }
}

/* ======================================================================
   Homepage, pages and settings
   ====================================================================== */

final class ContentApi
{
    public static function home(): void
    {
        Auth::requireAdmin();
        $sections = Content::homeSections();
        $media = Media::many(Content::mediaIdsIn(array_column($sections, 'content')));
        Http::ok(['sections' => $sections, 'media' => (object) $media, 'icons' => Content::ICONS]);
    }

    public static function saveSection(string $key): void
    {
        $admin = Auth::requireAdmin();
        if (!isset(Content::HOME_SECTIONS[$key])) throw new ApiError(404, 'not_found', 'Unknown homepage section.');
        $body = Http::jsonBody();
        $content = Content::validateSection($key, new Input(is_array($body['content'] ?? null) ? $body['content'] : []));
        $enabled = !array_key_exists('enabled', $body) || (bool) $body['enabled'];
        Db::run('INSERT INTO homepage_sections (section_key, is_enabled, content) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), content = VALUES(content)',
            [$key, (int) $enabled, json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        Activity::log((int) $admin['id'], 'update', 'homepage', $key, 'Updated homepage: ' . Content::sectionLabel($key) . ($enabled ? '' : ' (hidden)'));
        $media = Media::many(Content::mediaIdsIn($content));
        Http::ok(['enabled' => $enabled, 'content' => $content, 'media' => (object) $media]);
    }

    public static function page(string $slug): void
    {
        Auth::requireAdmin();
        if (!isset(Content::PAGES[$slug])) throw new ApiError(404, 'not_found', 'Unknown page.');
        $content = Content::page($slug);
        Http::ok(['content' => $content, 'media' => (object) Media::many(Content::mediaIdsIn($content))]);
    }

    public static function savePage(string $slug): void
    {
        $admin = Auth::requireAdmin();
        if (!isset(Content::PAGES[$slug])) throw new ApiError(404, 'not_found', 'Unknown page.');
        $body = Http::jsonBody();
        $content = Content::validatePage($slug, new Input(is_array($body['content'] ?? null) ? $body['content'] : []));
        Db::run('INSERT INTO pages (slug, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
            [$slug, json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        Activity::log((int) $admin['id'], 'update', 'page', $slug, 'Updated ' . Content::PAGES[$slug]);
        Http::ok(['content' => $content, 'media' => (object) Media::many(Content::mediaIdsIn($content))]);
    }

    public static function settings(): void
    {
        Auth::requireAdmin();
        $s = Content::settings();
        $media = Media::many(array_filter(array_map(fn ($k) => $s[$k] ?? null, array_keys(Content::settingMediaKeys()))));
        Http::ok(['settings' => $s, 'media' => (object) $media]);
    }

    public static function saveSettings(string $group): void
    {
        $admin = Auth::requireAdmin();
        $values = Content::validateSettings($group, new Input(Http::jsonBody()));
        Content::saveSettings($values);
        $labels = ['branding' => 'branding', 'contact' => 'contact details', 'general' => 'website settings'];
        Activity::log((int) $admin['id'], 'update', 'settings', $group, 'Updated ' . ($labels[$group] ?? $group));
        self::settings();
    }
}
