const { Telegraf, Markup } = require('telegraf');
const config = require('../config');
const db = require('../db');
const { getOrCreateUser, getBalance } = require('../services/users');
const nowpayments = require('../services/nowpayments');

const bot = new Telegraf(config.telegram.botToken);

const TOPUP_AMOUNTS = [10, 20, 50, 100, 200, 500];

function ensureUser(ctx) {
  const from = ctx.from;
  return getOrCreateUser({
    telegramId: String(from.id),
    username: from.username || null,
    firstName: from.first_name || null,
    lastName: from.last_name || null,
  });
}

function money(v) {
  return `${parseFloat(v).toFixed(2).replace('.', ',')} €`;
}

bot.start((ctx) => {
  const user = ensureUser(ctx);
  if (user.is_blocked) return ctx.reply('Tu cuenta está bloqueada. Contacta con soporte.');

  return ctx.reply(
    `👋 Bienvenido a eSIM Market.\n\nSaldo actual: ${money(getBalance(user.id))}`,
    Markup.keyboard([
      [Markup.button.webApp('🛍️ Abrir tienda', config.telegram.webappUrl + '/miniapp/index.html')],
      ['💰 Mi saldo', '➕ Añadir fondos'],
      ['🧾 Mis pedidos', '🆘 Soporte'],
    ]).resize()
  );
});

function replyShop(ctx) {
  return ctx.reply(
    'Abre la tienda:',
    Markup.inlineKeyboard([
      Markup.button.webApp('🛍️ Abrir tienda', config.telegram.webappUrl + '/miniapp/index.html'),
    ])
  );
}
bot.command('shop', replyShop);
bot.hears('🛍️ Abrir tienda', replyShop);

function replyBalance(ctx) {
  const user = ensureUser(ctx);
  return ctx.reply(`💰 Tu saldo: ${money(getBalance(user.id))}`);
}
bot.command('balance', replyBalance);
bot.hears('💰 Mi saldo', replyBalance);

function depositMenu() {
  const rows = [];
  for (let i = 0; i < TOPUP_AMOUNTS.length; i += 3) {
    rows.push(
      TOPUP_AMOUNTS.slice(i, i + 3).map((a) => Markup.button.callback(`${a} €`, `topup_${a}`))
    );
  }
  rows.push([Markup.button.callback('Cantidad personalizada', 'topup_custom')]);
  return Markup.inlineKeyboard(rows);
}

bot.command('deposit', (ctx) => ctx.reply('Selecciona cantidad:', depositMenu()));
bot.hears('➕ Añadir fondos', (ctx) => ctx.reply('Selecciona cantidad:', depositMenu()));

async function startTopup(ctx, amount) {
  const user = ensureUser(ctx);
  if (user.is_blocked) return ctx.reply('Tu cuenta está bloqueada. Contacta con soporte.');

  const info = db
    .prepare(`INSERT INTO payments (user_id, provider, amount_eur, status) VALUES (?, 'nowpayments', ?, 'waiting')`)
    .run(user.id, amount);

  try {
    const payment = await nowpayments.createPayment({
      amountEur: amount,
      orderId: `bot_topup_${user.id}_${info.lastInsertRowid}`,
      payerTelegramId: user.telegram_id,
    });
    db.prepare(`UPDATE payments SET provider_payment_id = ?, raw_create_response = ? WHERE id = ?`).run(
      String(payment.id || payment.invoice_id || ''),
      JSON.stringify(payment),
      info.lastInsertRowid
    );

    if (payment.invoice_url) {
      await ctx.reply(
        `Pago de ${money(amount)} creado. Complétalo aquí:\n${payment.invoice_url}\n\nTe avisaré en cuanto se confirme.`
      );
    } else {
      await ctx.reply('Pago creado. Revisa los detalles en tu proveedor de pago.');
    }
  } catch (e) {
    console.error('bot topup error:', e);
    await ctx.reply('No se pudo iniciar el pago. Inténtalo de nuevo en unos minutos.');
  }
}

TOPUP_AMOUNTS.forEach((amount) => {
  bot.action(`topup_${amount}`, async (ctx) => {
    await ctx.answerCbQuery();
    await startTopup(ctx, amount);
  });
});

bot.action('topup_custom', async (ctx) => {
  await ctx.answerCbQuery();
  awaitingCustomAmount.add(ctx.from.id);
  await ctx.reply('Escribe el importe en euros que quieres añadir (mínimo 5 €):');
});

const awaitingCustomAmount = new Set();
bot.on('text', async (ctx, next) => {
  if (!awaitingCustomAmount.has(ctx.from.id)) return next();
  awaitingCustomAmount.delete(ctx.from.id);
  const amount = parseFloat((ctx.message.text || '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 5) {
    return ctx.reply('Importe no válido. Usa /deposit para intentarlo de nuevo.');
  }
  return startTopup(ctx, amount);
});

function replyOrders(ctx) {
  const user = ensureUser(ctx);
  const orders = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 10')
    .all(user.id);
  if (!orders.length) return ctx.reply('Todavía no tienes pedidos.');
  const lines = orders.map(
    (o) => `#${o.id} — ${o.status} — ${money(o.total_eur)} — ${o.created_at}`
  );
  return ctx.reply(`🧾 Tus últimos pedidos:\n\n${lines.join('\n')}`);
}
bot.command('orders', replyOrders);
bot.hears('🧾 Mis pedidos', replyOrders);

function replySupport(ctx) {
  return ctx.reply('Escribe tu consulta y la reenviaré al equipo de soporte.');
}
bot.command('support', replySupport);
bot.hears('🆘 Soporte', replySupport);
// /paysupport is required by Telegram's bot developer ToS for any bot selling goods/services.
bot.command('paysupport', (ctx) =>
  ctx.reply(
    'Para incidencias de pago, indícanos el número de pedido o el ID del pago y un admin te atenderá aquí mismo.'
  )
);

function notifyTopupConfirmed(telegramId, amountEur, newBalance) {
  return bot.telegram.sendMessage(
    telegramId,
    `✅ Recarga confirmada: +${money(amountEur)}\nSaldo actual: ${money(newBalance)}`
  );
}

if (require.main === module) {
  bot.launch();
  console.log('Telegram bot started (polling)');
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = { bot, notifyTopupConfirmed };
