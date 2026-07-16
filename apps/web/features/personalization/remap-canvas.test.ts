/*
 * Test del remapeo de assetId del canvas (edición desde el carrito, ADR editar-diseño). Puro,
 * sin DB. Es la lógica delicada del clon: si el remapeo falla, el diseño clonado apunta a assets
 * inexistentes → fotos rotas.
 */

import { describe, it, expect } from "vitest";
import { remapCanvasAssetIds } from "./canvas-remap";

describe("remapCanvasAssetIds", () => {
  const map = new Map([
    ["old-1", "new-1"],
    ["old-2", "new-2"],
  ]);

  it("remapea assetId en slots (V2) y deja intactos los no-mapeados", () => {
    const canvas = {
      version: 2,
      slots: [
        { slotIndex: 0, assetId: "old-1", assetUrl: "https://x/1" },
        { slotIndex: 1, assetId: "old-2", assetUrl: "https://x/2" },
        { slotIndex: 2, assetId: null, assetUrl: null },
      ],
    };
    const out = remapCanvasAssetIds(canvas, map) as typeof canvas;
    expect(out.slots[0].assetId).toBe("new-1");
    expect(out.slots[1].assetId).toBe("new-2");
    expect(out.slots[2].assetId).toBeNull();
    // otras props intactas
    expect(out.slots[0].assetUrl).toBe("https://x/1");
    expect(out.version).toBe(2);
  });

  it("remapea assetId anidado en cualquier profundidad (V1/estructuras arbitrarias)", () => {
    const canvas = {
      layers: [{ items: [{ assetId: "old-2" }, { assetId: "desconocido" }] }],
      meta: { assetId: "old-1" },
    };
    const out = remapCanvasAssetIds(canvas, map) as {
      layers: { items: { assetId: string }[] }[];
      meta: { assetId: string };
    };
    expect(out.layers[0].items[0].assetId).toBe("new-2");
    expect(out.layers[0].items[1].assetId).toBe("desconocido"); // no en el mapa → sin cambio
    expect(out.meta.assetId).toBe("new-1");
  });

  it("no muta el input original (devuelve copia)", () => {
    const canvas = { slots: [{ assetId: "old-1" }] };
    const out = remapCanvasAssetIds(canvas, map) as typeof canvas;
    expect(canvas.slots[0].assetId).toBe("old-1"); // original intacto
    expect(out.slots[0].assetId).toBe("new-1");
    expect(out).not.toBe(canvas);
  });

  it("mapa vacío → devuelve estructura equivalente sin cambios", () => {
    const canvas = { slots: [{ assetId: "old-1" }] };
    const out = remapCanvasAssetIds(canvas, new Map()) as typeof canvas;
    expect(out.slots[0].assetId).toBe("old-1");
  });

  it("ignora assetId no-string (null/number) sin romper", () => {
    const canvas = { a: { assetId: null }, b: { assetId: 42 }, c: { assetId: "old-1" } };
    const out = remapCanvasAssetIds(canvas, map) as {
      a: { assetId: null };
      b: { assetId: number };
      c: { assetId: string };
    };
    expect(out.a.assetId).toBeNull();
    expect(out.b.assetId).toBe(42);
    expect(out.c.assetId).toBe("new-1");
  });
});
