const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config');

const authRoutes = require('./routes/auth');
const catalogRoutes = require('./routes/catalog');
const accountRoutes = require('./routes/account');
const purchaseRoutes = require('./routes/purchase');
const paymentsRoutes = require('./routes/payments');
const webhookRoutes = require('./routes/webhooks');
const couponRoutes = require('./routes/coupon');

const app = express();

// The NOWPayments webhook needs the raw byte body for HMAC verification, so it's mounted
// BEFORE the global json() parser and given its own raw parser.
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(
  cors({
    origin: config.corsOrigins.length ? config.corsOrigins : true,
  })
);
app.use(express.json());

// Serve the existing Mini App unchanged — API_BASE in index.html auto-resolves to
// window.location.origin because the file lives under /miniapp/.
app.use('/miniapp', express.static(path.join(__dirname, '..', 'public', 'miniapp')));

app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api', accountRoutes); // /api/balance, /api/orders, /api/user-promo
app.use('/api/purchase', purchaseRoutes);
app.use('/api', paymentsRoutes); // /api/recharge
app.use('/api', couponRoutes); // /api/apply-coupon
// /api/event and /api/stock-alert are called by index.html but are non-critical telemetry —
// answer them harmlessly so the frontend never shows a console error.
app.post('/api/event', (req, res) => res.json({ ok: true }));
app.post('/api/stock-alert', (req, res) => res.json({ ok: true }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

app.listen(config.port, () => {
  console.log(`esim-bot backend listening on :${config.port}`);
  console.log(`Mini App:  http://localhost:${config.port}/miniapp/index.html`);
  console.log(`Webhook:   POST /api/webhooks/nowpayments`);
});
