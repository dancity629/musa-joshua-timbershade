/*
 * Site-wide configuration.
 *
 * With the PHP backend installed, business details are managed in the admin
 * dashboard (Contact Details, Branding, Website Settings) and loaded from the
 * API by site-data.js, which overwrites the values below. These values are the
 * built-in fallback used only when the API cannot be reached (for example on
 * the GitHub Pages copy of the site).
 */
window.MJT = window.MJT || {};

MJT.config = {
  businessName: 'Musa Joshua Timbershade',

  // WhatsApp number in international format, digits only (used in wa.me links).
  whatsappNumber: '2348024694963',
  // Human-readable version shown on the page.
  whatsappDisplay: '+234 802 469 4963',

  // Street address shown in the footer, home page and contact page.
  address: 'Before Blascu Hotel, Area 1 - Luvu Road, Masaka, Karu LGA, Nasarawa State',

  // Business location on Google Maps. mapUrl is the link visitors open;
  // mapEmbedUrl draws the map on the contact page. Set both to null to hide them.
  mapUrl: 'https://www.google.com/maps/place/Musa+Joshua+Timbershade/@9.0151248,7.6712323,17z/data=!3m1!4b1!4m6!3m5!1s0x104e05d70796010b:0xc0529a7f757caf92!8m2!3d9.0151195!4d7.6738072!16s%2Fg%2F11zz84ffv0',
  mapEmbedUrl: 'https://maps.google.com/maps?q=9.0151195,7.6738072&z=16&output=embed',
  // Text of the map link shown under the address.
  locationLabel: 'View on Google Maps',

  // Quantity limits accepted by the cart.
  minQuantity: 1,
  maxQuantity: 9999,

  // localStorage keys. Bump the version suffix if the stored shape ever changes.
  storageKeys: {
    cart: 'mjt_cart_v1',
    orderRef: 'mjt_order_ref_v1'
  },

  // Prices: 'contact' hides them ("Contact for price"), 'show' displays naira prices.
  priceMode: 'contact',
  currency: 'NGN',

  // Public content endpoint of the PHP backend, relative to the site root.
  apiUrl: 'api/index.php?route=public/site',

  // Address of the PHP-hosted site once it is live, e.g. 'https://www.example.com.ng'.
  // When set, visitors who open the old GitHub Pages address (including /admin)
  // are forwarded there. Leave null until the new site is live.
  siteUrl: null
};
