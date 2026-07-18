/*
 * Unit tests de la normalización de vigencia a hora Colombia (auditoría flujo de cupones · #1).
 * El bug: un cupón "válido hasta el 18" moría ~29 h antes por interpretarse en medianoche UTC.
 */

import { describe, it, expect } from "vitest";
import { cotStartOfDay, cotEndOfDay } from "./dates";

describe("cotStartOfDay / cotEndOfDay — vigencia en hora Colombia", () => {
  it("inicio de día: 'YYYY-MM-DD' → instante 05:00:00Z (00:00 COT)", () => {
    const d = new Date(cotStartOfDay("2026-07-18"));
    expect(d.toISOString()).toBe("2026-07-18T05:00:00.000Z");
  });

  it("fin de día: 'YYYY-MM-DD' → instante 04:59:59.999Z del día siguiente (23:59:59.999 COT)", () => {
    const d = new Date(cotEndOfDay("2026-07-18"));
    expect(d.toISOString()).toBe("2026-07-19T04:59:59.999Z");
  });

  it("el día completo del 18 (hora Colombia) queda dentro de la vigencia", () => {
    const from = new Date(cotStartOfDay("2026-07-18")).getTime();
    const to = new Date(cotEndOfDay("2026-07-18")).getTime();
    // 18 de julio, 3pm COT = 20:00Z → debe estar dentro.
    const middayCot = new Date("2026-07-18T20:00:00Z").getTime();
    expect(middayCot).toBeGreaterThanOrEqual(from);
    expect(middayCot).toBeLessThanOrEqual(to);
    // 7pm COT del 17 (medianoche UTC del 18) — el instante que ANTES mataba el cupón — ahora NO
    // está dentro de la vigencia del 18 (correcto: pertenece al 17).
    const oldBuggyInstant = new Date("2026-07-18T00:00:00Z").getTime();
    expect(oldBuggyInstant).toBeLessThan(from);
  });

  it("un valor que ya trae hora/offset se devuelve tal cual (no se re-ancla)", () => {
    expect(cotStartOfDay("2026-07-18T10:00:00.000Z")).toBe("2026-07-18T10:00:00.000Z");
    expect(cotEndOfDay("")).toBe(""); // vacío pasa tal cual → z.coerce.date lo rechaza aguas abajo
  });
});
