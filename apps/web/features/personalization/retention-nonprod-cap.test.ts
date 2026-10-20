/*
 * Tope de retención no-productivo (auditoría 2026-10-20): STG acumuló 920 MB de renders
 * 300-DPI de pruebas en 10 días porque los plazos de negocio (30/90 días, pensados para
 * PRD) retienen meses datos de test sin finalidad. capRetentionDaysNonProd acota a 14 días
 * SOLO cuando VERCEL_ENV existe y ≠ "production" (preview/staging en Vercel); en PRD y en
 * local (VERCEL_ENV ausente — un script local puede apuntar a la BD de PRD) no toca nada.
 */

import { afterEach, describe, expect, it } from "vitest";

import { capRetentionDaysNonProd, RETENTION_NONPROD_MAX_DAYS } from "./retention-service";

describe("capRetentionDaysNonProd — tope de retención en ambientes no productivos", () => {
  const ORIGINAL = process.env.VERCEL_ENV;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = ORIGINAL;
  });

  it("VERCEL_ENV=production → el plazo de negocio NO se toca", () => {
    process.env.VERCEL_ENV = "production";
    expect(capRetentionDaysNonProd(90)).toBe(90);
    expect(capRetentionDaysNonProd(7)).toBe(7);
  });

  it("VERCEL_ENV ausente (local/scripts) → NO aplica el tope", () => {
    delete process.env.VERCEL_ENV;
    expect(capRetentionDaysNonProd(90)).toBe(90);
  });

  it("VERCEL_ENV=preview (STG) → acota al techo y respeta plazos ya más cortos", () => {
    process.env.VERCEL_ENV = "preview";
    expect(capRetentionDaysNonProd(90)).toBe(RETENTION_NONPROD_MAX_DAYS);
    expect(capRetentionDaysNonProd(30)).toBe(RETENTION_NONPROD_MAX_DAYS);
    expect(capRetentionDaysNonProd(7)).toBe(7);
  });

  it("VERCEL_ENV=development → también acota (build local de Vercel)", () => {
    process.env.VERCEL_ENV = "development";
    expect(capRetentionDaysNonProd(90)).toBe(RETENTION_NONPROD_MAX_DAYS);
  });
});
