/*
 * resolveBootTemplate (5.1, owner 2026-10-22; endurecido 2026-11-07) — sin
 * plantilla seleccionada por defecto: con plantillas visibles la selección
 * arranca en null (el checklist la pide como primer paso), INCLUSO con una
 * sola opción, pero el lienzo SIEMPRE tiene geometría de render.
 */

import { describe, expect, it } from "vitest";
import { resolveBootTemplate } from "./boot-template";
import type { StudioTemplate } from "../types";

function tpl(id: string): StudioTemplate {
  return {
    id,
    slug: id,
    name: id,
    previewUrl: "",
    canvasData: {
      version: 1,
      stage: { width: 450, height: 600 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
    },
  } as unknown as StudioTemplate;
}

describe("resolveBootTemplate", () => {
  it(">1 plantillas sin deep-link: selección null, geometría = primera", () => {
    const res = resolveBootTemplate([tpl("a"), tpl("b")], null);
    expect(res.templateId).toBeNull();
    expect(res.geometry?.id).toBe("a");
  });

  it("1 sola plantilla: SIN auto-selección (owner 2026-11-07 — elección obligatoria homologada)", () => {
    const res = resolveBootTemplate([tpl("a")], null);
    expect(res.templateId).toBeNull();
    expect(res.geometry?.id).toBe("a");
  });

  it("deep-link ?template= cuenta como elección explícita", () => {
    const res = resolveBootTemplate([tpl("a"), tpl("b")], "b");
    expect(res.templateId).toBe("b");
    expect(res.geometry?.id).toBe("b");
  });

  it("deep-link con id fuera de la lista visible: sin selección, geometría fallback", () => {
    const res = resolveBootTemplate([tpl("a"), tpl("b")], "fantasma");
    expect(res.templateId).toBeNull();
    expect(res.geometry?.id).toBe("a");
  });

  it("sin plantillas: geometría undefined y selección null", () => {
    const res = resolveBootTemplate([], null);
    expect(res.geometry).toBeUndefined();
    expect(res.templateId).toBeNull();
  });
});
