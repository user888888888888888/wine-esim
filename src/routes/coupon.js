const express = require('express');
const { requireTelegramAuth } = require('../telegramAuth');
const { getOrCreateUser } = require('../services/users');
const { evaluateCoupon } = require('../services/coupons');

const router = express.Router();

// Preview-only: actual redemption is recorded at purchase time (see purchases.js) so a
// coupon can be validated repeatedly while shopping without being consumed early.
router.post('/apply-coupon', requireTelegramAuth, (req, res) => {
  const tgu = req.telegramUser;
  const user = getOrCreateUser({
    telegramId: tgu.telegramId,
    username: tgu.username,
    firstName: tgu.firstName,
    lastName: tgu.lastName,
  });
  const { code, subtotal } = req.body || {};
  const result = evaluateCoupon(code, user.id, parseFloat(subtotal) || 0);
  if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
  res.json({ ok: true, code: result.code, discountEur: result.discountEur });
});

module.exports = router;
