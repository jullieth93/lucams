/**
 * Tests de los schemas de cupones (A5-04 — remediación R6 2026-09-27).
 *
 * Foco: el tope PERCENT 1-100 a nivel Zod (antes value max 10_000_000 permitía
 * un cupón de 150% que al aplicarse se clampeaba en silencio al 100% — el admin
 * creía haber configurado otra cosa). El servicio valida la misma regla como
 * segunda capa (service.ts, validateCouponBusinessRules).
 *
 * Unidad pura — corre sin DB.
 */
import { describe, expect, it } from "vitest";
import { CouponCreateSchema, CouponUpdateSchema } from "./schemas";

const BASE = {
  code: "PROMO10",
  type: "PERCENT",
  value: 10,
  validFrom: new Date("2026-09-01T00:00:00Z"),
  validTo: new Date("2026-12-31T23:59:59Z"),
};

describe("CouponCreateSchema — tope PERCENT (A5-04)", () => {
  it("rechaza PERCENT > 100 con error en el campo value", () => {
    const r = CouponCreateSchema.safeParse({ ...BASE, value: 150 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("value"))).toBe(true);
    }
  });

  it("rechaza PERCENT 0 (mínimo 1)", () => {
    expect(CouponCreateSchema.safeParse({ ...BASE, value: 0 }).success).toBe(false);
  });

  it("acepta PERCENT 1 y 100 (bordes)", () => {
    expect(CouponCreateSchema.safeParse({ ...BASE, value: 1 }).success).toBe(true);
    expect(CouponCreateSchema.safeParse({ ...BASE, value: 100 }).success).toBe(true);
  });

  it("FIXED conserva el tope global (centavos COP)", () => {
    expect(CouponCreateSchema.safeParse({ ...BASE, type: "FIXED", value: 5_000_000 }).success).toBe(
      true,
    );
    expect(
      CouponCreateSchema.safeParse({ ...BASE, type: "FIXED", value: 10_000_001 }).success,
    ).toBe(false);
  });
});

describe("CouponUpdateSchema — el tope aplica también en edición", () => {
  const ID = "clxxxxxxxxxxxxxxxxxxxxxx01";

  it("rechaza type=PERCENT con value > 100", () => {
    const r = CouponUpdateSchema.safeParse({ id: ID, type: "PERCENT", value: 150 });
    expect(r.success).toBe(false);
  });

  it("tolera update parcial sin type (la regla completa la valida el servicio)", () => {
    expect(CouponUpdateSchema.safeParse({ id: ID, isActive: false }).success).toBe(true);
  });
});
