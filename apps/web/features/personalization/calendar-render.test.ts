/*
 * Test del compositor de páginas de mes del calendario (ADR-063 CAL1). Verifica que produce N
 * PNGs válidos, uno por slot, con la foto del cliente + mes/año/grilla horneados. La correctitud
 * VISUAL (título, encabezados, grilla, foto) se verificó inspeccionando los PNGs; acá lockeamos que
 * el pipeline no se rompa (buffers no vacíos, conteo correcto, no lanza con/sin foto).
 */

import { describe, it, expect } from "vitest";
import {
  calendarFontFamilyForKey,
  renderCalendarMonthPagesCanvas,
} from "./production-render-canvas";

async function solidPhoto(): Promise<Buffer> {
  const mod = await import("@napi-rs/canvas");
  const c = mod.createCanvas(600, 600);
  const cx = c.getContext("2d");
  cx.fillStyle = "#5DD9D1";
  cx.fillRect(0, 0, 600, 600);
  return c.toBuffer("image/png");
}

// Un PNG es un buffer que empieza con la firma \x89PNG.
function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

describe("renderCalendarMonthPagesCanvas", () => {
  it("produce un PNG por slot, con foto", async () => {
    const photo = await solidPhoto();
    const bufs = await renderCalendarMonthPagesCanvas({
      slots: [
        { slotIndex: 0, assetId: "p", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } },
        { slotIndex: 1, assetId: "p", photoTransform: { offsetX: 0, offsetY: 0, scale: 1.2 } },
      ],
      loadAsset: async () => photo,
      year: 2027,
      startMonth: 0,
    });
    expect(bufs).toHaveLength(2);
    for (const b of bufs) {
      expect(isPng(b)).toBe(true);
      expect(b.length).toBeGreaterThan(5000);
    }
  });

  it("no lanza cuando un mes no tiene foto (dibuja recuadro)", async () => {
    const bufs = await renderCalendarMonthPagesCanvas({
      slots: [{ slotIndex: 0, assetId: null }],
      loadAsset: async () => null,
      year: 2028,
      startMonth: 5, // Junio
    });
    expect(bufs).toHaveLength(1);
    expect(isPng(bufs[0])).toBe(true);
  });

  it("respeta startMonth y da la vuelta al año (módulo 12)", async () => {
    // startMonth=11 (Dic) + slot 1 → Enero (mes 0). No debe lanzar.
    const photo = await solidPhoto();
    const bufs = await renderCalendarMonthPagesCanvas({
      slots: [
        { slotIndex: 0, assetId: "p" },
        { slotIndex: 1, assetId: "p" },
      ],
      loadAsset: async () => photo,
      year: 2027,
      startMonth: 11,
    });
    expect(bufs).toHaveLength(2);
  });

  // Layout SPLIT (2026-08) — la variante lateral (foto redondeada con margen + banda en 2
  // columnas) compone con el MISMO pipeline; acá lockeamos que produce PNGs válidos.
  it("layout 'split': produce PNGs válidos, con y sin foto", async () => {
    const photo = await solidPhoto();
    const bufs = await renderCalendarMonthPagesCanvas({
      slots: [
        { slotIndex: 0, assetId: "p", photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } },
        { slotIndex: 1, assetId: null },
      ],
      loadAsset: async () => photo,
      year: 2027,
      startMonth: 0,
      layout: "split",
    });
    expect(bufs).toHaveLength(2);
    for (const b of bufs) {
      expect(isPng(b)).toBe(true);
      expect(b.length).toBeGreaterThan(5000);
    }
  });
});

describe("calendarFontFamilyForKey — lista blanca del título/mes (Lucy 2026-09-07)", () => {
  it("mapea las claves curadas a las familias registradas", () => {
    expect(calendarFontFamilyForKey("fredoka")).toBe("Fredoka");
    expect(calendarFontFamilyForKey("inter")).toBe("Inter");
    expect(calendarFontFamilyForKey("caveat")).toBe("Caveat");
  });

  it("ausente o desconocido → Fredoka (retrocompatible), NUNCA un string libre", () => {
    expect(calendarFontFamilyForKey(undefined)).toBe("Fredoka");
    expect(calendarFontFamilyForKey(null)).toBe("Fredoka");
    expect(calendarFontFamilyForKey("")).toBe("Fredoka");
    expect(calendarFontFamilyForKey("Caveat")).toBe("Fredoka"); // la FAMILIA no es clave válida
    expect(calendarFontFamilyForKey("Comic Sans MS")).toBe("Fredoka");
    expect(calendarFontFamilyForKey("url(https://evil.example/x.ttf)")).toBe("Fredoka");
    expect(calendarFontFamilyForKey({ family: "Fredoka" })).toBe("Fredoka");
  });
});

describe("renderCalendarMonthPagesCanvas — calendarFont", () => {
  it("caveat cambia el título: el PNG difiere del de fredoka", async () => {
    const photo = await solidPhoto();
    const renderOne = (calendarFont: "fredoka" | "caveat") =>
      renderCalendarMonthPagesCanvas({
        slots: [{ slotIndex: 0, assetId: "p" }],
        loadAsset: async () => photo,
        year: 2027,
        startMonth: 0,
        calendarFont,
      });
    const [classic] = await renderOne("fredoka");
    const [script] = await renderOne("caveat");
    expect(isPng(classic!)).toBe(true);
    expect(isPng(script!)).toBe(true);
    // Mismo layout/foto/año: si la tipografía del título cambió, los píxeles difieren.
    expect(script!.equals(classic!)).toBe(false);
  });

  it("una clave inválida degrada a fredoka en vez de romper el render", async () => {
    const photo = await solidPhoto();
    const bufs = await renderCalendarMonthPagesCanvas({
      slots: [{ slotIndex: 0, assetId: "p" }],
      loadAsset: async () => photo,
      year: 2027,
      startMonth: 0,
      calendarFont: "Papyrus",
    });
    expect(bufs).toHaveLength(1);
    expect(isPng(bufs[0])).toBe(true);
  });
});
