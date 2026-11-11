/*
 * Loads all website content from the PHP backend in one request.
 *
 * MJT.site.ready is a Promise that resolves once content is in place:
 *   - from the API (api/index.php?route=public/site) when the backend is installed;
 *   - otherwise from the built-in files (config.js, products-data.js,
 *     reviews-data.js), so the GitHub Pages copy keeps working unchanged.
 *
 * MJT.site.source tells which one was used: 'api' or 'builtin'.
 * Admin changes appear on the next page load; nothing is cached in the browser.
 */
window.MJT = window.MJT || {};

(function (MJT) {
  'use strict';

  var config = MJT.config;

  // Forward visitors from the old GitHub Pages address once the PHP site is live.
  if (config.siteUrl && /\.github\.io$/i.test(window.location.hostname)) {
    var base = String(config.siteUrl).replace(/\/+$/, '');
    var rest = window.location.pathname.replace(/^\/[^/]+/, ''); // drop the /<repo> prefix
    window.location.replace(base + (rest || '/') + window.location.search + window.location.hash);
  }

  function applyApiData(d) {
    var s = d.settings || {};
    // Mutate the existing config object so every script that captured it sees the new values.
    Object.assign(config, {
      businessName: s.siteName || config.businessName,
      whatsappNumber: s.whatsappNumber || config.whatsappNumber,
      whatsappDisplay: s.whatsappDisplay || (s.whatsappNumber ? '+' + s.whatsappNumber : config.whatsappDisplay),
      address: s.address || '',
      mapUrl: s.mapUrl || null,
      mapEmbedUrl: s.mapEmbedUrl || null,
      locationLabel: s.locationLabel || 'View on Google Maps',
      priceMode: s.priceMode === 'show' ? 'show' : 'contact',
      currency: s.currency || 'NGN'
    });

    MJT.categories = (d.categories || []).map(function (c) {
      return { id: c.id, name: c.name, description: c.description || '', image: c.image };
    });
    MJT.productsData = (d.products || []).map(function (p) {
      return {
        id: p.id, name: p.name, category: p.category, unit: p.unit, image: p.image,
        description: p.description || '', stock: typeof p.stock === 'number' ? p.stock : null,
        featured: !!p.featured, featuredOrder: p.featuredOrder || 0,
        price: typeof p.price === 'number' ? p.price : null,
        size: p.size || '', gallery: p.gallery || [], available: p.available !== false
      };
    });
    MJT.reviews = (d.testimonials || []).map(function (t) {
      return { name: t.name, quote: t.quote, context: t.context, image: t.image };
    });
  }

  function builtinData() {
    // Shape the built-in content like the API response so cms.js has one code path.
    return {
      settings: {
        siteName: config.businessName,
        priceMode: config.priceMode,
        whatsappNumber: config.whatsappNumber,
        whatsappDisplay: config.whatsappDisplay
      },
      home: null,
      pages: null
    };
  }

  function load() {
    if (!window.fetch || !config.apiUrl) return Promise.reject(new Error('no fetch'));
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
    return fetch(config.apiUrl, { headers: { Accept: 'application/json' }, cache: 'no-cache', signal: controller ? controller.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var type = res.headers.get('Content-Type') || '';
        if (type.indexOf('application/json') === -1) throw new Error('Not JSON'); // e.g. a static host returning a page
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.ok || !json.data) throw new Error('Bad response');
        return json.data;
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  MJT.site = { source: 'builtin', data: null };
  MJT.site.ready = load().then(function (data) {
    applyApiData(data);
    MJT.site.source = 'api';
    MJT.site.data = data;
    return data;
  }).catch(function () {
    MJT.site.source = 'builtin';
    MJT.site.data = builtinData();
    return MJT.site.data;
  });
})(window.MJT);
