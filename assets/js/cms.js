/*
 * Fills the page with content managed in the admin dashboard.
 *
 * The HTML keeps the original text as a fallback; elements marked with
 * data-cms="path.to.value" (and the related data-cms-* attributes) are
 * replaced with the values loaded by site-data.js. Nothing changes when the
 * backend is not available (MJT.site.source === 'builtin').
 *
 * All text is set with textContent; links and image URLs are checked.
 */
window.MJT = window.MJT || {};

(function (MJT) {
  'use strict';

  var utils = MJT.utils;
  var el = utils.el;

  var ICONS = {
    timber: ['rect:6,14,36,8', 'rect:6,26,36,8', 'path:M12 18h10M18 30h14'],
    check: ['circle:24,24,17', 'path:m16 24 6 6 11-12'],
    phone: ['rect:12,5,24,38', 'path:M20 37h8M18 14h12M18 21h12M18 28h7'],
    home: ['path:M6 22 24 8l18 14', 'path:M11 20v20h26V20', 'path:M20 40V29h8v11'],
    truck: ['path:M4 12h24v20H4z', 'path:M28 20h9l7 7v5H28z', 'circle:12,36,4', 'circle:36,36,4'],
    star: ['path:M24 6l5.5 11.2 12.3 1.8-8.9 8.7 2.1 12.3L24 34.2 13 40l2.1-12.3-8.9-8.7 12.3-1.8z'],
    tools: ['path:M30 8a8 8 0 0 0-7.6 10.4L8 32.8 15.2 40l14.4-14.4A8 8 0 0 0 40 18l-5 5-6-2-2-6 5-5z'],
    clock: ['circle:24,24,17', 'path:M24 14v10l7 5']
  };

  function icon(name) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'feature__icon');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('aria-hidden', 'true');
    (ICONS[name] || ICONS.check).forEach(function (spec) {
      var parts = spec.split(':');
      var node = document.createElementNS(ns, parts[0]);
      var n = parts[1].split(',');
      if (parts[0] === 'rect') { node.setAttribute('x', n[0]); node.setAttribute('y', n[1]); node.setAttribute('width', n[2]); node.setAttribute('height', n[3]); node.setAttribute('rx', '2'); }
      else if (parts[0] === 'circle') { node.setAttribute('cx', n[0]); node.setAttribute('cy', n[1]); node.setAttribute('r', n[2]); }
      else node.setAttribute('d', parts[1]);
      svg.appendChild(node);
    });
    return svg;
  }

  function get(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  // Same rule as the server: relative pages, http(s), mailto: and tel: only.
  function safeLink(href) {
    if (typeof href !== 'string' || !href.trim()) return null;
    var h = href.trim();
    if (/^(https?:\/\/|mailto:|tel:)/i.test(h)) return h;
    if (/^[a-z][a-z0-9+.-]*:/i.test(h) || h.indexOf('//') === 0) return null;
    return h;
  }

  function isExternal(href) { return /^https?:\/\//i.test(href); }

  /* ---------- Site-wide: SEO, favicon, colours, logo, footer ---------- */

  function applySettings(s) {
    var page = document.body.getAttribute('data-page');
    if (s.siteName) {
      if (page === 'home' && s.seoTitle) document.title = s.seoTitle;
      else document.title = document.title.replace(/Musa Joshua Timbershade/g, s.siteName);
    }
    if (page === 'home' && s.seoDescription) {
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', s.seoDescription);
    }
    if (s.ogImage) {
      var og = document.querySelector('meta[property="og:image"]') || document.head.appendChild(el('meta', { property: 'og:image' }));
      og.setAttribute('content', new URL(s.ogImage, window.location.href).href);
    }
    if (s.favicon) {
      var link = document.querySelector('link[rel="icon"]');
      if (link) { link.setAttribute('href', s.favicon); link.removeAttribute('type'); }
    }

    var colors = s.colors || {};
    var root = document.documentElement.style;
    var map = { primary: '--forest', primaryDeep: '--forest-deep', cream: '--cream', accent: '--timber' };
    Object.keys(map).forEach(function (k) {
      if (/^#[0-9a-f]{6}$/i.test(colors[k] || '')) root.setProperty(map[k], colors[k]);
    });
    if (/^#[0-9a-f]{6}$/i.test(colors.primary || '')) {
      var theme = document.querySelector('meta[name="theme-color"]');
      if (theme) theme.setAttribute('content', colors.primary);
    }

    document.querySelectorAll('.brand').forEach(function (brand) {
      brand.setAttribute('aria-label', (s.siteName || 'Home') + ' home');
      var name = brand.querySelector('.brand__name');
      var sub = brand.querySelector('.brand__sub');
      if (name && s.brandLine1) name.textContent = s.brandLine1;
      if (sub) { sub.textContent = s.brandLine2 || ''; sub.hidden = !s.brandLine2; }
      if (s.logo) {
        var mark = brand.querySelector('.brand__mark');
        if (mark) mark.replaceWith(el('img', { className: 'brand__mark brand__logo', src: utils.safeImageUrl(s.logo), alt: '', width: '42', height: '42' }));
      }
    });

    // Extra contact details and social links in the footer.
    var footer = document.querySelector('.footer-contact');
    if (footer && !footer.querySelector('[data-cms-extra]')) {
      var extra = el('div', { 'data-cms-extra': '' });
      if (s.phone) extra.appendChild(el('p', {}, ['Phone: ', el('a', { href: 'tel:' + s.phone.replace(/[^\d+]/g, ''), text: s.phone })]));
      if (s.email) extra.appendChild(el('p', {}, ['Email: ', el('a', { href: 'mailto:' + s.email, text: s.email })]));
      if (s.openingHours) extra.appendChild(el('p', { text: s.openingHours }));
      var social = socialList(s.socials);
      if (social) extra.appendChild(social);
      footer.appendChild(extra);
    }
  }

  function socialList(socials) {
    var labels = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', x: 'X (Twitter)', youtube: 'YouTube' };
    var keys = Object.keys(socials || {}).filter(function (k) { return labels[k] && /^https?:\/\//i.test(socials[k]); });
    if (!keys.length) return null;
    return el('ul', { className: 'social-links' }, keys.map(function (k) {
      return el('li', {}, [el('a', { href: socials[k], target: '_blank', rel: 'noopener', text: labels[k] })]);
    }));
  }

  /* ---------- Generic bindings ---------- */

  function applyBindings(data) {
    var scope = { settings: data.settings, home: data.home, pages: data.pages };

    document.querySelectorAll('[data-cms]').forEach(function (node) {
      var value = get(scope, node.getAttribute('data-cms'));
      if (value === undefined) return;
      node.textContent = value == null ? '' : String(value);
      // Optional text hides itself when empty.
      if (node.classList.contains('section-lead') || node.hasAttribute('hidden')) node.hidden = !value;
      if (value === '' && node.closest('[data-cms-wa-button]')) node.closest('[data-cms-wa-button]').hidden = true;
    });

    document.querySelectorAll('[data-cms-link]').forEach(function (a) {
      var base = a.getAttribute('data-cms-link');
      var text = get(scope, base + '_text');
      var href = safeLink(get(scope, base + '_url'));
      if (text === undefined) return;
      a.textContent = text || '';
      a.hidden = !text;
      if (href) {
        a.setAttribute('href', href);
        if (isExternal(href)) { a.target = '_blank'; a.rel = 'noopener'; }
      }
    });

    document.querySelectorAll('[data-cms-img]').forEach(function (img) {
      var base = get(scope, img.getAttribute('data-cms-img'));
      if (!base) return;
      if (base.image) img.src = utils.safeImageUrl(base.image);
      if (typeof base.image_alt === 'string') img.alt = base.image_alt;
      var media = img.closest('.hero-media, .split__media');
      if (media) media.hidden = !base.image;
    });

    document.querySelectorAll('[data-cms-list]').forEach(function (list) {
      var items = get(scope, list.getAttribute('data-cms-list'));
      if (!Array.isArray(items)) return;
      list.textContent = '';
      items.forEach(function (t) { list.appendChild(el('li', { text: t })); });
      list.hidden = !items.length;
    });

    document.querySelectorAll('[data-cms-paragraphs]').forEach(function (box) {
      var items = get(scope, box.getAttribute('data-cms-paragraphs'));
      if (!Array.isArray(items)) return;
      box.textContent = '';
      items.forEach(function (t) { box.appendChild(el('p', { text: t })); });
    });

    document.querySelectorAll('[data-price-note]').forEach(function (n) {
      var note = data.settings.priceNote;
      n.textContent = '';
      if (!note) { n.hidden = true; return; }
      n.appendChild(el('strong', { text: 'Prices: ' }));
      n.appendChild(document.createTextNode(note));
    });
  }

  /* ---------- Homepage ---------- */

  function applyHome(home) {
    if (!home) return;
    document.querySelectorAll('[data-section]').forEach(function (section) {
      var cfg = home[section.getAttribute('data-section')];
      if (cfg) section.hidden = !cfg.enabled;
    });

    var why = document.getElementById('why-cards');
    if (why && home.why && Array.isArray(home.why.cards)) {
      why.textContent = '';
      home.why.cards.forEach(function (card) {
        why.appendChild(el('li', { className: 'feature' }, [
          card.image ? el('img', { className: 'feature__img', src: utils.safeImageUrl(card.image), alt: '', width: '64', height: '64', loading: 'lazy' }) : icon(card.icon),
          el('h3', { text: card.title }),
          card.text ? el('p', { text: card.text }) : null
        ]));
      });
    }
  }

  /* ---------- About page ---------- */

  function applyAbout(about) {
    if (!about || !about.title) return;
    var box = document.getElementById('about-sections');
    if (box && Array.isArray(about.sections)) {
      box.textContent = '';
      about.sections.forEach(function (sec) {
        box.appendChild(el('h2', { text: sec.heading }));
        (sec.paragraphs || []).forEach(function (p) { box.appendChild(el('p', { text: p })); });
        if (sec.steps && sec.steps.length) {
          box.appendChild(el('ol', { className: 'steps' }, sec.steps.map(function (step) {
            // "Lead phrase. Rest of the step" -> bold lead phrase, like the original page.
            var m = /^([^.!?]{2,60}[.!?])\s+(.+)$/.exec(step);
            return m ? el('li', {}, [el('strong', { text: m[1] }), ' ' + m[2]]) : el('li', { text: step });
          })));
        }
      });
    }
    var images = document.getElementById('about-images');
    if (images && Array.isArray(about.images)) {
      images.textContent = '';
      about.images.forEach(function (img) {
        images.appendChild(el('img', { src: utils.safeImageUrl(img.src), alt: img.alt || '', width: '400', height: '300', loading: 'lazy' }));
      });
      images.hidden = !about.images.length;
    }
  }

  function applySupplyList() {
    var list = document.getElementById('supply-list');
    if (!list) return;
    list.textContent = '';
    (MJT.categories || []).forEach(function (c) {
      list.appendChild(el('li', {}, [
        el('a', { href: 'products.html?category=' + encodeURIComponent(c.id), text: c.name }),
        el('span', { text: c.description || '' })
      ]));
    });
  }

  /* ---------- Contact page ---------- */

  function applyContactList(s) {
    var list = document.getElementById('contact-list');
    if (!list || list.querySelector('[data-cms-extra]')) return;
    function row(label, content) {
      return el('div', { 'data-cms-extra': '' }, [el('dt', { text: label }), el('dd', {}, [content])]);
    }
    if (s.phone) list.appendChild(row('Phone', el('a', { href: 'tel:' + s.phone.replace(/[^\d+]/g, ''), text: s.phone })));
    if (s.email) list.appendChild(row('Email', el('a', { href: 'mailto:' + s.email, text: s.email })));
    if (s.openingHours) list.appendChild(row('Opening hours', document.createTextNode(s.openingHours)));
    var social = socialList(s.socials);
    if (social) list.appendChild(row('Social media', social));
  }

  /* ---------- Run ---------- */

  MJT.cms = { icon: icon };

  document.addEventListener('DOMContentLoaded', function () {
    if (!MJT.site || !MJT.site.ready) return;
    MJT.site.ready.then(function (data) {
      if (MJT.site.source !== 'api') return;
      applySettings(data.settings || {});
      applyBindings(data);
      applyHome(data.home);
      applyAbout(data.pages && data.pages.about);
      applySupplyList();
      applyContactList(data.settings || {});
    });
  });
})(window.MJT);
