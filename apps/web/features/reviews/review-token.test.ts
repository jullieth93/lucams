/*
 * Token de reseña (review-token.ts): firma HMAC, expiración y anti-tampering.
 * CSRF_SECRET se fija por test para no depender del .env.local del entorno.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createReviewToken, verifyReviewToken, REVIEW_TOKEN_TTL_MS } from "./review-token";

const SECRET = "test-csrf-secret-0123456789abcdef";
const NOW = 1_800_000_000_000; // fijo para tests deterministas

const INPUT = {
  orderId: "corder000000000000000001",
  orderNumber: "LCM-2026-1042",
  email: "camila@example.com",
  productIds: ["cprod0000000000000000001", "cprod0000000000000000002"],
};

beforeEach(() => {
  process.env.CSRF_SECRET = SECRET;
});

describe("createReviewToken / verifyReviewToken", () => {
  it("roundtrip: un token recién creado verifica y conserva el payload", () => {
    const token = createReviewToken(INPUT, NOW);
    const payload = verifyReviewToken(token, NOW + 1000);
    expect(payload).toEqual({ ...INPUT, exp: NOW + REVIEW_TOKEN_TTL_MS });
  });

  it("expira exactamente en REVIEW_TOKEN_TTL_MS (30 días)", () => {
    const token = createReviewToken(INPUT, NOW);
    expect(verifyReviewToken(token, NOW + REVIEW_TOKEN_TTL_MS - 1)).not.toBeNull();
    expect(verifyReviewToken(token, NOW + REVIEW_TOKEN_TTL_MS)).toBeNull();
  });

  it("payload manipulado (misma firma vieja) → null", () => {
    const token = createReviewToken(INPUT, NOW);
    const [body, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    decoded.productIds.push("cprod9999999999999999999"); // añadir producto no comprado
    const forgedBody = Buffer.from(JSON.stringify(decoded), "utf-8").toString("base64url");
    expect(verifyReviewToken(`${forgedBody}.${signature}`, NOW)).toBeNull();
  });

  it("firma truncada o cambiada → null", () => {
    const token = createReviewToken(INPUT, NOW);
    const [body, signature] = token.split(".");
    expect(verifyReviewToken(`${body}.${signature.slice(0, -2)}aa`, NOW)).toBeNull();
    expect(verifyReviewToken(`${body}.${signature.slice(0, 10)}`, NOW)).toBeNull();
  });

  it("token firmado con OTRO secreto → null", () => {
    const token = createReviewToken(INPUT, NOW);
    process.env.CSRF_SECRET = "otro-secreto-distinto-al-de-emision";
    expect(verifyReviewToken(token, NOW)).toBeNull();
  });

  it("basura, vacío o sin firma → null", () => {
    expect(verifyReviewToken("", NOW)).toBeNull();
    expect(verifyReviewToken("sin-punto", NOW)).toBeNull();
    expect(verifyReviewToken("@@@.@@@", NOW)).toBeNull();
    // JSON válido firmado pero con shape incorrecto no se puede forjar sin
    // secreto; el shape inválido se cubre vía payload well-formed malicioso:
    const badShape = Buffer.from(JSON.stringify({ foo: "bar" }), "utf-8").toString("base64url");
    expect(verifyReviewToken(`${badShape}.cualquierfirma`, NOW)).toBeNull();
  });

  it("sin CSRF_SECRET la emisión lanza (error de configuración ruidoso)", () => {
    delete process.env.CSRF_SECRET;
    expect(() => createReviewToken(INPUT, NOW)).toThrow(/CSRF_SECRET/);
  });
});
