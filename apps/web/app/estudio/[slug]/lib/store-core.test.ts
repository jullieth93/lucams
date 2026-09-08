/*
 * Tests unitarios del núcleo del store del Estudio — acciones y selectores que
 * NO tienen suite propia (setSlotProfilePhoto/setCalendarFont tienen las suyas).
 *
 * Cubre las ramas de: setCanvasData (skipUndo / primer set), assignAssetToSlot,
 * clearSlot (reset de filter/textOverrides/photoTransform), setSlotFilter,
 * setSlotPhotoTransform (null/parcial), setTextOverrideAllSlots (set/limpiar/
 * cleanup del objeto vacío), setImagePlaceholderRect, setSlotTextOverride,
 * swapSlots (incl. índices inexistentes), autoFillSlots (solo vacíos, sin
 * assets suficientes), setSelectedTemplate/applyTemplate (stage distinto →
 * recalcGridLayout con gridCols/gridGap forzados), setBorderColor (no-op),
 * removeAsset (limpia foto principal y foto de perfil, Ola 17), undo/redo
 * (límites del stack), reset y los selectores atómicos.
 *
 * Todo puro (zustand vanilla en node): corre en CI sin Supabase.
 */

import { describe, expect, it } from "vitest";
import { createStudioStore } from "./store";
import {
  selectAssetIsUsed,
  selectFilledSlotCount,
  selectIsComplete,
  selectSlotState,
  selectTotalSlotCount,
  selectUnitImagePlaceholder,
} from "./store";
import type { CanvasDataV1, CanvasDataV2, StudioAsset, StudioTemplate } from "../types";

function makeUnitTemplate(overrides: Partial<CanvasDataV1> = {}): CanvasDataV1 {
  return {
    version: 1,
    stage: { width: 450, height: 600 },
    layers: [
      { id: "bg", type: "background", color: "#FFFFFF" },
      { id: "ph", type: "image-placeholder", x: 29, y: 58, width: 392, height: 392 },
    ],
    ...overrides,
  } as unknown as CanvasDataV1;
}

function makeCanvasData(overrides: Partial<CanvasDataV2> = {}): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: makeUnitTemplate(),
    slotCount: 4,
    slots: [
      { slotIndex: 0, assetId: "a0", assetUrl: "https://x/0.png" },
      { slotIndex: 1, assetId: null, assetUrl: null },
      { slotIndex: 2, assetId: null, assetUrl: null },
      { slotIndex: 3, assetId: "a3", assetUrl: "https://x/3.png" },
    ],
    gridLayout: { cols: 2, rows: 2, gap: 16 },
    ...overrides,
  } as unknown as CanvasDataV2;
}

function asset(id: string): StudioAsset {
  return { id, signedUrl: `https://x/${id}.png`, width: 100, height: 100 };
}

function setup(canvasData: CanvasDataV2 = makeCanvasData()) {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "set-fotoimanes",
    canvasData,
    templates: [],
  });
  return store;
}

describe("init / setCanvasData", () => {
  it("init hidrata assets desde slots ya llenos (sin duplicados por assetId)", () => {
    const canvas = makeCanvasData({
      slots: [
        { slotIndex: 0, assetId: "a0", assetUrl: "https://x/0.png" },
        { slotIndex: 1, assetId: "a0", assetUrl: "https://x/0.png" }, // mismo asset, 2 slots
        { slotIndex: 2, assetId: null, assetUrl: null },
      ],
    });
    const store = setup(canvas);
    const assets = store.getState().assets;
    expect(assets).toHaveLength(1);
    expect(assets[0].id).toBe("a0");
    expect(store.getState().selectedTemplateId).toBeNull();
  });

  it("init respeta selectedTemplateId provisto", () => {
    const store = createStudioStore();
    store.getState().init({
      designId: "d1",
      productSlug: "p",
      canvasData: makeCanvasData(),
      templates: [],
      selectedTemplateId: "tpl-1",
    });
    expect(store.getState().selectedTemplateId).toBe("tpl-1");
  });

  it("setCanvasData sin canvasData previo NO apila undo (primer set)", () => {
    const store = createStudioStore();
    store.getState().setCanvasData(makeCanvasData()); // sin init: canvasData null
    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().isDirty).toBe(true);
  });

  it("setCanvasData con skipUndo no toca el undo stack y limpia el redo", () => {
    const store = setup();
    store.getState().setSlotFilter(0, "bw"); // apila undo
    store.getState().undo(); // mueve el snapshot al redo stack
    expect(store.getState().redoStack.length).toBeGreaterThan(0);
    const undoLen = store.getState().undoStack.length;
    store.getState().setCanvasData(makeCanvasData(), { skipUndo: true });
    expect(store.getState().undoStack).toHaveLength(undoLen);
    expect(store.getState().redoStack).toHaveLength(0);
  });
});

