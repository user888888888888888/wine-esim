// Optional: run with `node src/db/seed.js` to insert sample products for local testing.
const db = require('./index');

const products = [
  {
    id: 'esim-es-5gb',
    name: 'eSIM España 5GB',
    description: '5GB de datos válidos 30 días',
    unit_price: 9.99,
    type_product: 'esim',
    stock: 50,
    company: 'vodafone',
    tariff: 'basic',
    data_gb: 5,
    validity_days: 30,
  },
  {
    id: 'esim-es-unlimited',
    name: 'eSIM España Ilimitada',
    description: 'Datos ilimitados 30 días',
    unit_price: 24.99,
    type_product: 'esim',
    stock: 20,
    company: 'orange',
    tariff: 'unlimited',
    unlimited_data: 1,
    validity_days: 30,
  },
  {
    id: 'sim-fisica-es',
    name: 'SIM Física España',
    description: 'SIM física con envío',
    unit_price: 4.99,
    type_product: 'physical',
    stock: 100,
    company: 'lebara',
  },
];

const stmt = db.prepare(`
  INSERT OR REPLACE INTO products
  (id, name, description, unit_price, type_product, stock, company, tariff, data_gb, unlimited_data, validity_days)
  VALUES (@id, @name, @description, @unit_price, @type_product, @stock, @company, @tariff, @data_gb, @unlimited_data, @validity_days)
`);

for (const p of products) {
  stmt.run({
    unlimited_data: 0,
    data_gb: null,
    validity_days: null,
    tariff: null,
    ...p,
  });
}

console.log(`Seeded ${products.length} products.`);
