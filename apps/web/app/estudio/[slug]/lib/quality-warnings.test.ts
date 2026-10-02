/*
 * Paquete C (2026-10-02) — collectQualityWarnings: cruza assets subidos (con su
 * validación sharp server-side) contra los slots del canvas. Reglas blindadas:
 *   1. Solo cuentan fotos ASIGNADAS a un slot (una foto con aviso que el
 *      cliente subió pero no usó no bloquea la compra ni sale en la Vista Previa).
 *   2. Sin duplicados: una foto usada en 2 slots aparece una sola vez.
 *   3. Solo niveles con aviso (warning-soft/strong, error) — "ok"/undefined, fuera.
 *   4. Lleva mensaje + recomendación específica del servidor a la UI.
 *   5. qualityWarningsKey es una clave primitiva estable (suscripción atómica).
 */

import { describe, expect, it } from "vitest";
import { collectQualityWarnings, qualityWarningsKey } from "./quality-warnings";
import type { CanvasDataV2, StudioAsset } from "../types";

function asset(id: string, over: Partial<StudioAsset> = {}): StudioAsset {
  return { id, signedUrl: `https://x/${id}.jpg`, width: 100, height: 100, ...over };
}

function canvas(...assetIds: (string | null)[]): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: { version: 1, stage: { width: 1080, height: 1080 }, layers: [] },
    slotCount: assetIds.length,
    slots: assetIds.map((assetId, i) => ({ slotIndex: i, assetId, assetUrl: assetId ? "u" : null })),
    gridLayout: { cols: 2, rows: 2, gap: 8 },
  };
}

const WARNED = {
  validationLevel: "warning-strong" as const,
  validationMessage: "Se va a ver pixelada al imprimir.",
  validationRecommendation: "Una foto más grande va a quedar mejor al imprimir.",
  validationChecks: { resolution: false, brightness: true, blur: true },
};

describe("collectQualityWarnings", () => {
  it("solo reporta fotos con aviso ASIGNADAS a slots del diseño", () => {
    const assets = [
      asset("usada-mala", WARNED),
      asset("subida-sin-usar", WARNED),
      asset("usada-buena", { validationLevel: "ok" }),
    ];
    const warnings = collectQualityWarnings(assets, canvas("usada-mala", "usada-buena", null));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      assetId: "usada-mala",
      level: "warning-strong",
      message: "Se va a ver pixelada al imprimir.",
      recommendation: "Una foto más grande va a quedar mejor al imprimir.",
    });
  });

  it("sin duplicados: la misma foto en 2 slots aparece una sola vez", () => {
    const warnings = collectQualityWarnings(
      [asset("mala", WARNED)],
      canvas("mala", "mala", "mala"),
    );
    expect(warnings.map((w) => w.assetId)).toEqual(["mala"]);
  });

  it("warning-soft y error también cuentan; assets sin validar no", () => {
    const assets = [
      asset("soft", { validationLevel: "warning-soft" }),
      asset("err", { validationLevel: "error" }),
      asset("sin-validar"),
    ];
    const warnings = collectQualityWarnings(assets, canvas("soft", "err", "sin-validar"));
    expect(warnings.map((w) => w.level)).toEqual(["warning-soft", "error"]);
  });

  it("canvasData null o slots vacíos → lista vacía (la Vista Previa no muestra nada)", () => {
    expect(collectQualityWarnings([asset("mala", WARNED)], null)).toEqual([]);
    expect(collectQualityWarnings([asset("mala", WARNED)], canvas(null, null))).toEqual([]);
  });
});

describe("qualityWarningsKey", () => {
  it("es un string primitivo estable para el mismo contenido", () => {
    const assets = [asset("a", WARNED), asset("b", { validationLevel: "warning-soft" })];
    const c = canvas("a", "b");
    expect(qualityWarningsKey(assets, c)).toBe("a:warning-strong,b:warning-soft");
    expect(qualityWarningsKey(assets, c)).toBe(qualityWarningsKey(assets, { ...c }));
  });

  it("cambia cuando cambian los avisos (re-render de los suscritos)", () => {
    const antes = qualityWarningsKey([asset("a", WARNED)], canvas("a"));
    const despues = qualityWarningsKey([asset("a", { validationLevel: "ok" })], canvas("a"));
    expect(antes).not.toBe(despues);
    expect(despues).toBe("");
  });
});
