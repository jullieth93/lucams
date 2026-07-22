/*
 * Test del layout de la tarjeta calendario 7.5×10 (Ola 2A): ratio 3:4 exacto, foto 4:3 arriba,
 * y el reescalado del encuadre (photoTransform) de unidades de plantilla a la página.
 */

import { describe, expect, it } from "vitest";
import { CALENDAR_PAGE, CALENDAR_PHOTO, scalePhotoTransformToPage } from "./calendar-layout";

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
