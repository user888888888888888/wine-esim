require('dotenv').config();

function required(name, { allowEmptyAtBoot = true } = {}) {
  const v = process.env[name];
  if (!v && !allowEmptyAtBoot) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v || '';
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databasePath: process.env.DATABASE_PATH || './data/esim.db',
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  telegram: {
    botToken: required('TELEGRAM_BOT_TOKEN'),
    webappUrl: required('TELEGRAM_WEBAPP_URL'),
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || '',
  },

  nowpayments: {
    apiKey: required('NOWPAYMENTS_API_KEY'),
    ipnSecret: required('NOWPAYMENTS_IPN_SECRET'),
    baseUrl: process.env.NOWPAYMENTS_BASE_URL || 'https://api.nowpayments.io/v1',
    ipnUrl: required('NOWPAYMENTS_IPN_URL'),
  },

  esimProvider: {
    baseUrl: process.env.ESIM_PROVIDER_BASE_URL || '',
    apiKey: process.env.ESIM_PROVIDER_API_KEY || '',
  },

  business: {
    firstPurchaseDiscountPct: parseFloat(process.env.FIRST_PURCHASE_DISCOUNT_PCT || '10'),
    physicalShippingEur: parseFloat(process.env.PHYSICAL_SIM_SHIPPING_EUR || '5'),
    physicalMinQty: parseInt(process.env.PHYSICAL_SIM_MIN_QTY || '3', 10),
  },
};

module.exports = config;
