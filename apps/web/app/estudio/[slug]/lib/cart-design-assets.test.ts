/*
 * Test del helper puro de lib/cart-design-assets.server.ts (2026-10-26):
 * collectCanvasAssetIds extrae los assetIds (foto principal + foto de perfil
 * IG) que un canvasData referencia, con parsing defensivo del JSON libre de
 * la DB. La query prisma (listCartDesignAssetIdsInUse) se cubre en
 * integración de carrito; acá solo lo puro.
 */

import { describe, expect, it } from "vitest";
import { collectCanvasAssetIds } from "./cart-design-assets.server";

describe("collectCanvasAssetIds — assetIds referenciados por un canvasData", () => {
  it("recoge la foto principal y la foto de perfil de cada slot, sin duplicados", () => {
    const canvas = {
      version: 2,
      slots: [
        { slotIndex: 0, assetId: "a1", assetUrl: "https://x/1.png" },
        { slotIndex: 1, assetId: "a2", assetUrl: "https://x/2.png", profileAssetId: "p1" },
        { slotIndex: 2, assetId: "a1", assetUrl: "https://x/1.png" }, // repetido
        { slotIndex: 3, assetId: null, assetUrl: null },
      ],
    };
    expect(collectCanvasAssetIds(canvas)).toEqual(["a1", "a2", "p1"]);
  });

  it("ignora ids vacíos/no-string y slots sin foto", () => {
    const canvas = {
      slots: [
        { slotIndex: 0, assetId: "", profileAssetId: 42 },
        { slotIndex: 1, assetId: null },
      ],
    };
    expect(collectCanvasAssetIds(canvas)).toEqual([]);
  });

  it("canvas sin slots (o basura) → []", () => {
    expect(collectCanvasAssetIds(null)).toEqual([]);
    expect(collectCanvasAssetIds({})).toEqual([]);
    expect(collectCanvasAssetIds({ slots: "nope" })).toEqual([]);
  });
});