describe("assignAssetToSlot / clearSlot / setSlotFilter", () => {
  it("assignAssetToSlot solo toca el slot indicado y lo auto-selecciona", () => {
    const store = setup();
    store.getState().assignAssetToSlot(1, asset("nuevo"));
    const s = store.getState();
    expect(s.canvasData?.slots[1].assetId).toBe("nuevo");
    expect(s.canvasData?.slots[0].assetId).toBe("a0");
    expect(s.selectedSlotIndex).toBe(1);
  });

  it("clearSlot resetea foto, filtro, overrides y encuadre", () => {
    const store = setup();
    store.getState().setSlotFilter(0, "vivid");
    store.getState().setSlotTextOverride(0, "caption", { text: "hola" });
    store.getState().setSlotPhotoTransform(0, { offsetX: 10, scale: 1.5 });
    store.getState().clearSlot(0);
    const slot = store.getState().canvasData?.slots[0];
    expect(slot?.assetId).toBeNull();
    expect(slot?.filter).toBeNull();
    expect(slot?.textOverrides).toBeUndefined();
    expect(slot?.photoTransform).toBeUndefined();
  });

  it("setSlotFilter aplica y quita el preset", () => {
    const store = setup();
    store.getState().setSlotFilter(0, "bw");
    expect(store.getState().canvasData?.slots[0].filter).toBe("bw");
    store.getState().setSlotFilter(0, null);
    expect(store.getState().canvasData?.slots[0].filter).toBeNull();
  });
});

describe("setSlotPhotoTransform", () => {
  it("transform=null resetea el encuadre del slot", () => {
    const store = setup();
    store.getState().setSlotPhotoTransform(0, { offsetX: 5, offsetY: 6, scale: 2 });
    store.getState().setSlotPhotoTransform(0, null);
    expect(store.getState().canvasData?.slots[0].photoTransform).toBeUndefined();
  });

  it("merge parcial: conserva los campos no provistos", () => {
    const store = setup();
    store.getState().setSlotPhotoTransform(0, { offsetX: 5, offsetY: 6, scale: 2 });
    store.getState().setSlotPhotoTransform(0, { scale: 3 });
    expect(store.getState().canvasData?.slots[0].photoTransform).toEqual({
      offsetX: 5,
      offsetY: 6,
      scale: 3,
      rotation: undefined,
    });
  });

  it("sin transform previo parte de offset 0 / scale 1", () => {
    const store = setup();
    store.getState().setSlotPhotoTransform(1, { offsetX: -3 });
    expect(store.getState().canvasData?.slots[1].photoTransform).toEqual({
      offsetX: -3,
      offsetY: 0,
      scale: 1,
      rotation: undefined,
    });
  });
});

describe("setSlotTextOverride / setTextOverrideAllSlots", () => {
  it("override=null limpia la clave y elimina el objeto cuando queda vacío", () => {
    const store = setup();
    store.getState().setSlotTextOverride(0, "caption", { text: "hola" });
    store.getState().setSlotTextOverride(0, "caption", null);
    expect(store.getState().canvasData?.slots[0].textOverrides).toBeUndefined();
  });

  it("mantiene las otras claves al limpiar una", () => {
    const store = setup();
    store.getState().setSlotTextOverride(0, "caption", { text: "hola" });
    store.getState().setSlotTextOverride(0, "user_name", { text: "lucy" });
    store.getState().setSlotTextOverride(0, "caption", null);
    expect(store.getState().canvasData?.slots[0].textOverrides).toEqual({
      user_name: { text: "lucy" },
    });
  });

  it("setTextOverrideAllSlots escribe en todos los slots y null limpia todos", () => {
    const store = setup();
    store.getState().setTextOverrideAllSlots("caption", { text: "pack" });
    expect(store.getState().canvasData?.slots.every((s) => s.textOverrides?.caption)).toBe(true);
    store.getState().setTextOverrideAllSlots("caption", null);
    expect(store.getState().canvasData?.slots.every((s) => s.textOverrides === undefined)).toBe(
      true,
    );
  });
});

