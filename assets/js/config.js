/*
 * Site-wide configuration.
 * Change business details here; every page reads from this one object.
 */
window.MJT = window.MJT || {};

MJT.config = Object.freeze({
  businessName: 'Musa Joshua Timbershade',

  // WhatsApp number in international format, digits only (used in wa.me links).
  whatsappNumber: '2348024694963',
  // Human-readable version shown on the page.
  whatsappDisplay: '+234 802 469 4963',

  // Set to the real business address when available, e.g. 'No. 12 Timber Market Road, Kaduna'.
  // While null, pages show a "location to be announced" placeholder.
  location: null,

  currency: 'NGN',
  locale: 'en-NG',

  // Extra charges are off unless explicitly configured. Use a fixed naira amount
  // for delivery and a decimal rate for tax (e.g. 0.075 for 7.5%).
  deliveryFee: 0,
  taxRate: 0,

  // Quantity limits accepted by the cart.
  minQuantity: 1,
  maxQuantity: 9999,

  // localStorage keys. Bump the version suffix if the stored shape ever changes.
  storageKeys: {
    cart: 'mjt_cart_v1',
    orderRef: 'mjt_order_ref_v1'
  }
});
