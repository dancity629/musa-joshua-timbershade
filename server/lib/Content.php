<?php
/*
 * Website content: settings, homepage sections and page content.
 * Each editable block has a whitelist validator, so only known fields are
 * ever stored. Images are stored as Media Library IDs.
 */
declare(strict_types=1);

final class Content
{
    public const HOME_SECTIONS = [
        'hero' => 'Hero',
        'categories' => 'Categories',
        'featured' => 'Featured products',
        'why' => 'Why Choose Us',
        'reviews' => 'Reviews',
        'about' => 'About section',
        'contact' => 'Contact section',
    ];
    public const PAGES = ['about' => 'About page', 'contact' => 'Contact page'];
    public const ICONS = ['timber', 'check', 'phone', 'home', 'truck', 'star', 'tools', 'clock'];
    public const UNITS = ['piece', 'length', 'bundle', 'pack', 'kg', 'bag', 'sheet', 'roll', 'tin', 'carton', 'set', 'metre'];

    public static function sectionLabel(string $key): string
    {
        return self::HOME_SECTIONS[$key] ?? $key;
    }

    /* ---------- Settings ---------- */

    private static ?array $settings = null;

    public static function settings(): array
    {
        if (self::$settings === null) {
            self::$settings = [];
            foreach (Db::all('SELECT setting_key, setting_value FROM website_settings') as $r) {
                self::$settings[$r['setting_key']] = json_decode($r['setting_value'], true);
            }
        }
        return self::$settings;
    }

    public static function setting(string $key)
    {
        return self::settings()[$key] ?? null;
    }

