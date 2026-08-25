const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const nowpayments = require('../services/nowpayments');
const { applyBalanceDelta, getBalance } = require('../services/users');

const router = express.Router();

// Statuses NOWPayments considers "money has actually arrived" — only these credit balance.
const CREDITABLE_STATUSES = new Set(['finished', 'confirmed']);

// IMPORTANT: this route must receive the *raw* body (see server.js, which mounts a
// raw-body parser only for this path) because the HMAC is computed over the exact bytes.
router.post('/nowpayments', (req, res) => {
  const rawBody = req.body; // Buffer, thanks to express.raw() in server.js
  const signature = req.get('x-nowpayments-sig');

  if (!nowpayments.verifyIpnSignature(rawBody.toString('utf8'), signature)) {
    return res.status(401).json({ ok: false, error: 'invalid_signature' });
  }

  const payload = JSON.parse(rawBody.toString('utf8'));

  // Dedupe key: NOWPayments may redeliver the same event; a hash of the full payload
  // means a byte-identical retry is dropped, while a genuine status transition (different
  // payload) is processed as a new event.
  const dedupeKey = crypto.createHash('sha256').update(rawBody).digest('hex');

  const already = db
    .prepare('SELECT 1 FROM payment_events WHERE event_dedupe_key = ?')
    .get(dedupeKey);
  if (already) {
    return res.json({ ok: true, deduped: true });
  }

  const providerPaymentId = String(payload.payment_id || payload.id || '');
  const payment = db
    .prepare('SELECT * FROM payments WHERE provider_payment_id = ?')
    .get(providerPaymentId);

  db.prepare(
    `INSERT INTO payment_events (payment_id, provider, event_dedupe_key, payload) VALUES (?, 'nowpayments', ?, ?)`
  ).run(payment ? payment.id : null, dedupeKey, rawBody.toString('utf8'));

  if (!payment) {
    // Log-and-acknowledge: unknown payment id, nothing more we can safely do.
    return res.json({ ok: true, warning: 'unknown_payment_id' });
  }

  const status = String(payload.payment_status || '').toLowerCase();

  const run = db.transaction(() => {
    db.prepare(`UPDATE payments SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
      status,
      payment.id
    );

    // The `credited` flag is the idempotency guard: even if two creditable events arrive
    // for the same payment (e.g. 'confirmed' then 'finished'), balance is only ever applied once.
    if (CREDITABLE_STATUSES.has(status) && !payment.credited) {
      applyBalanceDelta(payment.user_id, payment.amount_eur, 'nowpayments_topup', 'payment', payment.id);
      db.prepare('UPDATE payments SET credited = 1 WHERE id = ?').run(payment.id);
    }
  });
  run();

  if (CREDITABLE_STATUSES.has(status) && !payment.credited) {
    // Notify the user in the bot chat — best-effort, never blocks the IPN ack.
    try {
      const { notifyTopupConfirmed } = require('../bot/bot');
      const userRow = db.prepare('SELECT telegram_id FROM users WHERE id = ?').get(payment.user_id);
      if (userRow) {
        notifyTopupConfirmed(userRow.telegram_id, payment.amount_eur, getBalance(payment.user_id)).catch(
          (e) => console.error('notify topup failed:', e)
        );
      }
    } catch (e) {
      console.error('bot notify wiring failed:', e);
    }
  }

  res.json({ ok: true });
});

module.exports = router;