describe("setImagePlaceholderRect", () => {
  it("reescribe solo la capa image-placeholder del unitTemplate", () => {
    const store = setup();
    store.getState().setImagePlaceholderRect({ x: 0, y: 0, width: 450, height: 450 });
    const layers = store.getState().canvasData?.unitTemplate.layers;
    const ph = layers?.find((l) => l.type === "image-placeholder") as unknown as {
      x: number;
      width: number;
    };
    const bg = layers?.find((l) => l.type === "background");
    expect(ph).toMatchObject({ x: 0, y: 0, width: 450, height: 450 });
    expect(bg).toBeDefined(); // intacta
  });
});

describe("swapSlots", () => {
  it("intercambia fotos preservando el slotIndex de cada posición", () => {
    const store = setup();
    store.getState().swapSlots(0, 3);
    const slots = store.getState().canvasData?.slots;
    expect(slots?.[0].assetId).toBe("a3");
    expect(slots?.[3].assetId).toBe("a0");
  });

  it("índice inexistente → no-op (sin ruido de undo)", () => {
    const store = setup();
    store.getState().markClean();
    const before = store.getState().canvasData;
    store.getState().swapSlots(0, 99);
    expect(store.getState().canvasData).toBe(before);
    expect(store.getState().isDirty).toBe(false);
  });
});

describe("autoFillSlots", () => {
  // Canvas con TODOS los slots vacíos: init no hidrata assets (los slots llenos
  // del makeCanvasData default sí hidratarían a0/a3 y se asignarían de nuevo).
  function setupEmpty() {
    return setup(
      makeCanvasData({
        slots: Array.from({ length: 4 }, (_, i) => ({
          slotIndex: i,
          assetId: null,
          assetUrl: null,
        })),
      }),
    );
  }

  it("llena los slots vacíos en orden con los assets subidos", () => {
    const store = setupEmpty();
    store.getState().addAsset(asset("n1"));
    store.getState().addAsset(asset("n2"));
    store.getState().autoFillSlots();
    const slots = store.getState().canvasData?.slots;
    expect(slots?.[0].assetId).toBe("n1");
    expect(slots?.[1].assetId).toBe("n2");
    expect(slots?.[2].assetId).toBeNull();
    expect(slots?.[3].assetId).toBeNull();
  });

  it("sin assets → no-op", () => {
    const store = setupEmpty();
    store.getState().markClean();
    store.getState().autoFillSlots();
    expect(store.getState().isDirty).toBe(false);
  });

  it("menos assets que slots: los que sobran quedan vacíos", () => {
    const store = setupEmpty();
    store.getState().addAsset(asset("solo-1"));
    store.getState().autoFillSlots();
    const slots = store.getState().canvasData?.slots;
    expect(slots?.[0].assetId).toBe("solo-1");
    expect(slots?.[1].assetId).toBeNull();
  });

  it("slots ya llenos se preservan (no se pisan) al autollenar el resto", () => {
    const store = setup(); // slots 0 y 3 llenos (a0/a3 hidratados como assets)
    store.getState().addAsset(asset("nuevo"));
    store.getState().autoFillSlots();
    const slots = store.getState().canvasData?.slots;
    expect(slots?.[0].assetId).toBe("a0"); // lleno: intacto
    expect(slots?.[3].assetId).toBe("a3"); // lleno: intacto
    expect(slots?.[1].assetUrl).not.toBeNull(); // vacíos reciben assets
    expect(slots?.[2].assetUrl).not.toBeNull();
  });
});

