/*
 * Señal OBJETIVA de cupón de test (N-05, 2026-09-12) — la usa
 * purge-test-coupons.mjs y la testea lib/test-coupon-signal.test.mjs.
 *
 * Regex exacto:
 *   /^(?:CAT[0-9]{13,}-|SAGA[0-9]{13,}-|ord[0-9]{13,}-)/i
 *
 * Tres familias, todas con época de ≥13 dígitos (Date.now() del run de la
 * suite — la señal robusta; ningún cupón real la lleva):
 *   - CAT<época>-…   fixtures de suites de catálogo/checkout
 *                    (ej. CAT1785538260462586828-PUBLIC10)
 *   - SAGA<época>-…  fixtures de la saga de órdenes
 *                    (ej. SAGA1785288158155736093-CPN, sufijos -CPN/-EXH)
 *   - ord<época>-…   fixtures de checkout
 *                    (ej. ord1785379269856412661-CUP-f3zjo5)
 *
 * EXCLUYE explícitamente cualquier código que no matchee esa señal: los
 * cupones reales (LUCAMS_10, LUC*** y cualquier código de campaña) quedan
 * FUERA del alcance — se deciden aparte, nunca en una purga de test.
 */

export const TEST_COUPON_RE = /^(?:CAT[0-9]{13,}-|SAGA[0-9]{13,}-|ord[0-9]{13,}-)/i;

/** @param {string} code */
export const isTestCouponCode = (code) => TEST_COUPON_RE.test(code);
