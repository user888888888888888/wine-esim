const db = require('../db');

function findActiveCoupon(code) {
  const coupon = db
    .prepare('SELECT * FROM coupons WHERE code = ? AND active = 1')
    .get((code || '').trim().toUpperCase());
  if (!coupon) return null;
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) return null;
  return coupon;
}

function redemptionsCount(code) {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_code = ?')
    .get(code);
  return row.n;
}

function userAlreadyRedeemed(code, userId) {
  return !!db
    .prepare('SELECT 1 FROM coupon_redemptions WHERE coupon_code = ? AND user_id = ?')
    .get(code, userId);
}

/** Returns { ok, discountEur, error } — does NOT record redemption (that happens at checkout). */
function evaluateCoupon(code, userId, subtotalEur) {
  const coupon = findActiveCoupon(code);
  if (!coupon) return { ok: false, error: 'cupon_no_valido' };
  if (coupon.max_redemptions && redemptionsCount(coupon.code) >= coupon.max_redemptions) {
    return { ok: false, error: 'cupon_agotado' };
  }
  if (userAlreadyRedeemed(coupon.code, userId)) {
    return { ok: false, error: 'cupon_ya_utilizado' };
  }
  let discount = 0;
  if (coupon.discount_pct) discount = (subtotalEur * coupon.discount_pct) / 100;
  else if (coupon.discount_eur) discount = coupon.discount_eur;
  discount = Math.min(discount, subtotalEur);
  return { ok: true, code: coupon.code, discountEur: parseFloat(discount.toFixed(2)) };
}

function recordRedemption(code, userId, orderId) {
  db.prepare(
    `INSERT INTO coupon_redemptions (coupon_code, user_id, order_id) VALUES (?, ?, ?)`
  ).run(code, userId, orderId);
}

module.exports = { evaluateCoupon, recordRedemption, findActiveCoupon };
