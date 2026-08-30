const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireTelegramAuth } = require('../telegramAuth');
const { getOrCreateUser, getBalance } = require('../services/users');

const router = express.Router();

function resolveUser(req) {
  const tgu = req.telegramUser;
  return getOrCreateUser({
    telegramId: tgu.telegramId,
    username: tgu.username,
    firstName: tgu.firstName,
    lastName: tgu.lastName,
  });
}

// GET /api/balance  (initData passed as a query/header isn't part of the official flow for
// GET requests, so this app authenticates GET /api/balance via POST-style body on purpose:
// the frontend can call it as POST too — see README for the one deviation from the verb map.)
router.post('/balance', requireTelegramAuth, (req, res) => {
  const user = resolveUser(req);
  res.json({ ok: true, balance: getBalance(user.id) });
});

router.post('/orders', requireTelegramAuth, (req, res) => {
  const user = resolveUser(req);
  const orders = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(user.id);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const withItems = orders.map((o) => ({ ...o, items: items.all(o.id) }));
  res.json({ ok: true, orders: withItems });
});

router.post('/user-promo', requireTelegramAuth, (req, res) => {
  const user = resolveUser(req);
  res.json({
    ok: true,
    firstPurchaseDiscountPct: config.business.firstPurchaseDiscountPct,
    firstPurchaseEligible: !user.first_purchase_used,
  });
});

module.exports = router;
