const db = require('../db');

function getOrCreateUser({ telegramId, username, firstName, lastName }) {
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  if (existing) {
    db.prepare(
      `UPDATE users SET username=?, first_name=?, last_name=?, updated_at=datetime('now') WHERE id=?`
    ).run(username, firstName, lastName, existing.id);
    return { ...existing, username, first_name: firstName, last_name: lastName };
  }

  const info = db
    .prepare(
      `INSERT INTO users (telegram_id, username, first_name, last_name) VALUES (?, ?, ?, ?)`
    )
    .run(telegramId, username, firstName, lastName);
  db.prepare(`INSERT INTO balances (user_id, amount_eur) VALUES (?, 0)`).run(info.lastInsertRowid);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

function getUserByTelegramId(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

function getBalance(userId) {
  const row = db.prepare('SELECT amount_eur FROM balances WHERE user_id = ?').get(userId);
  return row ? row.amount_eur : 0;
}

/**
 * Applies a signed balance delta atomically and appends a ledger row.
 * Must be called inside a db.transaction() by the caller when combined with other writes
 * (see purchases.js / recharge.js for examples).
 */
function applyBalanceDelta(userId, amountEur, reason, referenceType = null, referenceId = null) {
  db.prepare(
    `UPDATE balances SET amount_eur = amount_eur + ?, updated_at = datetime('now') WHERE user_id = ?`
  ).run(amountEur, userId);
  db.prepare(
    `INSERT INTO balance_transactions (user_id, amount_eur, reason, reference_type, reference_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, amountEur, reason, referenceType, referenceId);
}

module.exports = { getOrCreateUser, getUserByTelegramId, getBalance, applyBalanceDelta };
