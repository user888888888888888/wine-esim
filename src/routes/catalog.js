const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE active = 1').all();
  const products = rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    unit_price: p.unit_price,
    typeProduct: p.type_product,
    stock: p.stock,
    company: p.company,
    tariff: p.tariff,
    data_gb: p.data_gb,
    unlimited_data: !!p.unlimited_data,
    validity_days: p.validity_days,
    intl_calls: !!p.intl_calls,
    intl_calls_minutes: p.intl_calls_minutes,
    unlimited_calls: !!p.unlimited_calls,
    national_calls_minutes: p.national_calls_minutes,
  }));
  res.json({ ok: true, products });
});

module.exports = router;
