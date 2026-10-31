/*
 * LUC-SEC-006 (auditoría 2026-10-30) — ratchet del límite global de Server
 * Actions. El 50 MB cubría un flujo muerto (los PNG de producción van por
 * tickets firmados directo a Storage desde ADR-081). El límite queda en 32 MB
 * con el inventario por action documentado en next.config.ts (la excepción que
 * lo fija es el upload de masters de galería, admin-only: 2×15 MB).
 *
 * Este test existe para que SUBIR el límite exija editar la prueba y la
 * justificación — no un cambio silencioso de config.
 */

import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config — bodySizeLimit de Server Actions (LUC-SEC-006)", () => {
  it("el límite global es exactamente el documentado (32mb)", () => {
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;
    expect(limit).toBe("32mb");
  });

  it("nunca vuelve al 50mb del flujo muerto", () => {
    const limit = String(nextConfig.experimental?.serverActions?.bodySizeLimit ?? "");
    expect(limit).not.toBe("50mb");
  });
});
