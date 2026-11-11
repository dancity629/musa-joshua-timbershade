<?php
/*
 * Creates the tables and fills them with the website's current content, so
 * the site looks exactly as before on first launch. Used by install.php
 * (browser) and server/cli-install.php (command line).
 *
 * The initial login is Admin / Admin. It is stored only as a password hash and
 * flagged must_change_password, so the API refuses every change until it is replaced.
 */
declare(strict_types=1);

final class Installer
{
    public static function isInstalled(): bool
    {
        try {
            return (int) Db::value('SELECT COUNT(*) FROM admins') > 0;
        } catch (PDOException $e) {
            return false; // table missing
        }
    }

    public static function run(): array
    {
        if (self::isInstalled()) throw new RuntimeException('Already installed: an admin account exists.');
        $log = [];

        $sql = file_get_contents(MJT_SERVER . '/schema.sql');
        $sql = preg_replace('/^\s*--.*$/m', '', (string) $sql);
        foreach (array_filter(array_map('trim', explode(';', (string) $sql))) as $stmt) {
            Db::pdo()->exec($stmt);
        }
        $log[] = 'Created tables.';

        Db::tx(function () use (&$log) {
            Db::run('INSERT INTO admins (username, password_hash, must_change_password) VALUES (?, ?, 1)',
                ['Admin', password_hash('Admin', PASSWORD_DEFAULT)]);
            $log[] = 'Created the initial admin account (must change password at first login).';

            $media = [];
            foreach (self::builtinImages() as $file => [$title, $alt]) {
                $path = 'assets/images/' . $file;
                $full = MJT_ROOT . '/' . $path;
                $size = is_file($full) ? (int) filesize($full) : 0;
                $media[$file] = Db::insert(
                    'INSERT INTO media_library (file_path, title, alt_text, original_name, mime_type, size_bytes, width, height, is_builtin)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
                    [$path, $title, $alt, $file, 'image/svg+xml', $size, 800, 600]
                );
            }
            $log[] = 'Added ' . count($media) . ' existing images to the Media Library.';

            $cats = [
                ['roofing-woods', 'Roofing Woods', 'Rafters and battens for roof framing.', 'roofing-wood-2x3.svg'],
                ['planks', 'Planks', 'Fascia boards and planks for roofing, formwork and carpentry.', 'plank-1x10.svg'],
                ['timber', 'Timber', 'Heavier sections for joists, lintels and framing.', 'timber-2x6.svg'],
                ['nails', 'Nails', 'Wire nails in common sizes.', 'nails-3in.svg'],
                ['other-building-materials', 'Other Building Materials', 'Other materials for your build. Ask us on WhatsApp for anything not listed.', 'hero-timber.svg'],
            ];
            $catIds = [];
            foreach ($cats as $i => [$slug, $name, $desc, $img]) {
                $catIds[$slug] = Db::insert('INSERT INTO categories (slug, name, description, image_id, sort_order) VALUES (?, ?, ?, ?, ?)',
                    [$slug, $name, $desc, $media[$img], ($i + 1) * 10]);
            }
            $log[] = 'Added ' . count($cats) . ' categories.';

            // [code, name, category, unit, image, description, featured, size]
            $products = [
                ['rw-2x3-12ft', '2" x 3" Roofing Wood', 'roofing-woods', 'piece', 'roofing-wood-2x3.svg', 'Standard rafter and purlin size for residential roof framing.', true, '2" x 3"'],
                ['rw-2x4-12ft', '2" x 4" Roofing Wood', 'roofing-woods', 'piece', 'roofing-wood-2x4.svg', 'Heavier rafter section for wider spans and hip roofs.', true, '2" x 4"'],
                ['rw-batten-2x2', '2" x 2" Batten', 'roofing-woods', 'piece', 'batten-2x2.svg', 'Batten for fixing roofing sheets and ceiling noggins.', false, '2" x 2"'],
                ['rw-fascia-1x10', '1" x 10" Fascia Board', 'planks', 'piece', 'fascia-board.svg', 'Finishing board for roof edges and eaves.', true, '1" x 10"'],
                ['pl-1x10-12ft', '1" x 10" Plank', 'planks', 'length', 'plank-1x10.svg', 'All-purpose plank for carpentry and concrete formwork.', true, '1" x 10"'],
                ['pl-1x6-12ft', '1" x 6" Plank', 'planks', 'length', 'plank-1x6.svg', 'Narrow plank for edging, bracing and light framing.', false, '1" x 6"'],
                ['tb-2x6-12ft', '2" x 6" Timber', 'timber', 'piece', 'timber-2x6.svg', 'Strong section for joists, lintels and roof members.', true, '2" x 6"'],
                ['nl-wire-2in', '2" Wire Nails', 'nails', 'kg', 'nails-2in.svg', 'Common nails for light carpentry and battens.', false, '2 inch'],
                ['nl-wire-3in', '3" Wire Nails', 'nails', 'kg', 'nails-3in.svg', 'General-purpose nails for formwork and framing.', true, '3 inch'],
                ['nl-wire-4in', '4" Wire Nails', 'nails', 'kg', 'nails-4in.svg', 'Long nails for heavy timber and roof trusses.', false, '4 inch'],
            ];
            $featuredOrder = 0;
            foreach ($products as $i => [$code, $name, $cat, $unit, $img, $desc, $featured, $size]) {
                Db::insert(
                    'INSERT INTO products (code, name, category_id, description, image_id, price, unit, size_spec, stock, is_available, is_featured, featured_order, sort_order)
                     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1, ?, ?, ?)',
                    [$code, $name, $catIds[$cat], $desc, $media[$img], $unit, $size, $featured ? 1 : 0, $featured ? ++$featuredOrder : 0, ($i + 1) * 10]
                );
            }
            $log[] = 'Added ' . count($products) . ' products (prices empty; the site starts in "Contact for price" mode).';

            Content::saveSettings([
                'site_name' => 'Musa Joshua Timbershade',
                'brand_line1' => 'Musa Joshua',
                'brand_line2' => 'Timbershade',
                'tagline' => 'Timber & building materials',
                'logo_id' => null,
                'favicon_id' => null,
                'color_primary' => '#1B4332',
                'color_primary_deep' => '#143326',
                'color_cream' => '#F5F0E6',
                'color_accent' => '#8B5E3C',
                'footer_tagline' => 'Roofing woods, planks, timber and nails.',
                'whatsapp_number' => '2348024694963',
                'whatsapp_display' => '+234 802 469 4963',
                'phone' => '',
                'email' => '',
                'address' => 'Before Blascu Hotel, Area 1 - Luvu Road, Masaka, Karu LGA, Nasarawa State',
                'map_url' => 'https://www.google.com/maps/place/Musa+Joshua+Timbershade/@9.0151248,7.6712323,17z/data=!3m1!4b1!4m6!3m5!1s0x104e05d70796010b:0xc0529a7f757caf92!8m2!3d9.0151195!4d7.6738072!16s%2Fg%2F11zz84ffv0',
                'map_embed_url' => 'https://maps.google.com/maps?q=9.0151195,7.6738072&z=16&output=embed',
                'map_label' => 'View on Google Maps',
                'opening_hours' => '',
                'social_facebook' => '', 'social_instagram' => '', 'social_tiktok' => '', 'social_x' => '', 'social_youtube' => '',
                'site_description' => 'Roofing woods, planks, timber and nails from Musa Joshua Timbershade. Browse the catalogue and order on WhatsApp.',
                'seo_title' => 'Musa Joshua Timbershade | Timber and Building Materials',
                'seo_description' => 'Roofing woods, planks, timber and nails from Musa Joshua Timbershade. Browse the catalogue and order on WhatsApp.',
                'og_image_id' => null,
                'currency' => 'NGN',
                'price_mode' => 'contact',
                'price_note' => 'We do not list prices online. Add what you need to your cart and send it on WhatsApp, and we will reply with current prices and availability.',
                'footer_text' => 'Prices and availability are confirmed on WhatsApp.',
                'copyright_text' => 'Musa Joshua Timbershade',
            ]);

            $sections = [
                'hero' => [
                    'eyebrow' => 'Timber & building materials',
                    'heading' => 'Quality Timber and Building Materials You Can Trust.',
                    'text' => 'Find roofing woods, planks, timber and nails for your next project.',
                    'image_id' => $media['hero-timber.svg'],
                    'image_alt' => 'Illustration of stacked timber in front of a roof truss',
                    'button_text' => 'Browse Products',
                    'button_url' => 'products.html',
                    'whatsapp_button_text' => 'Order on WhatsApp',
                    'points' => ['Browse sizes online', 'Build your list online', 'Send your order on WhatsApp'],
                ],
                'categories' => ['eyebrow' => 'Shop by category', 'heading' => 'What we supply', 'text' => ''],
                'featured' => ['eyebrow' => 'Popular materials', 'heading' => 'Featured products', 'button_text' => 'View all products', 'limit' => 6],
                'why' => [
                    'eyebrow' => 'Why choose us',
                    'heading' => 'Straightforward supply for your build',
                    'cards' => [
                        ['title' => 'Quality materials', 'text' => 'Roofing woods, planks, timber and fittings chosen for real building work, from roof framing to formwork.', 'icon' => 'timber', 'image_id' => null],
                        ['title' => 'Reliable service', 'text' => 'We confirm prices and availability with you before your order goes ahead, so there are no surprises.', 'icon' => 'check', 'image_id' => null],
                        ['title' => 'Convenient ordering', 'text' => 'Add what you need to your cart and send the full list to us on WhatsApp in one tap, with quantities included.', 'icon' => 'phone', 'image_id' => null],
                        ['title' => 'One stop for the job', 'text' => 'Roofing woods, planks, timber and nails in one place, so you can order everything together.', 'icon' => 'home', 'image_id' => null],
                    ],
                ],
                'reviews' => ['eyebrow' => 'Reviews', 'heading' => 'What our customers say', 'text' => ''],
                'about' => [
                    'eyebrow' => 'About us',
                    'heading' => 'Building materials from people who know timber',
                    'paragraphs' => [
                        'Musa Joshua Timbershade supplies roofing woods, planks, timber and nails to builders, contractors, carpenters and homeowners.',
                        'Whether you are roofing a house, casting a slab or finishing a carpentry job, tell us what you need and we will help you get the right materials.',
                    ],
                    'image_id' => $media['timber-2x6.svg'],
                    'image_alt' => 'Illustration of stacked hardwood timber',
                    'button_text' => 'More about us',
                    'button_url' => 'about.html',
                ],
                'contact' => ['eyebrow' => 'Contact', 'heading' => 'Talk to us on WhatsApp', 'text' => 'Ask about availability, sizes or bulk quantities.'],
            ];
            foreach ($sections as $key => $content) {
                Db::run('INSERT INTO homepage_sections (section_key, is_enabled, content) VALUES (?, 1, ?)',
                    [$key, json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
            }

            $pages = [
                'about' => [
                    'eyebrow' => 'About us',
                    'title' => 'About Musa Joshua Timbershade',
                    'intro' => 'Timber and building materials for builders, carpenters and homeowners.',
                    'sections' => [
                        ['heading' => 'Who we are', 'paragraphs' => [
                            'Musa Joshua Timbershade is a building materials business supplying roofing woods, planks, timber and nails for construction and carpentry work.',
                            'We serve builders, contractors, carpenters and homeowners who need dependable materials for roofing, formwork, framing and finishing. Our aim is simple: help you get the right materials for your project, with ordering that fits around your day.',
                        ], 'steps' => []],
                        ['heading' => 'How ordering works', 'paragraphs' => [], 'steps' => [
                            'Browse the catalogue. Find the sizes and quantities you need.',
                            'Build your cart. Your cart is saved on your device, so you can come back to it.',
                            'Send it on WhatsApp. Your full list, with quantities, is written into the message for you.',
                            'We confirm. We reply with prices, availability and delivery or pickup before anything is final.',
                        ]],
                    ],
                    'image_ids' => [$media['plank-1x6.svg'], $media['roofing-wood-2x4.svg']],
                    'supply_heading' => 'What we supply',
                    'cta_heading' => 'Ready to order?',
                    'cta_text' => 'Browse the catalogue or message us with your list.',
                ],
                'contact' => [
                    'eyebrow' => 'Contact',
                    'title' => 'Get in Touch',
                    'intro' => 'The fastest way to reach us is WhatsApp.',
                    'card_note' => 'Opens WhatsApp on your phone, or WhatsApp Web on a computer.',
                    'form_heading' => 'Send an enquiry',
                    'form_intro' => 'Fill this in and we will open WhatsApp with your message ready to send. Nothing is sent until you press Send in WhatsApp.',
                ],
            ];
            foreach ($pages as $slug => $content) {
                Db::run('INSERT INTO pages (slug, content) VALUES (?, ?)', [$slug, json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
            }
            $log[] = 'Copied homepage, About and Contact content from the current website.';
            // Testimonials start empty: only real customer reviews should be added.
        });

        return $log;
    }

    private static function builtinImages(): array
    {
        return [
            'hero-timber.svg' => ['Hero: stacked timber and roof truss', 'Illustration of stacked timber in front of a roof truss'],
            'roofing-wood-2x3.svg' => ['Roofing wood 2x3', 'Illustration of 2 by 3 inch roofing wood'],
            'roofing-wood-2x4.svg' => ['Roofing wood 2x4', 'Illustration of a bundle of roofing wood'],
            'batten-2x2.svg' => ['Batten 2x2', 'Illustration of 2 by 2 inch battens'],
            'fascia-board.svg' => ['Fascia board', 'Illustration of a fascia board'],
            'plank-1x10.svg' => ['Plank 1x10', 'Illustration of 1 by 10 inch planks'],
            'plank-1x6.svg' => ['Plank 1x6', 'Illustration of a stack of narrow timber planks'],
            'timber-2x6.svg' => ['Timber 2x6', 'Illustration of stacked hardwood timber'],
            'nails-2in.svg' => ['Wire nails 2 inch', 'Illustration of 2 inch wire nails'],
            'nails-3in.svg' => ['Wire nails 3 inch', 'Illustration of 3 inch wire nails'],
            'nails-4in.svg' => ['Wire nails 4 inch', 'Illustration of 4 inch wire nails'],
            'favicon.svg' => ['Favicon (built-in)', 'Musa Joshua Timbershade icon'],
        ];
    }
}
