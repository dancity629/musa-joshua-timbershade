/*
 * Shared helpers and page chrome: price formatting, safe DOM building,
 * storage access, navigation, cart badge, toasts and product cards.
 */
window.MJT = window.MJT || {};

(function (MJT) {
  'use strict';

  var config = MJT.config;

  /* ---------- Formatting ---------- */

  var nairaFormatter = new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  function formatNaira(amount) {
    var value = Number(amount);
    return nairaFormatter.format(Number.isFinite(value) ? value : 0);
  }

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
    var fallback = 'assets/images/other-materials.svg';
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

  function renderProductCard(product) {
    var qtyId = 'qty-' + product.id;
    var qtyInput = el('input', {
      id: qtyId, className: 'qty-input', type: 'number', inputmode: 'numeric',
      min: String(config.minQuantity), max: String(config.maxQuantity), step: '1', value: '1'
    });

    var addButton = el('button', { type: 'button', className: 'btn btn--primary btn--block', text: 'Add to Cart' });
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

    var badge = product.isDemo ? el('span', { className: 'badge badge--demo', text: 'Sample price' }) : null;

    return el('article', { className: 'product-card', 'data-product-id': product.id }, [
      el('div', { className: 'product-card__media' }, [
        el('img', { src: safeImageUrl(product.image), alt: product.name, loading: 'lazy', width: '400', height: '300' }),
        badge
      ]),
      el('div', { className: 'product-card__body' }, [
        el('p', { className: 'product-card__category', text: categoryName(product.category) }),
        el('h3', { className: 'product-card__title', text: product.name }),
        el('p', { className: 'product-card__desc', text: product.description || '' }),
        el('p', { className: 'product-card__price' }, [
          el('span', { className: 'price', text: formatNaira(product.price) }),
          el('span', { className: 'unit', text: ' ' + perUnitLabel(product.unit) })
        ]),
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
      n.textContent = config.location || 'Business address to be announced. Message us on WhatsApp for directions.';
      n.classList.toggle('is-placeholder', !config.location);
    });
    document.querySelectorAll('[data-year]').forEach(function (n) { n.textContent = String(new Date().getFullYear()); });
  }

  /* ---------- Public API ---------- */

  MJT.utils = {
    formatNaira: formatNaira,
    formatUnit: formatUnit,
    perUnitLabel: perUnitLabel,
    escapeHtml: escapeHtml,
    safeImageUrl: safeImageUrl,
    el: el,
    storage: storage,
    showToast: showToast,
    whatsappUrl: whatsappUrl,
    generalEnquiryMessage: generalEnquiryMessage,
    categoryName: categoryName
  };
  MJT.renderProductCard = renderProductCard;
  MJT.updateCartBadge = updateCartBadge;

  document.addEventListener('DOMContentLoaded', function () {
    initNav();
    fillSiteDetails();
    updateCartBadge();
  });

  // Keep the badge in sync when the cart changes in another tab.
  window.addEventListener('storage', function (e) {
    if (e.key === config.storageKeys.cart) {
      if (MJT.cart) MJT.cart.reload();
      updateCartBadge();
    }
  });
})(window.MJT);
