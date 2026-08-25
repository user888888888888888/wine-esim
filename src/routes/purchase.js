const express = require('express');
const { requireTelegramAuth } = require('../telegramAuth');
const { getOrCreateUser } = require('../services/users');
const { purchase } = require('../services/purchases');

const router = express.Router();

router.post('/', requireTelegramAuth, (req, res) => {
  const tgu = req.telegramUser;
  const user = getOrCreateUser({
    telegramId: tgu.telegramId,
    username: tgu.username,
    firstName: tgu.firstName,
    lastName: tgu.lastName,
  });
  if (user.is_blocked) return res.status(403).json({ ok: false, error: 'cuenta_bloqueada' });

  const { productId, quantity, coupon } = req.body || {};
  const qty = parseInt(quantity, 10);
  if (!productId || !Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ ok: false, error: 'precio_invalido' });
  }

  try {
    const result = purchase({ user, productId, quantity: qty, couponCode: coupon || null });
    res.json({
      ok: true,
      status: result.status,
      message:
        result.status === 'en_cola'
          ? 'Pedido en cola. Te avisaremos cuando haya stock.'
          : 'Pedido confirmado',
      orderId: result.orderId,
    });
  } catch (e) {
    const known = new Set([
      'producto_no_disponible',
      'cantidad_minima_fisica',
      'sin_stock_fisico',
      'saldo_insuficiente',
      'cupon_no_valido',
      'cupon_agotado',
      'cupon_ya_utilizado',
      'precio_invalido',
    ]);
    const code = known.has(e.message) ? e.message : null;
    if (!code) console.error('purchase error:', e);
    res.status(code ? 400 : 500).json({ ok: false, error: code || 'error_interno' });
  }
});

module.exports = router;
