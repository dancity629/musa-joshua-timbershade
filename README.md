# Musa Joshua Timbershade: Business Website

Customer-facing website for **Musa Joshua Timbershade**, a building materials business selling roofing woods, planks, timber, nails and other construction materials.

Customers can browse the catalogue, see prices in naira (₦), build a cart, and send their order to the business on WhatsApp with the cart contents written into the message.

This is phase 1: public website only. There is no admin dashboard, login, database or API yet. The code is structured so those can be added later without rebuilding the frontend (see [Connecting a PHP/MySQL backend later](#connecting-a-phpmysql-backend-later)).

## Contents

- [Project structure](#project-structure)
- [Features](#features)
- [Run locally](#run-locally)
- [Configuration](#configuration)
- [Editing products](#editing-products)
- [Replacing images](#replacing-images)
- [Deployment](#deployment)
- [Connecting a PHP/MySQL backend later](#connecting-a-phpmysql-backend-later)
- [Placeholders to replace before launch](#placeholders-to-replace-before-launch)

## Project structure

```
musa-joshua-timbershade/
├── index.html            Home: hero, categories, featured products, why us, about, contact
├── products.html         Catalogue with search, category filters and price sorting
├── cart.html             Cart: quantities, line totals, subtotal, WhatsApp checkout
├── about.html            Business introduction and how ordering works
├── contact.html          WhatsApp contact, location placeholder, enquiry form
├── assets/
│   ├── css/
│   │   ├── style.css       Design tokens and base (mobile-first) styles
│   │   └── responsive.css  Tablet / desktop breakpoints and print styles
│   ├── js/
│   │   ├── config.js        Business name, WhatsApp number, location, charges, storage keys
│   │   ├── products-data.js Categories, product list and the product source (swap for an API later)
│   │   ├── main.js          Shared helpers: naira formatting, safe DOM building, storage, nav, toasts, product card
│   │   ├── cart.js          Cart store (localStorage) and cart page view
│   │   ├── checkout.js      WhatsApp order message and confirmation flow
│   │   ├── products.js      Home featured/category sections and catalogue page
│   │   └── contact.js       Contact page enquiry form (opens WhatsApp)
│   └── images/             SVG illustrations used as image placeholders, plus favicon
└── README.md
```

Scripts load in this order on every page (all with `defer`): `config.js`, `products-data.js`, `main.js`, `cart.js`, `checkout.js`, then the page script. Everything hangs off one global namespace, `window.MJT`. There is no build step and no dependencies.

The header and footer are plain HTML repeated in each of the five pages, so the site works without JavaScript for navigation. If you change a nav link, change it in all five files.

## Features

- **Responsive, mobile-first layout** with a sticky header, a collapsible menu on phones and a full nav bar from 900px.
- **Catalogue** with live search (handles size notation, so `2x4`, `2 x 4` and `2" x 4"` all match), category chips, sorting by price or name, and shareable URLs such as `products.html?category=nails&sort=price-asc`.
- **Cart** stored in `localStorage`:
  - add with a chosen quantity, step quantities up and down, type a quantity, remove items, clear the cart;
  - only whole numbers from 1 to 9,999 are accepted (configurable);
  - line totals and subtotal in naira, using `Intl.NumberFormat('en-NG', { currency: 'NGN' })`;
  - cart count in the navigation, kept in sync across tabs;
  - products that are no longer in the catalogue are shown as "no longer available" and left out of the order instead of breaking the page;
  - if the browser blocks storage (some private modes), the cart still works for the current page and the customer is told it will not be saved.
- **WhatsApp checkout** from the cart page ("Proceed to WhatsApp Checkout") and from the home page hero ("Order on WhatsApp"):
  1. refuses to continue with an empty cart and offers "Browse Products" or a plain WhatsApp chat instead;
  2. builds the message from the actual cart: greeting, order reference (`MJT-XXXXXX`), each item with quantity and unit, unit price, line total, subtotal, and a request to confirm availability and final pricing;
  3. opens `https://wa.me/2348024694963?text=...`, which opens the WhatsApp app on phones and WhatsApp Web on computers;
  4. asks the customer whether they sent the message. The cart is cleared only when they answer "Yes, I sent it". "Not yet" keeps the cart, and the same order reference is reused if they try again.
- **Contact enquiry form** that writes the customer's name and message into a WhatsApp message. Nothing is sent until the customer presses Send in WhatsApp.
- **Safety and accessibility:** product data is always inserted with `textContent` (never `innerHTML`), image URLs are checked, skip link, labelled form fields, visible focus styles, `aria-current` on the active page, live regions for cart and search updates, reduced-motion support, and colour pairs chosen for WCAG AA contrast.

Sending the WhatsApp message is an **order enquiry**, not a payment or stock reservation. The site says so on the cart page and in the checkout dialog.

## Run locally

The site is static, so any local web server works. Use a server rather than double-clicking the HTML files, so `localStorage` and URL parameters behave as they will online.

With Python 3:

```bash
cd musa-joshua-timbershade
python3 -m http.server 8000
# open http://localhost:8000
```

With PHP (the same runtime most hosts use):

```bash
cd musa-joshua-timbershade
php -S localhost:8000
```

With Node: `npx serve .`

The VS Code "Live Server" extension also works.

## Configuration

All business settings are in `assets/js/config.js`:

| Setting | Purpose |
| --- | --- |
| `businessName` | Name used in the WhatsApp message and on pages |
| `whatsappNumber` | Digits only, international format, used in `wa.me` links (currently `2348024694963`) |
| `whatsappDisplay` | Number shown to visitors (currently `+234 802 469 4963`) |
| `location` | Business address. While `null`, pages show "Business address to be announced" |
| `deliveryFee` | Fixed delivery charge in naira. `0` means none is shown or added |
| `taxRate` | Decimal tax rate, e.g. `0.075` for 7.5%. `0` means none |
| `minQuantity`, `maxQuantity` | Accepted quantity range per cart line |
| `storageKeys` | `localStorage` key names |

The HTML also contains the WhatsApp number as a fallback `href` for visitors without JavaScript. If the number changes, update `config.js` and search the five HTML files for `2348024694963` and `+234 802 469 4963`.

## Editing products

Products live in one place: `MJT.productsData` in `assets/js/products-data.js`. Each product looks like this:

```js
{
  id: 'rw-2x3-12ft',            // unique and stable; the cart stores this ID
  name: '2" x 3" Roofing Wood (12 ft)',
  category: 'roofing-woods',    // must match an id in MJT.categories
  price: 3500,                  // naira, plain number
  unit: 'piece',                // piece, length, bundle, kg, pack, sheet, roll, tin, bag
  image: 'assets/images/roofing-wood-2x3.svg',
  description: 'Standard rafter and purlin size for residential roof framing.',
  stock: null,                  // number when known; null = unknown (not displayed)
  featured: true,               // shown on the home page
  isDemo: true                  // shows the "Sample price" badge; set false for real prices
}
```

Rules:

- Never reuse or rename an `id` that customers may already have in their cart. Retired IDs are handled gracefully, but the customer loses that line.
- When `stock` is a number, cart quantities for that product are capped at it.
- When every product has real prices, set `isDemo: false` on each and remove the "Sample catalogue" note (`demo-note` paragraph) from `index.html` and `products.html`.

Categories are defined in `MJT.categories` in the same file. The home page category tiles, catalogue filter chips and category links all read from it.

## Replacing images

Outbound access to photo libraries was not available while this site was built, so `assets/images/` contains **SVG illustrations** drawn for the site. They are lightweight and look consistent, but real photographs of the business's stock will build more trust.

To replace them:

1. Use your own photos or royalty-free images (e.g. Unsplash or Pexels, which allow commercial use) and keep a note of the source.
2. Crop to **4:3** (e.g. 1200 × 900) and compress to under ~200 KB (JPEG or WebP).
3. Save in `assets/images/` and update the `image` field of each product (and `image` of each category) in `products-data.js`.
4. For the hero, replace `assets/images/hero-timber.svg` or change the `src` in `index.html` (4:3 works best; 1600 × 1200 recommended). Update the `alt` text to describe the photo.

## Deployment

The site is plain HTML, CSS and JavaScript. It runs on any PHP/MySQL shared host (cPanel, DirectAdmin, Plesk etc.) without changes, and also on static hosts.

**cPanel or similar shared hosting**

1. Zip the contents of `musa-joshua-timbershade/` (the files, not the parent folder).
2. In cPanel, open **File Manager** → `public_html` (or the domain's document root).
3. Upload the zip and **Extract** it there, so `index.html` sits directly in `public_html`.
4. Visit the domain. Enable free SSL (AutoSSL / Let's Encrypt) in cPanel so the site is served over `https://`.

**FTP:** upload the same files to the document root with FileZilla or similar.

**Git-based deploy:** commit this folder to a repository and use cPanel's *Git Version Control* or your host's deploy hook to pull into the document root.

After deploying, check:

- every page loads and the menu works on a phone;
- add to cart → cart page → "Proceed to WhatsApp Checkout" opens WhatsApp with the right number and message;
- the site is on `https://`.

No server-side configuration is required. Paths are all relative, so the site also works from a subfolder (e.g. `example.com/shop/`).

## Connecting a PHP/MySQL backend later

The frontend is already separated so a database and admin dashboard can be added in a later phase:

- **One product source.** Every page gets products through `MJT.productSource.getAll()`, which returns a Promise. Today it resolves the local array. To use an API, change only that function in `products-data.js`:

  ```js
  MJT.productSource = {
    getAll: function () {
      return fetch('api/products.php', { headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        });
    }
  };
  ```

- **Same fields.** The API should return a JSON array of objects with the fields listed in [Editing products](#editing-products): `id`, `name`, `category`, `price`, `unit`, `image`, `description`, `stock`, `featured`, `isDemo`. A matching MySQL table would have one column per field (`id` as a unique string or the numeric primary key cast to string; `price` as `DECIMAL(12,2)`; `stock` as nullable `INT`).
- **Cart is independent.** The cart stores only product IDs and quantities, and looks up names and prices from whatever `getAll()` returns. Customer carts survive the switch as long as product IDs stay the same.
- **Categories** can move to the API the same way; replace `MJT.categories` with data loaded before pages render, or have the products endpoint return both.
- Pages already show a loading message and a friendly error if products fail to load.
- A suggested layout for that phase: `api/products.php` (public, read-only JSON), `admin/` (dashboard behind login), and `config/` for database credentials kept outside the web root.

## Placeholders to replace before launch

- **Products and prices** in `products-data.js` are sample data. Every product is marked `isDemo: true`, shows a "Sample price" badge, and both product listings carry a "Sample catalogue" note. Stock levels are unknown (`stock: null`) and are not shown.
- **Business address:** set `location` in `config.js`.
- **About text:** `about.html` has a short, factual introduction. Add the business story, years in operation and service area once confirmed (look for the `Owner:` comment).
- **Images:** SVG illustrations, see [Replacing images](#replacing-images).
- No email, opening hours or social media links are included, because none were provided. Add them to the footer and contact page when available.
