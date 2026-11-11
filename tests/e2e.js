/*
 * End-to-end browser test: edits made in the admin dashboard show up on the
 * public website, and the cart + WhatsApp checkout keep working.
 *
 * Needs a fresh install served by PHP and Playwright:
 *   php server/cli-install.php
 *   php -S 127.0.0.1:8080 server/dev-router.php &
 *   node tests/e2e.js http://127.0.0.1:8080 [screenshot-dir]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://127.0.0.1:8080';
const SHOTS = process.argv[3] || null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const NEW_PASSWORD = 'E2E-Timber-Pass-1';
let pass = 0;
let fail = 0;

function check(label, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + label); } else { fail++; console.log('  FAIL ' + label + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); }
}

function makePng(file, color) {
  // 1x1 PNG pixel scaled by the browser is enough for upload tests.
  const b64 = color === 'red'
    ? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
    : 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });
}

async function waitToast(page, text) {
  await page.locator('.toast', { hasText: text }).last().waitFor();
}

async function saveSection(page, summaryText) {
  const section = page.locator('details.section', { has: page.locator('summary', { hasText: summaryText }) });
  await section.locator('form button[type=submit]').click();
  await waitToast(page, summaryText);
}

(async () => {
  const browser = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mjt-e2e-'));
  const logo = makePng(path.join(tmp, 'logo.png'), 'red');
  const productImg = makePng(path.join(tmp, 'cement.png'), 'green');
  const errors = [];

  /* ---------- Public site before any change ---------- */
  console.log('Public site reads from the backend');
  const pub = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  pub.on('pageerror', (e) => errors.push('public: ' + e.message));
  await pub.goto(BASE + '/index.html');
  await pub.waitForSelector('#featured-products .product-card');
  check('site data came from the API', await pub.evaluate(() => MJT.site.source) === 'api');
  check('5 category tiles (incl. Other Building Materials)', await pub.locator('#category-grid li').count() === 5);
  check('6 featured products', await pub.locator('#featured-products .product-card').count() === 6);

  /* ---------- Admin: login and forced password change ---------- */
  console.log('Admin login');
  const admin = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  admin.on('pageerror', (e) => errors.push('admin: ' + e.message));
  await admin.goto(BASE + '/admin/');
  await admin.fill('#login-username', 'Admin');
  await admin.fill('#login-password', 'Admin');
  await admin.click('button[type=submit]');
  await admin.waitForSelector('.sidebar');
  await admin.waitForSelector('main h1');
  check('forced to change default password', (await admin.textContent('main h1')) === 'Change Password');
  await admin.evaluate(() => { location.hash = '#/products'; });
  await admin.waitForTimeout(500);
  check('other pages blocked until password changed', (await admin.textContent('main h1')) === 'Change Password');
  const pw = admin.locator('main input[type=password]');
  await pw.nth(0).fill('Admin'); await pw.nth(1).fill(NEW_PASSWORD); await pw.nth(2).fill(NEW_PASSWORD);
  await admin.click('main form button[type=submit]');
  await admin.waitForFunction(() => location.hash === '#/overview');
  await admin.waitForSelector('.stat');
  check('overview shows stats', (await admin.locator('.stat').count()) === 6);

  /* ---------- Branding: upload a logo ---------- */
  console.log('Branding and contact details');
  await admin.evaluate(() => { location.hash = '#/branding'; });
  await admin.waitForSelector('main form');
  await admin.locator('[data-field="logo_id"] button', { hasText: 'Choose image' }).click();
  await admin.waitForSelector('dialog.modal[open] .media-grid');
  await admin.setInputFiles('dialog.modal[open] input[type=file]', logo);
  await admin.waitForSelector('[data-field="logo_id"] .image-field__preview img');
  await admin.fill('[data-field="brand_line1"] input', 'Musa J.');
  await admin.click('main form button[type=submit]');
  await waitToast(admin, 'Branding saved');
  await shot(admin, 'admin-branding');

  /* ---------- Contact: change WhatsApp number ---------- */
  await admin.evaluate(() => { location.hash = '#/contact'; });
  await admin.waitForSelector('[data-field="whatsapp_number"] input');
  await admin.fill('[data-field="whatsapp_number"] input', '+234 803 000 1111');
  await admin.fill('[data-field="email"] input', 'sales@example.com');
  await admin.locator('main form').first().locator('button[type=submit]').click();
  await waitToast(admin, 'Contact details saved');

  /* ---------- Settings: show prices ---------- */
  console.log('Price display setting');
  await admin.evaluate(() => { location.hash = '#/settings'; });
  await admin.waitForSelector('input[name=price_mode][value=show]');
  await admin.check('input[name=price_mode][value=show]');
  await admin.locator('main form').first().locator('button[type=submit]').click();
  await waitToast(admin, 'Website settings saved');

  /* ---------- Homepage: edit hero heading, hide reviews ---------- */
  console.log('Homepage editor');
  await admin.evaluate(() => { location.hash = '#/homepage'; });
  await admin.waitForSelector('details.section');
  await admin.fill('details.section[open] [data-field="heading"] input', 'Strong Timber for Strong Roofs');
  await saveSection(admin, 'Hero');
  const reviews = admin.locator('details.section', { has: admin.locator('summary', { hasText: 'Reviews' }) });
  await reviews.locator('summary').click();
  await reviews.locator('input[name=enabled]').uncheck();
  await saveSection(admin, 'Reviews');

  /* ---------- Products: add one with an uploaded image and a price ---------- */
  console.log('Product management');
  await admin.evaluate(() => { location.hash = '#/products/new'; });
  await admin.waitForSelector('[data-field="name"] input');
  await admin.click('main form button[type=submit]');
  await admin.waitForSelector('[data-field="name"] .field__error:not([hidden])');
  check('empty form shows field errors', true);
  await admin.fill('[data-field="name"] input', 'Cement (50kg)');
  await admin.selectOption('[data-field="category_id"] select', { label: 'Other Building Materials' });
  await admin.fill('[data-field="description"] textarea', 'Portland cement for blocks and plastering.');
  await admin.fill('[data-field="price"] input', '9500');
  await admin.fill('[data-field="unit"] input', 'bag');
  await admin.fill('[data-field="stock"] input', '40');
  await admin.locator('[data-field="image_id"] button', { hasText: 'Choose image' }).click();
  await admin.waitForSelector('dialog.modal[open] .media-grid');
  await admin.setInputFiles('dialog.modal[open] input[type=file]', productImg);
  await admin.waitForSelector('[data-field="image_id"] .image-field__preview img');
  await admin.click('main form button[type=submit]');
  await admin.waitForFunction(() => /#\/products\/\d+/.test(location.hash));
  check('product created and opened for editing', true);
  await shot(admin, 'admin-product-edit');

  // Mark the 2x2 batten unavailable from the list.
  await admin.evaluate(() => { location.hash = '#/products'; });
  await admin.waitForSelector('table.table');
  await admin.fill('main input[type=search]', 'batten');
  await admin.waitForTimeout(700);
  await admin.locator('table a', { hasText: 'Edit' }).first().click();
  await admin.waitForSelector('[name=is_available]');
  await admin.uncheck('[name=is_available]');
  await admin.click('main form button[type=submit]');
  await admin.waitForFunction(() => location.hash === '#/products');
  await admin.waitForSelector('table.table');
  await shot(admin, 'admin-products');

  /* ---------- Public site reflects every change ---------- */
  console.log('Public website after admin changes');
  await pub.goto(BASE + '/index.html');
  await pub.waitForSelector('#featured-products .product-card');
  check('hero heading updated', (await pub.textContent('.hero h1')) === 'Strong Timber for Strong Roofs');
  check('logo image in header and footer', (await pub.locator('.brand img.brand__logo').count()) === 2);
  check('logo text updated', (await pub.textContent('.site-header .brand__name')) === 'Musa J.');
  check('reviews section hidden', await pub.locator('[data-section="reviews"]').isHidden());
  const waHref = await pub.getAttribute('.contact-band a[data-wa-link]', 'href');
  check('WhatsApp links use the new number', waHref.startsWith('https://wa.me/2348030001111'), waHref);
  check('email shown in footer', (await pub.textContent('.footer-contact')).includes('sales@example.com'));
  await shot(pub, 'public-home');

  await pub.goto(BASE + '/products.html?q=cement');
  await pub.waitForSelector('#product-grid .product-card');
  const card = pub.locator('.product-card', { hasText: 'Cement (50kg)' });
  check('new product on catalogue', (await card.count()) === 1);
  check('price shown in naira', ((await card.locator('.product-card__price').textContent()) || '').startsWith('₦9,500'));
  check('uploaded product image used', ((await card.locator('img').getAttribute('src')) || '').includes('/uploads/'));
  await card.locator('.qty-input').fill('3');
  await card.locator('button', { hasText: 'Add to Cart' }).click();

  await pub.goto(BASE + '/products.html?q=batten');
  await pub.waitForSelector('#product-grid .product-card');
  const batten = pub.locator('.product-card', { hasText: 'Batten' });
  check('unavailable product labelled and cannot be added', (await batten.locator('.product-card__badge').count()) === 1 && await batten.locator('button', { hasText: 'Unavailable' }).isDisabled());

  await pub.goto(BASE + '/products.html?category=other-building-materials');
  await pub.waitForSelector('#product-grid .product-card');
  check('category filter chip from database', (await pub.locator('.chip', { hasText: 'Other Building Materials' }).getAttribute('aria-pressed')) === 'true');

  console.log('Cart and WhatsApp checkout');
  await pub.goto(BASE + '/cart.html');
  await pub.waitForSelector('.cart-item');
  check('cart line total', (await pub.textContent('.cart-item__price')).includes('₦28,500'));
  check('estimated total in summary', (await pub.textContent('.cart-summary')).includes('₦28,500'));
  await shot(pub, 'public-cart');
  // Do not leave the test machine: answer wa.me requests locally and record the URL.
  await pub.context().route(/wa\.me|whatsapp\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'WhatsApp stub' }));
  const [popup] = await Promise.all([
    pub.waitForEvent('popup'),
    pub.click('button[data-action="whatsapp-checkout"]')
  ]);
  const waUrl = popup.url();
  await popup.close();
  const text = decodeURIComponent(waUrl.split('text=')[1] || '');
  check('checkout opens WhatsApp with the new number', /wa\.me\/2348030001111|api\.whatsapp\.com.*2348030001111|phone=2348030001111/.test(waUrl), waUrl);
  check('order message has item, quantity and price', text.includes('Cement (50kg)') && text.includes('3 bags') && text.includes('₦9,500') && text.includes('Estimated total: ₦28,500'), text);
  await pub.click('text=Yes, I sent it');
  await pub.waitForTimeout(300);
  check('cart cleared after confirming', (await pub.evaluate(() => MJT.cart.count())) === 0);

  /* ---------- Contact for price mode ---------- */
  await admin.evaluate(() => { location.hash = '#/settings'; });
  await admin.waitForSelector('input[name=price_mode][value=contact]');
  await admin.check('input[name=price_mode][value=contact]');
  await admin.locator('main form').first().locator('button[type=submit]').click();
  await waitToast(admin, 'Website settings saved');
  await pub.goto(BASE + '/products.html?q=cement');
  await pub.waitForSelector('#product-grid .product-card');
  check('contact-for-price mode hides prices', (await pub.locator('.product-card__price').count()) === 0);
  const leaked = await pub.evaluate(() => MJT.productsData.some((p) => p.price != null));
  check('prices not sent to browsers in contact mode', leaked === false);

  /* ---------- About page ---------- */
  await pub.goto(BASE + '/about.html');
  await pub.waitForSelector('#supply-list li');
  check('about page supply list built from categories', (await pub.locator('#supply-list li').count()) === 5);

  /* ---------- Mobile layouts ---------- */
  console.log('Mobile');
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  const m = await phone.newPage();
  await m.goto(BASE + '/index.html');
  await m.waitForSelector('#featured-products .product-card');
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('public homepage has no horizontal scroll on phone', !overflow);
  await shot(m, 'mobile-public-home');
  const cookies = await admin.context().cookies();
  await phone.addCookies(cookies);
  await m.goto(BASE + '/admin/#/products');
  await m.waitForSelector('table.table');
  const adminOverflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('admin products page has no horizontal scroll on phone', !adminOverflow);
  await m.click('.topbar__menu');
  await m.waitForSelector('.sidebar.is-open');
  check('mobile menu opens', true);
  await shot(m, 'mobile-admin-menu');

  /* ---------- Logout ---------- */
  console.log('Logout');
  await admin.click('[data-action="logout"]');
  await admin.waitForSelector('#login-form');
  check('logout returns to login', true);
  await admin.goto(BASE + '/admin/#/products');
  check('dashboard not rendered after logout', (await admin.locator('.sidebar').count()) === 0);

  check('no JavaScript errors', errors.length === 0, errors);
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
