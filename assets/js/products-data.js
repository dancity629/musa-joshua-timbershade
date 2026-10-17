/*
 * Product catalogue data.
 *
 * DEMONSTRATION DATA: every product, price and description below is a sample
 * placeholder. Prices are NOT verified business prices and stock levels are
 * unknown (stock: null). Replace this list with real products before launch,
 * or point MJT.productSource at the PHP/MySQL API (see README.md).
 *
 * Field reference (keep these names when the data moves to a database):
 *   id          unique, stable string ID (used by the cart; never reuse an ID)
 *   name        display name
 *   category    one of the IDs in MJT.categories
 *   price       unit price in naira, as a number (no symbols or commas)
 *   unit        what one unit means: 'piece', 'length', 'bundle', 'kg', 'pack', 'sheet', 'roll', 'tin'
 *   image       path relative to the site root
 *   description short plain-text description
 *   stock       number in stock, or null when unknown
 *   featured    true to show on the home page
 *   isDemo      true while the entry is sample data
 */
window.MJT = window.MJT || {};

MJT.categories = Object.freeze([
  { id: 'roofing-woods', name: 'Roofing Woods', description: 'Rafters, battens and fascia boards for roof framing.', image: 'assets/images/roofing-wood-2x3.svg' },
  { id: 'planks', name: 'Planks', description: 'Boards for formwork, shelving, ceilings and general carpentry.', image: 'assets/images/plank-1x12.svg' },
  { id: 'timber', name: 'Timber', description: 'Heavier sections for beams, posts and structural framing.', image: 'assets/images/timber-4x4.svg' },
  { id: 'nails', name: 'Nails', description: 'Wire, roofing and concrete nails in common sizes.', image: 'assets/images/nails-3in.svg' },
  { id: 'other-materials', name: 'Other Building Materials', description: 'Plywood, binding wire, wood treatment and more.', image: 'assets/images/other-materials.svg' }
]);

