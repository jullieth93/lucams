/*
 * Test del layout de la tarjeta calendario 7.5×10 (Ola 2A): ratio 3:4 exacto, foto 4:3 arriba,
 * y el reescalado del encuadre (photoTransform) de unidades de plantilla a la página.
 */

import { describe, expect, it } from "vitest";
import {
  CALENDAR_PAGE,
  CALENDAR_PHOTO,
  CALENDAR_PHOTO_SPLIT,
  calendarLayoutFromUnitTemplate,
  calendarPhotoFor,
  scalePhotoTransformToPage,
} from "./calendar-layout";

describe("calendar-layout — tarjeta 7.5×10 (Ola 2A)", () => {
  it("la página es ratio 3:4 exacto (7.5×10 cm)", () => {
    expect(CALENDAR_PAGE.width / CALENDAR_PAGE.height).toBeCloseTo(0.75, 6);
  });

  it("la foto ocupa la franja superior full-bleed en ratio 4:3", () => {
    expect(CALENDAR_PHOTO.x).toBe(0);
    expect(CALENDAR_PHOTO.y).toBe(0);
    expect(CALENDAR_PHOTO.width).toBe(CALENDAR_PAGE.width);
    expect(CALENDAR_PHOTO.width / CALENDAR_PHOTO.height).toBeCloseTo(4 / 3, 6);
    // La ventana de la plantilla del editor (600×450) es proporcional a la de la página.
    expect(CALENDAR_PHOTO.width / 600).toBeCloseTo(CALENDAR_PHOTO.height / 450, 6);
  });

  it("reescala offsets de unidades de plantilla (600) a página (1080) con factor 1.8", () => {
    const out = scalePhotoTransformToPage({ offsetX: 50, offsetY: -20, scale: 1.5 }, 600);
    expect(out).toEqual({ offsetX: 90, offsetY: -36, scale: 1.5 });
  });

  it("sin ancho de plantilla (o igual a la página) no toca los offsets", () => {
    const t = { offsetX: 10, offsetY: 5, scale: 1 };
    expect(scalePhotoTransformToPage(t, undefined)).toEqual(t);
    expect(scalePhotoTransformToPage(t, CALENDAR_PAGE.width)).toEqual(t);
  });

  it("null/undefined de entrada → null (mes sin encuadre manual)", () => {
    expect(scalePhotoTransformToPage(null, 600)).toBeNull();
    expect(scalePhotoTransformToPage(undefined, 600)).toBeNull();
  });
});

// Layout SPLIT (2026-08) — foto redondeada con margen (9:7), espejo exacto del photoSlot de la
// plantilla lateral del editor (30,30,540×420, r31) con el mismo factor 1.8 → encuadre 1:1.
describe("calendar-layout — layout split (lateral)", () => {
  it("la foto split es ratio 9:7 exacto y termina en y=810 como la clásica", () => {
    expect(CALENDAR_PHOTO_SPLIT.width / CALENDAR_PHOTO_SPLIT.height).toBeCloseTo(9 / 7, 6);
    expect(CALENDAR_PHOTO_SPLIT.y + CALENDAR_PHOTO_SPLIT.height).toBe(
      CALENDAR_PHOTO.y + CALENDAR_PHOTO.height,
    );
  });

  it("mapea 1:1 con la ventana de la plantilla split (factor 1.8: 54=30×1.8, etc.)", () => {
    const f = CALENDAR_PAGE.width / 600; // 1.8
    expect(CALENDAR_PHOTO_SPLIT.x).toBeCloseTo(30 * f, 6);
    expect(CALENDAR_PHOTO_SPLIT.y).toBeCloseTo(30 * f, 6);
    expect(CALENDAR_PHOTO_SPLIT.width).toBeCloseTo(540 * f, 6);
    expect(CALENDAR_PHOTO_SPLIT.height).toBeCloseTo(420 * f, 6);
    expect(CALENDAR_PHOTO_SPLIT.cornerRadius).toBeCloseTo(31 * f, 0);
  });

  it("calendarPhotoFor devuelve la región según el layout", () => {
    expect(calendarPhotoFor("split")).toBe(CALENDAR_PHOTO_SPLIT);
    expect(calendarPhotoFor("classic")).toBe(CALENDAR_PHOTO);
  });
});

describe("calendarLayoutFromUnitTemplate", () => {
  it("lee 'split' cuando la plantilla lo declara", () => {
    expect(calendarLayoutFromUnitTemplate({ calendarLayout: "split" })).toBe("split");
  });

  it("cae a 'classic' con 'classic' explícito, sin campo, undefined o null", () => {
    expect(calendarLayoutFromUnitTemplate({ calendarLayout: "classic" })).toBe("classic");
    expect(calendarLayoutFromUnitTemplate({})).toBe("classic");
    expect(calendarLayoutFromUnitTemplate(undefined)).toBe("classic");
    expect(calendarLayoutFromUnitTemplate(null)).toBe("classic");
  });

  it("cae a 'classic' con basura (números, strings ajenos, no-objetos)", () => {
    expect(calendarLayoutFromUnitTemplate({ calendarLayout: 42 })).toBe("classic");
    expect(calendarLayoutFromUnitTemplate({ calendarLayout: "SPLIT" })).toBe("classic");
    expect(calendarLayoutFromUnitTemplate({ calendarLayout: true })).toBe("classic");
    expect(calendarLayoutFromUnitTemplate("split")).toBe("classic");
    expect(calendarLayoutFromUnitTemplate(7)).toBe("classic");
  });
});
