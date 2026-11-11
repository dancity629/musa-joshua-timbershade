/*
 * Shared helpers and page chrome: unit labels, safe DOM building,
 * storage access, navigation, cart badge, toasts and product cards.
 */
window.MJT = window.MJT || {};

(function (MJT) {
  'use strict';

  var config = MJT.config;

  /* ---------- Formatting ---------- */

  var UNIT_PLURALS = { piece: 'pieces', length: 'lengths', bundle: 'bundles', kg: 'kg', pack: 'packs', sheet: 'sheets', roll: 'rolls', tin: 'tins', bag: 'bags' };

  function formatUnit(unit, quantity) {
    if (!unit) return '';
    if (quantity === 1) return unit;
    return UNIT_PLURALS[unit] || unit;
  }

  // "per piece", "per kg"
  function perUnitLabel(unit) {
    return unit ? 'per ' + unit : '';
  }

  /* ---------- Prices (only when the business chooses to show them) ---------- */

  function showPrices() {
    return config.priceMode === 'show';
  }

  // Naira amount, e.g. 12500 -> "₦12,500", 99.5 -> "₦99.50"
  function formatMoney(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return '';
    var fixed = n % 1 ? n.toFixed(2) : String(Math.round(n));
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '\u20A6' + parts.join('.');
  }

  function hasPrice(product) {
    return showPrices() && product && typeof product.price === 'number';
  }

  function isAvailable(product) {
    if (!product || product.available === false) return false;
    return !(typeof product.stock === 'number' && product.stock <= 0);
  }

  // Show the size line only when the name does not already say it.
  function sizeLabel(product) {
    if (!product.size) return '';
    var squash = function (t) { return String(t).toLowerCase().replace(/[^a-z0-9]/g, ''); };
    return squash(product.name).indexOf(squash(product.size)) === -1 ? product.size : '';
  }

  /* ---------- Safe rendering ---------- */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Only allow relative paths or http(s) URLs for product images.
  function safeImageUrl(url) {
    var fallback = 'assets/images/plank-1x10.svg';
    if (typeof url !== 'string' || !url.trim()) return fallback;
    var trimmed = url.trim();
    if (/^(https?:)?\/\//i.test(trimmed)) return trimmed;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return fallback; // javascript:, data:, etc.
    return trimmed;
  }

  // Small element builder. Text is always set via textContent, never innerHTML.
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (val == null || val === false) return;
        if (key === 'className') node.className = val;
        else if (key === 'text') node.textContent = val;
        else if (key.indexOf('on') === 0 && typeof val === 'function') node.addEventListener(key.slice(2), val);
        else node.setAttribute(key, val === true ? '' : val);
      });
    }
    (children || []).forEach(function (child) {
      if (child == null) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  /* ---------- Storage (fails gracefully in private mode / blocked storage) ---------- */

  var memoryStore = {};
  var storageWarned = false;

  function warnStorage() {
    if (storageWarned) return;
    storageWarned = true;
    // Shown after any confirmation toast triggered by the same action.
    setTimeout(function () {
      showToast('Your browser is blocking storage, so your cart will not be saved after you leave this page.');
    }, 4200);
  }

  var storage = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        if (raw == null) return key in memoryStore ? memoryStore[key] : fallback;
        return JSON.parse(raw);
      } catch (err) {
        return key in memoryStore ? memoryStore[key] : fallback;
      }
    },
    set: function (key, value) {
      memoryStore[key] = value;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (err) {
        warnStorage();
        return false;
      }
    },
    remove: function (key) {
      delete memoryStore[key];
      try { window.localStorage.removeItem(key); } catch (err) { /* ignore */ }
    }
  };

  /* ---------- Toast notifications ---------- */

  var toastTimer = null;

  function showToast(message, link) {
    var region = document.getElementById('toast');
    if (!region) {
      region = el('div', { id: 'toast', className: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(region);
    }
    region.textContent = '';
    region.appendChild(el('span', { text: message }));
    if (link) {
      var external = /^https?:/i.test(link.href);
      region.appendChild(el('a', { href: link.href, className: 'toast__link', text: link.label, target: external ? '_blank' : null, rel: external ? 'noopener' : null }));
    }
    region.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { region.classList.remove('is-visible'); }, 4000);
  }

  /* ---------- WhatsApp links ---------- */

  function whatsappUrl(message) {
    var base = 'https://wa.me/' + config.whatsappNumber;
    return message ? base + '?text=' + encodeURIComponent(message) : base;
  }

  function generalEnquiryMessage() {
    return 'Hello ' + config.businessName + ', I would like to make an enquiry about your building materials.';
  }

  /* ---------- Product card ---------- */

  function categoryName(categoryId) {
    var match = (MJT.categories || []).filter(function (c) { return c.id === categoryId; })[0];
    return match ? match.name : 'Building Materials';
  }

  /* ---------- Product details dialog (gallery, size, price) ---------- */

  var detailsDialog = null;

  function openProductDetails(product) {
    if (!detailsDialog) {
      detailsDialog = el('dialog', { className: 'modal modal--product', 'aria-labelledby': 'product-dialog-title' });
      detailsDialog.addEventListener('click', function (e) { if (e.target === detailsDialog) detailsDialog.close(); });
      document.body.appendChild(detailsDialog);
    }
    var d = detailsDialog;
    d.textContent = '';
    var images = [product.image].concat(product.gallery || []).filter(Boolean);
    var main = el('img', { className: 'product-detail__img', src: safeImageUrl(images[0]), alt: product.name, width: '800', height: '600' });
    var thumbs = images.length > 1 ? el('div', { className: 'product-detail__thumbs' }, images.map(function (src, i) {
      return el('button', {
        type: 'button', className: 'product-detail__thumb', 'aria-label': 'Show image ' + (i + 1) + ' of ' + images.length,
        onclick: function () { main.src = safeImageUrl(src); }
      }, [el('img', { src: safeImageUrl(src), alt: '', width: '96', height: '72' })]);
    })) : null;
    var size = product.size ? el('p', { className: 'product-card__unit', text: 'Size: ' + product.size }) : null;
    var price = hasPrice(product)
      ? el('p', { className: 'product-card__price', text: formatMoney(product.price) + ' ' + perUnitLabel(product.unit) })
      : el('p', { className: 'product-card__unit', text: 'Sold ' + perUnitLabel(product.unit) + ' \u00B7 price on request' });
    d.appendChild(el('div', { className: 'modal__content' }, [
      el('button', { type: 'button', className: 'modal__close', 'aria-label': 'Close', onclick: function () { d.close(); } }, ['\u00D7']),
      main, thumbs,
      el('p', { className: 'product-card__category', text: categoryName(product.category) }),
      el('h2', { id: 'product-dialog-title', className: 'modal__title', text: product.name }),
      el('p', { text: product.description || '' }),
      size, price,
      isAvailable(product) ? null : el('p', { className: 'product-card__status', text: 'Currently unavailable' })
    ]));
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  }

  function renderProductCard(product) {
    var qtyId = 'qty-' + product.id;
    var available = isAvailable(product);
    var qtyInput = el('input', {
      id: qtyId, className: 'qty-input', type: 'number', inputmode: 'numeric',
      min: String(config.minQuantity), max: String(typeof product.stock === 'number' && product.stock > 0 ? Math.min(product.stock, config.maxQuantity) : config.maxQuantity),
      step: '1', value: '1', disabled: !available
    });

    var addButton = el('button', { type: 'button', className: 'btn btn--primary btn--block', text: available ? 'Add to Cart' : 'Unavailable', disabled: !available });
    addButton.addEventListener('click', function () {
      var qty = MJT.cart.normalizeQuantity(qtyInput.value);
      if (qty === null) {
        qtyInput.value = '1';
        showToast('Please enter a whole number between ' + config.minQuantity + ' and ' + config.maxQuantity + '.');
        qtyInput.focus();
        return;
      }
      MJT.cart.add(product.id, qty);
      qtyInput.value = '1';
      showToast('Added ' + qty + ' ' + formatUnit(product.unit, qty) + ' of ' + product.name + ' to your cart.', { href: 'cart.html', label: 'View cart' });
    });

    var size = sizeLabel(product);
    var priceLine = hasPrice(product)
      ? el('p', { className: 'product-card__price' }, [formatMoney(product.price), el('span', { text: ' ' + perUnitLabel(product.unit) })])
      : (product.unit ? el('p', { className: 'product-card__unit', text: 'Sold ' + perUnitLabel(product.unit) }) : null);

    return el('article', { className: 'product-card' + (available ? '' : ' product-card--unavailable'), 'data-product-id': product.id }, [
      el('div', { className: 'product-card__media' }, [
        el('img', { src: safeImageUrl(product.image), alt: product.name, loading: 'lazy', width: '400', height: '300' }),
        available ? null : el('span', { className: 'product-card__badge', text: 'Currently unavailable' })
      ]),
      el('div', { className: 'product-card__body' }, [
        el('p', { className: 'product-card__category', text: categoryName(product.category) }),
        el('h3', { className: 'product-card__title' }, [
          el('button', { type: 'button', className: 'product-card__link', text: product.name, onclick: function () { openProductDetails(product); } })
        ]),
        el('p', { className: 'product-card__desc', text: product.description || '' }),
        size ? el('p', { className: 'product-card__size', text: 'Size: ' + size }) : null,
        priceLine,
        el('div', { className: 'product-card__actions' }, [
          el('label', { className: 'visually-hidden', for: qtyId, text: 'Quantity of ' + product.name }),
          qtyInput,
          addButton
        ])
      ])
    ]);
  }

  /* ---------- Page chrome ---------- */

  function initNav() {
    var toggle = document.querySelector('.nav-toggle');
    var menu = document.getElementById('site-menu');
    if (toggle && menu) {
      toggle.addEventListener('click', function () {
        var open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!open));
        menu.classList.toggle('is-open', !open);
      });
      menu.addEventListener('click', function (e) {
        if (e.target.closest('a')) {
          toggle.setAttribute('aria-expanded', 'false');
          menu.classList.remove('is-open');
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menu.classList.contains('is-open')) {
          toggle.setAttribute('aria-expanded', 'false');
          menu.classList.remove('is-open');
          toggle.focus();
        }
      });
    }

    var page = document.body.getAttribute('data-page');
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      if (link.getAttribute('data-nav') === page) link.setAttribute('aria-current', 'page');
    });
  }

  function updateCartBadge() {
    var count = MJT.cart ? MJT.cart.count() : 0;
    document.querySelectorAll('[data-cart-count]').forEach(function (node) {
      node.textContent = String(count);
      node.hidden = count === 0;
    });
    document.querySelectorAll('[data-cart-label]').forEach(function (node) {
      node.setAttribute('aria-label', 'Cart, ' + count + (count === 1 ? ' item' : ' items'));
    });
  }

  function fillSiteDetails() {
    document.querySelectorAll('[data-wa-link]').forEach(function (a) {
      a.href = whatsappUrl(a.getAttribute('data-wa-link') === 'enquiry' ? generalEnquiryMessage() : '');
      a.target = '_blank';
      a.rel = 'noopener';
    });
    document.querySelectorAll('[data-wa-display]').forEach(function (n) { n.textContent = config.whatsappDisplay; });
    document.querySelectorAll('[data-business-name]').forEach(function (n) { n.textContent = config.businessName; });
    document.querySelectorAll('[data-location]').forEach(function (n) {
      n.textContent = '';
      if (config.address) n.appendChild(el('span', { className: 'address', text: config.address }));
      if (config.mapUrl) {
        if (config.address) n.appendChild(el('br'));
        n.appendChild(el('a', { href: config.mapUrl, target: '_blank', rel: 'noopener', text: config.locationLabel || 'View our location on Google Maps' }));
      }
      if (!config.address && !config.mapUrl) {
        n.textContent = 'Business address to be announced. Message us on WhatsApp for directions.';
      }
      n.classList.toggle('is-placeholder', !config.address && !config.mapUrl);
    });
    document.querySelectorAll('[data-map]').forEach(function (n) {
      n.hidden = !config.mapEmbedUrl;
      if (!config.mapEmbedUrl || n.querySelector('iframe')) return;
      n.appendChild(el('iframe', {
        src: config.mapEmbedUrl, title: 'Map showing the location of ' + config.businessName,
        loading: 'lazy', referrerpolicy: 'no-referrer-when-downgrade', allowfullscreen: true
      }));
    });
    document.querySelectorAll('[data-year]').forEach(function (n) { n.textContent = String(new Date().getFullYear()); });
  }

  /* ---------- Public API ---------- */

  MJT.utils = {
    formatUnit: formatUnit,
    perUnitLabel: perUnitLabel,
    escapeHtml: escapeHtml,
    safeImageUrl: safeImageUrl,
    el: el,
    storage: storage,
    showToast: showToast,
    whatsappUrl: whatsappUrl,
    formatMoney: formatMoney,
    hasPrice: hasPrice,
    showPrices: showPrices,
    isAvailable: isAvailable,
    generalEnquiryMessage: generalEnquiryMessage,
    categoryName: categoryName
  };
  MJT.renderProductCard = renderProductCard;
  MJT.openProductDetails = openProductDetails;
  MJT.updateCartBadge = updateCartBadge;

  document.addEventListener('DOMContentLoaded', function () {
    initNav();
    updateCartBadge();
    // Business details come from the backend; fill them in once loaded.
    (MJT.site && MJT.site.ready ? MJT.site.ready : Promise.resolve()).then(fillSiteDetails);
  });

  // Keep the badge in sync when the cart changes in another tab.
  window.addEventListener('storage', function (e) {
    if (e.key === config.storageKeys.cart) {
      if (MJT.cart) MJT.cart.reload();
      updateCartBadge();
    }
  });
})(window.MJT);
