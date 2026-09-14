/*
 * setSlotProfilePhoto — foto de perfil del header del post de Instagram
 * (Ola 17, Lucy 2026-09-07). Sigue el patrón de assignAssetToSlot: persiste
 * profileAssetId/profileAssetUrl en el SlotState vía setCanvasData → undo +
 * auto-save. La capa `profile-photo` del unitTemplate las consume. POR SLOT:
 * cada imán del pack es un post independiente con su propio usuario.
 */

import { describe, expect, it } from "vitest";
import { createStudioStore } from "./store";
import type { CanvasDataV2 } from "../types";

function makeCanvasData(): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 450, height: 600 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "profile_photo", type: "profile-photo", x: 34, y: 34, radius: 16 },
      ],
    },
    slotCount: 2,
    slots: [
      { slotIndex: 0, assetId: null, assetUrl: null },
      { slotIndex: 1, assetId: "a1", assetUrl: "https://x/foto1.png" },
    ],
    gridLayout: { cols: 2, rows: 1, gap: 12 },
  };
}

const avatar = {
  id: "pa-1",
  signedUrl: "https://x/avatar.png",
  width: 200,
  height: 200,
};

function setup() {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "set-fotoimanes-polaroid",
    canvasData: makeCanvasData(),
    templates: [],
  });
  return store;
}

describe("setSlotProfilePhoto — foto de perfil por slot (Ola 17)", () => {
  it("asigna la foto de perfil al slot indicado (y solo a ese)", () => {
    const store = setup();
    store.getState().setSlotProfilePhoto(0, avatar);
    const slots = store.getState().canvasData?.slots;
    expect(slots?.[0].profileAssetId).toBe("pa-1");
    expect(slots?.[0].profileAssetUrl).toBe("https://x/avatar.png");
    expect(slots?.[1].profileAssetId).toBeUndefined();
    expect(store.getState().isDirty).toBe(true);
  });

  it("no toca la foto principal del slot (son independientes)", () => {
    const store = setup();
    store.getState().setSlotProfilePhoto(1, avatar);
    const slot = store.getState().canvasData?.slots[1];
    expect(slot?.assetId).toBe("a1");
    expect(slot?.profileAssetId).toBe("pa-1");
  });

  it("asset=null quita la foto de perfil (vuelve el placeholder del SVG)", () => {
    const store = setup();
    store.getState().setSlotProfilePhoto(0, avatar);
    store.getState().markClean();
    store.getState().setSlotProfilePhoto(0, null);
    const slot = store.getState().canvasData?.slots[0];
    expect(slot?.profileAssetId).toBeNull();
    expect(slot?.profileAssetUrl).toBeUndefined();
    expect(store.getState().isDirty).toBe(true);
  });

  it("va por setCanvasData → queda en el undo stack", () => {
    const store = setup();
    store.getState().setSlotProfilePhoto(0, avatar);
    expect(store.getState().undoStack.length).toBeGreaterThan(0);
    store.getState().undo();
    expect(store.getState().canvasData?.slots[0].profileAssetId).toBeUndefined();
  });

  it("clearSlot también suelta la foto de perfil (reset completo del slot)", () => {
    const store = setup();
    store.getState().setSlotProfilePhoto(1, avatar);
    store.getState().clearSlot(1);
    const slot = store.getState().canvasData?.slots[1];
    expect(slot?.assetId).toBeNull();
    expect(slot?.profileAssetId).toBeNull();
    expect(slot?.profileAssetUrl).toBeUndefined();
  });
});
