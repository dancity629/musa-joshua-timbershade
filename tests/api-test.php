<?php
/*
 * API integration tests. Run against a fresh install:
 *
 *   php server/cli-install.php
 *   php -S 127.0.0.1:8080 server/dev-router.php &
 *   php tests/api-test.php http://127.0.0.1:8080
 *
 * Uses the default Admin/Admin login, changes the password, then exercises
 * every endpoint, security check and public-site update.
 */
declare(strict_types=1);

$base = rtrim($argv[1] ?? 'http://127.0.0.1:8080', '/');
$jar = tempnam(sys_get_temp_dir(), 'mjt');
$csrf = '';
$pass = 0;
$fail = 0;

function req(string $method, string $route, $body = null, array $query = [], array $opts = []): array
{
    global $base, $jar, $csrf;
    $q = http_build_query(['route' => $route] + $query);
    $ch = curl_init("$base/api/index.php?$q");
    $headers = ['Accept: application/json'];
    $useJar = $opts['jar'] ?? $jar;
    if ($useJar) { curl_setopt($ch, CURLOPT_COOKIEJAR, $useJar); curl_setopt($ch, CURLOPT_COOKIEFILE, $useJar); }
    if ($method !== 'GET') {
        if (!($opts['no_csrf'] ?? false)) $headers[] = 'X-CSRF-Token: ' . ($opts['csrf'] ?? $csrf);
        if ($method !== 'POST') $headers[] = 'X-HTTP-Method-Override: ' . $method;
        curl_setopt($ch, CURLOPT_POST, true);
        if ($body instanceof CURLFile || (is_array($body) && ($opts['multipart'] ?? false))) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($body) ? $body : ['file' => $body]);
        } else {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body ?? new stdClass()));
        }
    }
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = json_decode((string) $raw, true);
    return ['status' => $status, 'json' => $json, 'data' => $json['data'] ?? null, 'error' => $json['error'] ?? null, 'raw' => $raw];
}

function check(string $label, bool $ok, $detail = ''): void
{
    global $pass, $fail;
    if ($ok) { $pass++; echo "  ok   $label\n"; }
    else { $fail++; echo "  FAIL $label " . (is_string($detail) ? $detail : json_encode($detail)) . "\n"; }
}

function refreshCsrf(): void
{
    global $csrf;
    $csrf = req('GET', 'auth/me')['data']['csrf'];
}

function img(string $type, int $w = 40, int $h = 30): string
{
    $im = imagecreatetruecolor($w, $h);
    imagefill($im, 0, 0, imagecolorallocate($im, 139, 94, 60));
    $path = tempnam(sys_get_temp_dir(), 'img') . '.' . $type;
    match ($type) { 'jpg' => imagejpeg($im, $path), 'png' => imagepng($im, $path), 'webp' => imagewebp($im, $path) };
    return $path;
}

function site(): array
{
    return req('GET', 'public/site', null, [], ['jar' => false])['data'];
}

echo "Public and unauthenticated access\n";
$r = req('GET', 'public/site', null, [], ['jar' => false]);
check('public site loads without login', $r['status'] === 200 && count($r['data']['products']) === 10);
check('public site hides prices in contact mode', array_filter(array_column($r['data']['products'], 'price')) === []);
foreach (['dashboard', 'products', 'categories', 'media', 'testimonials', 'content/home', 'settings', 'content/pages/about'] as $route) {
    $r = req('GET', $route, null, [], ['jar' => false]);
    check("GET $route requires login (401)", $r['status'] === 401);
}
$r = req('DELETE', 'products/1', null, [], ['jar' => false, 'no_csrf' => true]);
check('DELETE without session/CSRF is refused', in_array($r['status'], [401, 403], true));
check('product 1 still exists', count(site()['products']) === 10);
$r = req('GET', 'nope');
check('unknown endpoint 404', $r['status'] === 404);

