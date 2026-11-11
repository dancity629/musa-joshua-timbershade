/*
 * Built-in product catalogue (fallback only).
 *
 * With the PHP backend installed, products and categories are managed in the
 * admin dashboard and loaded from the API by site-data.js, which replaces
 * MJT.categories and MJT.productsData. This list is only used when the API
 * cannot be reached (for example on the GitHub Pages copy of the site).
 *
 *
 * Prices are not shown on the website: customers send their list on WhatsApp
 * and the business replies with current prices. Descriptions are placeholder
 * text and stock levels are unknown (stock: null). Edit this list to change the
 * catalogue, or point MJT.productSource at the PHP/MySQL API (see README.md).
 *
 * Field reference (keep these names when the data moves to a database):
 *   id          unique, stable string ID (used by the cart; never reuse an ID)
 *   name        display name
 *   category    one of the IDs in MJT.categories
 *   unit        what one unit means: 'piece', 'length', 'bundle', 'kg', 'pack', 'sheet', 'roll', 'tin'
 *   image       path relative to the site root
 *   description short plain-text description
 *   stock       number in stock, or null when unknown
 *   featured    true to show on the home page
 */
window.MJT = window.MJT || {};

MJT.categories = Object.freeze([
  { id: 'roofing-woods', name: 'Roofing Woods', description: 'Rafters and battens for roof framing.', image: 'assets/images/roofing-wood-2x3.svg' },
  { id: 'planks', name: 'Planks', description: 'Fascia boards and planks for roofing, formwork and carpentry.', image: 'assets/images/plank-1x10.svg' },
  { id: 'timber', name: 'Timber', description: 'Heavier sections for joists, lintels and framing.', image: 'assets/images/timber-2x6.svg' },
  { id: 'nails', name: 'Nails', description: 'Wire nails in common sizes.', image: 'assets/images/nails-3in.svg' }
]);

MJT.productsData = Object.freeze([
  // Roofing woods
  { id: 'rw-2x3-12ft', name: '2" x 3" Roofing Wood', category: 'roofing-woods', unit: 'piece', image: 'assets/images/roofing-wood-2x3.svg', description: 'Standard rafter and purlin size for residential roof framing.', stock: null, featured: true },
  { id: 'rw-2x4-12ft', name: '2" x 4" Roofing Wood', category: 'roofing-woods', unit: 'piece', image: 'assets/images/roofing-wood-2x4.svg', description: 'Heavier rafter section for wider spans and hip roofs.', stock: null, featured: true },
  { id: 'rw-batten-2x2', name: '2" x 2" Batten', category: 'roofing-woods', unit: 'piece', image: 'assets/images/batten-2x2.svg', description: 'Batten for fixing roofing sheets and ceiling noggins.', stock: null, featured: false },

  // Planks
  { id: 'rw-fascia-1x10', name: '1" x 10" Fascia Board', category: 'planks', unit: 'piece', image: 'assets/images/fascia-board.svg', description: 'Finishing board for roof edges and eaves.', stock: null, featured: true },
  { id: 'pl-1x10-12ft', name: '1" x 10" Plank', category: 'planks', unit: 'length', image: 'assets/images/plank-1x10.svg', description: 'All-purpose plank for carpentry and concrete formwork.', stock: null, featured: true },
  { id: 'pl-1x6-12ft', name: '1" x 6" Plank', category: 'planks', unit: 'length', image: 'assets/images/plank-1x6.svg', description: 'Narrow plank for edging, bracing and light framing.', stock: null, featured: false },

  // Timber
  { id: 'tb-2x6-12ft', name: '2" x 6" Timber', category: 'timber', unit: 'piece', image: 'assets/images/timber-2x6.svg', description: 'Strong section for joists, lintels and roof members.', stock: null, featured: true },

  // Nails
  { id: 'nl-wire-2in', name: '2" Wire Nails', category: 'nails', unit: 'kg', image: 'assets/images/nails-2in.svg', description: 'Common nails for light carpentry and battens.', stock: null, featured: false },
  { id: 'nl-wire-3in', name: '3" Wire Nails', category: 'nails', unit: 'kg', image: 'assets/images/nails-3in.svg', description: 'General-purpose nails for formwork and framing.', stock: null, featured: true },
  { id: 'nl-wire-4in', name: '4" Wire Nails', category: 'nails', unit: 'kg', image: 'assets/images/nails-4in.svg', description: 'Long nails for heavy timber and roof trusses.', stock: null, featured: false }
]);

/*
 * Product source.
 * Every page gets products through MJT.productSource.getAll(), which returns a
 * Promise. It waits for site-data.js to load the catalogue from the API (or to
 * fall back to the built-in list above).
 */
MJT.productSource = {
  getAll: function () {
    var ready = MJT.site && MJT.site.ready ? MJT.site.ready : Promise.resolve();
    return ready.then(function () { return MJT.productsData.slice(); });
  }
};
