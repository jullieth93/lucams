/*
 * Unit — helpers puros de visibilidad de plantillas (N-08, 2026-09-11).
 *
 * Son la regla COMPARTIDA PDP (lib/catalog.listTemplatesByProduct) ↔ Estudio
 * (service.listTemplatesForKind): si acá cambia la tolerancia o la preferencia,
 * cambian los dos lados a la vez (esa es justamente la razón de extraerlos).
 */

import { describe, expect, it } from "vitest";
import {
  filterTemplatesByAspectRatio,
  parseAspectRatio,
  preferProductSpecific,
  templateAspectRatio,
} from "./template-visibility";

describe("parseAspectRatio", () => {
  it("parsea formatos con ':', '×' y 'x'", () => {
    expect(parseAspectRatio("1:1")).toBe(1);
    expect(parseAspectRatio("4:5")).toBeCloseTo(0.8);
    expect(parseAspectRatio("3×4")).toBeCloseTo(0.75);
    expect(parseAspectRatio("16x9")).toBeCloseTo(16 / 9);
    expect(parseAspectRatio(" 7 : 9 ")).toBeCloseTo(7 / 9);
  });

  it("rechaza strings sin formato o con alto 0", () => {
    expect(parseAspectRatio("")).toBeNull();
    expect(parseAspectRatio("cuadrado")).toBeNull();
    expect(parseAspectRatio("1:0")).toBeNull();
  });
});

describe("templateAspectRatio", () => {
  it("lee width/height del stage", () => {
    expect(templateAspectRatio({ stage: { width: 1080, height: 1350 } })).toBeCloseTo(0.8);
  });

  it("devuelve null con canvasData faltante o stage no numérico", () => {
    expect(templateAspectRatio(null)).toBeNull();
    expect(templateAspectRatio({})).toBeNull();
    expect(templateAspectRatio({ stage: { width: "1080", height: 1080 } })).toBeNull();
    expect(templateAspectRatio({ stage: { width: 1080, height: 0 } })).toBeNull();
  });
});

describe("filterTemplatesByAspectRatio", () => {
  const t = (w: number, h: number) => ({ canvasData: { stage: { width: w, height: h } } });

  it("filtra por aspect con tolerancia 0.05", () => {
    const list = [t(1080, 1080), t(1080, 1350), t(1090, 1080)];
    const out = filterTemplatesByAspectRatio(list, "1:1");
    expect(out).toHaveLength(2); // 1:1 exacto y ~1.009 (dentro de tolerancia)
    expect(out).not.toContain(list[1]);
  });

  it("sin aspect del producto (o no parseable) no filtra nada", () => {
    const list = [t(1080, 1080), t(1080, 1350)];
    expect(filterTemplatesByAspectRatio(list, undefined)).toHaveLength(2);
    expect(filterTemplatesByAspectRatio(list, "no-aspect")).toHaveLength(2);
  });

  it("plantilla sin stage parseable se permite (la curaduría manda)", () => {
    const sinStage = { canvasData: {} };
    const out = filterTemplatesByAspectRatio([sinStage], "1:1");
    expect(out).toHaveLength(1);
  });
});

describe("preferProductSpecific", () => {
  it("con específicas del producto devuelve SOLO esas (no mezcla globales)", () => {
    const especifica = { productId: "p1" };
    const global = { productId: null };
    const otra = { productId: "p2" };
    expect(preferProductSpecific([global, especifica, otra], "p1")).toEqual([especifica]);
  });

  it("sin específicas conserva las globales", () => {
    const g1 = { productId: null };
    const g2 = { productId: null };
    expect(preferProductSpecific([g1, g2], "p1")).toEqual([g1, g2]);
  });

  it("sin productId no aplica preferencia", () => {
    const list = [{ productId: "p1" }, { productId: null }];
    expect(preferProductSpecific(list, undefined)).toEqual(list);
  });
});
