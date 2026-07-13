import { describe, it, expect } from "vitest";
import { warrantyWindowEnd, isWithinWarranty } from "./service";

describe("garantía — ventana (Ley 1480)", () => {
  const delivered = new Date("2026-01-15T00:00:00Z");

  it("warrantyWindowEnd suma warrantyMonths desde la entrega", () => {
    const end12 = warrantyWindowEnd(delivered, 12);
    const days = (end12.getTime() - delivered.getTime()) / (1000 * 60 * 60 * 24);
    // ~1 año (365 o 366), tolerancia por meses de distinto largo.
    expect(days).toBeGreaterThanOrEqual(364);
    expect(days).toBeLessThanOrEqual(367);
    // el fin siempre es posterior a la entrega
    expect(warrantyWindowEnd(delivered, 6).getTime()).toBeGreaterThan(delivered.getTime());
  });

  it("isWithinWarranty: dentro de la ventana → true", () => {
    expect(isWithinWarranty(delivered, 12, new Date("2026-06-01T00:00:00Z"))).toBe(true);
    expect(isWithinWarranty(delivered, 12, new Date("2027-01-10T00:00:00Z"))).toBe(true);
  });

  it("isWithinWarranty: fuera de la ventana → false", () => {
    expect(isWithinWarranty(delivered, 12, new Date("2027-03-01T00:00:00Z"))).toBe(false);
    expect(isWithinWarranty(delivered, 6, new Date("2026-09-01T00:00:00Z"))).toBe(false);
  });

  it("una garantía más corta vence antes", () => {
    expect(warrantyWindowEnd(delivered, 6).getTime()).toBeLessThan(
      warrantyWindowEnd(delivered, 12).getTime(),
    );
  });
});
