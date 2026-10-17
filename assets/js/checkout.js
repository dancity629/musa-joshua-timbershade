/*
 * WhatsApp checkout.
 *
 * Any element with data-action="whatsapp-checkout" starts checkout:
 *   1. checks the cart is not empty,
 *   2. builds an order message from the actual cart contents,
 *   3. opens WhatsApp (app on mobile, WhatsApp Web on desktop) via wa.me,
 *   4. asks the customer whether they sent it, and only then offers to clear the cart.
 *
 * Sending the message is an order enquiry, not a payment or stock reservation.
 */
window.MJT = window.MJT || {};

(function (MJT) {
  'use strict';

  var config = MJT.config;
  var utils = MJT.utils;
  var el = utils.el;

  var productsCache = null;

  /* ---------- Message building ---------- */

  function buildOrderMessage(lines, totals, orderRef) {
    var out = [];
    out.push('Hello ' + config.businessName + ', I would like to place an order.');
    out.push('Order Reference: ' + orderRef);
    out.push('');

    lines.forEach(function (line, index) {
      var p = line.product;
      out.push((index + 1) + '. ' + p.name + ' — ' + line.qty + ' ' + utils.formatUnit(p.unit, line.qty));
      out.push('Unit Price: ' + utils.formatNaira(p.price) + (p.unit ? ' ' + utils.perUnitLabel(p.unit) : ''));
      out.push('Total: ' + utils.formatNaira(line.lineTotal));
      out.push('');
    });

    out.push('Order Subtotal: ' + utils.formatNaira(totals.subtotal));
    if (totals.delivery) out.push('Delivery: ' + utils.formatNaira(totals.delivery));
    if (totals.tax) out.push('Tax: ' + utils.formatNaira(totals.tax));
    if (totals.delivery || totals.tax) out.push('Order Total: ' + utils.formatNaira(totals.total));
    out.push('');
    out.push('Please confirm availability and the final order details. Thank you.');
    return out.join('\n');
  }

  function buildCheckout(products) {
    var state = MJT.cart.resolve(products);
    if (!state.lines.length) return null;
    var ref = MJT.cart.orderRef();
    var message = buildOrderMessage(state.lines, state.totals, ref);
    return { ref: ref, message: message, url: utils.whatsappUrl(message), skipped: state.missing.length };
  }

  /* ---------- Dialog ---------- */

  var dialog = null;

  function getDialog() {
    if (dialog) return dialog;
    dialog = el('dialog', { className: 'modal', 'aria-labelledby': 'modal-title' });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    document.body.appendChild(dialog);
    return dialog;
  }

  function openDialog(title, bodyNodes, actions) {
    var d = getDialog();
    d.textContent = '';
    var closeBtn = el('button', { type: 'button', className: 'modal__close', 'aria-label': 'Close', onclick: function () { d.close(); } }, ['×']);
    d.appendChild(el('div', { className: 'modal__content' }, [
      closeBtn,
      el('h2', { id: 'modal-title', className: 'modal__title', text: title })
    ].concat(bodyNodes).concat([el('div', { className: 'modal__actions' }, actions)])));
    if (typeof d.showModal === 'function') {
      if (!d.open) d.showModal();
    } else {
      d.setAttribute('open', '');
    }
    var first = d.querySelector('.modal__actions .btn');
    if (first) first.focus();
  }

  function closeDialog() {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function showEmptyCartDialog() {
    openDialog('Your cart is empty', [
      el('p', { text: 'Add products to your cart first and we will include them in your WhatsApp order automatically. You can also chat with us directly.' })
    ], [
      el('a', { className: 'btn btn--primary', href: 'products.html', text: 'Browse Products' }),
      el('a', { className: 'btn btn--outline', href: utils.whatsappUrl(utils.generalEnquiryMessage()), target: '_blank', rel: 'noopener', text: 'Chat on WhatsApp', onclick: closeDialog })
    ]);
  }

  function showSentConfirmation(checkout, opened) {
    var intro = opened
      ? 'WhatsApp should now be open with your order (reference ' + checkout.ref + ') ready to send. Your order only reaches us after you press Send in WhatsApp.'
      : 'Tap the button below to open WhatsApp with your order (reference ' + checkout.ref + ') ready to send. Your order only reaches us after you press Send in WhatsApp.';

    var body = [el('p', { text: intro })];
    if (checkout.skipped) {
      body.push(el('p', { className: 'modal__warning', text: checkout.skipped + ' unavailable item(s) in your cart were left out of the message.' }));
    }
    body.push(el('p', { text: 'Did you send the message?' }));

    openDialog(opened ? 'Finish your order in WhatsApp' : 'Open WhatsApp to send your order', body, [
      el('button', {
        type: 'button', className: 'btn btn--primary', text: 'Yes, I sent it. Clear my cart',
        onclick: function () {
          MJT.cart.clear();
          openDialog('Thank you', [
            el('p', { text: 'Your cart has been cleared. Musa Joshua Timbershade will reply on WhatsApp to confirm availability, final prices and delivery for order ' + checkout.ref + '.' })
          ], [
            el('a', { className: 'btn btn--primary', href: 'products.html', text: 'Continue Browsing' }),
            el('button', { type: 'button', className: 'btn btn--outline', text: 'Close', onclick: closeDialog })
          ]);
        }
      }),
      el('a', { className: 'btn btn--whatsapp', href: checkout.url, target: '_blank', rel: 'noopener', text: opened ? 'Open WhatsApp again' : 'Open WhatsApp' }),
      el('button', { type: 'button', className: 'btn btn--text', text: 'Not yet, keep my cart', onclick: closeDialog })
    ]);
  }

  function openWhatsApp(url) {
    var win = null;
    try { win = window.open(url, '_blank'); } catch (err) { win = null; }
    if (win) {
      try { win.opener = null; } catch (err) { /* cross-origin, ignore */ }
      return true;
    }
    return false;
  }

  function startCheckout() {
    if (MJT.cart.isEmpty()) { showEmptyCartDialog(); return; }

    if (productsCache) {
      // Products already loaded: open WhatsApp synchronously inside the click
      // so mobile browsers do not block it as a pop-up.
      var checkout = buildCheckout(productsCache);
      if (!checkout) { showEmptyCartDialog(); return; }
      showSentConfirmation(checkout, openWhatsApp(checkout.url));
      return;
    }

    MJT.productSource.getAll().then(function (products) {
      productsCache = products;
      var checkout = buildCheckout(products);
      if (!checkout) { showEmptyCartDialog(); return; }
      showSentConfirmation(checkout, false);
    }).catch(function () {
      utils.showToast('We could not load product details. Please refresh the page and try again.');
    });
  }

  // In-page confirmation (window.confirm is blocked in some embedded viewers).
  function confirmAction(title, text, confirmLabel, onConfirm) {
    openDialog(title, [el('p', { text: text })], [
      el('button', { type: 'button', className: 'btn btn--primary', text: confirmLabel, onclick: function () { closeDialog(); onConfirm(); } }),
      el('button', { type: 'button', className: 'btn btn--outline', text: 'Cancel', onclick: closeDialog })
    ]);
  }

  MJT.checkout = {
    confirm: confirmAction,
    buildOrderMessage: buildOrderMessage,
    buildCheckout: buildCheckout,
    start: startCheckout
  };

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-action="whatsapp-checkout"]');
    if (!trigger || trigger.disabled) return;
    e.preventDefault();
    startCheckout();
  });

  document.addEventListener('DOMContentLoaded', function () {
    MJT.productSource.getAll().then(function (products) { productsCache = products; }).catch(function () { /* retried on click */ });
  });
})(window.MJT);
