const db = require('../db');
const config = require('../config');
const { getBalance, applyBalanceDelta } = require('./users');
const { evaluateCoupon, recordRedemption } = require('./coupons');
const { provisionEsim } = require('./esimProvider');

function computeTotals({ product, quantity, user, couponCode }) {
  const subtotal = product.unit_price * quantity;
  const shipping = product.type_product === 'physical' ? config.business.physicalShippingEur : 0;

  let firstDiscount = 0;
  if (!user.first_purchase_used && config.business.firstPurchaseDiscountPct > 0) {
    firstDiscount = parseFloat(
      ((subtotal * config.business.firstPurchaseDiscountPct) / 100).toFixed(2)
    );
  }

  let couponResult = null;
  if (couponCode) {
    couponResult = evaluateCoupon(couponCode, user.id, subtotal - firstDiscount);
  }
  const couponDiscount = couponResult && couponResult.ok ? couponResult.discountEur : 0;

  const total = Math.max(0, subtotal - firstDiscount - couponDiscount + shipping);
  return { subtotal, shipping, firstDiscount, couponDiscount, couponResult, total };
}

/**
 * Executes a purchase atomically: revalidates price/stock server-side (never trusts the
 * client's price), locks the row via an immediate transaction, debits balance, decrements
 * stock, and (for eSIM) calls the provider adapter. Throws typed errors matching the
 * frontend's existing errMap in index.html.
 */
function purchase({ user, productId, quantity, couponCode }) {
  const run = db.transaction(() => {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(productId);
    if (!product) {
      const e = new Error('producto_no_disponible');
      throw e;
    }

    if (product.type_product === 'physical') {
      if (quantity < config.business.physicalMinQty) {
        throw new Error('cantidad_minima_fisica');
      }
      if (product.stock < quantity) {
        throw new Error('sin_stock_fisico');
      }
    }

    const { subtotal, shipping, firstDiscount, couponDiscount, couponResult, total } =
      computeTotals({ product, quantity, user, couponCode });

    if (couponCode && (!couponResult || !couponResult.ok)) {
      throw new Error(couponResult ? couponResult.error : 'cupon_no_valido');
    }

    const balance = getBalance(user.id);
    if (balance < total) {
      throw new Error('saldo_insuficiente');
    }

    // Queue mode: esim with 0 stock is still purchasable and fulfilled later (matches
    // isQueueMode() in the existing frontend), physical goods are hard-blocked above.
    const isQueue = product.type_product === 'esim' && product.stock <= 0;

    const orderInfo = db
      .prepare(
        `INSERT INTO orders (user_id, status, subtotal_eur, discount_eur, shipping_eur, total_eur, coupon_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        user.id,
        isQueue ? 'en_cola' : 'completado',
        subtotal,
        parseFloat((firstDiscount + couponDiscount).toFixed(2)),
        shipping,
        total,
        couponResult && couponResult.ok ? couponResult.code : null
      );
    const orderId = orderInfo.lastInsertRowid;

    const itemInfo = db
      .prepare(
        `INSERT INTO order_items (order_id, product_id, product_name, type_product, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(orderId, product.id, product.name, product.type_product, quantity, product.unit_price, subtotal);

    applyBalanceDelta(user.id, -total, 'purchase', 'order', orderId);

    if (product.type_product === 'physical') {
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(quantity, product.id);
    } else if (!isQueue) {
      db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(quantity, product.id);
    }

    if (!user.first_purchase_used && firstDiscount > 0) {
      db.prepare('UPDATE users SET first_purchase_used = 1 WHERE id = ?').run(user.id);
    }
    if (couponResult && couponResult.ok) {
      recordRedemption(couponResult.code, user.id, orderId);
    }

    return { orderId, itemId: itemInfo.lastInsertRowid, status: isQueue ? 'en_cola' : 'completado', total };
  });

  const result = run();

  // Fulfillment happens outside the DB transaction (it's an external network call).
  if (result.status === 'completado') {
    provisionEsimIfNeeded(result.itemId).catch((e) => {
      console.error('esim fulfillment failed for item', result.itemId, e);
    });
  }

  return result;
}

async function provisionEsimIfNeeded(orderItemId) {
  const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(orderItemId);
  if (!item || item.type_product !== 'esim') return;
  try {
    const payload = await provisionEsim({
      orderItemId,
      productId: item.product_id,
      quantity: item.quantity,
    });
    db.prepare(
      `UPDATE order_items SET fulfillment_status='provisioned', fulfillment_payload=? WHERE id=?`
    ).run(JSON.stringify(payload), orderItemId);
  } catch (e) {
    db.prepare(`UPDATE order_items SET fulfillment_status='failed' WHERE id=?`).run(orderItemId);
  }
}

module.exports = { purchase, computeTotals };
