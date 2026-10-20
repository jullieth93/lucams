import { describe, expect, it } from "vitest";
import { designHasMeaningfulProgress } from "./design-progress";

const emptyCanvas = {
  version: 2,
  slotCount: 1,
  slots: [{ slotIndex: 0, assetId: null, assetUrl: null }],
};

describe("designHasMeaningfulProgress", () => {
  it("un canvas vacío legacy no cuenta como borrador recuperable", () => {
    expect(designHasMeaningfulProgress({ canvasData: emptyCanvas })).toBe(false);
  });

  it("una revisión guardada sí representa un cambio real del flujo nuevo", () => {
    expect(designHasMeaningfulProgress({ canvasData: { ...emptyCanvas, clientRev: 123 } })).toBe(
      true,
    );
  });

  it("cuenta foto, avatar o texto editado", () => {
    for (const slot of [
      { slotIndex: 0, assetId: "a", assetUrl: "u" },
      { slotIndex: 0, assetId: null, assetUrl: null, profileAssetUrl: "avatar" },
      { slotIndex: 0, assetId: null, assetUrl: null, textOverrides: { title: { text: "Hola" } } },
    ]) {
      expect(designHasMeaningfulProgress({ canvasData: { ...emptyCanvas, slots: [slot] } })).toBe(
        true,
      );
    }
  });

  it("un diseño de nombre o set con contenido en metadata cuenta", () => {
    expect(
      designHasMeaningfulProgress({
        canvasData: { version: 1 },
        metadata: { surface: "name", letters: ["L", "U"] },
      }),
    ).toBe(true);
    expect(designHasMeaningfulProgress({ canvasData: { version: 1 } })).toBe(false);
  });
});