echo "Login, CSRF and forced password change\n";
refreshCsrf();
$r = req('POST', 'auth/login', ['username' => 'Admin', 'password' => 'Admin'], [], ['no_csrf' => true]);
check('login without CSRF token is refused', $r['status'] === 403 && $r['error']['code'] === 'csrf');
$r = req('POST', 'auth/login', ['username' => 'Admin', 'password' => 'wrong']);
check('wrong password 401', $r['status'] === 401);
$r = req('POST', 'auth/login', ['username' => 'Admin', 'password' => 'Admin']);
check('default login works', $r['status'] === 200 && $r['data']['admin']['must_change_password'] === true, $r);
$csrf = $r['data']['csrf'];
$r = req('GET', 'products');
check('API refuses work until password changed', $r['status'] === 403 && $r['error']['code'] === 'password_change_required');
$r = req('POST', 'auth/password', ['current_password' => 'Admin', 'new_password' => 'Admin', 'confirm_password' => 'Admin']);
check('cannot keep Admin as password', $r['status'] === 422);
$r = req('POST', 'auth/password', ['current_password' => 'Admin', 'new_password' => 'Strong-Timber-99', 'confirm_password' => 'Strong-Timber-99']);
check('password changed', $r['status'] === 200, $r);
$csrf = $r['data']['csrf'];
$hash = shell_exec('mysql -N -uroot mjt -e "SELECT password_hash FROM admins LIMIT 1" 2>/dev/null');
if ($hash !== null) check('password stored as a hash, not plaintext', str_starts_with(trim($hash), '$2y$') || str_starts_with(trim($hash), '$argon'));

echo "Products\n";
$r = req('GET', 'products', null, ['q' => '2x4', 'per_page' => 5]);
check('search finds products', $r['status'] === 200 && $r['data']['total'] >= 1, $r['error']);
$r = req('GET', 'products', null, ['per_page' => 3, 'page' => 2]);
check('pagination', $r['data']['page'] === 2 && count($r['data']['items']) === 3 && $r['data']['pages'] === 4);
$cats = req('GET', 'categories')['data'];
check('5 initial categories', count($cats) === 5 && $cats[4]['name'] === 'Other Building Materials');
$r = req('GET', 'products', null, ['category' => $cats[3]['id']]);
check('category filter (Nails = 3)', $r['data']['total'] === 3);
$r = req('POST', 'products', ['name' => '', 'unit' => 'piece', 'price' => 'abc', 'category_id' => 999]);
check('validation errors returned per field', $r['status'] === 422 && isset($r['error']['fields']['name'], $r['error']['fields']['price'], $r['error']['fields']['category_id']), $r);
$r = req('POST', 'products', ['name' => 'Cement 50kg <script>alert(1)</script>', 'category_id' => $cats[4]['id'], 'unit' => 'bag', 'price' => '9,500', 'stock' => 20, 'size_spec' => '50 kg', 'description' => "Line one\nLine two", 'is_featured' => true]);
check('create product', $r['status'] === 201 && $r['data']['code'] !== '' && $r['data']['price'] == 9500, $r);
$pid = $r['data']['id'];
$code = $r['data']['code'];
$p = array_values(array_filter(site()['products'], fn ($x) => $x['id'] === $code))[0] ?? null;
check('new product appears on public site', $p !== null && $p['category'] === 'other-building-materials');
check('text stored as plain text (no HTML stripping surprises)', $p && str_contains($p['name'], '<script>'));
$r = req('PUT', "products/$pid", ['name' => 'Cement 50kg', 'code' => $code, 'category_id' => $cats[4]['id'], 'unit' => 'bag', 'price' => '9800.50', 'stock' => 0, 'is_available' => true]);
check('update product', $r['status'] === 200 && $r['data']['price'] == 9800.5 && $r['data']['stock'] === 0, $r);
$p = array_values(array_filter(site()['products'], fn ($x) => $x['id'] === $code))[0];
check('stock 0 shows as unavailable publicly', $p['available'] === false && $p['name'] === 'Cement 50kg');
$r = req('PUT', "products/$pid", ['name' => 'Dup', 'code' => 'rw-2x3-12ft', 'category_id' => $cats[0]['id'], 'unit' => 'piece']);
check('duplicate product ID rejected', $r['status'] === 422 && isset($r['error']['fields']['code']));