describe("selectSlot / setSelectedTemplate / applyTemplate", () => {
  it("selectSlot y setSelectedTemplate actualizan la selección", () => {
    const store = setup();
    store.getState().selectSlot(2);
    expect(store.getState().selectedSlotIndex).toBe(2);
    store.getState().selectSlot(null);
    expect(store.getState().selectedSlotIndex).toBeNull();
    store.getState().setSelectedTemplate("tpl-9");
    expect(store.getState().selectedTemplateId).toBe("tpl-9");
  });

  function template(stage: { width: number; height: number }, extra: object = {}): StudioTemplate {
    return {
      id: "tpl-x",
      slug: "tpl-x",
      name: "Tpl X",
      previewUrl: "",
      canvasData: {
        ...makeUnitTemplate(),
        stage,
        ...extra,
      },
    } as unknown as StudioTemplate;
  }

  it("applyTemplate con stage distinto recalcula el grid (con gridCols/gridGap forzados)", () => {
    const store = setup(); // 4 slots, stage 450×600
    store.getState().applyTemplate(
      template(
        { width: 1200, height: 300 }, // aspect 4 → >2: swap cols/rows si aplica
        { gridCols: 1, gridGap: 0 },
      ),
    );
    const cd = store.getState().canvasData;
    expect(cd?.gridLayout).toEqual({ cols: 1, rows: 4, gap: 0 });
    expect(store.getState().selectedTemplateId).toBe("tpl-x");
  });

  it("applyTemplate con stage igual conserva el gridLayout actual", () => {
    const store = setup();
    const gridBefore = store.getState().canvasData?.gridLayout;
    store.getState().applyTemplate(template({ width: 450, height: 600 }));
    expect(store.getState().canvasData?.gridLayout).toBe(gridBefore);
  });

  it("applyTemplate preserva las fotos por slotIndex", () => {
    const store = setup();
    store.getState().applyTemplate(template({ width: 450, height: 600 }));
    expect(store.getState().canvasData?.slots[0].assetId).toBe("a0");
    expect(store.getState().canvasData?.slots[3].assetId).toBe("a3");
  });
});

describe("setBorderColor", () => {
  it("persiste el color y null lo quita; mismo valor → no-op", () => {
    const store = setup();
    store.getState().setBorderColor("#FF0000");
    expect(store.getState().canvasData?.borderColor).toBe("#FF0000");
    store.getState().markClean();
    store.getState().setBorderColor("#FF0000"); // mismo → no-op
    expect(store.getState().isDirty).toBe(false);
    store.getState().setBorderColor(null);
    expect(store.getState().canvasData?.borderColor).toBeNull();
  });
});

describe("removeAsset (Ola 17 — limpia foto principal Y foto de perfil)", () => {
  it("suelta la foto principal de los slots que la usan", () => {
    const store = setup();
    store.getState().removeAsset("a0");
    const slots = store.getState().canvasData?.slots;
    expect(slots?.[0].assetId).toBeNull();
    expect(slots?.[0].assetUrl).toBeNull();
    expect(slots?.[3].assetId).toBe("a3"); // no usaba a0
    expect(store.getState().assets.find((a) => a.id === "a0")).toBeUndefined();
  });

  it("suelta la foto de perfil (profileAssetId) sin tocar la foto principal", () => {
    const store = setup();
    store.getState().setSlotProfilePhoto(0, asset("avatar-1"));
    store.getState().removeAsset("avatar-1");
    const slot = store.getState().canvasData?.slots[0];
    expect(slot?.profileAssetId).toBeNull();
    expect(slot?.profileAssetUrl).toBeUndefined();
    expect(slot?.assetId).toBe("a0"); // foto principal intacta
  });

  it("asset en uso por varios slots → limpia todos", () => {
    const store = setup();
    store.getState().assignAssetToSlot(1, asset("compartida"));
    store.getState().assignAssetToSlot(2, asset("compartida"));
    store.getState().removeAsset("compartida");
    const slots = store.getState().canvasData?.slots;
    expect(slots?.[1].assetId).toBeNull();
    expect(slots?.[2].assetId).toBeNull();
  });

  it("asset sin uso → solo lo quita del listado (sin setCanvasData)", () => {
    const store = setup();
    store.getState().addAsset(asset("libre"));
    store.getState().markClean();
    store.getState().removeAsset("libre");
    expect(store.getState().assets.find((a) => a.id === "libre")).toBeUndefined();
    expect(store.getState().isDirty).toBe(false);
  });
});