    public static function saveSettings(array $values): void
    {
        foreach ($values as $k => $v) {
            Db::run('INSERT INTO website_settings (setting_key, setting_value) VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
                [$k, json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        }
        self::$settings = null;
    }

    public static function settingMediaKeys(): array
    {
        return ['logo_id' => 'Logo', 'favicon_id' => 'Favicon', 'og_image_id' => 'Social sharing image'];
    }

    /**
     * Settings groups edited by the dashboard. Each returns the cleaned values
     * for the keys it owns; unknown keys are ignored.
     */
    public static function validateSettings(string $group, Input $in): array
    {
        switch ($group) {
            case 'branding':
                $v = [
                    'site_name' => $in->str('site_name', 100, true, 'Business name'),
                    'brand_line1' => $in->str('brand_line1', 40, true, 'Logo text, first line'),
                    'brand_line2' => $in->str('brand_line2', 40, false, 'Logo text, second line'),
                    'tagline' => $in->str('tagline', 160, false, 'Tagline'),
                    'logo_id' => $in->mediaId('logo_id', 'Logo'),
                    'favicon_id' => $in->mediaId('favicon_id', 'Favicon'),
                    'color_primary' => $in->hexColor('color_primary', '#1B4332', 'Forest green'),
                    'color_primary_deep' => $in->hexColor('color_primary_deep', '#143326', 'Deep green'),
                    'color_cream' => $in->hexColor('color_cream', '#F5F0E6', 'Cream'),
                    'color_accent' => $in->hexColor('color_accent', '#8B5E3C', 'Timber brown'),
                    'footer_tagline' => $in->str('footer_tagline', 200, false, 'Footer text'),
                ];
                break;
            case 'contact':
                $v = [
                    'whatsapp_number' => $in->phoneDigits('whatsapp_number', true, 'WhatsApp number'),
                    'whatsapp_display' => $in->str('whatsapp_display', 30, false, 'WhatsApp number as shown'),
                    'phone' => $in->str('phone', 30, false, 'Phone number'),
                    'email' => $in->email('email', 'Business email'),
                    'address' => $in->str('address', 300, false, 'Address'),
                    'map_url' => $in->httpsUrl('map_url', 1000, 'Google Maps link'),
                    'map_embed_url' => $in->httpsUrl('map_embed_url', 1000, 'Map embed address'),
                    'map_label' => $in->str('map_label', 80, false, 'Map link text'),
                    'opening_hours' => $in->str('opening_hours', 200, false, 'Opening hours'),
                    'social_facebook' => $in->httpsUrl('social_facebook', 300, 'Facebook link'),
                    'social_instagram' => $in->httpsUrl('social_instagram', 300, 'Instagram link'),
                    'social_tiktok' => $in->httpsUrl('social_tiktok', 300, 'TikTok link'),
                    'social_x' => $in->httpsUrl('social_x', 300, 'X (Twitter) link'),
                    'social_youtube' => $in->httpsUrl('social_youtube', 300, 'YouTube link'),
                ];
                if ($v['map_embed_url'] !== '' && !preg_match('#^https://(www\.)?(google\.[a-z.]+|maps\.google\.[a-z.]+)/#i', $v['map_embed_url'])) {
                    $in->fail('map_embed_url', 'The map embed must be a Google Maps address.');
                }
                if ($v['whatsapp_display'] === '' && $v['whatsapp_number'] !== '') $v['whatsapp_display'] = '+' . $v['whatsapp_number'];
                break;
            case 'general':
                $v = [
                    'site_description' => $in->str('site_description', 300, false, 'Website description'),
                    'seo_title' => $in->str('seo_title', 70, false, 'SEO title'),
                    'seo_description' => $in->str('seo_description', 170, false, 'SEO description'),
                    'og_image_id' => $in->mediaId('og_image_id', 'Social sharing image'),
                    'currency' => $in->oneOf('currency', ['NGN'], 'NGN'),
                    'price_mode' => $in->oneOf('price_mode', ['contact', 'show'], 'contact'),
                    'price_note' => $in->str('price_note', 300, false, 'Price note'),
                    'footer_text' => $in->str('footer_text', 200, false, 'Footer note'),
                    'copyright_text' => $in->str('copyright_text', 120, false, 'Copyright'),
                ];
                break;
            default:
                throw new ApiError(404, 'not_found', 'Unknown settings group.');
        }
        $in->check();
        return $v;
    }

    /* ---------- Homepage sections and pages ---------- */

    public static function validateSection(string $key, Input $in): array
    {
        $common = fn () => [
            'eyebrow' => $in->str('eyebrow', 60, false, 'Small label'),
            'heading' => $in->str('heading', 150, true, 'Heading'),
        ];
        switch ($key) {
            case 'hero':
                $v = $common() + [
                    'text' => $in->str('text', 400, false, 'Supporting text', true),
                    'image_id' => $in->mediaId('image_id', 'Hero image'),
                    'image_alt' => $in->str('image_alt', 200, false, 'Image description'),
                    'button_text' => $in->str('button_text', 40, true, 'Button text'),
                    'button_url' => $in->link('button_url', 300, true, 'Button destination'),
                    'whatsapp_button_text' => $in->str('whatsapp_button_text', 40, false, 'WhatsApp button text'),
                    'points' => $in->strList('points', 6, 80, 'Highlights'),
                ];
                break;
            case 'categories':
            case 'reviews':
            case 'contact':
                $v = $common() + ['text' => $in->str('text', 500, false, 'Supporting text', true)];
                break;
            case 'featured':
                $v = $common() + [
                    'button_text' => $in->str('button_text', 40, false, 'Button text'),
                    'limit' => $in->int('limit', 1, 12, 6, 'Number of products shown'),
                ];
                break;
            case 'why':
                $v = $common() + [
                    'cards' => $in->objList('cards', 8, function (Input $c) {
                        return [
                            'title' => $c->str('title', 80, true, 'Card title'),
                            'text' => $c->str('text', 300, false, 'Card text', true),
                            'icon' => $c->oneOf('icon', self::ICONS, 'check'),
                            'image_id' => $c->mediaId('image_id', 'Card image'),
                        ];
                    }, 'Benefit cards'),
                ];
                break;
            case 'about':
                $v = $common() + [
                    'paragraphs' => $in->strList('paragraphs', 6, 1000, 'Paragraphs'),
                    'image_id' => $in->mediaId('image_id', 'Image'),
                    'image_alt' => $in->str('image_alt', 200, false, 'Image description'),
                    'button_text' => $in->str('button_text', 40, false, 'Button text'),
                    'button_url' => $in->link('button_url', 300, false, 'Button destination'),
                ];
                break;
            default:
                throw new ApiError(404, 'not_found', 'Unknown homepage section.');
        }
        $in->check();
        return $v;
    }

    public static function validatePage(string $slug, Input $in): array
    {
        switch ($slug) {
            case 'about':
                $v = [
                    'eyebrow' => $in->str('eyebrow', 60, false, 'Small label'),
                    'title' => $in->str('title', 150, true, 'Page title'),
                    'intro' => $in->str('intro', 400, false, 'Main introduction', true),
                    'sections' => $in->objList('sections', 8, function (Input $s) {
                        return [
                            'heading' => $s->str('heading', 150, true, 'Section heading'),
                            'paragraphs' => $s->strList('paragraphs', 8, 1500, 'Paragraphs'),
                            'steps' => $s->strList('steps', 10, 300, 'Numbered steps'),
                        ];
                    }, 'Content sections'),
                    'image_ids' => $in->mediaIds('image_ids', 4, 'Images'),
                    'supply_heading' => $in->str('supply_heading', 150, false, 'Categories heading'),
                    'cta_heading' => $in->str('cta_heading', 150, false, 'Closing heading'),
                    'cta_text' => $in->str('cta_text', 300, false, 'Closing text'),
                ];
                break;
            case 'contact':
                $v = [
                    'eyebrow' => $in->str('eyebrow', 60, false, 'Small label'),
                    'title' => $in->str('title', 150, true, 'Page title'),
                    'intro' => $in->str('intro', 400, false, 'Introduction', true),
                    'card_note' => $in->str('card_note', 200, false, 'Note under the WhatsApp button'),
                    'form_heading' => $in->str('form_heading', 150, false, 'Enquiry form heading'),
                    'form_intro' => $in->str('form_intro', 400, false, 'Enquiry form description', true),
                ];
                break;
            default:
                throw new ApiError(404, 'not_found', 'Unknown page.');
        }
        $in->check();
        return $v;
    }

    public static function homeSections(): array
    {
        $out = [];
        foreach (Db::all('SELECT section_key, is_enabled, content, updated_at FROM homepage_sections') as $r) {
            $out[$r['section_key']] = [
                'enabled' => (bool) $r['is_enabled'],
                'content' => json_decode($r['content'], true) ?: [],
                'updated_at' => $r['updated_at'],
            ];
        }
        return $out;
    }

    public static function page(string $slug): array
    {
        $row = Db::one('SELECT content FROM pages WHERE slug = ?', [$slug]);
        return $row ? (json_decode($row['content'], true) ?: []) : [];
    }

    /** All media IDs referenced anywhere in a content structure (keys image_id / image_ids). */
    public static function mediaIdsIn($data): array
    {
        $ids = [];
        $walk = function ($node) use (&$walk, &$ids) {
            if (!is_array($node)) return;
            foreach ($node as $k => $v) {
                if ($k === 'image_id' && is_int($v)) $ids[] = $v;
                elseif ($k === 'image_ids' && is_array($v)) foreach ($v as $x) if (is_int($x)) $ids[] = $x;
                elseif (is_array($v)) $walk($v);
            }
        };
        $walk($data);
        return array_values(array_unique($ids));
    }

    /** Replace image_id / image_ids in a structure with resolved {src, alt} objects. */
    public static function resolveImages($data, array $media)
    {
        if (!is_array($data)) return $data;
        $out = [];
        foreach ($data as $k => $v) {
            if ($k === 'image_id') {
                $m = is_int($v) ? ($media[$v] ?? null) : null;
                $out['image'] = $m ? $m['url'] : null;
            } elseif ($k === 'image_ids' && is_array($v)) {
                $out['images'] = array_values(array_filter(array_map(fn ($id) => isset($media[$id]) ? ['src' => $media[$id]['url'], 'alt' => $media[$id]['alt']] : null, $v)));
            } else {
                $out[$k] = is_array($v) ? self::resolveImages($v, $media) : $v;
            }
        }
        return $out;
    }

    /* ---------- Public site payload ---------- */

    /** Everything the public pages need, in one response. */
    public static function publicSite(): array
    {
        $s = self::settings();
        $priceMode = ($s['price_mode'] ?? 'contact') === 'show' ? 'show' : 'contact';

        $categories = Db::all('SELECT id, slug, name, description, image_id FROM categories ORDER BY sort_order, name');
        $products = Db::all(
            'SELECT p.*, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id
             ORDER BY p.sort_order, p.name'
        );
        $gallery = [];
        foreach (Db::all('SELECT product_id, media_id FROM product_images ORDER BY sort_order, id') as $g) {
            $gallery[(int) $g['product_id']][] = (int) $g['media_id'];
        }
        $testimonials = Db::all('SELECT customer_name, quote, context, image_id FROM testimonials WHERE is_published = 1 ORDER BY sort_order, id');
        $home = self::homeSections();
        $pages = ['about' => self::page('about'), 'contact' => self::page('contact')];

        $mediaIds = array_merge(
            array_column($categories, 'image_id'), array_column($products, 'image_id'), array_column($testimonials, 'image_id'),
            array_merge([], ...array_values($gallery)),
            [$s['logo_id'] ?? null, $s['favicon_id'] ?? null, $s['og_image_id'] ?? null],
            self::mediaIdsIn(array_column($home, 'content')), self::mediaIdsIn($pages)
        );
        $media = Media::many(array_filter($mediaIds));
        $src = fn ($id) => $id && isset($media[(int) $id]) ? $media[(int) $id]['url'] : null;

        $homeOut = [];
        foreach (self::HOME_SECTIONS as $key => $_) {
            $sec = $home[$key] ?? ['enabled' => false, 'content' => []];
            $homeOut[$key] = ['enabled' => $sec['enabled']] + self::resolveImages($sec['content'], $media);
        }

        return [
            'settings' => [
                'siteName' => $s['site_name'] ?? '',
                'brandLine1' => $s['brand_line1'] ?? '',
                'brandLine2' => $s['brand_line2'] ?? '',
                'tagline' => $s['tagline'] ?? '',
                'siteDescription' => $s['site_description'] ?? '',
                'seoTitle' => $s['seo_title'] ?? '',
                'seoDescription' => $s['seo_description'] ?? '',
                'ogImage' => $src($s['og_image_id'] ?? null),
                'logo' => $src($s['logo_id'] ?? null),
                'favicon' => $src($s['favicon_id'] ?? null),
                'colors' => [
                    'primary' => $s['color_primary'] ?? '#1B4332',
                    'primaryDeep' => $s['color_primary_deep'] ?? '#143326',
                    'cream' => $s['color_cream'] ?? '#F5F0E6',
                    'accent' => $s['color_accent'] ?? '#8B5E3C',
                ],
                'footerTagline' => $s['footer_tagline'] ?? '',
                'footerText' => $s['footer_text'] ?? '',
                'copyrightText' => $s['copyright_text'] ?? '',
                'whatsappNumber' => $s['whatsapp_number'] ?? '',
                'whatsappDisplay' => $s['whatsapp_display'] ?? '',
                'phone' => $s['phone'] ?? '',
                'email' => $s['email'] ?? '',
                'address' => $s['address'] ?? '',
                'mapUrl' => ($s['map_url'] ?? '') ?: null,
                'mapEmbedUrl' => ($s['map_embed_url'] ?? '') ?: null,
                'locationLabel' => $s['map_label'] ?? '',
                'openingHours' => $s['opening_hours'] ?? '',
                'socials' => array_filter([
                    'facebook' => $s['social_facebook'] ?? '',
                    'instagram' => $s['social_instagram'] ?? '',
                    'tiktok' => $s['social_tiktok'] ?? '',
                    'x' => $s['social_x'] ?? '',
                    'youtube' => $s['social_youtube'] ?? '',
                ]),
                'currency' => $s['currency'] ?? 'NGN',
                'priceMode' => $priceMode,
                'priceNote' => $s['price_note'] ?? '',
            ],
            'categories' => array_map(fn ($c) => [
                'id' => $c['slug'],
                'name' => $c['name'],
                'description' => $c['description'],
                'image' => $src($c['image_id']),
            ], $categories),
            'products' => array_map(fn ($p) => [
                'id' => $p['code'],
                'name' => $p['name'],
                'category' => $p['category_slug'],
                'description' => (string) $p['description'],
                'image' => $src($p['image_id']),
                'gallery' => array_values(array_filter(array_map($src, $gallery[(int) $p['id']] ?? []))),
                // Prices are only published when the business chooses to show them.
                'price' => $priceMode === 'show' && $p['price'] !== null ? (float) $p['price'] : null,
                'unit' => $p['unit'],
                'size' => $p['size_spec'],
                'stock' => $p['stock'] === null ? null : (int) $p['stock'],
                'available' => (bool) $p['is_available'] && ($p['stock'] === null || (int) $p['stock'] > 0),
                'featured' => (bool) $p['is_featured'],
                'featuredOrder' => (int) $p['featured_order'],
            ], $products),
            'testimonials' => array_map(fn ($t) => [
                'name' => $t['customer_name'],
                'quote' => $t['quote'],
                'context' => $t['context'],
                'image' => $src($t['image_id']),
            ], $testimonials),
            'home' => $homeOut,
            'pages' => [
                'about' => self::resolveImages($pages['about'], $media),
                'contact' => self::resolveImages($pages['contact'], $media),
            ],
        ];
    }
}