MJT.productsData = Object.freeze([
  // Roofing woods
  { id: 'rw-2x3-12ft', name: '2" x 3" Roofing Wood (12 ft)', category: 'roofing-woods', price: 3500, unit: 'piece', image: 'assets/images/roofing-wood-2x3.svg', description: 'Standard rafter and purlin size for residential roof framing.', stock: null, featured: true, isDemo: true },
  { id: 'rw-2x4-12ft', name: '2" x 4" Roofing Wood (12 ft)', category: 'roofing-woods', price: 4800, unit: 'piece', image: 'assets/images/roofing-wood-2x4.svg', description: 'Heavier rafter section for wider spans and hip roofs.', stock: null, featured: false, isDemo: true },
  { id: 'rw-batten-2x2', name: '2" x 2" Batten (12 ft)', category: 'roofing-woods', price: 2000, unit: 'piece', image: 'assets/images/batten-2x2.svg', description: 'Batten for fixing roofing sheets and ceiling noggins.', stock: null, featured: false, isDemo: true },
  { id: 'rw-fascia-1x10', name: '1" x 10" Fascia Board (12 ft)', category: 'roofing-woods', price: 6500, unit: 'piece', image: 'assets/images/fascia-board.svg', description: 'Finishing board for roof edges and eaves.', stock: null, featured: false, isDemo: true },

  // Planks
  { id: 'pl-1x12-12ft', name: '1" x 12" Plank (12 ft)', category: 'planks', price: 5500, unit: 'length', image: 'assets/images/plank-1x12.svg', description: 'Wide plank for formwork, shelving and site use.', stock: null, featured: true, isDemo: true },
  { id: 'pl-1x10-12ft', name: '1" x 10" Plank (12 ft)', category: 'planks', price: 4500, unit: 'length', image: 'assets/images/plank-1x10.svg', description: 'All-purpose plank for carpentry and concrete formwork.', stock: null, featured: false, isDemo: true },
  { id: 'pl-1x6-12ft', name: '1" x 6" Plank (12 ft)', category: 'planks', price: 2800, unit: 'length', image: 'assets/images/plank-1x6.svg', description: 'Narrow plank for edging, bracing and light framing.', stock: null, featured: false, isDemo: true },

  // Timber
  { id: 'tb-2x6-12ft', name: '2" x 6" Timber (12 ft)', category: 'timber', price: 9000, unit: 'piece', image: 'assets/images/timber-2x6.svg', description: 'Strong section for joists, lintels and roof members.', stock: null, featured: true, isDemo: true },
  { id: 'tb-3x4-12ft', name: '3" x 4" Timber (12 ft)', category: 'timber', price: 8500, unit: 'piece', image: 'assets/images/timber-3x4.svg', description: 'Popular wall plate and framing section.', stock: null, featured: false, isDemo: true },
  { id: 'tb-4x4-12ft', name: '4" x 4" Timber Post (12 ft)', category: 'timber', price: 12000, unit: 'piece', image: 'assets/images/timber-4x4.svg', description: 'Square post for columns, supports and scaffolding.', stock: null, featured: false, isDemo: true },
  { id: 'tb-2x12-12ft', name: '2" x 12" Timber Board (12 ft)', category: 'timber', price: 15000, unit: 'piece', image: 'assets/images/timber-2x12.svg', description: 'Wide heavy board for beams, stair treads and platforms.', stock: null, featured: false, isDemo: true },

  // Nails
  { id: 'nl-wire-2in', name: '2" Wire Nails', category: 'nails', price: 2300, unit: 'kg', image: 'assets/images/nails-2in.svg', description: 'Common nails for light carpentry and battens.', stock: null, featured: false, isDemo: true },
  { id: 'nl-wire-3in', name: '3" Wire Nails', category: 'nails', price: 2300, unit: 'kg', image: 'assets/images/nails-3in.svg', description: 'General-purpose nails for formwork and framing.', stock: null, featured: true, isDemo: true },
  { id: 'nl-wire-4in', name: '4" Wire Nails', category: 'nails', price: 2300, unit: 'kg', image: 'assets/images/nails-4in.svg', description: 'Long nails for heavy timber and roof trusses.', stock: null, featured: false, isDemo: true },
  { id: 'nl-roofing', name: 'Roofing Nails (Umbrella Head)', category: 'nails', price: 3000, unit: 'kg', image: 'assets/images/roofing-nails.svg', description: 'Umbrella-head nails for fixing roofing sheets.', stock: null, featured: true, isDemo: true },
  { id: 'nl-concrete-pack', name: 'Concrete Nails', category: 'nails', price: 1500, unit: 'pack', image: 'assets/images/concrete-nails.svg', description: 'Hardened nails for fixing into blockwork and concrete.', stock: null, featured: false, isDemo: true },

  // Other building materials
  { id: 'ot-plywood-18mm', name: 'Plywood Sheet (18 mm)', category: 'other-materials', price: 22000, unit: 'sheet', image: 'assets/images/plywood.svg', description: '8 ft x 4 ft sheet for formwork, furniture and partitions.', stock: null, featured: true, isDemo: true },
  { id: 'ot-binding-wire', name: 'Binding Wire', category: 'other-materials', price: 25000, unit: 'roll', image: 'assets/images/binding-wire.svg', description: 'Soft wire for tying reinforcement bars.', stock: null, featured: false, isDemo: true },
  { id: 'ot-preservative-4l', name: 'Wood Preservative (4 L)', category: 'other-materials', price: 18000, unit: 'tin', image: 'assets/images/wood-preservative.svg', description: 'Protects timber against termites, rot and moisture.', stock: null, featured: false, isDemo: true }
]);

/*
 * Product source.
 * Every page gets products through MJT.productSource.getAll(), which returns a
 * Promise. Today it resolves the local list above. To use a PHP/MySQL API later,
 * replace the body with a fetch call, for example:
 *
 *   getAll: function () {
 *     return fetch('api/products.php', { headers: { Accept: 'application/json' } })
 *       .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
 *   }
 *
 * Nothing else in the frontend needs to change as long as the API returns the
 * same fields.
 */
MJT.productSource = {
  getAll: function () {
    return Promise.resolve(MJT.productsData.slice());
  }
};
