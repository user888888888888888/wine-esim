const crypto = require('crypto');
const config = require('./config');

/**
 * Validates Telegram Mini App `initData` per the official algorithm:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * secret_key = HMAC_SHA256(<bot_token>, "WebAppData")
 * check_hash = HMAC_SHA256(secret_key, data_check_string)
 *
 * Returns the parsed, verified user object, or throws.
 * maxAgeSeconds guards against replay of an old initData string (default 24h).
 */
function validateInitData(initData, { maxAgeSeconds = 86400 } = {}) {
  if (!initData || typeof initData !== 'string') {
    throw new Error('missing_init_data');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('missing_hash');
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(config.telegram.botToken)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const validSignature =
    computedHash.length === hash.length &&
    crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(hash, 'hex'));

  if (!validSignature) {
    throw new Error('invalid_signature');
  }

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (!authDate || ageSeconds > maxAgeSeconds || ageSeconds < -60) {
    throw new Error('expired_init_data');
  }

  const userRaw = params.get('user');
  if (!userRaw) throw new Error('missing_user');

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch (e) {
    throw new Error('malformed_user');
  }

  if (!user || !user.id) throw new Error('missing_user_id');

  return {
    telegramId: String(user.id),
    username: user.username || null,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    authDate,
  };
}

/** Express middleware: expects `initData` in the JSON body, attaches req.telegramUser */
function requireTelegramAuth(req, res, next) {
  try {
    const initData = req.body && req.body.initData;
    req.telegramUser = validateInitData(initData);
    next();
  } catch (e) {
    res.status(401).json({ ok: false, error: 'init_data_invalida', detail: e.message });
  }
}

module.exports = { validateInitData, requireTelegramAuth };
