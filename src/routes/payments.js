const express = require('express');
const db = require('../db');
const { requireTelegramAuth } = require('../telegramAuth');
const { getOrCreateUser } = require('../services/users');
const nowpayments = require('../services/nowpayments');

const router = express.Router();

const MIN_TOPUP_EUR = 5;

async function createTopupPayment(user) {
  const orderRef = `topup_${user.id}_${Date.now()}`;
  return orderRef;
}

// POST /api/recharge  — used by the Mini App "Añadir fondos" sheet in index.html
router.post('/recharge', requireTelegramAuth, async (req, res) => {
  const tgu = req.telegramUser;
  const user = getOrCreateUser({
    telegramId: tgu.telegramId,
    username: tgu.username,
    firstName: tgu.firstName,
    lastName: tgu.lastName,
  });
  if (user.is_blocked) return res.status(403).json({ ok: false, error: 'cuenta_bloqueada' });

  const amount = parseFloat(req.body && req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'importe_invalido' });
  }
  if (amount < MIN_TOPUP_EUR) {
    return res.status(400).json({ ok: false, error: 'minimo_5' });
  }

  try {
    const orderRef = await createTopupPayment(user);
    const info = db
      .prepare(
        `INSERT INTO payments (user_id, provider, amount_eur, status) VALUES (?, 'nowpayments', ?, 'waiting')`
      )
      .run(user.id, amount);

    const payment = await nowpayments.createPayment({
      amountEur: amount,
      orderId: `${orderRef}_${info.lastInsertRowid}`,
      payerTelegramId: tgu.telegramId,
    });

    db.prepare(
      `UPDATE payments SET provider_payment_id = ?, raw_create_response = ? WHERE id = ?`
    ).run(String(payment.id || payment.invoice_id || ''), JSON.stringify(payment), info.lastInsertRowid);

    res.json({
      ok: true,
      message: 'Revisa el chat con el bot para completar el pago, o usa el enlace.',
      paymentUrl: payment.invoice_url || null,
      paymentId: info.lastInsertRowid,
    });
  } catch (e) {
    console.error('recharge error:', e);
    res.status(500).json({ ok: false, error: 'no_se_pudo_iniciar_recarga' });
  }
});

module.exports = router;
