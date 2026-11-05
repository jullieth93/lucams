import { describe, expect, it } from "vitest";
import {
  addColombianBusinessDaysEndOfDay,
  computeRetractSlaDueAt,
  computeSupportTicketSlaDueAt,
  evaluateSlaStatus,
  getColombianHolidaysForYear,
  isColombianBusinessDay,
} from "./colombian-sla";

describe("colombian-sla — calendario festivo CO (Ley Emiliani) y semáforos legales", () => {
  it("calcula festivos fijos, Semana Santa y traslados Ley Emiliani para 2026", () => {
    const holidays2026 = getColombianHolidaysForYear(2026);
    // Fijos
    expect(holidays2026.has("2026-01-01")).toBe(true);
    expect(holidays2026.has("2026-07-20")).toBe(true);
    expect(holidays2026.has("2026-12-25")).toBe(true);
    // Semana Santa 2026 (Pascua = 5 abril 2026 -> Jueves 2 y Viernes 3 abril)
    expect(holidays2026.has("2026-04-02")).toBe(true);
    expect(holidays2026.has("2026-04-03")).toBe(true);
    // Reyes Magos 2026: 6 ene cae martes -> se traslada al lunes 12 ene 2026
    expect(holidays2026.has("2026-01-06")).toBe(false);
    expect(holidays2026.has("2026-01-12")).toBe(true);
  });

  it("salta fines de semana y lunes festivo al sumar días hábiles en hora de Colombia (UTC-5)", () => {
    // Viernes 9 de enero de 2026 a las 14:00 COT (19:00 UTC)
    // Sáb 10 (no hábil), Dom 11 (no hábil), Lun 12 ene (festivo Reyes Emiliani) -> 1 día hábil cae Mar 13 ene 23:59:59.999 COT
    const fridayCot = new Date("2026-01-09T19:00:00.000Z");
    expect(isColombianBusinessDay(new Date("2026-01-12T15:00:00.000Z"))).toBe(false);

    const due = addColombianBusinessDaysEndOfDay(fridayCot, 1);
    // 2026-01-13 23:59:59.999 COT == 2026-01-14 04:59:59.999 UTC
    expect(due.toISOString()).toBe("2026-01-14T04:59:59.999Z");
  });

  it("calcula 15 días calendario para retracto (Ley 2439) y evalúa estados ON_TIME / DUE_SOON / OVERDUE / MET", () => {
    const start = new Date("2026-05-01T15:00:00.000Z"); // 10:00 COT del 1 mayo
    const retractDue = computeRetractSlaDueAt(start);
    // 1 mayo + 15 días calendario = 16 mayo 23:59:59.999 COT = 2026-05-17T04:59:59.999Z
    expect(retractDue.toISOString()).toBe("2026-05-17T04:59:59.999Z");

    const supportDue = computeSupportTicketSlaDueAt(start, "MI_PEDIDO");
    expect(supportDue.getTime()).toBeGreaterThan(retractDue.getTime());

    expect(evaluateSlaStatus(retractDue, { now: new Date("2026-05-05T15:00:00.000Z") }).state).toBe(
      "ON_TIME",
    );
    expect(evaluateSlaStatus(retractDue, { now: new Date("2026-05-16T12:00:00.000Z") }).state).toBe(
      "DUE_SOON",
    );
    expect(evaluateSlaStatus(retractDue, { now: new Date("2026-05-18T12:00:00.000Z") }).state).toBe(
      "OVERDUE",
    );
    expect(
      evaluateSlaStatus(retractDue, {
        now: new Date("2026-05-20T12:00:00.000Z"),
        isClosed: true,
      }).state,
    ).toBe("MET");
  });
});