echo "Price display setting\n";
$settings = req('GET', 'settings')['data']['settings'];
$r = req('PUT', 'settings/general', ['price_mode' => 'show', 'currency' => 'NGN', 'price_note' => 'Prices confirmed on WhatsApp.', 'seo_title' => 'Test SEO', 'copyright_text' => 'MJT']);
check('switch to show prices', $r['status'] === 200 && $r['data']['settings']['price_mode'] === 'show', $r);
$p = array_values(array_filter(site()['products'], fn ($x) => $x['id'] === $code))[0];
check('prices now public', $p['price'] == 9800.5 && site()['settings']['priceMode'] === 'show');

echo "Categories\n";
$r = req('POST', 'categories', ['name' => 'Roofing Sheets', 'description' => 'Aluminium sheets']);
check('create category', $r['status'] === 201 && $r['data']['slug'] === 'roofing-sheets', $r);
$cid = $r['data']['id'];
$r = req('POST', 'categories', ['name' => 'roofing sheets']);
check('duplicate category name rejected', $r['status'] === 422);
$r = req('PUT', "categories/$cid", ['name' => 'Roofing Sheets & Accessories', 'slug' => 'roofing-sheets', 'description' => 'Sheets']);
check('rename category', $r['status'] === 200 && $r['data']['name'] === 'Roofing Sheets & Accessories');
$ids = array_column(req('GET', 'categories')['data'], 'id');
$r = req('POST', 'categories/reorder', ['ids' => array_merge([$cid], array_diff($ids, [$cid]))]);
check('reorder categories', $r['data'][0]['id'] === $cid && site()['categories'][0]['id'] === 'roofing-sheets');
$r = req('DELETE', 'categories/' . $cats[4]['id']);
check('cannot delete category that has products', $r['status'] === 409);
$r = req('DELETE', "categories/$cid");
check('delete empty category', $r['status'] === 200 && !in_array('roofing-sheets', array_column(site()['categories'], 'id'), true));

echo "Media uploads\n";
$jpg = img('jpg'); $png = img('png'); $webp = img('webp');
$r = req('POST', 'media', new CURLFile($jpg, 'image/jpeg', 'Plank photo.jpg'));
check('upload JPG', $r['status'] === 201 && $r['data']['mime'] === 'image/jpeg' && $r['data']['title'] === 'Plank photo', $r);
$mid = $r['data']['id'];
$file = __DIR__ . '/../' . $r['data']['path'];
check('file stored on server under uploads/', is_file($file));
$r = req('POST', 'media', new CURLFile($png, 'image/png', 'logo.png'));
check('upload PNG', $r['status'] === 201);
$logoId = $r['data']['id'];
$r = req('POST', 'media', new CURLFile($webp, 'image/webp', 'x.webp'));
check('upload WebP', $r['status'] === 201);
$fake = tempnam(sys_get_temp_dir(), 'bad') . '.jpg';
file_put_contents($fake, "<?php echo 'pwned'; ?>");
$r = req('POST', 'media', new CURLFile($fake, 'image/jpeg', 'evil.jpg'));
check('PHP file disguised as JPG rejected', $r['status'] === 415, $r);
$gif = tempnam(sys_get_temp_dir(), 'g') . '.gif';
$im = imagecreatetruecolor(5, 5); imagegif($im, $gif);
$r = req('POST', 'media', new CURLFile($gif, 'image/gif', 'a.gif'));
check('GIF rejected (only JPG/PNG/WebP)', $r['status'] === 415);
$big = tempnam(sys_get_temp_dir(), 'big') . '.jpg';
file_put_contents($big, file_get_contents($jpg) . str_repeat("\0", 6 * 1024 * 1024)); // valid JPEG padded past 5 MB
$r = req('POST', 'media', new CURLFile($big, 'image/jpeg', 'big.jpg'));
check('oversized image rejected', $r['status'] === 413, $r['status']);
$r = req('POST', 'media', new CURLFile($jpg, 'image/jpeg', 'x.jpg'), [], ['no_csrf' => true]);
check('upload without CSRF refused', $r['status'] === 403);
$r = req('PUT', "media/$mid", ['title' => 'Cement bag', 'alt' => 'A bag of cement']);
check('rename image', $r['data']['title'] === 'Cement bag');
$r = req('PUT', "products/$pid", ['name' => 'Cement 50kg', 'code' => $code, 'category_id' => $cats[4]['id'], 'unit' => 'bag', 'price' => '9800.50', 'stock' => 10, 'image_id' => $mid, 'gallery_ids' => [$logoId]]);
check('assign uploaded image + gallery to product', $r['data']['image']['id'] === $mid && count($r['data']['gallery']) === 1, $r);
$p = array_values(array_filter(site()['products'], fn ($x) => $x['id'] === $code))[0];
check('public product shows image and gallery', str_contains((string) $p['image'], 'uploads/') && count($p['gallery']) === 1);
$oldPath = $file;
$r = req('POST', "media/$mid/replace", new CURLFile($png, 'image/png', 'new.png'));
check('replace image keeps the same ID', $r['status'] === 200 && $r['data']['id'] === $mid && $r['data']['mime'] === 'image/png', $r);
clearstatcache();
check('old file removed after replace', !is_file($oldPath));
$p = array_values(array_filter(site()['products'], fn ($x) => $x['id'] === $code))[0];
check('product now shows replaced image', str_ends_with((string) $p['image'], '.png'));
$r = req('GET', "media/$mid");
check('usage shows where image is used', in_array('Product: Cement 50kg (main image)', $r['data']['used_in'], true), $r['data']['used_in'] ?? null);
$r = req('DELETE', "media/$mid");
check('deleting an in-use image needs confirmation (409)', $r['status'] === 409 && !empty($r['error']['fields']['used_in']));
$r = req('GET', 'media', null, ['q' => 'cement']);
check('media search', $r['data']['total'] === 1);

