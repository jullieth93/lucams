/*
 * Test #3 (certificación Bloque A) — getWompiExpectedWebhookEnv deriva de
 * WOMPI_ENV, NO de NODE_ENV. Regresión del bug donde Vercel preview
 * (NODE_ENV=production + WOMPI_ENV=sandbox) rechazaba webhooks sandbox con 401.
 */

import { afterEach, describe, expect, it } from "vitest";
import { getWompiExpectedWebhookEnv } from "./wompi";

// Nota: el helper deriva SOLO de WOMPI_ENV; NODE_ENV es irrelevante por diseño
// (ese es justamente el bug #3 que arreglamos). vitest corre con NODE_ENV=test
// y aun así el resultado depende solo de WOMPI_ENV — lo que estos tests prueban.
describe("getWompiExpectedWebhookEnv (#3 certificación Bloque A)", () => {
  const original = process.env.WOMPI_ENV;

  afterEach(() => {
    if (original === undefined) delete process.env.WOMPI_ENV;
    else process.env.WOMPI_ENV = original;
  });

  it("WOMPI_ENV=sandbox → 'test' (aunque NODE_ENV=production)", () => {
    process.env.WOMPI_ENV = "sandbox";
    expect(getWompiExpectedWebhookEnv()).toBe("test");
  });

  it("WOMPI_ENV=production → 'prod'", () => {
    process.env.WOMPI_ENV = "production";
    expect(getWompiExpectedWebhookEnv()).toBe("prod");
  });

  it("WOMPI_ENV ausente → 'test' (default seguro sandbox)", () => {
    delete process.env.WOMPI_ENV;
    expect(getWompiExpectedWebhookEnv()).toBe("test");
  });

  it("tolera comentario inline en el valor (ej. 'sandbox  # nota')", () => {
    process.env.WOMPI_ENV = "sandbox  # configurado por Lucy";
    expect(getWompiExpectedWebhookEnv()).toBe("test");
  });

  it("WOMPI_ENV con mayúsculas → normaliza", () => {
    process.env.WOMPI_ENV = "PRODUCTION";
    expect(getWompiExpectedWebhookEnv()).toBe("prod");
  });
});