describe("undo / redo", () => {
  it("round-trip: undo restaura y redo re-aplica", () => {
    const store = setup();
    const original = store.getState().canvasData;
    store.getState().assignAssetToSlot(1, asset("nuevo"));
    store.getState().undo();
    expect(store.getState().canvasData).toBe(original);
    store.getState().redo();
    expect(store.getState().canvasData?.slots[1].assetId).toBe("nuevo");
  });

  it("undo con stack vacío → no-op", () => {
    const store = setup();
    store.getState().markClean();
    const before = store.getState().canvasData;
    store.getState().undo();
    expect(store.getState().canvasData).toBe(before);
    expect(store.getState().isDirty).toBe(false);
  });

  it("canUndo/canRedo reflejan los stacks", () => {
    const store = setup();
    expect(store.getState().canUndo()).toBe(false);
    store.getState().setSlotFilter(0, "bw");
    expect(store.getState().canUndo()).toBe(true);
    expect(store.getState().canRedo()).toBe(false);
    store.getState().undo();
    expect(store.getState().canRedo()).toBe(true);
  });

  it("un cambio nuevo trunca el redo stack", () => {
    const store = setup();
    store.getState().setSlotFilter(0, "bw");
    store.getState().undo();
    expect(store.getState().canRedo()).toBe(true);
    store.getState().setSlotFilter(0, "vivid");
    expect(store.getState().canRedo()).toBe(false);
  });
});

describe("reset", () => {
  it("vuelve al estado inicial", () => {
    const store = setup();
    store.getState().assignAssetToSlot(1, asset("nuevo"));
    store.getState().reset();
    expect(store.getState().canvasData).toBeNull();
    expect(store.getState().assets).toHaveLength(0);
    expect(store.getState().undoStack).toHaveLength(0);
  });
});

describe("selectores atómicos", () => {
  it("sin canvasData: selectores con default seguro", () => {
    const store = createStudioStore();
    const state = store.getState();
    expect(selectFilledSlotCount(state)).toBe(0);
    expect(selectTotalSlotCount(state)).toBe(0);
    expect(selectIsComplete(state)).toBe(false);
    expect(selectAssetIsUsed("a0")(state)).toBe(false);
    expect(selectSlotState(0)(state)).toBeNull();
    expect(selectUnitImagePlaceholder(state)).toBeNull();
  });

  it("con canvasData: cuentas y lookups correctos", () => {
    const store = setup();
    const state = store.getState();
    expect(selectFilledSlotCount(state)).toBe(2);
    expect(selectTotalSlotCount(state)).toBe(4);
    expect(selectIsComplete(state)).toBe(false); // 2/4 llenos
    expect(selectAssetIsUsed("a0")(state)).toBe(true);
    expect(selectAssetIsUsed("nope")(state)).toBe(false);
    expect(selectSlotState(3)(state)?.assetId).toBe("a3");
    expect(selectSlotState(99)(state)).toBeNull();
    expect(selectUnitImagePlaceholder(state)?.id).toBe("ph");
  });

  it("selectIsComplete true cuando todos los slots tienen foto", () => {
    const store = setup(
      makeCanvasData({
        slots: [
          { slotIndex: 0, assetId: "a0", assetUrl: "https://x/0.png" },
          { slotIndex: 1, assetId: "a1", assetUrl: "https://x/1.png" },
        ],
        slotCount: 2,
      }),
    );
    expect(selectIsComplete(store.getState())).toBe(true);
  });

  it("unitTemplate sin image-placeholder → null", () => {
    const store = setup(
      makeCanvasData({
        unitTemplate: {
          version: 1,
          stage: { width: 450, height: 600 },
          layers: [{ id: "bg", type: "background", color: "#FFF" }],
        } as unknown as CanvasDataV1,
      }),
    );
    expect(selectUnitImagePlaceholder(store.getState())).toBeNull();
  });
});

