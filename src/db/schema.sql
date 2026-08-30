-- Users authenticated via Telegram (never trust a client-supplied id; always derive from initData)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  first_purchase_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS balances (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  amount_eur REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only ledger. Balance = sum of amount_eur here. Never mutate rows.
CREATE TABLE IF NOT EXISTS balance_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount_eur REAL NOT NULL, -- positive = credit, negative = debit
  reason TEXT NOT NULL,     -- 'nowpayments_topup' | 'purchase' | 'refund' | 'manual_adjustment'
  reference_type TEXT,      -- 'payment' | 'order'
  reference_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  unit_price REAL NOT NULL,
  type_product TEXT NOT NULL CHECK (type_product IN ('esim','physical')),
  stock INTEGER NOT NULL DEFAULT 0,
  company TEXT,
  tariff TEXT,
  data_gb REAL,
  unlimited_data INTEGER NOT NULL DEFAULT 0,
  validity_days INTEGER,
  intl_calls INTEGER NOT NULL DEFAULT 0,
  intl_calls_minutes INTEGER,
  unlimited_calls INTEGER NOT NULL DEFAULT 0,
  national_calls_minutes INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  discount_pct REAL,
  discount_eur REAL,
  max_redemptions INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_code TEXT NOT NULL REFERENCES coupons(code),
  user_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(coupon_code, user_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending|completado|parcial|en_cola|cancelado
  subtotal_eur REAL NOT NULL,
  discount_eur REAL NOT NULL DEFAULT 0,
  shipping_eur REAL NOT NULL DEFAULT 0,
  total_eur REAL NOT NULL,
  coupon_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  type_product TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  -- esim fulfillment payload (QR/activation code) once provisioned by the provider adapter
  fulfillment_status TEXT NOT NULL DEFAULT 'pending', -- pending|provisioned|failed
  fulfillment_payload TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL DEFAULT 'nowpayments',
  provider_payment_id TEXT UNIQUE,
  amount_eur REAL NOT NULL,
  pay_currency TEXT,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting|confirming|confirmed|finished|failed|expired|refunded
  credited INTEGER NOT NULL DEFAULT 0,    -- idempotency guard: 1 once balance has been credited
  raw_create_response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every inbound IPN call is logged before processing, keyed by a dedupe hash, so a
-- replayed/duplicate webhook can never credit balance twice even under concurrent delivery.
CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER REFERENCES payments(id),
  provider TEXT NOT NULL DEFAULT 'nowpayments',
  event_dedupe_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_user ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
