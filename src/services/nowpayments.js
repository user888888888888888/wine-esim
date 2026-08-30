const crypto = require('crypto');
const fetch = require('node-fetch');
const config = require('../config');

/**
 * Creates a NOWPayments invoice/payment for a top-up.
 * Docs: https://documenter.getpostman.com/view/7907941/S1a32n38 (NOWPayments API)
 */
async function createPayment({ amountEur, orderId, payerTelegramId }) {
  const res = await fetch(`${config.nowpayments.baseUrl}/invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': config.nowpayments.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount: amountEur,
      price_currency: 'eur',
      order_id: orderId,
      order_description: `Recarga de saldo — usuario TG ${payerTelegramId}`,
      ipn_callback_url: config.nowpayments.ipnUrl,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'nowpayments_create_failed');
    err.details = data;
    throw err;
  }
  return data; // includes id / invoice_url / token, etc.
}

/**
 * Verifies the `x-nowpayments-sig` HMAC-SHA512 header on an IPN callback.
 * The signature is computed over the JSON body with keys SORTED alphabetically,
 * per NOWPayments' IPN documentation.
 */
function verifyIpnSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch (e) {
    return false;
  }
  const sorted = Object.keys(parsed)
    .sort()
    .reduce((acc, k) => ((acc[k] = parsed[k]), acc), {});
  const computed = crypto
    .createHmac('sha512', config.nowpayments.ipnSecret)
    .update(JSON.stringify(sorted))
    .digest('hex');
  return (
    computed.length === signatureHeader.length &&
    crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(signatureHeader, 'hex'))
  );
}

module.exports = { createPayment, verifyIpnSignature };
