/*
 * Contact page enquiry form. There is no backend: the form composes a
 * WhatsApp message and opens it. Nothing is sent until the customer presses Send.
 */
window.MJT = window.MJT || {};

(function (MJT) {
  'use strict';

  var utils = MJT.utils;

  function setError(input, errorId, show) {
    var error = document.getElementById(errorId);
    if (error) error.hidden = !show;
    input.setAttribute('aria-invalid', show ? 'true' : 'false');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('enquiry-form');
    if (!form) return;
    var nameInput = document.getElementById('enq-name');
    var messageInput = document.getElementById('enq-message');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = nameInput.value.trim();
      var message = messageInput.value.trim();

      setError(nameInput, 'enq-name-error', !name);
      setError(messageInput, 'enq-message-error', !message);
      if (!name) { nameInput.focus(); return; }
      if (!message) { messageInput.focus(); return; }

      var text = 'Hello ' + MJT.config.businessName + ', my name is ' + name + '.\n\n' + message;
      var url = utils.whatsappUrl(text);
      var win = null;
      try { win = window.open(url, '_blank'); } catch (err) { win = null; }
      if (win) {
        try { win.opener = null; } catch (err) { /* ignore */ }
        utils.showToast('WhatsApp opened with your message. Press Send in WhatsApp to reach us.');
      } else {
        // Pop-up blocked: give the customer a real link to tap instead.
        utils.showToast('Tap to open WhatsApp with your message.', { href: url, label: 'Open WhatsApp' });
      }
    });
  });
})(window.MJT);
