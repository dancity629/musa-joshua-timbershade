/*
 * Shopping cart.
 *
 * MJT.cart is the cart store. It only keeps product IDs and quantities, so it
 * does not care where product data comes from (local file today, API later).
 * Prices and names are looked up from the current product list at display and
 * checkout time via MJT.cart.resolve(products).
 *
 * The cart page view at the bottom renders into #cart-root when present.
 */
window.MJT = window.MJT || {};

(function (MJT) {
  'use strict';

  var config = MJT.config;
  var utils = MJT.utils;
  var KEY = config.storageKeys.cart;
  var REF_KEY = config.storageKeys.orderRef;

  function normalizeQuantity(value) {
    var str = String(value).trim();
    if (!/^\d+$/.test(str)) return null;
    var n = parseInt(str, 10);
    if (n < config.minQuantity || n > config.maxQuantity) return null;
    return n;
  }

  function clampToStock(product, qty) {
    if (product && typeof product.stock === 'number' && product.stock >= 0) return Math.min(qty, product.stock);
    return qty;
  }

  function roundMoney(n) {
    return Math.round(n * 100) / 100;
  }

  // Read and sanitise whatever is in storage; drop anything malformed.
  function load() {
    var raw = utils.storage.get(KEY, []);
    if (!Array.isArray(raw)) return [];
    var seen = {};
    var clean = [];
    raw.forEach(function (item) {
      if (!item || typeof item.id !== 'string' || !item.id) return;
      var qty = normalizeQuantity(item.qty);
      if (qty === null) qty = Math.min(Math.max(parseInt(item.qty, 10) || 0, 0), config.maxQuantity);
      if (qty < config.minQuantity) return;
      if (seen[item.id]) { seen[item.id].qty = Math.min(seen[item.id].qty + qty, config.maxQuantity); return; }
      seen[item.id] = { id: item.id, qty: qty };
      clean.push(seen[item.id]);
    });
    return clean;
  }

  var items = load();

  function save() {
    utils.storage.set(KEY, items);
    document.dispatchEvent(new CustomEvent('mjt:cartchange'));
    if (MJT.updateCartBadge) MJT.updateCartBadge();
  }

  function find(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function generateOrderRef() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
    var out = '';
    var bytes = new Uint8Array(6);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var j = 0; j < bytes.length; j++) bytes[j] = Math.floor(Math.random() * 256);
    for (var i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
    return 'MJT-' + out;
  }

  MJT.cart = {
    normalizeQuantity: normalizeQuantity,

    items: function () {
      return items.map(function (i) { return { id: i.id, qty: i.qty }; });
    },

    count: function () {
      return items.length;
    },

    isEmpty: function () {
      return items.length === 0;
    },

    add: function (id, qty) {
      var n = normalizeQuantity(qty == null ? 1 : qty);
      if (!id || n === null) return false;
      var existing = find(id);
      if (existing) existing.qty = Math.min(existing.qty + n, config.maxQuantity);
      else items.push({ id: id, qty: n });
      save();
      return true;
    },

    setQuantity: function (id, qty) {
      var n = normalizeQuantity(qty);
      var existing = find(id);
      if (!existing || n === null) return false;
      existing.qty = n;
      save();
      return true;
    },

    remove: function (id) {
      var before = items.length;
      items = items.filter(function (i) { return i.id !== id; });
      if (items.length !== before) save();
    },

    clear: function () {
      items = [];
      utils.storage.remove(REF_KEY);
      save();
    },

    reload: function () {
      items = load();
    },

    // One reference per cart, so re-opening WhatsApp reuses the same reference.
    orderRef: function () {
      var ref = utils.storage.get(REF_KEY, null);
      if (typeof ref !== 'string' || !/^MJT-[A-Z0-9]{6}$/.test(ref)) {
        ref = generateOrderRef();
        utils.storage.set(REF_KEY, ref);
      }
      return ref;
    },

    // Join cart items with product data. Items whose product no longer exists
    // are returned separately in `missing` instead of breaking the page.
    resolve: function (products) {
      var byId = {};
      (products || []).forEach(function (p) { byId[p.id] = p; });
      var lines = [];
      var missing = [];
      items.forEach(function (item) {
        var product = byId[item.id];
        if (!product || !Number.isFinite(Number(product.price))) { missing.push(item); return; }
        var qty = clampToStock(product, item.qty);
        lines.push({ product: product, qty: qty, lineTotal: roundMoney(Number(product.price) * qty) });
      });
      return { lines: lines, missing: missing, totals: MJT.cart.totals(lines) };
    },

    totals: function (lines) {
      var subtotal = roundMoney(lines.reduce(function (sum, l) { return sum + l.lineTotal; }, 0));
      var delivery = lines.length && config.deliveryFee > 0 ? roundMoney(config.deliveryFee) : 0;
      var tax = config.taxRate > 0 ? roundMoney(subtotal * config.taxRate) : 0;
      return { subtotal: subtotal, delivery: delivery, tax: tax, total: roundMoney(subtotal + delivery + tax) };
    }
  };

  /* ---------- Cart page view ---------- */

  var el = utils.el;

  function quantityControl(line) {
    var id = line.product.id;
    var inputId = 'cart-qty-' + id;
    var input = el('input', {
      id: inputId, className: 'qty-input', type: 'number', inputmode: 'numeric',
      min: String(config.minQuantity), max: String(config.maxQuantity), step: '1', value: String(line.qty),
      'data-qty-input': id
    });
    input.addEventListener('change', function () {
      var n = normalizeQuantity(input.value);
      if (n === null) {
        input.value = String(line.qty);
        utils.showToast('Quantity must be a whole number between ' + config.minQuantity + ' and ' + config.maxQuantity + '.');
        return;
      }
      MJT.cart.setQuantity(id, n);
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); });

    function stepButton(delta, label, symbol) {
      var disabled = delta < 0 ? line.qty <= config.minQuantity : line.qty >= config.maxQuantity;
      return el('button', {
        type: 'button', className: 'qty-step', 'aria-label': label + ' ' + line.product.name, disabled: disabled,
        'data-step': id + ':' + delta,
        onclick: function () { MJT.cart.setQuantity(id, line.qty + delta); }
      }, [symbol]);
    }

    return el('div', { className: 'qty-control' }, [
      el('label', { className: 'visually-hidden', for: inputId, text: 'Quantity of ' + line.product.name }),
      stepButton(-1, 'Decrease quantity of', '−'),
      input,
      stepButton(1, 'Increase quantity of', '+')
    ]);
  }

  function cartRow(line) {
    var p = line.product;
    return el('li', { className: 'cart-item' }, [
      el('img', { className: 'cart-item__img', src: utils.safeImageUrl(p.image), alt: p.name, width: '120', height: '90' }),
      el('div', { className: 'cart-item__info' }, [
        el('h3', { className: 'cart-item__name', text: p.name }),
        el('p', { className: 'cart-item__unit', text: utils.formatNaira(p.price) + ' ' + utils.perUnitLabel(p.unit) }),
        typeof p.stock === 'number' ? el('p', { className: 'cart-item__note', text: 'Limited to ' + p.stock + ' in stock.' }) : null
      ]),
      quantityControl(line),
      el('p', { className: 'cart-item__total' }, [
        el('span', { className: 'visually-hidden', text: 'Line total: ' }),
        utils.formatNaira(line.lineTotal)
      ]),
      el('button', {
        type: 'button', className: 'btn btn--text cart-item__remove', 'data-remove': p.id,
        'aria-label': 'Remove ' + p.name + ' from cart', text: 'Remove',
        onclick: function () {
          MJT.cart.remove(p.id);
          utils.showToast(p.name + ' removed from your cart.');
        }
      })
    ]);
  }

  function missingRow(item) {
    return el('li', { className: 'cart-item cart-item--missing' }, [
      el('div', { className: 'cart-item__info' }, [
        el('h3', { className: 'cart-item__name', text: 'Item no longer available' }),
        el('p', { className: 'cart-item__unit', text: 'This product has been removed from the catalogue and will not be included in your order.' })
      ]),
      el('button', {
        type: 'button', className: 'btn btn--text cart-item__remove', text: 'Remove',
        onclick: function () { MJT.cart.remove(item.id); }
      })
    ]);
  }

  function summaryRow(label, value, extraClass) {
    return el('div', { className: 'summary-row' + (extraClass ? ' ' + extraClass : '') }, [
      el('dt', { text: label }), el('dd', { text: value })
    ]);
  }

  function renderCartPage(root, products) {
    var focusKey = document.activeElement && (document.activeElement.getAttribute('data-step') || document.activeElement.getAttribute('data-qty-input'));
    var focusAttr = document.activeElement && document.activeElement.hasAttribute('data-step') ? 'data-step' : 'data-qty-input';

    var state = MJT.cart.resolve(products);
    root.textContent = '';

    if (!state.lines.length && !state.missing.length) {
      root.appendChild(el('div', { className: 'empty-state' }, [
        el('img', { src: 'assets/images/plank-1x10.svg', alt: '', width: '240', height: '180' }),
        el('h2', { text: 'Your cart is empty' }),
        el('p', { text: 'Browse our roofing woods, planks, timber, nails and other materials, then add what you need.' }),
        el('a', { className: 'btn btn--primary', href: 'products.html', text: 'Browse Products' })
      ]));
      return;
    }

    var list = el('ul', { className: 'cart-list', 'aria-label': 'Items in your cart' });
    state.lines.forEach(function (line) { list.appendChild(cartRow(line)); });
    state.missing.forEach(function (item) { list.appendChild(missingRow(item)); });

    var t = state.totals;
    var summary = el('dl', { className: 'summary-list' }, [
      summaryRow('Subtotal', utils.formatNaira(t.subtotal)),
      t.delivery ? summaryRow('Delivery', utils.formatNaira(t.delivery)) : null,
      t.tax ? summaryRow('Tax', utils.formatNaira(t.tax)) : null,
      (t.delivery || t.tax) ? summaryRow('Total', utils.formatNaira(t.total), 'summary-row--total') : null
    ]);

    var aside = el('aside', { className: 'cart-summary', 'aria-labelledby': 'summary-heading' }, [
      el('h2', { id: 'summary-heading', text: 'Order summary' }),
      summary,
      el('p', { className: 'cart-summary__note', text: 'Sending your cart on WhatsApp is an order enquiry, not a payment. We will confirm availability, final prices and delivery before anything is reserved.' }),
      el('button', { type: 'button', className: 'btn btn--whatsapp btn--block', 'data-action': 'whatsapp-checkout', disabled: !state.lines.length, text: 'Proceed to WhatsApp Checkout' }),
      el('a', { className: 'btn btn--outline btn--block', href: 'products.html', text: 'Continue Shopping' }),
      el('button', {
        type: 'button', className: 'btn btn--text btn--block', text: 'Clear cart',
        onclick: function () {
          MJT.checkout.confirm('Clear your cart?', 'This removes every item from your cart.', 'Yes, clear cart', function () {
            MJT.cart.clear();
            utils.showToast('Your cart has been cleared.');
          });
        }
      })
    ]);

    root.appendChild(el('div', { className: 'cart-layout' }, [
      el('section', { className: 'cart-items', 'aria-label': 'Cart items' }, [list]),
      aside
    ]));

    if (focusKey) {
      var target = root.querySelector('[' + focusAttr + '="' + focusKey.replace(/"/g, '') + '"]');
      if (target && !target.disabled) target.focus();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('cart-root');
    if (!root) return;
    MJT.productSource.getAll().then(function (products) {
      var draw = function () { renderCartPage(root, products); };
      draw();
      document.addEventListener('mjt:cartchange', draw);
      window.addEventListener('storage', function (e) { if (e.key === KEY) draw(); });
    }).catch(function () {
      root.textContent = '';
      root.appendChild(el('div', { className: 'empty-state' }, [
        el('h2', { text: 'We could not load product details' }),
        el('p', { text: 'Please refresh the page. Your cart has been kept.' })
      ]));
    });
  });
})(window.MJT);
