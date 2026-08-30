const config = require('../config');

/**
 * Adapter boundary for your real eSIM supplier (e.g. Airalo, eSIM Access, Truphone, etc.).
 * Swap the body of provisionEsim() for real calls to ESIM_PROVIDER_BASE_URL once you have
 * a contract with a supplier — nothing else in the codebase needs to change.
 *
 * Until ESIM_PROVIDER_API_KEY is set, this returns a clearly-marked mock activation payload
 * so the purchase flow is fully testable end-to-end without a live supplier.
 */
async function provisionEsim({ orderItemId, productId, quantity }) {
  if (!config.esimProvider.apiKey || !config.esimProvider.baseUrl) {
    return {
      mock: true,
      status: 'provisioned',
      message: 'MOCK: configura ESIM_PROVIDER_BASE_URL / ESIM_PROVIDER_API_KEY para activaciones reales',
      activationCodes: Array.from({ length: quantity }, (_, i) => ({
        iccid: `MOCK-ICCID-${orderItemId}-${i + 1}`,
        qrPayload: `MOCK-QR-PAYLOAD-${orderItemId}-${i + 1}`,
      })),
    };
  }

  // --- Real integration goes here, e.g.: ---
  // const res = await fetch(`${config.esimProvider.baseUrl}/orders`, {
  //   method: 'POST',
  //   headers: { Authorization: `Bearer ${config.esimProvider.apiKey}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ productId, quantity }),
  // });
  // if (!res.ok) throw new Error('esim_provider_error');
  // return await res.json();

  throw new Error('esim_provider_not_configured');
}

module.exports = { provisionEsim };
