/*
 * Product listing views: featured products and category tiles on the home
 * page, and the full catalogue with search, category filter and sorting.
 */
window.MJT = window.MJT || {};

(function (MJT) {
  'use strict';

  var utils = MJT.utils;
  var el = utils.el;

  function renderGrid(container, products) {
    container.textContent = '';
    var frag = document.createDocumentFragment();
    products.forEach(function (p) { frag.appendChild(MJT.renderProductCard(p)); });
    container.appendChild(frag);
  }

  function showLoadError(container) {
    container.textContent = '';
    container.appendChild(el('p', { className: 'notice', text: 'Products could not be loaded right now. Please refresh the page, or message us on WhatsApp.' }));
  }

  /* ---------- Home page ---------- */

  function initFeatured(container, products) {
    var featured = products.filter(function (p) { return p.featured; });
    if (!featured.length) featured = products.slice(0, 4);
    renderGrid(container, featured.slice(0, 6));
  }

  function initCategoryGrid(container, products) {
    container.textContent = '';
    MJT.categories.forEach(function (cat) {
      var count = products.filter(function (p) { return p.category === cat.id; }).length;
      container.appendChild(el('li', {}, [
        el('a', { className: 'category-card', href: 'products.html?category=' + encodeURIComponent(cat.id) }, [
          el('img', { src: utils.safeImageUrl(cat.image), alt: '', loading: 'lazy', width: '400', height: '300' }),
          el('span', { className: 'category-card__body' }, [
            el('span', { className: 'category-card__name', text: cat.name }),
            el('span', { className: 'category-card__desc', text: cat.description }),
            el('span', { className: 'category-card__count', text: count + (count === 1 ? ' product' : ' products') + ' →' })
          ])
        ])
      ]));
    });
  }

  /* ---------- Catalogue ---------- */

  var SORTS = {
    featured: function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); },
    name: function (a, b) { return a.name.localeCompare(b.name); }
  };

  // Lower-case and collapse size notation so '2x4', '2 x 4' and '2" x 4"' all match.
  function normalizeSearch(text) {
    return String(text || '').toLowerCase()
      .replace(/["\u201C\u201D\u2033']/g, '')
      .replace(/(\d)\s*[x\u00D7]\s*(\d)/g, '$1x$2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function initCatalogue(root, products) {
    var params = new URLSearchParams(window.location.search);
    var validCategories = MJT.categories.map(function (c) { return c.id; });
    var state = {
      category: validCategories.indexOf(params.get('category')) !== -1 ? params.get('category') : 'all',
      query: (params.get('q') || '').slice(0, 80),
      sort: SORTS[params.get('sort')] ? params.get('sort') : 'featured'
    };

    var searchInput = document.getElementById('product-search');
    var sortSelect = document.getElementById('product-sort');
    var filterBar = document.getElementById('category-filters');
    var grid = document.getElementById('product-grid');
    var status = document.getElementById('results-status');

    searchInput.value = state.query;
    sortSelect.value = state.sort;

    var chips = [{ id: 'all', name: 'All Products' }].concat(MJT.categories).map(function (cat) {
      var btn = el('button', { type: 'button', className: 'chip', 'data-category': cat.id, 'aria-pressed': String(cat.id === state.category), text: cat.name });
      btn.addEventListener('click', function () { state.category = cat.id; update(); });
      filterBar.appendChild(btn);
      return btn;
    });

    function matches(p) {
      if (state.category !== 'all' && p.category !== state.category) return false;
      var q = normalizeSearch(state.query);
      if (!q) return true;
      var haystack = normalizeSearch([p.name, p.description, utils.categoryName(p.category), p.unit].join(' '));
      return q.split(/\s+/).every(function (word) { return haystack.indexOf(word) !== -1; });
    }

    function syncUrl() {
      var next = new URLSearchParams();
      if (state.category !== 'all') next.set('category', state.category);
      if (state.query.trim()) next.set('q', state.query.trim());
      if (state.sort !== 'featured') next.set('sort', state.sort);
      var qs = next.toString();
      try { window.history.replaceState(null, '', qs ? '?' + qs : window.location.pathname); } catch (err) { /* file:// in some browsers */ }
    }

    function update() {
      chips.forEach(function (chip) { chip.setAttribute('aria-pressed', String(chip.getAttribute('data-category') === state.category)); });
      var list = products.filter(matches).sort(SORTS[state.sort]);
      if (list.length) {
        renderGrid(grid, list);
      } else {
        grid.textContent = '';
        grid.appendChild(el('div', { className: 'empty-state empty-state--inline' }, [
          el('h2', { text: 'No products match your search' }),
          el('p', { text: 'Try a different word or category. If you cannot find what you need, ask us on WhatsApp.' }),
          el('button', {
            type: 'button', className: 'btn btn--outline', text: 'Show all products',
            onclick: function () { state.category = 'all'; state.query = ''; searchInput.value = ''; update(); }
          })
        ]));
      }
      var catLabel = state.category === 'all' ? 'all categories' : utils.categoryName(state.category);
      status.textContent = 'Showing ' + list.length + (list.length === 1 ? ' product' : ' products') + ' in ' + catLabel + (state.query.trim() ? ' matching “' + state.query.trim() + '”' : '') + '.';
      syncUrl();
    }

    var debounce = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { state.query = searchInput.value.slice(0, 80); update(); }, 150);
    });
    document.getElementById('product-search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      state.query = searchInput.value.slice(0, 80);
      update();
    });
    sortSelect.addEventListener('change', function () { state.sort = SORTS[sortSelect.value] ? sortSelect.value : 'featured'; update(); });

    update();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var featured = document.getElementById('featured-products');
    var categoryGrid = document.getElementById('category-grid');
    var catalogue = document.getElementById('catalogue');
    if (!featured && !categoryGrid && !catalogue) return;

    MJT.productSource.getAll().then(function (products) {
      if (featured) initFeatured(featured, products);
      if (categoryGrid) initCategoryGrid(categoryGrid, products);
      if (catalogue) initCatalogue(catalogue, products);
    }).catch(function () {
      [featured, document.getElementById('product-grid')].forEach(function (c) { if (c) showLoadError(c); });
    });
  });
})(window.MJT);
