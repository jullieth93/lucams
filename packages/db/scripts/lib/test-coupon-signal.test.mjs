/*
 * Test de la señal objetiva de cupón de test (lib/test-coupon-signal.mjs) —
 * corre con `node --test`. Lo crítico: el regex debe atrapar TODAS las
 * familias de fixtures reales observadas en los dumps (tmp/backups/*.sql) y
 * NO atrapar jamás un cupón de campaña real.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTestCouponCode } from "./test-coupon-signal.mjs";

describe("isTestCouponCode — familias de test observadas en dumps reales", () => {
  it("atrapa CAT<época>-* (fixtures de catálogo/checkout)", () => {
    assert.equal(isTestCouponCode("CAT1785538260462586828-PUBLIC10"), true);
    assert.equal(isTestCouponCode("CAT1784907299055339301-INACTIVE"), true);
    assert.equal(isTestCouponCode("CAT1785365629769685070-EXPIRED"), true);
  });

  it("atrapa SAGA<época>-CPN/-EXH (fixtures de la saga)", () => {
    assert.equal(isTestCouponCode("SAGA1785288158155736093-CPN"), true);
    assert.equal(isTestCouponCode("SAGA1784255062641941246-EXH"), true);
    assert.equal(isTestCouponCode("SAGA17846842512107201-CPN"), true);
  });

  it("atrapa ord<época>-CUP-* (fixtures de checkout, minúscula)", () => {
    assert.equal(isTestCouponCode("ord1785379269856412661-CUP-f3zjo5"), true);
    assert.equal(isTestCouponCode("ord178431224525866556-CUP-a5wxxu"), true);
  });

  it("épocas cortas NO bastan (se exigen ≥13 dígitos tras el prefijo)", () => {
    assert.equal(isTestCouponCode("CAT123-PUBLIC10"), false);
    assert.equal(isTestCouponCode("SAGA20260912-CPN"), false);
    assert.equal(isTestCouponCode("ord123456-CUP-x"), false);
  });
});

describe("isTestCouponCode — cupones reales QUEDAN FUERA (nunca se purgan)", () => {
  it("LUCAMS_10 y la familia LUC*** no matchean", () => {
    assert.equal(isTestCouponCode("LUCAMS_10"), false);
    assert.equal(isTestCouponCode("LUC10"), false);
    assert.equal(isTestCouponCode("LUCAMS1785538260462-10"), false);
  });

  it("códigos de campaña típicos no matchean", () => {
    assert.equal(isTestCouponCode("BIENVENIDA10"), false);
    assert.equal(isTestCouponCode("NAVIDAD2026"), false);
    assert.equal(isTestCouponCode("DIAMADRE-15"), false);
    // Prefijo parecido pero sin la época de suite:
    assert.equal(isTestCouponCode("ORDENES-MAYO"), false);
    assert.equal(isTestCouponCode("CATALOGO-2026"), false);
    assert.equal(isTestCouponCode("SAGA-CLIENTE-VIP"), false);
  });
});