echo "Homepage, pages, branding, contact\n";
$home = req('GET', 'content/home')['data'];
$hero = $home['sections']['hero']['content'];
$hero['heading'] = 'New heading from the dashboard';
$hero['image_id'] = $mid;
$hero['button_url'] = 'javascript:alert(1)';
$r = req('PUT', 'content/home/hero', ['enabled' => true, 'content' => $hero]);
check('javascript: link rejected', $r['status'] === 422 && isset($r['error']['fields']['button_url']));
$hero['button_url'] = 'products.html?category=nails';
$r = req('PUT', 'content/home/hero', ['enabled' => true, 'content' => $hero]);
check('save hero', $r['status'] === 200, $r);
$s = site();
check('hero heading + image public', $s['home']['hero']['heading'] === 'New heading from the dashboard' && str_contains((string) $s['home']['hero']['image'], 'uploads/'));
$why = $home['sections']['why']['content'];
$why['cards'][] = ['title' => 'Delivery', 'text' => 'We can arrange delivery.', 'icon' => 'truck', 'image_id' => null];
array_shift($why['cards']);
$r = req('PUT', 'content/home/why', ['enabled' => true, 'content' => $why]);
check('add/remove benefit cards', $r['status'] === 200 && count(site()['home']['why']['cards']) === 4 && site()['home']['why']['cards'][3]['icon'] === 'truck');
$r = req('PUT', 'content/home/reviews', ['enabled' => false, 'content' => $home['sections']['reviews']['content']]);
check('hide a section', site()['home']['reviews']['enabled'] === false);
$r = req('PUT', 'content/home/reviews', ['enabled' => true, 'content' => $home['sections']['reviews']['content']]);
$about = req('GET', 'content/pages/about')['data']['content'];
$about['title'] = 'About us (edited)';
$about['sections'][] = ['heading' => 'Delivery', 'paragraphs' => ['We deliver around Masaka.'], 'steps' => []];
$r = req('PUT', 'content/pages/about', ['content' => $about]);
check('edit About page', $r['status'] === 200 && site()['pages']['about']['title'] === 'About us (edited)' && count(site()['pages']['about']['sections']) === 3);
$r = req('PUT', 'settings/contact', ['whatsapp_number' => '0803 123 4567', 'address' => 'Test address', 'email' => 'not-an-email']);
check('invalid email rejected', $r['status'] === 422 && isset($r['error']['fields']['email']));
$r = req('PUT', 'settings/contact', ['whatsapp_number' => '0803 123 4567', 'whatsapp_display' => '+234 803 123 4567', 'address' => 'Test address', 'email' => 'sales@example.com', 'social_facebook' => 'https://facebook.com/example', 'map_url' => 'https://maps.google.com/?q=1']);
check('save contact details', $r['status'] === 200, $r);
check('WhatsApp number normalised to international digits', site()['settings']['whatsappNumber'] === '2348031234567');
$r = req('PUT', 'settings/branding', ['site_name' => 'MJ Timbershade', 'brand_line1' => 'MJ', 'brand_line2' => 'Timbershade', 'logo_id' => $logoId, 'color_primary' => '#123456', 'color_accent' => 'red']);
check('invalid colour rejected', $r['status'] === 422 && isset($r['error']['fields']['color_accent']));
$r = req('PUT', 'settings/branding', ['site_name' => 'MJ Timbershade', 'brand_line1' => 'MJ', 'brand_line2' => 'Timbershade', 'logo_id' => $logoId, 'color_primary' => '#123456']);
check('save branding with logo', $r['status'] === 200 && str_contains((string) site()['settings']['logo'], 'uploads/') && site()['settings']['colors']['primary'] === '#123456');

