/*
 * Musa Joshua Timbershade: admin dashboard.
 *
 * A small single-page app with no build step. Every screen loads and saves
 * through the PHP API (../api/index.php), which checks the login session and
 * CSRF token on the server. Nothing is stored in the browser except the page
 * you are on.
 *
 * Text is always inserted with textContent (never innerHTML).
 */
(function () {
  'use strict';

  var API = '../api/index.php';
  var MAX_UPLOAD = 5 * 1024 * 1024;
  var UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  var UNITS = ['piece', 'length', 'bundle', 'pack', 'kg', 'bag', 'sheet', 'roll', 'tin', 'carton', 'set', 'metre'];
  var SECTION_LABELS = { hero: 'Hero', categories: 'Categories', featured: 'Featured products', why: 'Why Choose Us', reviews: 'Reviews / testimonials', about: 'About section', contact: 'Contact section' };
  var ICON_PATHS = {
    timber: ['rect:6,14,36,8', 'rect:6,26,36,8', 'path:M12 18h10M18 30h14'],
    check: ['circle:24,24,17', 'path:m16 24 6 6 11-12'],
    phone: ['rect:12,5,24,38', 'path:M20 37h8M18 14h12M18 21h12M18 28h7'],
    home: ['path:M6 22 24 8l18 14', 'path:M11 20v20h26V20', 'path:M20 40V29h8v11'],
    truck: ['path:M4 12h24v20H4z', 'path:M28 20h9l7 7v5H28z', 'circle:12,36,4', 'circle:36,36,4'],
    star: ['path:M24 6l5.5 11.2 12.3 1.8-8.9 8.7 2.1 12.3L24 34.2 13 40l2.1-12.3-8.9-8.7 12.3-1.8z'],
    tools: ['path:M30 8a8 8 0 0 0-7.6 10.4L8 32.8 15.2 40l14.4-14.4A8 8 0 0 0 40 18l-5 5-6-2-2-6 5-5z'],
    clock: ['circle:24,24,17', 'path:M24 14v10l7 5']
  };

  var state = { csrf: null, admin: null, categories: null, settings: null, dirty: false };

  /* ======================================================================
     DOM helpers
     ====================================================================== */

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'value') node.value = v;
        else if (k === 'checked') node.checked = !!v;
        else if (k === 'selected') node.selected = !!v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(parent, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(parent, c); }); return; }
    parent.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }

  function svgIcon(name) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('aria-hidden', 'true');
    (ICON_PATHS[name] || ICON_PATHS.check).forEach(function (spec) {
      var parts = spec.split(':');
      var el = document.createElementNS(ns, parts[0]);
      var n = parts[1].split(',');
      if (parts[0] === 'rect') { el.setAttribute('x', n[0]); el.setAttribute('y', n[1]); el.setAttribute('width', n[2]); el.setAttribute('height', n[3]); el.setAttribute('rx', '2'); }
      else if (parts[0] === 'circle') { el.setAttribute('cx', n[0]); el.setAttribute('cy', n[1]); el.setAttribute('r', n[2]); }
      else el.setAttribute('d', parts[1]);
      svg.appendChild(el);
    });
    return svg;
  }

  var uid = 0;
  function nextId(prefix) { uid += 1; return (prefix || 'f') + '-' + uid; }

  function formatBytes(n) {
    if (!n) return '0 KB';
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function formatNaira(v) {
    if (v == null || v === '') return '';
    return '₦' + Number(v).toLocaleString('en-NG', { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }

  function formatWhen(ts) {
    if (!ts) return '';
    var d = new Date(ts.replace(' ', 'T') + '+01:00');
    if (isNaN(d)) return ts;
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function splitParagraphs(text) {
    return String(text || '').split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function splitLines(text) {
    return String(text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* ======================================================================
     API client
     ====================================================================== */

  function ApiError(status, code, message, fields) {
    this.status = status; this.code = code; this.message = message; this.fields = fields || {};
  }

  function apiUrl(route, query) {
    var params = new URLSearchParams(query || {});
    params.set('route', route);
    return API + '?' + params.toString();
  }

  function api(method, route, body, query, retried) {
    var opts = { method: method === 'GET' ? 'GET' : 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' };
    if (method !== 'GET') {
      opts.headers['X-CSRF-Token'] = state.csrf || '';
      if (method !== 'POST') opts.headers['X-HTTP-Method-Override'] = method; // works on hosts that block PUT/DELETE
    }
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }

    return fetch(apiUrl(route, query), opts).catch(function () {
      throw new ApiError(0, 'network', 'Cannot reach the server. Check your internet connection and try again.');
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        if (res.ok && json && json.ok) return json.data;
        var err = (json && json.error) || { code: 'http_' + res.status, message: 'Unexpected server response (' + res.status + ').' };
        if (err.code === 'csrf' && !retried) {
          // Token went stale (e.g. after a password change in another tab): refresh once and retry.
          return refreshSession().then(function () { return api(method, route, body, query, true); });
        }
        if (res.status === 401 && route !== 'auth/login') sessionEnded();
        if (err.code === 'password_change_required' && location.hash !== '#/password') location.hash = '#/password';
        throw new ApiError(res.status, err.code, err.message, err.fields);
      });
    });
  }

  function refreshSession() {
    return api('GET', 'auth/me').then(function (me) {
      state.csrf = me.csrf;
      state.admin = me.admin;
      if (me.upload_max_bytes > 0) MAX_UPLOAD = me.upload_max_bytes;
      return me;
    });
  }

  var sessionEndedShown = false;
  function sessionEnded() {
    if (sessionEndedShown || document.body.getAttribute('data-view') !== 'app') return;
    sessionEndedShown = true;
    state.dirty = false;
    openModal('Session ended', [h('p', { text: 'For security you were logged out after a period of inactivity. Please log in again.' })], [
      h('button', { class: 'btn btn--primary', type: 'button', text: 'Log in again', onclick: function () { location.reload(); } })
    ], { noClose: true });
  }

  /* ======================================================================
     Toasts, dialogs
     ====================================================================== */

  function toast(message, type) {
    var box = document.getElementById('toasts');
    if (!box) return;
    var t = h('div', { class: 'toast' + (type === 'error' ? ' toast--error' : ''), text: message });
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, type === 'error' ? 7000 : 3500);
  }

  function showError(err) {
    toast(err && err.message ? err.message : 'Something went wrong.', 'error');
  }

  function openModal(title, bodyNodes, footNodes, opts) {
    opts = opts || {};
    var dialog = h('dialog', { class: 'modal' + (opts.wide ? ' modal--wide' : ''), 'aria-label': title });
    function close() { if (dialog.open) dialog.close(); dialog.remove(); }
    var head = h('div', { class: 'modal__head' }, h('h2', { text: title }),
      opts.noClose ? null : h('button', { type: 'button', class: 'modal__close', 'aria-label': 'Close', text: '×', onclick: close }));
    dialog.appendChild(head);
    dialog.appendChild(h('div', { class: 'modal__body' }, bodyNodes));
    if (footNodes && footNodes.length) dialog.appendChild(h('div', { class: 'modal__foot' }, footNodes));
    dialog.addEventListener('cancel', function (e) { if (opts.noClose) e.preventDefault(); else { e.preventDefault(); close(); } });
    document.body.appendChild(dialog);
    dialog.showModal();
    return { dialog: dialog, close: close };
  }

  function confirmDialog(title, text, confirmLabel, danger) {
    return new Promise(function (resolve) {
      var m;
      var yes = h('button', { type: 'button', class: 'btn ' + (danger ? 'btn--danger-solid' : 'btn--primary'), text: confirmLabel || 'Confirm', onclick: function () { m.close(); resolve(true); } });
      var no = h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: function () { m.close(); resolve(false); } });
      m = openModal(title, Array.isArray(text) ? text : [h('p', { text: text })], [no, yes]);
      m.dialog.addEventListener('close', function () { resolve(false); });
      no.focus();
    });
  }

  /* ======================================================================
     Form helpers
     ====================================================================== */

  function field(key, label, input, hint) {
    var id = input.id || nextId('in');
    input.id = id;
    if (!input.name) input.name = key;
    var hintEl = hint ? h('p', { class: 'field__hint', id: id + '-hint', text: hint }) : null;
    if (hintEl) input.setAttribute('aria-describedby', id + '-hint');
    return h('div', { class: 'field', 'data-field': key },
      h('label', { for: id, text: label }), input, hintEl, h('p', { class: 'field__error', hidden: true }));
  }

  function textInput(value, attrs) {
    return h('input', Object.assign({ type: 'text', value: value == null ? '' : String(value) }, attrs || {}));
  }

  function textArea(value, attrs) {
    var t = h('textarea', attrs || {});
    t.value = value == null ? '' : String(value);
    return t;
  }

  function select(options, value, attrs) {
    var s = h('select', attrs || {});
    options.forEach(function (o) {
      s.appendChild(h('option', { value: String(o.value), text: o.label, selected: String(o.value) === String(value == null ? '' : value) }));
    });
    return s;
  }

  function checkbox(key, label, checked, hint) {
    var input = h('input', { type: 'checkbox', name: key, checked: !!checked });
    return { input: input, node: h('label', { class: 'check', 'data-field': key }, input, h('span', {}, h('strong', { text: label }), hint ? h('span', { class: 'muted small', text: hint }) : null)) };
  }

  function clearErrors(root) {
    root.querySelectorAll('[data-field]').forEach(function (f) {
      var e = f.querySelector('.field__error');
      if (e) { e.hidden = true; e.textContent = ''; }
      f.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    });
  }

  function showFieldErrors(root, err) {
    clearErrors(root);
    var fields = (err && err.fields) || {};
    var first = null;
    var unmatched = [];
    Object.keys(fields).forEach(function (key) {
      if (key === 'used_in' || key === 'retry_after') return;
      var wrap = root.querySelector('[data-field="' + key.replace(/"/g, '') + '"]');
      if (!wrap) { unmatched.push(fields[key]); return; }
      var e = wrap.querySelector('.field__error');
      if (e) { e.textContent = fields[key]; e.hidden = false; }
      var input = wrap.querySelector('input, select, textarea');
      if (input) { input.setAttribute('aria-invalid', 'true'); if (!first) first = input; }
    });
    if (first) first.focus();
    toast(unmatched.length ? unmatched.join(' ') : (err.message || 'Please correct the highlighted fields.'), 'error');
  }

  function busy(button, isBusy, label) {
    if (!button) return;
    if (isBusy) { button.dataset.label = button.textContent; button.textContent = label || 'Saving…'; button.disabled = true; }
    else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
  }

  /** Runs a save: busy button, field errors, success toast. */
  function save(button, root, fn, successMessage) {
    busy(button, true);
    if (root) clearErrors(root);
    return fn().then(function (result) {
      state.dirty = false;
      if (successMessage) toast(successMessage);
      return result;
    }).catch(function (err) {
      if (err && err.code === 'validation' && root) showFieldErrors(root, err);
      else showError(err);
      throw err;
    }).finally(function () { busy(button, false); });
  }

  function trackDirty(form) {
    form.addEventListener('input', function () { state.dirty = true; });
    form.addEventListener('change', function () { state.dirty = true; });
  }

  /* ======================================================================
     Media: uploads, picker, image fields
     ====================================================================== */

  function checkFile(file) {
    if (UPLOAD_TYPES.indexOf(file.type) === -1) return file.name + ': only JPG, PNG and WebP images can be uploaded.';
    if (file.size > MAX_UPLOAD) return file.name + ': the image is ' + formatBytes(file.size) + '. The limit is ' + formatBytes(MAX_UPLOAD) + '.';
    return null;
  }

  function uploadFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    var uploaded = [];
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () {
        var problem = checkFile(file);
        if (problem) { toast(problem, 'error'); return; }
        var fd = new FormData();
        fd.append('file', file);
        return api('POST', 'media', fd).then(function (m) { uploaded.push(m); })
          .catch(function (err) { toast(file.name + ': ' + err.message, 'error'); });
      });
    });
    return chain.then(function () {
      if (uploaded.length) toast(uploaded.length === 1 ? 'Image uploaded.' : uploaded.length + ' images uploaded.');
      return uploaded;
    });
  }

  function fileButton(label, multiple, onFiles, cls) {
    var input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: multiple ? true : null, class: 'visually-hidden', tabindex: '-1' });
    var btn = h('button', { type: 'button', class: cls || 'btn', text: label, onclick: function () { input.click(); } });
    input.addEventListener('change', function () { if (input.files.length) onFiles(input.files); input.value = ''; });
    return h('span', {}, btn, input);
  }

  /** Opens the Media Library as a picker. Resolves to an array of media, or null when cancelled. */
  function pickMedia(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var selected = {};
      var order = [];
      var page = 1;
      var query = '';
      var grid = h('div', { class: 'media-grid' });
      var more = h('button', { type: 'button', class: 'btn', text: 'Load more', hidden: true });
      var search = h('input', { type: 'search', placeholder: 'Search images by name', 'aria-label': 'Search images' });
      var done = false;

      function toggle(m, tile) {
        if (!opts.multiple) {
          finish([m]);
          return;
        }
        if (selected[m.id]) { delete selected[m.id]; order = order.filter(function (x) { return x !== m.id; }); tile.classList.remove('is-selected'); }
        else { selected[m.id] = m; order.push(m.id); tile.classList.add('is-selected'); }
        choose.textContent = 'Use ' + order.length + ' selected';
        choose.disabled = !order.length;
      }

      function tileFor(m) {
        var tile = h('button', { type: 'button', class: 'media-tile' + (selected[m.id] ? ' is-selected' : ''), title: m.title },
          h('img', { src: m.url, alt: '', loading: 'lazy' }), h('span', { text: m.title }), h('span', { class: 'tick', text: '✓', 'aria-hidden': 'true' }));
        tile.addEventListener('click', function () { toggle(m, tile); });
        return tile;
      }

      function load(reset) {
        if (reset) { page = 1; grid.textContent = ''; }
        api('GET', 'media', undefined, { page: page, per_page: 24, q: query }).then(function (res) {
          if (!res.items.length && page === 1) grid.appendChild(h('p', { class: 'empty', text: query ? 'No images match your search.' : 'No images yet. Upload one to get started.' }));
          res.items.forEach(function (m) { grid.appendChild(tileFor(m)); });
          more.hidden = res.page >= res.pages;
        }).catch(showError);
      }

      var timer;
      search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { query = search.value.trim(); load(true); }, 250); });
      more.addEventListener('click', function () { page += 1; load(false); });

      var upload = fileButton('Upload new image', !!opts.multiple, function (files) {
        uploadFiles(files).then(function (items) {
          if (!items.length) return;
          if (!opts.multiple) { finish([items[0]]); return; }
          items.forEach(function (m) { selected[m.id] = m; order.push(m.id); });
          load(true);
          choose.textContent = 'Use ' + order.length + ' selected';
          choose.disabled = false;
        });
      }, 'btn btn--accent');

      var choose = h('button', { type: 'button', class: 'btn btn--primary', text: 'Use selected', disabled: true, hidden: !opts.multiple });
      var m = openModal(opts.title || 'Choose an image', [
        h('div', { class: 'btn-row' }, upload, h('span', { class: 'muted small', text: 'JPG, PNG or WebP, up to 5 MB.' })),
        h('div', { class: 'field' }, search),
        grid,
        h('div', { class: 'btn-row' }, more)
      ], [h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: function () { finish(null); } }), choose], { wide: true });
      choose.addEventListener('click', function () { finish(order.map(function (id) { return selected[id]; })); });
      m.dialog.addEventListener('close', function () { finish(null); });

      function finish(result) {
        if (done) return;
        done = true;
        m.close();
        resolve(result);
      }
      load(true);
    });
  }

  /** Single image chooser. getValue() returns the media ID or null. */
  function imageField(key, label, media, hint, small) {
    var current = media || null;
    var preview = h('div', { class: 'image-field__preview' });
    var removeBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Remove' });
    var chooseBtn = h('button', { type: 'button', class: 'btn btn--sm', text: 'Choose image' });
    function draw() {
      preview.textContent = '';
      if (current) preview.appendChild(h('img', { src: current.url, alt: current.alt || '' }));
      else preview.textContent = 'No image';
      removeBtn.hidden = !current;
      chooseBtn.textContent = current ? 'Change image' : 'Choose image';
    }
    chooseBtn.addEventListener('click', function () {
      pickMedia({ title: label }).then(function (items) { if (items && items[0]) { current = items[0]; draw(); state.dirty = true; } });
    });
    removeBtn.addEventListener('click', function () { current = null; draw(); state.dirty = true; });
    draw();
    var node = h('div', { class: 'field', 'data-field': key },
      h('span', { class: 'field__label', text: label }),
      h('div', { class: 'image-field' + (small ? ' image-field--small' : '') }, preview, h('div', { class: 'btn-row' }, chooseBtn, removeBtn)),
      hint ? h('p', { class: 'field__hint', text: hint }) : null,
      h('p', { class: 'field__error', hidden: true }));
    return { node: node, getValue: function () { return current ? current.id : null; }, getMedia: function () { return current; } };
  }

  /** Several images in order. getValue() returns an array of media IDs. */
  function galleryField(key, label, items, hint, max) {
    var list = (items || []).slice();
    var box = h('div', { class: 'gallery-field' });
    var addBtn = h('button', { type: 'button', class: 'btn btn--sm', text: 'Add images' });
    function draw() {
      box.textContent = '';
      list.forEach(function (m, i) {
        box.appendChild(h('div', { class: 'gallery-field__item' },
          h('img', { src: m.url, alt: m.alt || m.title }),
          h('button', { type: 'button', 'aria-label': 'Remove ' + m.title, text: '×', onclick: function () { list.splice(i, 1); draw(); state.dirty = true; } })));
      });
      box.appendChild(addBtn);
      addBtn.hidden = list.length >= (max || 12);
    }
    addBtn.addEventListener('click', function () {
      pickMedia({ multiple: true, title: label }).then(function (picked) {
        if (!picked) return;
        picked.forEach(function (m) { if (!list.some(function (x) { return x.id === m.id; })) list.push(m); });
        list = list.slice(0, max || 12);
        draw();
        state.dirty = true;
      });
    });
    draw();
    return {
      node: h('div', { class: 'field', 'data-field': key }, h('span', { class: 'field__label', text: label }), box,
        hint ? h('p', { class: 'field__hint', text: hint }) : null, h('p', { class: 'field__error', hidden: true })),
      getValue: function () { return list.map(function (m) { return m.id; }); }
    };
  }

  /** Repeatable list of sub-forms (benefit cards, about sections). */
  function repeater(key, items, makeItem, opts) {
    var wrap = h('div', { class: 'repeater', 'data-field': key });
    var rows = [];
    var addBtn = h('button', { type: 'button', class: 'btn btn--sm', text: opts.addLabel });

    function draw() {
      wrap.textContent = '';
      rows.forEach(function (row, i) {
        var up = h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Move up', text: '↑', disabled: i === 0, onclick: function () { move(i, -1); } });
        var down = h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Move down', text: '↓', disabled: i === rows.length - 1, onclick: function () { move(i, 1); } });
        var del = h('button', { type: 'button', class: 'btn btn--danger btn--sm', text: 'Delete', onclick: function () {
          confirmDialog('Delete this ' + opts.itemLabel.toLowerCase() + '?', 'It will be removed when you save this section.', 'Delete', true).then(function (ok) {
            if (ok) { rows.splice(i, 1); draw(); state.dirty = true; }
          });
        } });
        row.setIndex(i);
        wrap.appendChild(h('div', { class: 'repeater__item' },
          h('div', { class: 'repeater__head' }, h('strong', { text: opts.itemLabel + ' ' + (i + 1) }), h('div', { class: 'btn-row' }, up, down, del)),
          row.node));
      });
      if (!rows.length) wrap.appendChild(h('p', { class: 'muted', text: 'Nothing here yet.' }));
      addBtn.hidden = rows.length >= opts.max;
      wrap.appendChild(h('div', {}, addBtn));
    }
    function move(i, delta) {
      var r = rows.splice(i, 1)[0];
      rows.splice(i + delta, 0, r);
      draw();
      state.dirty = true;
    }
    addBtn.addEventListener('click', function () { rows.push(makeItem({})); draw(); state.dirty = true; });
    (items || []).forEach(function (item) { rows.push(makeItem(item)); });
    draw();
    return { node: wrap, getValue: function () { return rows.map(function (r) { return r.getValue(); }); } };
  }

  /* ======================================================================
     Layout and routing
     ====================================================================== */

  var main;
  var routes = {};

  function pageHead(title, intro, actions) {
    document.title = title + ' | Timbershade dashboard';
    var t = document.querySelector('.topbar__title');
    if (t) t.textContent = title;
    return h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: title }), intro ? h('p', { text: intro }) : null), actions ? h('div', { class: 'btn-row' }, actions) : null);
  }

  function setActiveNav(name) {
    document.querySelectorAll('.sidebar__nav a').forEach(function (a) {
      if (a.getAttribute('data-route') === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function closeSidebar() {
    var sb = document.getElementById('sidebar');
    var bd = document.querySelector('.sidebar-backdrop');
    var btn = document.querySelector('.topbar__menu');
    if (sb) sb.classList.remove('is-open');
    if (bd) bd.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  var lastHash = location.hash;
  function router() {
    var hash = location.hash || '#/overview';
    var parts = hash.replace(/^#\/?/, '').split('/');
    var name = parts[0] || 'overview';
    if (state.admin && state.admin.must_change_password && name !== 'password') {
      location.replace('#/password');
      return;
    }
    if (!routes[name]) { location.replace('#/overview'); return; }
    lastHash = hash;
    setActiveNav(name);
    closeSidebar();
    main.textContent = '';
    main.appendChild(h('p', { class: 'loading', text: 'Loading…' }));
    state.dirty = false;
    Promise.resolve(routes[name](parts.slice(1))).then(function (nodes) {
      main.textContent = '';
      append(main, nodes);
      main.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }).catch(function (err) {
      main.textContent = '';
      main.appendChild(h('div', { class: 'alert alert--error', text: (err && err.message) || 'This page could not be loaded.' }));
    });
  }

  window.addEventListener('hashchange', function () {
    if (!main) return; // login screen
    if (state.dirty && location.hash !== lastHash) {
      var target = location.hash;
      history.replaceState(null, '', lastHash);
      confirmDialog('Leave without saving?', 'You have changes on this page that are not saved yet.', 'Leave page', true).then(function (ok) {
        if (ok) { state.dirty = false; location.hash = target; }
      });
      return;
    }
    router();
  });
  window.addEventListener('beforeunload', function (e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  function loadCategories(force) {
    if (state.categories && !force) return Promise.resolve(state.categories);
    return api('GET', 'categories').then(function (c) { state.categories = c; return c; });
  }

  function loadSettings() {
    return api('GET', 'settings').then(function (res) { state.settings = res.settings; return res; });
  }

  /* ======================================================================
     Overview
     ====================================================================== */

  routes.overview = function () {
    return api('GET', 'dashboard').then(function (d) {
      function stat(value, label, href, warn) {
        return h('a', { class: 'stat' + (warn ? ' stat--warn' : ''), href: href }, h('div', { class: 'stat__value', text: String(value) }), h('div', { class: 'stat__label', text: label }));
      }
      var recent = d.recent.length
        ? h('ul', { class: 'activity' }, d.recent.map(function (a) {
          return h('li', {}, h('span', { text: a.summary }), h('time', { datetime: a.created_at, text: formatWhen(a.created_at) }));
        }))
        : h('p', { class: 'muted', text: 'No changes yet. Edits you make will be listed here.' });
      return [
        pageHead('Overview', 'Everything on your public website is managed from here.'),
        h('div', { class: 'stats' },
          stat(d.products, 'Products', '#/products'),
          stat(d.categories, 'Categories', '#/categories'),
          stat(d.featured, 'Featured on homepage', '#/homepage'),
          stat(d.available, 'Available', '#/products'),
          stat(d.unavailable, 'Unavailable / out of stock', '#/products', d.unavailable > 0),
          stat(d.testimonials, 'Published reviews', '#/testimonials')),
        h('div', { class: 'grid-2' },
          h('section', { class: 'panel' },
            h('h2', { text: 'Quick actions' }),
            h('div', { class: 'quick' },
              h('a', { class: 'btn btn--primary', href: '#/products/new', text: 'Add a product' }),
              h('a', { class: 'btn', href: '#/homepage', text: 'Edit homepage' }),
              h('a', { class: 'btn', href: '#/media', text: 'Upload images' }),
              h('a', { class: 'btn', href: '#/contact', text: 'Edit contact details' }),
              h('a', { class: 'btn', href: '#/branding', text: 'Change logo & branding' }),
              h('a', { class: 'btn', href: '#/settings', text: 'Price display & settings' })),
            h('p', { class: 'muted small', text: 'Prices on the website: ' + (d.price_mode === 'show' ? 'shown in naira.' : '"Contact for price".') + ' WhatsApp orders go to ' + (d.whatsapp_display || 'the number in Contact Details') + '.' })),
          h('section', { class: 'panel' }, h('h2', { text: 'Recent updates' }), recent))
      ];
    });
  };

  /* ======================================================================
     Products
     ====================================================================== */

  var productQuery = { q: '', category: '', status: '', page: 1 };

  routes.products = function (args) {
    if (args[0] === 'new') return productForm(null);
    if (args[0] && /^\d+$/.test(args[0])) return api('GET', 'products/' + args[0]).then(productForm);
    return loadCategories().then(function (cats) {
      var search = h('input', { type: 'search', placeholder: 'Search by name, size or ID', value: productQuery.q, 'aria-label': 'Search products' });
      var catSel = select([{ value: '', label: 'All categories' }].concat(cats.map(function (c) { return { value: c.id, label: c.name }; })), productQuery.category, { 'aria-label': 'Filter by category' });
      var statusSel = select([
        { value: '', label: 'Any status' }, { value: 'available', label: 'Available' },
        { value: 'unavailable', label: 'Unavailable / out of stock' }, { value: 'featured', label: 'Featured' }
      ], productQuery.status, { 'aria-label': 'Filter by status' });
      var tableBox = h('div', {});
      var pager = h('div', { class: 'pager' });

      function load() {
        tableBox.textContent = 'Loading…';
        api('GET', 'products', undefined, { q: productQuery.q, category: productQuery.category, status: productQuery.status, page: productQuery.page, per_page: 15 })
          .then(function (res) { renderTable(res); }).catch(showError);
      }

      function renderTable(res) {
        tableBox.textContent = '';
        pager.textContent = '';
        if (!res.items.length) {
          tableBox.appendChild(h('div', { class: 'panel empty' }, h('p', { text: 'No products match.' }), h('a', { class: 'btn btn--primary', href: '#/products/new', text: 'Add a product' })));
          return;
        }
        var priceShown = state.settings && state.settings.price_mode === 'show';
        var tbody = h('tbody', {});
        res.items.forEach(function (p) {
          var status = [];
          var outOfStock = p.stock === 0;
          status.push(h('span', { class: 'badge ' + (p.is_available && !outOfStock ? 'badge--ok' : 'badge--off'), text: !p.is_available ? 'Unavailable' : outOfStock ? 'Out of stock' : 'Available' }));
          if (p.is_featured) status.push(h('span', { class: 'badge badge--star', text: '★ Featured' }));
          tbody.appendChild(h('tr', {},
            h('td', {}, p.image ? h('img', { class: 'thumb', src: p.image.url, alt: '' }) : h('span', { class: 'thumb' })),
            h('td', {}, h('div', { class: 'name', text: p.name }), h('div', { class: 'code', text: 'ID: ' + p.code + (p.size_spec ? ' · ' + p.size_spec : '') })),
            h('td', { 'data-label': 'Category', text: p.category_name || '—' }),
            h('td', { 'data-label': 'Price', text: p.price == null ? '—' : formatNaira(p.price) + ' / ' + p.unit, title: priceShown ? '' : 'Prices are hidden on the website (Contact for price mode).' }),
            h('td', { 'data-label': 'Stock', text: p.stock == null ? 'Not tracked' : String(p.stock) }),
            h('td', {}, status),
            h('td', { class: 'actions' },
              h('a', { class: 'btn btn--sm', href: '#/products/' + p.id, text: 'Edit' }), ' ',
              h('button', { type: 'button', class: 'btn btn--danger btn--sm', text: 'Delete', onclick: function () { deleteProduct(p).then(function (ok) { if (ok) load(); }); } }))));
        });
        tableBox.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards' },
          h('thead', {}, h('tr', {}, ['', 'Product', 'Category', 'Price', 'Stock', 'Status', ''].map(function (t) { return h('th', { scope: 'col', text: t }); }))),
          tbody)));
        pager.appendChild(h('span', { class: 'muted small', text: res.total + ' product' + (res.total === 1 ? '' : 's') + ' · page ' + res.page + ' of ' + res.pages }));
        pager.appendChild(h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn--sm', text: '← Previous', disabled: res.page <= 1, onclick: function () { productQuery.page = res.page - 1; load(); } }),
          h('button', { type: 'button', class: 'btn btn--sm', text: 'Next →', disabled: res.page >= res.pages, onclick: function () { productQuery.page = res.page + 1; load(); } })));
      }

      var timer;
      search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { productQuery.q = search.value.trim(); productQuery.page = 1; load(); }, 300); });
      catSel.addEventListener('change', function () { productQuery.category = catSel.value; productQuery.page = 1; load(); });
      statusSel.addEventListener('change', function () { productQuery.status = statusSel.value; productQuery.page = 1; load(); });

      (state.settings ? Promise.resolve() : loadSettings().catch(function () {})).then(load);
      return [
        pageHead('Products', 'Add, edit and remove the products shown on your website.', [h('a', { class: 'btn btn--primary', href: '#/products/new', text: '+ Add product' })]),
        h('div', { class: 'toolbar' }, search, catSel, statusSel),
        tableBox, pager
      ];
    });
  };

  function deleteProduct(p) {
    return confirmDialog('Delete "' + p.name + '"?', 'The product will be removed from the website immediately. Customers who already have it in their cart will see it as no longer available. This cannot be undone.', 'Delete product', true)
      .then(function (ok) {
        if (!ok) return false;
        return api('DELETE', 'products/' + p.id).then(function () { toast('Product deleted.'); return true; }).catch(function (e) { showError(e); return false; });
      });
  }

  function productForm(p) {
    var isNew = !p;
    p = p || { name: '', code: '', category_id: '', description: '', image: null, gallery: [], price: null, unit: 'piece', size_spec: '', stock: null, is_available: true, is_featured: false, sort_order: 0 };
    return Promise.all([loadCategories(true), state.settings ? Promise.resolve() : loadSettings().catch(function () {})]).then(function () {
      var cats = state.categories;
      var form = h('form', { novalidate: true });
      var name = textInput(p.name, { maxlength: 150, required: true });
      var code = textInput(p.code, { maxlength: 60, autocapitalize: 'none', spellcheck: 'false' });
      var category = select([{ value: '', label: 'Choose a category' }].concat(cats.map(function (c) { return { value: c.id, label: c.name }; })), p.category_id);
      var description = textArea(p.description, { maxlength: 2000, rows: 4 });
      var price = textInput(p.price == null ? '' : String(p.price), { inputmode: 'decimal', placeholder: 'e.g. 4500' });
      var unitList = h('datalist', { id: 'unit-options' }, UNITS.map(function (u) { return h('option', { value: u }); }));
      var unit = textInput(p.unit, { list: 'unit-options', maxlength: 30 });
      var size = textInput(p.size_spec, { maxlength: 150, placeholder: 'e.g. 2" x 4" x 12 ft' });
      var stock = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: p.stock == null ? '' : String(p.stock), placeholder: 'Leave empty if not tracked' });
      var order = h('input', { type: 'number', step: '1', value: String(p.sort_order || 0) });
      var available = checkbox('is_available', 'Available for order', p.is_available, 'Untick to show the product as "Currently unavailable".');
      var featured = checkbox('is_featured', 'Featured on the homepage', p.is_featured, 'Change the order of featured products under Homepage.');
      var image = imageField('image_id', 'Main image', p.image, 'Shown on product cards and in the cart. 4:3 photos (e.g. 1200 × 900) look best.');
      var gallery = galleryField('gallery_ids', 'Additional gallery images', p.gallery, 'Optional extra photos of this product.', 12);
      var priceHint = state.settings && state.settings.price_mode === 'show'
        ? 'Shown on the website in naira.'
        : 'Saved, but not shown: the website is in "Contact for price" mode (change it in Website Settings).';

      append(form, [
        h('section', { class: 'panel' },
          h('h2', { text: 'Product details' }),
          field('name', 'Product name', name),
          h('div', { class: 'grid-2' },
            field('category_id', 'Category', category),
            field('size_spec', 'Size / specification', size)),
          field('description', 'Description', description, 'A short description customers will see.'),
          image.node, gallery.node),
        h('section', { class: 'panel' },
          h('h2', { text: 'Price and stock' }),
          h('div', { class: 'grid-3' },
            field('price', 'Price (₦)', price, priceHint),
            field('unit', 'Sold per (unit)', unit, 'e.g. piece, length, bundle, pack, kg'),
            field('stock', 'Stock quantity', stock, 'Customers cannot order more than this. 0 = out of stock.')),
          unitList, available.node, featured.node),
        h('section', { class: 'panel' },
          h('h2', { text: 'Advanced' }),
          h('div', { class: 'grid-2' },
            field('code', 'Product ID', code, isNew ? 'Leave empty to create one from the name. Used in links and saved carts.' : 'Changing this removes the product from carts that already contain it.'),
            field('sort_order', 'Display order', order, 'Lower numbers are shown first in the catalogue.')))
      ]);

      var saveBtn = h('button', { type: 'submit', class: 'btn btn--primary', text: isNew ? 'Add product' : 'Save changes' });
      var actions = h('div', { class: 'form-actions' }, saveBtn, h('a', { class: 'btn', href: '#/products', text: 'Cancel' }),
        isNew ? null : h('button', { type: 'button', class: 'btn btn--danger', text: 'Delete product', onclick: function () {
          deleteProduct(p).then(function (ok) { if (ok) { state.dirty = false; location.hash = '#/products'; } });
        } }));
      form.appendChild(actions);
      trackDirty(form);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var body = {
          name: name.value, code: code.value, category_id: category.value ? Number(category.value) : null,
          description: description.value, image_id: image.getValue(), gallery_ids: gallery.getValue(),
          price: price.value, unit: unit.value, size_spec: size.value, stock: stock.value,
          is_available: available.input.checked, is_featured: featured.input.checked, sort_order: order.value
        };
        save(saveBtn, form, function () {
          return isNew ? api('POST', 'products', body) : api('PUT', 'products/' + p.id, body);
        }, isNew ? 'Product added. It is now on the website.' : 'Product saved. The website is updated.').then(function (saved) {
          state.dirty = false;
          if (isNew) location.hash = '#/products/' + saved.id;
          else location.hash = '#/products';
        }).catch(function () {});
      });

      return [pageHead(isNew ? 'Add product' : 'Edit product', isNew ? null : p.name, [h('a', { class: 'btn btn--ghost', href: '#/products', text: '← All products' })]), form];
    });
  }

  /* ======================================================================
     Categories
     ====================================================================== */

  routes.categories = function () {
    return loadCategories(true).then(function (cats) {
      var list = h('ul', { class: 'sortable' });
      function draw() {
        list.textContent = '';
        if (!state.categories.length) list.appendChild(h('li', { class: 'empty', text: 'No categories yet.' }));
        state.categories.forEach(function (c, i) {
          list.appendChild(h('li', {},
            h('div', { class: 'order-btns' },
              h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Move ' + c.name + ' up', text: '↑', disabled: i === 0, onclick: function () { reorder(i, -1); } }),
              h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Move ' + c.name + ' down', text: '↓', disabled: i === state.categories.length - 1, onclick: function () { reorder(i, 1); } })),
            c.image ? h('img', { class: 'thumb', src: c.image.url, alt: '' }) : h('span', { class: 'thumb' }),
            h('div', { class: 'grow' }, h('p', { class: 'name' }, h('strong', { text: c.name })), h('p', { class: 'muted small', text: c.description || 'No description' }),
              h('p', { class: 'small' }, h('span', { class: 'badge', text: c.product_count + ' product' + (c.product_count === 1 ? '' : 's') }))),
            h('div', { class: 'btn-row' },
              h('button', { type: 'button', class: 'btn btn--sm', text: 'Edit', onclick: function () { categoryModal(c).then(refresh); } }),
              h('button', { type: 'button', class: 'btn btn--danger btn--sm', text: 'Delete', onclick: function () { deleteCategory(c); } }))));
        });
      }
      function refresh(changed) { if (changed) loadCategories(true).then(draw); }
      function reorder(i, delta) {
        var arr = state.categories.slice();
        var item = arr.splice(i, 1)[0];
        arr.splice(i + delta, 0, item);
        api('POST', 'categories/reorder', { ids: arr.map(function (c) { return c.id; }) }).then(function (res) {
          state.categories = res; draw(); toast('Category order saved.');
        }).catch(showError);
      }
      function deleteCategory(c) {
        if (c.product_count > 0) {
          toast('"' + c.name + '" still has ' + c.product_count + ' product(s). Move them to another category first.', 'error');
          return;
        }
        confirmDialog('Delete "' + c.name + '"?', 'It will disappear from the website menu and filters. This cannot be undone.', 'Delete category', true).then(function (ok) {
          if (!ok) return;
          api('DELETE', 'categories/' + c.id).then(function () { toast('Category deleted.'); refresh(true); }).catch(showError);
        });
      }
      draw();
      return [
        pageHead('Categories', 'Categories appear on the homepage, in the catalogue filters and on the About page. The order here is the order on the website.',
          [h('button', { type: 'button', class: 'btn btn--primary', text: '+ Add category', onclick: function () { categoryModal(null).then(refresh); } })]),
        list
      ];
    });
  };

  function categoryModal(c) {
    var isNew = !c;
    c = c || { name: '', slug: '', description: '', image: null };
    return new Promise(function (resolve) {
      var form = h('form', { novalidate: true });
      var name = textInput(c.name, { maxlength: 100 });
      var slug = textInput(c.slug, { maxlength: 80, autocapitalize: 'none' });
      var desc = textArea(c.description, { maxlength: 500, rows: 3 });
      var image = imageField('image_id', 'Category image', c.image, 'Shown on the homepage category tile.');
      append(form, [field('name', 'Category name', name), field('description', 'Description', desc), image.node,
        field('slug', 'Web address name', slug, isNew ? 'Optional. Used in links such as products.html?category=planks.' : 'Changing this breaks old links to this category.')]);
      var saveBtn = h('button', { type: 'button', class: 'btn btn--primary', text: isNew ? 'Add category' : 'Save' });
      var m = openModal(isNew ? 'Add category' : 'Edit category', [form], [h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: function () { m.close(); resolve(false); } }), saveBtn]);
      function submit(e) {
        if (e) e.preventDefault();
        var body = { name: name.value, slug: slug.value, description: desc.value, image_id: image.getValue() };
        save(saveBtn, form, function () { return isNew ? api('POST', 'categories', body) : api('PUT', 'categories/' + c.id, body); }, isNew ? 'Category added.' : 'Category saved.')
          .then(function () { m.close(); resolve(true); }).catch(function () {});
      }
      saveBtn.addEventListener('click', submit);
      form.addEventListener('submit', submit);
      m.dialog.addEventListener('close', function () { resolve(false); });
    });
  }

  /* ======================================================================
     Homepage
     ====================================================================== */

  function sectionForm(key, label, sec, media, buildFields, intro) {
    var c = sec ? sec.content : {};
    var form = h('form', { novalidate: true });
    var enabled = checkbox('enabled', 'Show this section on the homepage', !sec || sec.enabled);
    var built = buildFields(c, media);
    var saveBtn = h('button', { type: 'submit', class: 'btn btn--primary', text: 'Save ' + label.toLowerCase() });
    append(form, [intro ? h('p', { class: 'muted', text: intro }) : null, enabled.node, built.nodes, h('div', { class: 'btn-row' }, saveBtn)]);
    trackDirty(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      save(saveBtn, form, function () {
        return api('PUT', 'content/home/' + key, { enabled: enabled.input.checked, content: built.getValue() });
      }, label + ' saved. The homepage is updated.').catch(function () {});
    });
    return h('details', { class: 'section' }, h('summary', {}, h('span', { text: label }), sec && !sec.enabled ? h('span', { class: 'badge badge--off', text: 'Hidden' }) : null), h('div', { class: 'section__body' }, form));
  }

  function m(media, id) { return id && media ? media[id] || null : null; }

  function headingFields(c) {
    var eyebrow = textInput(c.eyebrow, { maxlength: 60 });
    var heading = textInput(c.heading, { maxlength: 150 });
    return {
      nodes: h('div', { class: 'grid-2' }, field('eyebrow', 'Small label above the heading', eyebrow), field('heading', 'Heading', heading)),
      get: function () { return { eyebrow: eyebrow.value, heading: heading.value }; }
    };
  }

  routes.homepage = function () {
    return Promise.all([api('GET', 'content/home'), api('GET', 'products', undefined, { per_page: 100 })]).then(function (r) {
      var home = r[0];
      var products = r[1].items;
      var s = home.sections;
      var media = home.media;

      var hero = sectionForm('hero', 'Hero', s.hero, media, function (c) {
        var hf = headingFields(c);
        var text = textArea(c.text, { maxlength: 400, rows: 3 });
        var image = imageField('image_id', 'Hero image', m(media, c.image_id), 'Large image beside the heading. 4:3, about 1600 × 1200, works best.');
        var alt = textInput(c.image_alt, { maxlength: 200 });
        var btnText = textInput(c.button_text, { maxlength: 40 });
        var btnUrl = textInput(c.button_url, { maxlength: 300 });
        var waText = textInput(c.whatsapp_button_text, { maxlength: 40 });
        var points = textArea((c.points || []).join('\n'), { rows: 3 });
        return {
          nodes: [hf.nodes, field('text', 'Supporting text', text), image.node, field('image_alt', 'Image description (for screen readers)', alt),
            h('div', { class: 'grid-3' }, field('button_text', 'Main button text', btnText), field('button_url', 'Main button destination', btnUrl, 'A page such as products.html, or a full https:// link.'), field('whatsapp_button_text', 'WhatsApp button text', waText, 'Leave empty to hide the WhatsApp button.')),
            field('points', 'Highlights under the buttons (one per line)', points)],
          getValue: function () { return Object.assign(hf.get(), { text: text.value, image_id: image.getValue(), image_alt: alt.value, button_text: btnText.value, button_url: btnUrl.value, whatsapp_button_text: waText.value, points: splitLines(points.value) }); }
        };
      });

      var categories = sectionForm('categories', 'Categories', s.categories, media, function (c) {
        var hf = headingFields(c);
        var text = textArea(c.text, { maxlength: 500, rows: 2 });
        return {
          nodes: [hf.nodes, field('text', 'Supporting text (optional)', text), h('p', { class: 'muted small' }, 'Category names, descriptions, images and order are edited under ', h('a', { href: '#/categories', text: 'Categories' }), '.')],
          getValue: function () { return Object.assign(hf.get(), { text: text.value }); }
        };
      });

      var featuredPicker = featuredEditor(products);
      var featured = sectionForm('featured', 'Featured products', s.featured, media, function (c) {
        var hf = headingFields(c);
        var btn = textInput(c.button_text, { maxlength: 40 });
        var limit = h('input', { type: 'number', min: '1', max: '12', value: String(c.limit || 6) });
        return {
          nodes: [hf.nodes, h('div', { class: 'grid-2' }, field('button_text', '"View all" button text', btn), field('limit', 'Number of products shown', limit))],
          getValue: function () { return Object.assign(hf.get(), { button_text: btn.value, limit: Number(limit.value) || 6 }); }
        };
      });
      featured.querySelector('.section__body').appendChild(featuredPicker);

      var why = sectionForm('why', 'Why Choose Us', s.why, media, function (c) {
        var hf = headingFields(c);
        var cards = repeater('cards', c.cards, function (card) {
          var title = textInput(card.title, { maxlength: 80 });
          var text = textArea(card.text, { maxlength: 300, rows: 2 });
          var iconName = 'icon-' + nextId('ic');
          var current = card.icon || 'check';
          var icons = h('div', { class: 'icon-choice', role: 'radiogroup', 'aria-label': 'Icon' }, Object.keys(ICON_PATHS).map(function (key) {
            var input = h('input', { type: 'radio', name: iconName, value: key, checked: key === current, 'aria-label': key });
            return h('label', { title: key }, input, svgIcon(key));
          }));
          var image = imageField('image_id', 'Or use an image instead of the icon', m(media, card.image_id), null, true);
          var wrap = h('div', {}, field('title', 'Title', title), field('text', 'Description', text), h('div', { class: 'field' }, h('span', { class: 'field__label', text: 'Icon' }), icons), image.node);
          return {
            node: wrap,
            setIndex: function (i) { wrap.querySelectorAll('[data-field]').forEach(function (f) { var k = f.getAttribute('data-field').split('.').pop(); f.setAttribute('data-field', 'cards.' + i + '.' + k); }); },
            getValue: function () { var sel = icons.querySelector('input:checked'); return { title: title.value, text: text.value, icon: sel ? sel.value : 'check', image_id: image.getValue() }; }
          };
        }, { addLabel: '+ Add benefit card', itemLabel: 'Card', max: 8 });
        return { nodes: [hf.nodes, cards.node], getValue: function () { return Object.assign(hf.get(), { cards: cards.getValue() }); } };
      });

      var reviews = sectionForm('reviews', 'Reviews / testimonials', s.reviews, media, function (c) {
        var hf = headingFields(c);
        var text = textArea(c.text, { maxlength: 500, rows: 2 });
        return {
          nodes: [hf.nodes, field('text', 'Supporting text (optional)', text), h('p', { class: 'muted small' }, 'Add, publish and hide individual reviews under ', h('a', { href: '#/testimonials', text: 'Testimonials' }), '.')],
          getValue: function () { return Object.assign(hf.get(), { text: text.value }); }
        };
      });

      var about = sectionForm('about', 'About section', s.about, media, function (c) {
        var hf = headingFields(c);
        var paras = textArea((c.paragraphs || []).join('\n\n'), { rows: 6 });
        var image = imageField('image_id', 'Image', m(media, c.image_id));
        var alt = textInput(c.image_alt, { maxlength: 200 });
        var btnText = textInput(c.button_text, { maxlength: 40 });
        var btnUrl = textInput(c.button_url, { maxlength: 300 });
        return {
          nodes: [hf.nodes, field('paragraphs', 'Paragraphs', paras, 'Leave an empty line between paragraphs.'), image.node, field('image_alt', 'Image description', alt),
            h('div', { class: 'grid-2' }, field('button_text', 'Button text', btnText), field('button_url', 'Button destination', btnUrl))],
          getValue: function () { return Object.assign(hf.get(), { paragraphs: splitParagraphs(paras.value), image_id: image.getValue(), image_alt: alt.value, button_text: btnText.value, button_url: btnUrl.value }); }
        };
      });

      var contact = sectionForm('contact', 'Contact section', s.contact, media, function (c) {
        var hf = headingFields(c);
        var text = textArea(c.text, { maxlength: 500, rows: 2 });
        return {
          nodes: [hf.nodes, field('text', 'Supporting text', text), h('p', { class: 'muted small' }, 'The WhatsApp number and address shown here come from ', h('a', { href: '#/contact', text: 'Contact Details' }), '.')],
          getValue: function () { return Object.assign(hf.get(), { text: text.value }); }
        };
      }, null);

      hero.open = true;
      return [pageHead('Homepage', 'Open a section to edit it. Each section saves separately and appears on the homepage straight away.', [h('a', { class: 'btn btn--ghost', href: '../index.html', target: '_blank', rel: 'noopener', text: 'Preview homepage' })]),
        hero, categories, featured, why, reviews, about, contact];
    });
  };

  function featuredEditor(products) {
    var chosen = products.filter(function (p) { return p.is_featured; }).sort(function (a, b) { return a.featured_order - b.featured_order; });
    var box = h('div', { class: 'panel panel--muted' });
    var list = h('ul', { class: 'sortable' });
    var addSel = h('select', { 'aria-label': 'Add a featured product' });
    var saveBtn = h('button', { type: 'button', class: 'btn btn--primary', text: 'Save featured products' });
    function draw() {
      list.textContent = '';
      if (!chosen.length) list.appendChild(h('li', { class: 'muted', text: 'No featured products. The first products in the catalogue will be shown instead.' }));
      chosen.forEach(function (p, i) {
        list.appendChild(h('li', {},
          h('div', { class: 'order-btns' },
            h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Move ' + p.name + ' up', text: '↑', disabled: i === 0, onclick: function () { move(i, -1); } }),
            h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Move ' + p.name + ' down', text: '↓', disabled: i === chosen.length - 1, onclick: function () { move(i, 1); } })),
          p.image ? h('img', { class: 'thumb', src: p.image.url, alt: '' }) : h('span', { class: 'thumb' }),
          h('div', { class: 'grow' }, h('p', {}, h('strong', { text: p.name })), h('p', { class: 'muted small', text: p.category_name || '' })),
          h('button', { type: 'button', class: 'btn btn--danger btn--sm', text: 'Remove', onclick: function () { chosen.splice(i, 1); draw(); state.dirty = true; } })));
      });
      addSel.textContent = '';
      addSel.appendChild(h('option', { value: '', text: 'Add a product…' }));
      products.filter(function (p) { return chosen.indexOf(p) === -1; }).forEach(function (p) { addSel.appendChild(h('option', { value: String(p.id), text: p.name })); });
    }
    function move(i, d) { var x = chosen.splice(i, 1)[0]; chosen.splice(i + d, 0, x); draw(); state.dirty = true; }
    addSel.addEventListener('change', function () {
      var p = products.filter(function (x) { return String(x.id) === addSel.value; })[0];
      if (p) { chosen.push(p); draw(); state.dirty = true; }
    });
    saveBtn.addEventListener('click', function () {
      save(saveBtn, null, function () { return api('PUT', 'products/featured', { ids: chosen.map(function (p) { return p.id; }) }); }, 'Featured products saved.').catch(function () {});
    });
    draw();
    append(box, [h('h3', { text: 'Which products are featured, and in what order' }), list, h('div', { class: 'btn-row' }, addSel, saveBtn)]);
    return box;
  }

  /* ======================================================================
     About page
     ====================================================================== */

  routes.about = function () {
    return api('GET', 'content/pages/about').then(function (res) {
      var c = res.content;
      var media = res.media;
      var form = h('form', { novalidate: true });
      var eyebrow = textInput(c.eyebrow, { maxlength: 60 });
      var title = textInput(c.title, { maxlength: 150 });
      var intro = textArea(c.intro, { maxlength: 400, rows: 2 });
      var sections = repeater('sections', c.sections, function (s) {
        var heading = textInput(s.heading, { maxlength: 150 });
        var paras = textArea((s.paragraphs || []).join('\n\n'), { rows: 5 });
        var steps = textArea((s.steps || []).join('\n'), { rows: 3 });
        var wrap = h('div', {}, field('heading', 'Heading', heading), field('paragraphs', 'Paragraphs', paras, 'Leave an empty line between paragraphs.'),
          field('steps', 'Numbered steps (optional, one per line)', steps, 'Start a step with a short phrase and a full stop to make it bold, e.g. "Browse the catalogue. Find the sizes you need."'));
        return {
          node: wrap,
          setIndex: function (i) { wrap.querySelectorAll('[data-field]').forEach(function (f) { var k = f.getAttribute('data-field').split('.').pop(); f.setAttribute('data-field', 'sections.' + i + '.' + k); }); },
          getValue: function () { return { heading: heading.value, paragraphs: splitParagraphs(paras.value), steps: splitLines(steps.value) }; }
        };
      }, { addLabel: '+ Add content section', itemLabel: 'Section', max: 8 });
      var images = galleryField('image_ids', 'Images', (c.image_ids || []).map(function (id) { return media[id]; }).filter(Boolean), 'Shown beside the main text. Up to 4.', 4);
      var supply = textInput(c.supply_heading, { maxlength: 150 });
      var ctaH = textInput(c.cta_heading, { maxlength: 150 });
      var ctaT = textInput(c.cta_text, { maxlength: 300 });
      var saveBtn = h('button', { type: 'submit', class: 'btn btn--primary', text: 'Save About page' });
      append(form, [
        h('section', { class: 'panel' }, h('h2', { text: 'Page header' }), h('div', { class: 'grid-2' }, field('eyebrow', 'Small label', eyebrow), field('title', 'Page title', title)), field('intro', 'Main introduction', intro)),
        h('section', { class: 'panel' }, h('h2', { text: 'Business description' }), sections.node, images.node),
        h('section', { class: 'panel' }, h('h2', { text: 'Lower sections' }), field('supply_heading', '"What we supply" heading (lists your categories)', supply),
          h('div', { class: 'grid-2' }, field('cta_heading', 'Closing heading', ctaH), field('cta_text', 'Closing text', ctaT))),
        h('div', { class: 'form-actions' }, saveBtn, h('a', { class: 'btn btn--ghost', href: '../about.html', target: '_blank', rel: 'noopener', text: 'Preview About page' }))
      ]);
      trackDirty(form);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var content = { eyebrow: eyebrow.value, title: title.value, intro: intro.value, sections: sections.getValue(), image_ids: images.getValue(), supply_heading: supply.value, cta_heading: ctaH.value, cta_text: ctaT.value };
        save(saveBtn, form, function () { return api('PUT', 'content/pages/about', { content: content }); }, 'About page saved.').catch(function () {});
      });
      return [pageHead('About Us', 'Edit the About page. The short About block on the homepage is under Homepage.'), form];
    });
  };

  /* ======================================================================
     Testimonials
     ====================================================================== */

  routes.testimonials = function () {
    return api('GET', 'testimonials').then(function (items) {
      var list = h('ul', { class: 'sortable' });
      function draw() {
        list.textContent = '';
        if (!items.length) list.appendChild(h('li', { class: 'empty', text: 'No testimonials yet. The homepage shows an invitation for customers to leave a review on WhatsApp.' }));
        items.forEach(function (t, i) {
          var pub = h('input', { type: 'checkbox', checked: t.is_published, 'aria-label': 'Published' });
          pub.addEventListener('change', function () {
            api('PUT', 'testimonials/' + t.id, { customer_name: t.customer_name, quote: t.quote, context: t.context, image_id: t.image_id, is_published: pub.checked })
              .then(function (u) { items[i] = u; toast(u.is_published ? 'Review published.' : 'Review hidden.'); })
              .catch(function (e) { pub.checked = !pub.checked; showError(e); });
          });
          list.appendChild(h('li', {},
            h('div', { class: 'order-btns' },
              h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Move up', text: '↑', disabled: i === 0, onclick: function () { reorder(i, -1); } }),
              h('button', { type: 'button', class: 'btn btn--ghost btn--sm btn--icon', 'aria-label': 'Move down', text: '↓', disabled: i === items.length - 1, onclick: function () { reorder(i, 1); } })),
            t.image ? h('img', { class: 'thumb', src: t.image.url, alt: '' }) : null,
            h('div', { class: 'grow' }, h('p', {}, h('strong', { text: t.customer_name }), t.context ? h('span', { class: 'muted', text: ' · ' + t.context }) : null), h('p', { class: 'muted small', text: '“' + t.quote + '”' })),
            h('label', { class: 'check' }, pub, h('span', { text: 'Published' })),
            h('div', { class: 'btn-row' },
              h('button', { type: 'button', class: 'btn btn--sm', text: 'Edit', onclick: function () { testimonialModal(t).then(reload); } }),
              h('button', { type: 'button', class: 'btn btn--danger btn--sm', text: 'Delete', onclick: function () {
                confirmDialog('Delete this review?', 'The review from ' + t.customer_name + ' will be removed permanently.', 'Delete review', true).then(function (ok) {
                  if (ok) api('DELETE', 'testimonials/' + t.id).then(function () { toast('Review deleted.'); reload(true); }).catch(showError);
                });
              } }))));
        });
      }
      function reload(changed) { if (changed) api('GET', 'testimonials').then(function (x) { items = x; draw(); }).catch(showError); }
      function reorder(i, d) {
        var arr = items.slice(); var x = arr.splice(i, 1)[0]; arr.splice(i + d, 0, x);
        api('POST', 'testimonials/reorder', { ids: arr.map(function (t) { return t.id; }) }).then(function (res) { items = res; draw(); toast('Order saved.'); }).catch(showError);
      }
      draw();
      return [
        pageHead('Testimonials', 'Customer reviews shown on the homepage. Only published reviews are visible.', [h('button', { type: 'button', class: 'btn btn--primary', text: '+ Add review', onclick: function () { testimonialModal(null).then(reload); } })]),
        h('p', { class: 'alert alert--warn', text: 'Only add reviews that real customers gave you, in their words, with their permission to show their name and photo.' }),
        list
      ];
    });
  };

  function testimonialModal(t) {
    var isNew = !t;
    t = t || { customer_name: '', quote: '', context: '', image: null, is_published: true };
    return new Promise(function (resolve) {
      var form = h('form', { novalidate: true });
      var name = textInput(t.customer_name, { maxlength: 100 });
      var quote = textArea(t.quote, { maxlength: 1000, rows: 4 });
      var context = textInput(t.context, { maxlength: 150, placeholder: 'e.g. Builder, Masaka' });
      var image = imageField('image_id', 'Customer photo (optional)', t.image, null, true);
      var pub = checkbox('is_published', 'Published on the website', t.is_published);
      append(form, [field('customer_name', 'Customer name', name, 'How the customer agreed to be named, e.g. Mr Zakari.'), field('quote', 'What they said', quote), field('context', 'Details (optional)', context), image.node, pub.node]);
      var saveBtn = h('button', { type: 'button', class: 'btn btn--primary', text: isNew ? 'Add review' : 'Save' });
      var md = openModal(isNew ? 'Add review' : 'Edit review', [form], [h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: function () { md.close(); resolve(false); } }), saveBtn]);
      saveBtn.addEventListener('click', function () {
        var body = { customer_name: name.value, quote: quote.value, context: context.value, image_id: image.getValue(), is_published: pub.input.checked };
        save(saveBtn, form, function () { return isNew ? api('POST', 'testimonials', body) : api('PUT', 'testimonials/' + t.id, body); }, 'Review saved.')
          .then(function () { md.close(); resolve(true); }).catch(function () {});
      });
      md.dialog.addEventListener('close', function () { resolve(false); });
    });
  }

  /* ======================================================================
     Media Library
     ====================================================================== */

  routes.media = function () {
    var grid = h('div', { class: 'media-grid' });
    var pager = h('div', { class: 'pager' });
    var search = h('input', { type: 'search', placeholder: 'Search images', 'aria-label': 'Search images' });
    var q = '';
    var page = 1;
    function load() {
      api('GET', 'media', undefined, { q: q, page: page, per_page: 24 }).then(function (res) {
        grid.textContent = '';
        pager.textContent = '';
        if (!res.items.length) grid.appendChild(h('p', { class: 'empty', text: q ? 'No images match.' : 'No images yet.' }));
        res.items.forEach(function (item) {
          grid.appendChild(h('button', { type: 'button', class: 'media-tile', onclick: function () { mediaDetail(item.id).then(function (changed) { if (changed) load(); }); } },
            h('img', { src: item.url, alt: '', loading: 'lazy' }), h('span', { text: item.title })));
        });
        pager.appendChild(h('span', { class: 'muted small', text: res.total + ' image' + (res.total === 1 ? '' : 's') }));
        if (res.pages > 1) {
          pager.appendChild(h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn btn--sm', text: '← Previous', disabled: res.page <= 1, onclick: function () { page -= 1; load(); } }),
            h('button', { type: 'button', class: 'btn btn--sm', text: 'Next →', disabled: res.page >= res.pages, onclick: function () { page += 1; load(); } })));
        }
      }).catch(showError);
    }
    var timer;
    search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { q = search.value.trim(); page = 1; load(); }, 250); });

    var drop = h('div', { class: 'dropzone' }, h('p', { text: 'Drag images here, or' }), fileButton('Choose images to upload', true, function (files) { uploadFiles(files).then(function () { page = 1; load(); }); }, 'btn btn--accent'),
      h('p', { class: 'small', text: 'JPG, JPEG, PNG or WebP, up to 5 MB each. Images are stored on your web server.' }));
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); uploadFiles(e.dataTransfer.files).then(function () { page = 1; load(); }); });

    load();
    return [pageHead('Media Library', 'All images used on the website. Click an image to see where it is used, rename, replace or delete it.'), drop, h('div', { class: 'field' }, search), grid, pager];
  };

  function mediaDetail(id) {
    return api('GET', 'media/' + id).then(function (item) {
      return new Promise(function (resolve) {
        var changed = false;
        var form = h('form', { novalidate: true });
        var title = textInput(item.title, { maxlength: 150 });
        var alt = textInput(item.alt, { maxlength: 255 });
        var img = h('img', { src: item.url, alt: item.alt || '' });
        var meta = h('dl', { class: 'meta-list' });
        function drawMeta(x) {
          meta.textContent = '';
          [['File', x.path], ['Type', x.mime.replace('image/', '').toUpperCase()], ['Size', formatBytes(x.size)], ['Dimensions', x.width && x.height ? x.width + ' × ' + x.height + ' px' : '—'], ['Uploaded', formatWhen(x.created_at)], ['Updated', formatWhen(x.updated_at)]]
            .forEach(function (row) { meta.appendChild(h('dt', { text: row[0] })); meta.appendChild(h('dd', { text: row[1] })); });
        }
        drawMeta(item);
        var used = h('div', {}, h('h3', { text: 'Used in' }), item.used_in.length ? h('ul', {}, item.used_in.map(function (u) { return h('li', { text: u }); })) : h('p', { class: 'muted', text: 'Not used anywhere yet.' }));
        var saveBtn = h('button', { type: 'button', class: 'btn btn--primary', text: 'Save name' });
        var replace = fileButton('Replace image', false, function (files) {
          var problem = checkFile(files[0]);
          if (problem) { toast(problem, 'error'); return; }
          var fd = new FormData();
          fd.append('file', files[0]);
          api('POST', 'media/' + item.id + '/replace', fd).then(function (u) {
            item = Object.assign(item, u); img.src = u.url; drawMeta(u); changed = true;
            toast('Image replaced everywhere it is used.');
          }).catch(showError);
        });
        var del = h('button', { type: 'button', class: 'btn btn--danger', text: 'Delete image' });
        append(form, [field('title', 'Name', title, 'Helps you find the image later.'), field('alt', 'Description', alt, 'Describes the image for visually impaired visitors and search engines.')]);
        var md = openModal('Image details', [h('div', { class: 'media-detail' }, h('div', {}, h('div', { class: 'media-detail__img' }, img)), h('div', {}, meta, form, used))],
          [del, replace, h('button', { type: 'button', class: 'btn', text: 'Close', onclick: function () { md.close(); } }), saveBtn], { wide: true });
        saveBtn.addEventListener('click', function () {
          save(saveBtn, form, function () { return api('PUT', 'media/' + item.id, { title: title.value, alt: alt.value }); }, 'Image details saved.').then(function () { changed = true; }).catch(function () {});
        });
        del.addEventListener('click', function () {
          var warn = item.used_in.length
            ? [h('p', { text: 'This image is used in:' }), h('ul', {}, item.used_in.map(function (u) { return h('li', { text: u }); })), h('p', { text: 'Those places will show no image (or the default) until you choose another. This cannot be undone.' })]
            : 'The image will be removed from the server. This cannot be undone.';
          confirmDialog('Delete "' + item.title + '"?', warn, 'Delete image', true).then(function (ok) {
            if (!ok) return;
            api('DELETE', 'media/' + item.id, undefined, item.used_in.length ? { force: '1' } : undefined).then(function () {
              toast('Image deleted.'); changed = true; md.close();
            }).catch(showError);
          });
        });
        md.dialog.addEventListener('close', function () { resolve(changed); });
      });
    });
  }

  /* ======================================================================
     Settings pages: contact, branding, general
     ====================================================================== */

  function settingsForm(group, buildFields, successMsg) {
    return loadSettings().then(function (res) {
      var s = res.settings;
      var media = res.media;
      var form = h('form', { novalidate: true });
      var built = buildFields(s, media);
      var saveBtn = h('button', { type: 'submit', class: 'btn btn--primary', text: 'Save changes' });
      append(form, [built.nodes, h('div', { class: 'form-actions' }, saveBtn)]);
      trackDirty(form);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        save(saveBtn, form, function () { return api('PUT', 'settings/' + group, built.getValue()); }, successMsg)
          .then(function (r) { state.settings = r.settings; if (built.after) built.after(r.settings); }).catch(function () {});
      });
      return form;
    });
  }

  routes.contact = function () {
    var detailsForm = settingsForm('contact', function (s) {
      var wa = textInput(s.whatsapp_display || s.whatsapp_number, { inputmode: 'tel', maxlength: 30 });
      var phone = textInput(s.phone, { inputmode: 'tel', maxlength: 30 });
      var email = h('input', { type: 'email', value: s.email || '', maxlength: 150 });
      var address = textArea(s.address, { maxlength: 300, rows: 2 });
      var hours = textInput(s.opening_hours, { maxlength: 200, placeholder: 'e.g. Mon to Sat, 8am to 6pm' });
      var mapUrl = textInput(s.map_url, { maxlength: 1000, inputmode: 'url' });
      var mapEmbed = textInput(s.map_embed_url, { maxlength: 1000, inputmode: 'url' });
      var mapLabel = textInput(s.map_label, { maxlength: 80 });
      var socials = ['facebook', 'instagram', 'tiktok', 'x', 'youtube'].map(function (k) {
        return { key: 'social_' + k, input: textInput(s['social_' + k], { inputmode: 'url', maxlength: 300, placeholder: 'https://' }), label: { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', x: 'X (Twitter)', youtube: 'YouTube' }[k] };
      });
      return {
        nodes: [
          h('section', { class: 'panel' }, h('h2', { text: 'WhatsApp and contact details' }),
            field('whatsapp_number', 'WhatsApp number', wa, 'International format, e.g. +234 802 469 4963. Every WhatsApp button and the cart checkout use this number.'),
            h('div', { class: 'grid-2' }, field('phone', 'Phone number (optional)', phone), field('email', 'Business email (optional)', email)),
            field('address', 'Physical address', address), field('opening_hours', 'Opening hours (optional)', hours)),
          h('section', { class: 'panel' }, h('h2', { text: 'Map' }),
            field('map_url', 'Google Maps link', mapUrl, 'Open your business on Google Maps, tap Share, and paste the link.'),
            field('map_embed_url', 'Map embed address (optional)', mapEmbed, 'Shows a map on the Contact page. Leave empty to hide it.'),
            field('map_label', 'Map link text', mapLabel)),
          h('section', { class: 'panel' }, h('h2', { text: 'Social media links' }), h('p', { class: 'muted small', text: 'Leave empty to hide. Links appear in the website footer and on the Contact page.' }),
            h('div', { class: 'grid-2' }, socials.map(function (x) { return field(x.key, x.label, x.input); })))
        ],
        getValue: function () {
          var v = { whatsapp_number: wa.value, whatsapp_display: wa.value, phone: phone.value, email: email.value, address: address.value, opening_hours: hours.value, map_url: mapUrl.value, map_embed_url: mapEmbed.value, map_label: mapLabel.value };
          socials.forEach(function (x) { v[x.key] = x.input.value; });
          return v;
        }
      };
    }, 'Contact details saved. All WhatsApp links on the website now use these details.');

    var pageForm = api('GET', 'content/pages/contact').then(function (res) {
      var c = res.content;
      var form = h('form', { novalidate: true });
      var eyebrow = textInput(c.eyebrow, { maxlength: 60 });
      var title = textInput(c.title, { maxlength: 150 });
      var intro = textArea(c.intro, { maxlength: 400, rows: 2 });
      var note = textInput(c.card_note, { maxlength: 200 });
      var fh = textInput(c.form_heading, { maxlength: 150 });
      var fi = textArea(c.form_intro, { maxlength: 400, rows: 2 });
      var saveBtn = h('button', { type: 'submit', class: 'btn btn--primary', text: 'Save Contact page text' });
      append(form, h('section', { class: 'panel' }, h('h2', { text: 'Contact page headings and text' }),
        h('div', { class: 'grid-2' }, field('eyebrow', 'Small label', eyebrow), field('title', 'Page title', title)),
        field('intro', 'Introduction', intro), field('card_note', 'Note under the WhatsApp button', note),
        h('div', { class: 'grid-2' }, field('form_heading', 'Enquiry form heading', fh), field('form_intro', 'Enquiry form description', fi)),
        h('div', { class: 'btn-row' }, saveBtn)));
      trackDirty(form);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        save(saveBtn, form, function () {
          return api('PUT', 'content/pages/contact', { content: { eyebrow: eyebrow.value, title: title.value, intro: intro.value, card_note: note.value, form_heading: fh.value, form_intro: fi.value } });
        }, 'Contact page saved.').catch(function () {});
      });
      return form;
    });

    return Promise.all([detailsForm, pageForm]).then(function (forms) {
      return [pageHead('Contact Details', 'Business contact information used across the website, including the cart checkout.'), forms[0], forms[1]];
    });
  };

  routes.branding = function () {
    return settingsForm('branding', function (s, media) {
      var logo = imageField('logo_id', 'Logo', m(media, s.logo_id), 'Replaces the logo mark in the header and footer on every page. A square PNG or WebP with a transparent background works best. Leave empty to use the built-in mark.');
      var favicon = imageField('favicon_id', 'Favicon (browser tab icon)', m(media, s.favicon_id), 'A square image, at least 64 × 64 pixels.', true);
      var siteName = textInput(s.site_name, { maxlength: 100 });
      var l1 = textInput(s.brand_line1, { maxlength: 40 });
      var l2 = textInput(s.brand_line2, { maxlength: 40 });
      var tagline = textInput(s.tagline, { maxlength: 160 });
      var footer = textInput(s.footer_tagline, { maxlength: 200 });
      function colorField(key, label, value) {
        var picker = h('input', { type: 'color', value: value, 'aria-label': label + ' picker' });
        var text = textInput(value, { maxlength: 7 });
        picker.addEventListener('input', function () { text.value = picker.value.toUpperCase(); });
        text.addEventListener('input', function () { if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value; });
        var f = field(key, label, text);
        f.insertBefore(h('div', { class: 'color-row' }, picker, text), f.querySelector('.field__error'));
        return { node: f, input: text, picker: picker, def: value };
      }
      var colors = [
        colorField('color_primary', 'Forest green (main)', s.color_primary || '#1B4332'),
        colorField('color_primary_deep', 'Deep green (header, footer)', s.color_primary_deep || '#143326'),
        colorField('color_cream', 'Cream (backgrounds)', s.color_cream || '#F5F0E6'),
        colorField('color_accent', 'Timber brown (accent)', s.color_accent || '#8B5E3C')
      ];
      var resetColors = h('button', { type: 'button', class: 'btn btn--sm', text: 'Reset to original colours', onclick: function () {
        ['#1B4332', '#143326', '#F5F0E6', '#8B5E3C'].forEach(function (v, i) { colors[i].input.value = v; colors[i].picker.value = v; });
        state.dirty = true;
      } });
      return {
        nodes: [
          h('section', { class: 'panel' }, h('h2', { text: 'Logo and icon' }), logo.node, favicon.node),
          h('section', { class: 'panel' }, h('h2', { text: 'Business name' }),
            field('site_name', 'Business name', siteName, 'Used in page titles, WhatsApp messages and the footer.'),
            h('div', { class: 'grid-2' }, field('brand_line1', 'Logo text, first line', l1), field('brand_line2', 'Logo text, second line', l2)),
            field('tagline', 'Tagline', tagline), field('footer_tagline', 'Footer text under the logo', footer)),
          h('section', { class: 'panel' }, h('h2', { text: 'Brand colours' }), h('p', { class: 'muted small', text: 'Choose colours with enough contrast against white text. The website uses these on buttons, headings, the header and the footer.' }),
            h('div', { class: 'grid-2' }, colors.map(function (c) { return c.node; })), resetColors)
        ],
        getValue: function () {
          return { site_name: siteName.value, brand_line1: l1.value, brand_line2: l2.value, tagline: tagline.value, footer_tagline: footer.value, logo_id: logo.getValue(), favicon_id: favicon.getValue(),
            color_primary: colors[0].input.value, color_primary_deep: colors[1].input.value, color_cream: colors[2].input.value, color_accent: colors[3].input.value };
        }
      };
    }, 'Branding saved. The logo and colours are updated on every page.').then(function (form) {
      return [pageHead('Branding', 'Logo, favicon, business name and brand colours.'), form];
    });
  };

  routes.settings = function () {
    var general = settingsForm('general', function (s, media) {
      var mode = s.price_mode === 'show' ? 'show' : 'contact';
      function radio(value, title, text) {
        return h('label', { class: 'radio-card' }, h('input', { type: 'radio', name: 'price_mode', value: value, checked: mode === value }), h('span', {}, h('strong', { text: title }), h('br'), h('span', { class: 'muted small', text: text })));
      }
      var modeBox = h('div', { class: 'radio-cards', 'data-field': 'price_mode', role: 'radiogroup', 'aria-label': 'Price display' },
        radio('contact', 'Contact for price', 'No prices on the website. Customers send their list on WhatsApp and you reply with prices.'),
        radio('show', 'Show prices in naira', 'Product cards and the cart show ₦ prices from each product. The WhatsApp order includes prices and asks you to confirm.'));
      var note = textArea(s.price_note, { maxlength: 300, rows: 2 });
      var desc = textArea(s.site_description, { maxlength: 300, rows: 2 });
      var seoTitle = textInput(s.seo_title, { maxlength: 70 });
      var seoDesc = textArea(s.seo_description, { maxlength: 170, rows: 2 });
      var og = imageField('og_image_id', 'Image shown when the site is shared (optional)', m(media, s.og_image_id), null, true);
      var footerText = textInput(s.footer_text, { maxlength: 200 });
      var copyright = textInput(s.copyright_text, { maxlength: 120 });
      var currency = select([{ value: 'NGN', label: 'Nigerian naira (₦, NGN)' }], s.currency || 'NGN');
      return {
        nodes: [
          h('section', { class: 'panel' }, h('h2', { text: 'Price display' }), modeBox,
            field('price_note', 'Note shown above products', note, 'e.g. explain that prices and availability are confirmed on WhatsApp.'),
            field('currency', 'Currency', currency)),
          h('section', { class: 'panel' }, h('h2', { text: 'Search engines (SEO)' }),
            field('seo_title', 'SEO title', seoTitle, 'Shown in Google results and the browser tab. Up to 70 characters.'),
            field('seo_description', 'SEO description', seoDesc, 'One or two sentences, up to 170 characters.'),
            field('site_description', 'Website description', desc), og.node),
          h('section', { class: 'panel' }, h('h2', { text: 'Footer' }),
            h('div', { class: 'grid-2' }, field('footer_text', 'Footer note', footerText), field('copyright_text', 'Copyright name', copyright, 'Shown as © ' + new Date().getFullYear() + ' <name>.')))
        ],
        getValue: function () {
          var sel = modeBox.querySelector('input:checked');
          return { price_mode: sel ? sel.value : 'contact', price_note: note.value, currency: currency.value, site_description: desc.value, seo_title: seoTitle.value, seo_description: seoDesc.value, og_image_id: og.getValue(), footer_text: footerText.value, copyright_text: copyright.value };
        }
      };
    }, 'Website settings saved.');

    var sections = api('GET', 'content/home').then(function (res) {
      var panel = h('section', { class: 'panel' }, h('h2', { text: 'Homepage sections' }), h('p', { class: 'muted small', text: 'Switch sections on or off. Changes apply immediately.' }));
      Object.keys(SECTION_LABELS).forEach(function (key) {
        var sec = res.sections[key];
        if (!sec) return;
        var cb = checkbox('section_' + key, SECTION_LABELS[key], sec.enabled);
        cb.input.addEventListener('change', function () {
          api('PUT', 'content/home/' + key, { enabled: cb.input.checked, content: sec.content })
            .then(function () { sec.enabled = cb.input.checked; toast(SECTION_LABELS[key] + (cb.input.checked ? ' shown.' : ' hidden.')); })
            .catch(function (e) { cb.input.checked = !cb.input.checked; showError(e); });
        });
        panel.appendChild(cb.node);
      });
      return panel;
    });

    return Promise.all([general, sections]).then(function (r) {
      return [pageHead('Website Settings', 'Price display, search engine details, footer and which homepage sections are shown.'), r[0], r[1]];
    });
  };

  /* ======================================================================
     Password
     ====================================================================== */

  routes.password = function () {
    var forced = state.admin && state.admin.must_change_password;
    var form = h('form', { novalidate: true, class: 'panel' });
    function pw(key, label, ac, hint) {
      var input = h('input', { type: 'password', autocomplete: ac, maxlength: 200 });
      var toggle = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Show', 'aria-pressed': 'false', onclick: function () {
        var show = input.type === 'password'; input.type = show ? 'text' : 'password'; toggle.textContent = show ? 'Hide' : 'Show'; toggle.setAttribute('aria-pressed', String(show));
      } });
      var f = field(key, label, input, hint);
      var wrap = h('div', { class: 'password-wrap' });
      f.insertBefore(wrap, input);
      wrap.appendChild(input); wrap.appendChild(toggle);
      return { node: f, input: input };
    }
    var cur = pw('current_password', 'Current password', 'current-password');
    var nw = pw('new_password', 'New password', 'new-password', 'At least 10 characters. A short sentence you can remember works well.');
    var cf = pw('confirm_password', 'Repeat new password', 'new-password');
    var saveBtn = h('button', { type: 'submit', class: 'btn btn--primary', text: 'Change password' });
    append(form, [cur.node, nw.node, cf.node, h('div', { class: 'btn-row' }, saveBtn)]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      save(saveBtn, form, function () {
        return api('POST', 'auth/password', { current_password: cur.input.value, new_password: nw.input.value, confirm_password: cf.input.value });
      }, 'Password changed.').then(function (res) {
        state.csrf = res.csrf;
        cur.input.value = nw.input.value = cf.input.value = '';
        if (state.admin) state.admin.must_change_password = false;
        document.body.classList.remove('is-forced');
        if (forced) location.hash = '#/overview';
      }).catch(function () {});
    });
    return [
      pageHead('Change Password', forced ? null : 'Use a password that you do not use anywhere else.'),
      forced ? h('div', { class: 'alert alert--warn' }, h('strong', { text: 'Please choose a new password before continuing. ' }), 'You are using the initial password (Admin). Until you change it, nothing on the website can be edited.') : null,
      form
    ];
  };

  /* ======================================================================
     Start-up
     ====================================================================== */

  function initLogin() {
    var form = document.getElementById('login-form');
    if (!form) return;
    var errorBox = document.getElementById('login-error');
    var btn = form.querySelector('button[type=submit]');
    document.querySelectorAll('[data-toggle-password]').forEach(function (t) {
      t.addEventListener('click', function () {
        var input = document.getElementById(t.getAttribute('data-toggle-password'));
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        t.textContent = show ? 'Hide' : 'Show';
        t.setAttribute('aria-pressed', String(show));
      });
    });
    refreshSession().catch(function () {});
    document.getElementById('login-username').focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.hidden = true;
      var username = form.username.value.trim();
      var password = form.password.value;
      if (!username || !password) { errorBox.textContent = 'Enter your username and password.'; errorBox.hidden = false; return; }
      busy(btn, true, 'Logging in…');
      (state.csrf ? Promise.resolve() : refreshSession()).then(function () {
        return api('POST', 'auth/login', { username: username, password: password });
      }).then(function () {
        // The server renders the dashboard only now that the session exists.
        location.reload();
      }).catch(function (err) {
        busy(btn, false);
        errorBox.textContent = err.message || 'Login failed.';
        errorBox.hidden = false;
        form.password.value = '';
        form.password.focus();
      });
    });
  }

  function initApp() {
    main = document.getElementById('main');
    var menuBtn = document.querySelector('.topbar__menu');
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.querySelector('.sidebar-backdrop');
    menuBtn.addEventListener('click', function () {
      var open = !sidebar.classList.contains('is-open');
      sidebar.classList.toggle('is-open', open);
      backdrop.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    backdrop.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSidebar(); });
    document.querySelector('[data-action="logout"]').addEventListener('click', function () {
      var go = function () {
        api('POST', 'auth/logout').catch(function () {}).then(function () { state.dirty = false; location.replace(location.pathname); });
      };
      if (state.dirty) confirmDialog('Log out without saving?', 'You have unsaved changes on this page.', 'Log out', true).then(function (ok) { if (ok) go(); });
      else go();
    });
    refreshSession().then(function (me) {
      if (!me.authenticated) { location.reload(); return; }
      router();
    }).catch(function (err) {
      main.textContent = '';
      main.appendChild(h('div', { class: 'alert alert--error', text: err.message }));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (document.body.getAttribute('data-view') === 'app') initApp();
    else initLogin();
  });
})();