describe("setPhotoSlotsPerUnit — packs de fotoimanes (N elegido en el Estudio)", () => {
  it("reconstruye los slots preservando las fotos por índice hasta donde quepan", () => {
    const store = setup(); // 4 slots, slots 0 y 3 con foto
    store.getState().setPhotoSlotsPerUnit(3, { facesPerUnit: 1, max: 6 });
    const cd = store.getState().canvasData;
    expect(cd?.slotCount).toBe(3);
    expect(cd?.photoSlots).toBe(3);
    expect(cd?.slots).toHaveLength(3);
    expect(cd?.slots[0].assetId).toBe("a0"); // preservada por índice
    expect(cd?.slots[2].assetId).toBeNull(); // la foto de slot 3 se cayó (fuera de rango)
  });

  it("con facesPerUnit=2 (separadores) slotCount = N × caras", () => {
    const store = setup();
    store.getState().setPhotoSlotsPerUnit(3, { facesPerUnit: 2, max: 4 });
    const cd = store.getState().canvasData;
    expect(cd?.slotCount).toBe(6);
    expect(cd?.photoSlots).toBe(3);
  });

  it("persiste sizeCm cuando viene en opts", () => {
    const store = setup();
    store.getState().setPhotoSlotsPerUnit(2, { facesPerUnit: 1, max: 4, sizeCm: "6×6" });
    expect(store.getState().canvasData?.sizeCm).toBe("6×6");
  });

  it("conserva sizeCm previo si opts no lo trae", () => {
    const store = setup();
    store.getState().setPhotoSlotsPerUnit(2, { facesPerUnit: 1, max: 4, sizeCm: "7×9" });
    store.getState().setPhotoSlotsPerUnit(3, { facesPerUnit: 1, max: 4 });
    expect(store.getState().canvasData?.sizeCm).toBe("7×9");
  });

  it("n truncado y clampado al rango [1, max]", () => {
    const store = setup();
    store.getState().setPhotoSlotsPerUnit(99, { facesPerUnit: 1, max: 6 });
    expect(store.getState().canvasData?.photoSlots).toBe(6);
    store.getState().setPhotoSlotsPerUnit(0.7, { facesPerUnit: 1, max: 6 });
    expect(store.getState().canvasData?.photoSlots).toBe(1);
  });

  it("mismo N efectivo → no-op (sin ruido de undo)", () => {
    const store = setup();
    store.getState().setPhotoSlotsPerUnit(4, { facesPerUnit: 1, max: 6 }); // ya 4
    store.getState().markClean();
    store.getState().setPhotoSlotsPerUnit(4, { facesPerUnit: 1, max: 6 });
    expect(store.getState().isDirty).toBe(false);
  });

  it("N no finito → no-op (defensivo)", () => {
    const store = setup();
    store.getState().markClean();
    store.getState().setPhotoSlotsPerUnit(Number.NaN, { facesPerUnit: 1, max: 6 });
    expect(store.getState().isDirty).toBe(false);
  });

  it("el slot seleccionado que queda fuera del nuevo conteo se suelta", () => {
    const store = setup(); // 4 slots
    store.getState().selectSlot(3);
    store.getState().setPhotoSlotsPerUnit(2, { facesPerUnit: 1, max: 6 }); // baja a 2
    expect(store.getState().selectedSlotIndex).toBeNull();
  });

  it("el slot seleccionado que sigue dentro se conserva", () => {
    const store = setup();
    store.getState().selectSlot(1);
    store.getState().setPhotoSlotsPerUnit(6, { facesPerUnit: 1, max: 6 }); // sube a 6
    expect(store.getState().selectedSlotIndex).toBe(1);
  });

  it("sin canvasData → no-op", () => {
    const store = createStudioStore(); // sin init
    store.getState().setPhotoSlotsPerUnit(2, { facesPerUnit: 1, max: 6 });
    expect(store.getState().canvasData).toBeNull();
  });
});