echo "Testimonials\n";
$r = req('POST', 'testimonials', ['customer_name' => 'Test Customer', 'quote' => 'Good wood.', 'is_published' => false]);
check('create hidden testimonial', $r['status'] === 201);
$tid = $r['data']['id'];
check('hidden testimonial not public', count(site()['testimonials']) === 0);
$r = req('PUT', "testimonials/$tid", ['customer_name' => 'Test Customer', 'quote' => 'Good wood.', 'is_published' => true, 'image_id' => $logoId]);
check('publish testimonial', count(site()['testimonials']) === 1 && site()['testimonials'][0]['image'] !== null);
$r = req('DELETE', "testimonials/$tid");
check('delete testimonial', $r['status'] === 200 && count(site()['testimonials']) === 0);

echo "Featured products and delete\n";
$all = req('GET', 'products', null, ['per_page' => 100])['data']['items'];
$r = req('PUT', 'products/featured', ['ids' => [$pid, $all[0]['id']]]);
$feat = array_values(array_filter(site()['products'], fn ($x) => $x['featured']));
usort($feat, fn ($a, $b) => $a['featuredOrder'] <=> $b['featuredOrder']);
check('featured selection and order', count($feat) === 2 && $feat[0]['id'] === $code, array_map(fn ($f) => [$f['id'], $f['featuredOrder']], $feat));
$r = req('DELETE', "products/$pid");
check('delete product', $r['status'] === 200 && !in_array($code, array_column(site()['products'], 'id'), true));
$r = req('DELETE', "media/$mid", null, ['force' => '1']);
check('force-delete image clears references', $r['status'] === 200 && site()['home']['hero']['image'] === null);

echo "Dashboard and logout\n";
$r = req('GET', 'dashboard');
check('dashboard stats', $r['status'] === 200 && $r['data']['products'] === 10 && count($r['data']['recent']) > 5);
$r = req('POST', 'auth/logout');
check('logout', $r['status'] === 200);
$r = req('GET', 'products');
check('after logout API refuses', $r['status'] === 401);

echo "Rate limiting\n";
refreshCsrf();
$codes = [];
for ($i = 0; $i < 6; $i++) $codes[] = req('POST', 'auth/login', ['username' => 'Admin', 'password' => 'bad' . $i])['status'];
check('5 failures then locked (429)', $codes === [401, 401, 401, 401, 401, 429], $codes);
$r = req('POST', 'auth/login', ['username' => 'Admin', 'password' => 'Strong-Timber-99']);
check('correct password also blocked while locked', $r['status'] === 429);

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
