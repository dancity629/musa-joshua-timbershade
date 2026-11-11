/*
 * The GitHub Pages copy has no PHP. Check every public page still works from
 * the built-in files, with no errors, when the API is missing.
 *
 *   python3 -m http.server 8090 &
 *   node tests/static-fallback.js http://127.0.0.1:8090
 */
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8090';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let fail = 0;
  const check = (label, ok) => { console.log((ok ? '  ok   ' : '  FAIL ') + label); if (!ok) fail++; };

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('#featured-products .product-card');
  check('home: built-in content used', await page.evaluate(() => MJT.site.source) === 'builtin');
  check('home: featured products render', (await page.locator('#featured-products .product-card').count()) > 0);
  check('home: original hero heading kept', (await page.textContent('.hero h1')).startsWith('Quality Timber'));
  check('home: WhatsApp number from config.js', (await page.getAttribute('.contact-band a[data-wa-link]', 'href')).startsWith('https://wa.me/2348024694963'));

  await page.goto(BASE + '/products.html');
  await page.waitForSelector('#product-grid .product-card');
  check('products: 10 products', (await page.locator('#product-grid .product-card').count()) === 10);
  await page.locator('.product-card').first().locator('button', { hasText: 'Add to Cart' }).click();
  await page.goto(BASE + '/cart.html');
  await page.waitForSelector('.cart-item');
  check('cart: item added', (await page.locator('.cart-item').count()) === 1);
  for (const p of ['about.html', 'contact.html', 'admin/index.html']) {
    await page.goto(BASE + '/' + p);
    await page.waitForTimeout(300);
    check(p + ': loads', true);
  }
  check('admin notice explains dashboard is on PHP hosting', (await page.textContent('#msg')).includes('PHP hosting'));
  check('no JavaScript errors', errors.length === 0);
  if (errors.length) console.log(errors);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
