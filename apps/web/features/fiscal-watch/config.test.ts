/*
 * Unit — config de vigilancia fiscal (ADR-196).
 *
 * El test clave es el GUARDA DE DICIEMBRE: la DIAN publica la UVT del año
 * siguiente cada diciembre y este módulo la usa para medir los topes de
 * 3 500 UVT. Si llega febrero sin actualizar FISCAL_UVT_COP_BY_YEAR, CI se
 * pone rojo (enero es el mes de gracia — la exención se mide al 31-dic del
 * año anterior y la UVT nueva no afecta ese cómputo).
 */

import { describe, expect, it } from "vitest";
import {
  FISCAL_INVOICING_THRESHOLD_UVT,
  FISCAL_IVA_CARD_THRESHOLD_UVT,
  FISCAL_LEVEL_RATIOS,
  FISCAL_UVT_COP_BY_YEAR,
  fiscalLevelForRatio,
  fiscalThresholdCents,
} from "./config";

// UTC-5 fijo (sin Intl ad hoc — misma convención que lib/datetime.ts).
const COLOMBIA_OFFSET_MS = 5 * 60 * 60 * 1000;

describe("FISCAL_UVT_COP_BY_YEAR", () => {
  it("tiene la UVT del año en curso (grace: enero del año nuevo)", () => {
    const bogota = new Date(Date.now() - COLOMBIA_OFFSET_MS);
    const year = bogota.getUTCFullYear();
    const month = bogota.getUTCMonth(); // 0 = enero
    if (month === 0) return; // enero: la DIAN la publicó en diciembre, hay plazo
    expect(
      FISCAL_UVT_COP_BY_YEAR[year],
      `Falta la UVT ${year} en FISCAL_UVT_COP_BY_YEAR (features/fiscal-watch/config.ts) — la publica la DIAN cada diciembre`,
    ).toBeTypeOf("number");
  });

  it("valores oficiales conocidos: 2025 = $49.799 y 2026 = $52.374 (Res. DIAN 000238/2025)", () => {
    expect(FISCAL_UVT_COP_BY_YEAR[2025]).toBe(49_799);
    expect(FISCAL_UVT_COP_BY_YEAR[2026]).toBe(52_374);
  });

  it("los umbrales vigentes son 3 500 UVT (art. 618-1 ET y art. 437 par. 3 ET)", () => {
    expect(FISCAL_INVOICING_THRESHOLD_UVT).toBe(3_500);
    expect(FISCAL_IVA_CARD_THRESHOLD_UVT).toBe(3_500);
  });
});

describe("fiscalThresholdCents", () => {
  it("convierte UVT a centavos COP sin floats (3 500 UVT 2026 = $183.309.000)", () => {
    expect(fiscalThresholdCents(2026, 3_500)).toBe(18_330_900_000);
  });

  it("falla explícito si el año no tiene UVT configurada", () => {
    expect(() => fiscalThresholdCents(2099, 3_500)).toThrow(/UVT no configurada/);
  });
});

describe("fiscalLevelForRatio", () => {
  it("mapea los niveles en los bordes exactos 70/90/100 %", () => {
    expect(fiscalLevelForRatio(0)).toBe("ok");
    expect(fiscalLevelForRatio(FISCAL_LEVEL_RATIOS.watch - 0.001)).toBe("ok");
    expect(fiscalLevelForRatio(FISCAL_LEVEL_RATIOS.watch)).toBe("watch");
    expect(fiscalLevelForRatio(FISCAL_LEVEL_RATIOS.warning - 0.001)).toBe("watch");
    expect(fiscalLevelForRatio(FISCAL_LEVEL_RATIOS.warning)).toBe("warning");
    expect(fiscalLevelForRatio(FISCAL_LEVEL_RATIOS.critical - 0.001)).toBe("warning");
    expect(fiscalLevelForRatio(FISCAL_LEVEL_RATIOS.critical)).toBe("critical");
    expect(fiscalLevelForRatio(1.5)).toBe("critical");
  });
});
