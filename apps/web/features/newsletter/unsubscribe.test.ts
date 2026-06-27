/*
 * Test del token de unsubscribe (P0-005, Bloque B).
 *
 * El token verifica que quien tiene el link es el dueño del email (evita que
 * cualquiera dé de baja a otro con su email crudo). Pure crypto — sin DB.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";

describe("unsubscribe token (P0-005)", () => {
  const original = process.env.CSRF_SECRET;
  beforeEach(() => {
    process.env.CSRF_SECRET = "test-secret-fijo";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CSRF_SECRET;
    else process.env.CSRF_SECRET = original;
  });

  it("computeUnsubscribeToken es determinístico para el mismo email", () => {
    const a = computeUnsubscribeToken("lucy@example.com");
    const b = computeUnsubscribeToken("lucy@example.com");
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it("normaliza email (trim + lowercase) antes de hashear", () => {
    expect(computeUnsubscribeToken("  Lucy@Example.com ")).toBe(
      computeUnsubscribeToken("lucy@example.com"),
    );
  });

  it("emails distintos producen tokens distintos", () => {
    expect(computeUnsubscribeToken("a@example.com")).not.toBe(
      computeUnsubscribeToken("b@example.com"),
    );
  });

  it("verifyUnsubscribeToken acepta el token correcto", () => {
    const email = "cliente@example.com";
    const token = computeUnsubscribeToken(email);
    expect(verifyUnsubscribeToken(email, token)).toBe(true);
  });

  it("verifyUnsubscribeToken acepta aunque el email venga con mayúsculas/espacios", () => {
    const token = computeUnsubscribeToken("cliente@example.com");
    expect(verifyUnsubscribeToken("  CLIENTE@example.com ", token)).toBe(true);
  });

  it("rechaza un token incorrecto (no puedes dar de baja a otro con su email crudo)", () => {
    const victima = "victima@example.com";
    const tokenDeOtro = computeUnsubscribeToken("atacante@example.com");
    expect(verifyUnsubscribeToken(victima, tokenDeOtro)).toBe(false);
  });

  it("rechaza token vacío o de largo distinto sin lanzar", () => {
    expect(verifyUnsubscribeToken("x@example.com", "")).toBe(false);
    expect(verifyUnsubscribeToken("x@example.com", "abc")).toBe(false);
  });
});
