// @vitest-environment jsdom

/*
 * Tests jsdom de calendar-card-preview — resolución de las fuentes de marca
 * (nombres hasheados de next/font vía CSS vars) y carga anti-FOUT de las caras
 * usadas por drawCalendarPage, incluida la del TÍTULO según la key del selector
 * calendarFont (Lucy 2026-09-07).
 *
 * jsdom no implementa document.fonts → se define/remueve por test para cubrir
 * las ramas de carga (éxito / rechazo tolerado / ausencia de FontFaceSet).
 * Corre en CI sin Supabase.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureBrandCanvasFontsLoaded,
  ensureCalendarTitleFontLoaded,
  firstFontFamily,
  resolveBrandCanvasFonts,
  resolveCalendarTitleFont,
} from "./calendar-card-preview";

function setVar(name: string, value: string | null) {
  if (value === null) document.documentElement.style.removeProperty(name);
  else document.documentElement.style.setProperty(name, value);
}

function setFonts(impl: unknown) {
  Object.defineProperty(document, "fonts", { value: impl, configurable: true });
}

afterEach(() => {
  setVar("--font-fredoka", null);
  setVar("--font-inter", null);
  setVar("--font-caveat", null);
  delete (document as { fonts?: unknown }).fonts;
  vi.restoreAllMocks();
});

describe("resolveCalendarTitleFont — key del selector → familia real (jsdom)", () => {
  it("resuelve cada key vía su CSS var", () => {
    setVar("--font-fredoka", '"__Fredoka_a1", sans-serif');
    setVar("--font-inter", '"__Inter_b2", sans-serif');
    setVar("--font-caveat", "__Caveat_c3");
    expect(resolveCalendarTitleFont("fredoka")).toBe("__Fredoka_a1");
    expect(resolveCalendarTitleFont("inter")).toBe("__Inter_b2");
    expect(resolveCalendarTitleFont("caveat")).toBe("__Caveat_c3");
  });

  it("var ausente → null (el caller cae al literal registrado por el server)", () => {
    expect(resolveCalendarTitleFont("caveat")).toBeNull();
  });

  it("key desconocida cae a la var de fredoka (defensivo, nunca un string libre)", () => {
    setVar("--font-fredoka", '"__Fredoka_a1"');
    expect(resolveCalendarTitleFont("comic-sans" as never)).toBe("__Fredoka_a1");
  });
});

describe("ensureCalendarTitleFontLoaded — carga anti-FOUT del título", () => {
  it("sin document.fonts (jsdom) devuelve la familia resuelta (degradación)", async () => {
    setVar("--font-inter", '"__Inter_b2"');
    await expect(ensureCalendarTitleFontLoaded("inter")).resolves.toBe("__Inter_b2");
  });

  it("con fonts: pide las caras 700 y 500 y espera document.fonts.ready", async () => {
    setVar("--font-caveat", '"__Caveat_c3"');
    const load = vi.fn().mockResolvedValue(undefined);
    const ready = Promise.resolve();
    setFonts({ load, ready });
    await expect(ensureCalendarTitleFontLoaded("caveat")).resolves.toBe("__Caveat_c3");
    expect(load).toHaveBeenCalledWith("700 62px __Caveat_c3");
    expect(load).toHaveBeenCalledWith("500 62px __Caveat_c3");
  });

  it("si la carga falla, devuelve la familia igual (el dibujo degrada al fallback)", async () => {
    setVar("--font-fredoka", '"__Fredoka_a1"');
    const load = vi.fn().mockRejectedValue(new Error("sin cara 500"));
    setFonts({ load, ready: Promise.resolve() });
    await expect(ensureCalendarTitleFontLoaded("fredoka")).resolves.toBe("__Fredoka_a1");
  });

  it("familia no resoluble + fonts presentes → null sin tocar document.fonts", async () => {
    const load = vi.fn();
    setFonts({ load, ready: Promise.resolve() });
    await expect(ensureCalendarTitleFontLoaded("caveat")).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});

describe("resolveBrandCanvasFonts / ensureBrandCanvasFontsLoaded", () => {
  it("ambas vars → pares title/body resueltos", () => {
    setVar("--font-fredoka", '"__Fredoka_a1"');
    setVar("--font-inter", '"__Inter_b2"');
    expect(resolveBrandCanvasFonts()).toEqual({ title: "__Fredoka_a1", body: "__Inter_b2" });
  });

  it("una var ausente → null (fallback a literales en el caller)", () => {
    setVar("--font-fredoka", '"__Fredoka_a1"');
    expect(resolveBrandCanvasFonts()).toBeNull();
  });

  it("ensureBrand: sin fonts devuelve las familias; con fonts carga title 700 + body 400/600/700", async () => {
    setVar("--font-fredoka", '"__Fredoka_a1"');
    setVar("--font-inter", '"__Inter_b2"');
    await expect(ensureBrandCanvasFontsLoaded()).resolves.toEqual({
      title: "__Fredoka_a1",
      body: "__Inter_b2",
    });

    const load = vi.fn().mockResolvedValue(undefined);
    setFonts({ load, ready: Promise.resolve() });
    await expect(ensureBrandCanvasFontsLoaded()).resolves.toEqual({
      title: "__Fredoka_a1",
      body: "__Inter_b2",
    });
    const calls = load.mock.calls.map((c) => c[0]);
    expect(calls).toContain("700 62px __Fredoka_a1");
    expect(calls).toContain("400 30px __Inter_b2");
    expect(calls).toContain("600 30px __Inter_b2");
    expect(calls).toContain("700 30px __Inter_b2");
  });

  it("ensureBrand: rechazo de una cara tolerado → devuelve las familias igual", async () => {
    setVar("--font-fredoka", '"__Fredoka_a1"');
    setVar("--font-inter", '"__Inter_b2"');
    const load = vi.fn().mockRejectedValue(new Error("FOUT imposible de evitar"));
    setFonts({ load, ready: Promise.resolve() });
    await expect(ensureBrandCanvasFontsLoaded()).resolves.toEqual({
      title: "__Fredoka_a1",
      body: "__Inter_b2",
    });
  });
});

describe("firstFontFamily — casos borde extra", () => {
  it("familia entre comillas sin fallback → se descomilla", () => {
    expect(firstFontFamily('"__Fredoka_solo"')).toBe("__Fredoka_solo");
  });
});
