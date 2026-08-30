# eSIM Market — Backend + Bot de Telegram

Backend real para la Mini App existente (`public/miniapp/index.html`, sin modificar) +
bot de Telegram que la sirve.

## Arquitectura

```
Usuario → /start en el bot → botón "🛍️ Abrir tienda" (Telegram WebApp)
                                        ↓
                        Mini App (public/miniapp/index.html)
                                        ↓  fetch (mismo origen)
                        Backend Express (src/server.js)
                          ├─ /api/auth/telegram   → valida tg.initData (HMAC), crea/lee usuario
                          ├─ /api/catalog         → productos
                          ├─ /api/balance         → saldo
                          ├─ /api/orders          → historial
                          ├─ /api/purchase        → compra transaccional (stock + saldo)
                          ├─ /api/recharge        → crea pago NOWPayments
                          ├─ /api/apply-coupon    → valida cupón
                          └─ /api/webhooks/nowpayments → IPN idempotente, acredita saldo
                                        ↓
                                   SQLite (better-sqlite3)
```

El bot (`src/bot/bot.js`) corre por separado (polling) y también permite iniciar una
recarga de saldo directamente desde el chat (`/deposit` o botón "➕ Añadir fondos"),
sin pasar por la Mini App.

## Puesta en marcha local

```bash
npm install
cp .env.example .env    # rellena los valores — ver "DATOS QUE NECESITO DE TI"
node src/db/seed.js     # opcional: productos de ejemplo
npm start                # backend en :3000
npm run bot               # bot de Telegram (proceso aparte)
```

En producción, sirve el backend detrás de HTTPS (Telegram exige HTTPS tanto para el
dominio de la Mini App como para el `ipn_callback_url` de NOWPayments) y ejecuta el bot
como un proceso persistente (`pm2`, `systemd`, contenedor, etc.).

## Seguridad — decisiones importantes

- **Nunca se confía en el `telegram_id` que manda el frontend.** Cada endpoint de
  usuario exige `initData` en el body y lo valida con HMAC-SHA256 contra
  `TELEGRAM_BOT_TOKEN` (`src/telegramAuth.js`), siguiendo el algoritmo oficial de
  Telegram. Un `initData` caducado (>24h) o con firma inválida es rechazado.
- **La compra es una transacción atómica** (`src/services/purchases.js`): revalida
  precio/stock en servidor (nunca confía en el precio que mande el cliente), descuenta
  saldo y stock en la misma transacción SQLite. No hay ventana para condiciones de carrera
  de doble gasto.
- **El webhook de NOWPayments es idempotente:** cada evento entrante se guarda con un hash
  del payload como clave única (`payment_events.event_dedupe_key`) antes de procesarse, y
  el saldo solo se acredita si `payments.credited = 0`. Un reintento/duplicado del
  proveedor nunca puede acreditar dos veces.
- La firma del webhook (`x-nowpayments-sig`) se verifica con `NOWPAYMENTS_IPN_SECRET`
  antes de aceptar cualquier payload.

> **Estado actual: NOWPayments todavía NO está activado.** El código está completo y
> lo llama, pero como no se ha proporcionado `NOWPAYMENTS_API_KEY` / `NOWPAYMENTS_IPN_SECRET`
> a propósito, `/api/recharge` y el flujo `/deposit` del bot fallarán con un error
> controlado (`no_se_pudo_iniciar_recarga`) hasta que rellenes esas variables. El resto
> del sistema (catálogo, compra con saldo, bot, Mini App) funciona sin ellas.

## ⚠️ Cumplimiento de Telegram con pagos externos (léelo antes de lanzar)

Según los Términos de Servicio para desarrolladores de bots de Telegram y su
documentación de Bot Payments:

- Los **bienes/servicios digitales** vendidos dentro de un bot o Mini App de Telegram
  **deben pagarse exclusivamente con Telegram Stars** (por cumplimiento con las políticas
  de Apple/Google de compras dentro de la app). Usar un proveedor externo (NOWPayments,
  cripto, tarjeta) para esto puede hacer que Telegram limite tu bot o te avise de
  incumplimiento.
- Los **bienes físicos** sí pueden pagarse con cualquier proveedor externo, incluido
  NOWPayments.

| Producto      | ¿Es "digital"? | Pago recomendado                          |
|---------------|-----------------|--------------------------------------------|
| SIM física     | No (bien físico) | NOWPayments — sin problema                 |
| eSIM           | Probablemente sí (activación digital dentro del bot) | Riesgo de incumplimiento si usas solo NOWPayments |

El adaptador de pagos está aislado (`src/services/nowpayments.js` + tabla `payments`),
así que añadir Stars como método alternativo para eSIM más adelante es un cambio
localizado, no una reescritura.

## Qué usa Zapier (y qué NO)

Zapier **no es el backend**. La tienda funciona igual si Zapier está desconectado.
Úselo solo para automatizaciones adicionales — notificar un pedido grande a un canal,
registrar ventas en Google Sheets, alertas por email. Nada de la lógica de saldo, stock
o pagos depende de Zapier.

## Adaptador eSIM (pendiente de proveedor real)

`src/services/esimProvider.js` genera activaciones **mock** claramente marcadas
(`mock: true`) mientras no configures `ESIM_PROVIDER_BASE_URL` / `ESIM_PROVIDER_API_KEY`,
para poder probar el flujo de compra de punta a punta sin proveedor real.

## Base de datos

SQLite vía `better-sqlite3` (archivo único, cero configuración). Aislada detrás de
`src/db/index.js`, así que migrar a PostgreSQL más adelante es sustituir esa capa, no
reescribir rutas ni servicios.

## Endpoints implementados

`POST /api/auth/telegram`, `GET /api/catalog`, `POST /api/balance`, `POST /api/orders`,
`POST /api/purchase`, `POST /api/recharge`, `POST /api/apply-coupon`,
`POST /api/webhooks/nowpayments`, `POST /api/event` y `POST /api/stock-alert`
(telemetría no crítica, siempre devuelven `ok:true`).

---

## DATOS QUE NECESITO DE TI

1. **`TELEGRAM_BOT_TOKEN`** — el token de tu bot (`@Wine_Esimbot`). No puedo extraerlo
   de Zapier: las conexiones de Zapier son OAuth y no exponen el token en texto plano.
2. **`TELEGRAM_WEBAPP_URL`** — el dominio HTTPS definitivo donde vas a desplegar este
   backend (Telegram exige HTTPS real, no `localhost` ni ngrok gratuito, para botones
   `web_app` en producción).
3. **Nombre/host del servidor donde vas a desplegar** — para darte los pasos exactos de
   despliegue (VPS, Railway, Render, etc.).
4. **`NOWPAYMENTS_API_KEY` / `NOWPAYMENTS_IPN_SECRET`** — pendiente a propósito, según
   lo acordado. El código ya está listo para cuando los proporciones.
5. **Imagen de fondo del home** — `index.html` referencia
   `photo_2026-06-09_19-58-36.jpg`, que no estaba en los archivos subidos. Sin ella el
   hero de la pantalla principal se verá sin imagen de fondo.
6. **Decisión sobre Telegram Stars para eSIM** — ver sección de cumplimiento arriba.
7. **Proveedor eSIM real** (si ya tienes uno elegido) — mientras tanto usa el modo mock
   incluido.
