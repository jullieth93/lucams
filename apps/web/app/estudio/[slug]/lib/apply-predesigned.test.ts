/*
 * Tests de apply-predesigned (Paquete A, 2026-10-02):
 *  - DEDUPE: el mismo galleryImageId se sube UNA sola vez por sesión/diseño;
 *    aplicarlo a otro slot reusa el asset (bug: una copia en el servidor por slot).
 *  - CARA B OCUPADA: no se pisa el contenido del usuario ni se descarta en
 *    silencio → bBlocked=true y el slot B queda intacto.
 *  - VARIEDAD: applyPredesignedVarietyToEmptySlots recorre el catálogo sin
 *    repetir mientras haya diseños (bug: 20 slots con el mismo diseño) y
 *    continúa el round-robin entre llamadas.
 *  - PARIDAD Cara A/B (2026-10-05): con facesPerUnit 2 la A siempre ancla en
 *    un slot par de su unidad (destino impar → A del par, o siguiente par con
 *    la A libre) y la B en su hermana — nunca cruza unidades.
 *
 * La server action está mockeada (vi.mock); el store corre real (zustand
 * vanilla en node), igual que store-core.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasDataV2 } from "../types";
import { createStudioStore } from "./store";
import {
  applyPredesignedToSlot,
  applyPredesignedVarietyToEmptySlots,
  firstFreeSlotOfFace,
} from "./apply-predesigned";
import type { PredesignedItem } from "../studio-asset-picker-modal";

const { calls } = vi.hoisted(() => ({
  calls: { assign: [] as Array<{ designId: string; galleryImageId: string }> },
}));

vi.mock("@/features/personalization/actions", () => ({
  assignPredesignedToDesignAction: async (input: { designId: string; galleryImageId: string }) => {
    calls.assign.push(input);
    // Ids "fail-*" simulan un fallo del servidor (reason "error" del helper).
    if (input.galleryImageId.startsWith("fail-")) {
      return { ok: false as const, message: "boom" };
    }
    const withB = input.galleryImageId.endsWith("-ab");
    return {
      ok: true as const,
      assetId: `asset-${input.galleryImageId}-a`,
      signedUrl: `https://signed.example/${input.galleryImageId}-a.png`,
      width: 100,
      height: 200,
      ...(withB
        ? {
            assetB: {
              assetId: `asset-${input.galleryImageId}-b`,
              signedUrl: `https://signed.example/${input.galleryImageId}-b.png`,
              width: 100,
              height: 200,
            },
          }
        : {}),
    };
  },
}));

function makeCanvas(slotCount: number, occupied: number[] = []): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 200, height: 400 },
      layers: [],
    },
    slotCount,
    slots: Array.from({ length: slotCount }, (_, i) =>
      occupied.includes(i)
        ? { slotIndex: i, assetId: `own-${i}`, assetUrl: `https://x/own-${i}.png` }
        : { slotIndex: i, assetId: null, assetUrl: null },
    ),
    gridLayout: { cols: 2, rows: Math.ceil(slotCount / 2), gap: 8 },
  } as unknown as CanvasDataV2;
}

function setup(slotCount: number, occupied: number[] = []) {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "separadores",
    canvasData: makeCanvas(slotCount, occupied),
    templates: [],
  });
  return store;
}

const item = (id: string): PredesignedItem => ({
  id,
  name: `Diseño ${id}`,
  imageUrl: `https://cdn.example/${id}.png`,
  imageUrlB: id.endsWith("-ab") ? `https://cdn.example/${id}-b.png` : null,
});

beforeEach(() => {
  calls.assign.length = 0;
});

describe("applyPredesignedToSlot — dedupe de assets (Paquete A)", () => {
  it("fallo del servidor al resolver el asset → reason error con el mensaje crudo", async () => {
    const store = setup(2);
    const res = await applyPredesignedToSlot({ store, item: item("fail-1"), targetSlot: 0 });
    expect(res).toEqual({ ok: false, reason: "error", message: "boom" });
    // No se asignó nada al slot.
    expect(store.getState().canvasData!.slots[0]!.assetId).toBeNull();
  });

  it("el mismo diseño aplicado a 2 slots se sube UNA sola vez y ambos slots comparten el asset", async () => {
    const store = setup(2);
    const r1 = await applyPredesignedToSlot({ store, item: item("g1"), targetSlot: 0 });
    const r2 = await applyPredesignedToSlot({ store, item: item("g1"), targetSlot: 1 });
    expect(r1.ok && r2.ok).toBe(true);
    expect(calls.assign).toHaveLength(1);
    const slots = store.getState().canvasData!.slots;
    expect(slots[0]!.assetId).toBe("asset-g1-a");
    expect(slots[1]!.assetId).toBe("asset-g1-a");
    // La bandeja "Mis fotos" tampoco duplica el asset.
    expect(store.getState().assets).toHaveLength(1);
  });

  it("con par A/B la reutilización incluye la cara B (no se re-sube)", async () => {
    const store = setup(4);
    await applyPredesignedToSlot({ store, item: item("g1-ab"), targetSlot: 0 });
    await applyPredesignedToSlot({ store, item: item("g1-ab"), targetSlot: 2 });
    expect(calls.assign).toHaveLength(1);
    const slots = store.getState().canvasData!.slots;
    expect(slots[2]!.assetId).toBe("asset-g1-ab-a");
    expect(slots[3]!.assetId).toBe("asset-g1-ab-b");
  });
});

describe("applyPredesignedToSlot — reemplazo limpio sobre slot ocupado (2026-10-12)", () => {
  // Aplicar un prediseño sobre un slot que YA tenía diseño: la composición
  // anterior no sobrevive (sin textos huérfanos ni encuadre heredado encima).
  it("slot ocupado con textos/filtro/encuadre → el prediseño reemplaza TODO el estado del slot", async () => {
    const store = setup(2, [0]);
    store.getState().setSlotFilter(0, "vivid");
    store.getState().setSlotTextOverride(0, "caption", { text: "diseño previo" });
    store.getState().setSlotPhotoTransform(0, { offsetX: 8, offsetY: 8, scale: 2 });
    const res = await applyPredesignedToSlot({ store, item: item("g1"), targetSlot: 0 });
    expect(res.ok).toBe(true);
    const slot = store.getState().canvasData!.slots[0]!;
    expect(slot.assetId).toBe("asset-g1-a");
    expect(slot.filter).toBeNull();
    expect(slot.textOverrides).toBeUndefined();
    expect(slot.photoTransform).toBeUndefined();
  });
});

describe("applyPredesignedToSlot — cara B ocupada (Paquete A: nunca pisar ni descartar en silencio)", () => {  it("slot B vacío → se aplica la cara B (sin aviso)", async () => {
    const store = setup(2);
    const res = await applyPredesignedToSlot({ store, item: item("g1-ab"), targetSlot: 0 });
    expect(res).toEqual({ ok: true, bBlocked: false });
    expect(store.getState().canvasData!.slots[1]!.assetId).toBe("asset-g1-ab-b");
  });

  it("slot B ocupado → NO se pisa, se reporta bBlocked y la cara A sí se aplica", async () => {
    const store = setup(2, [1]);
    const res = await applyPredesignedToSlot({ store, item: item("g1-ab"), targetSlot: 0 });
    expect(res).toEqual({ ok: true, bBlocked: true });
    const slots = store.getState().canvasData!.slots;
    expect(slots[0]!.assetId).toBe("asset-g1-ab-a");
    expect(slots[1]!.assetId).toBe("own-1"); // contenido del usuario intacto
  });

  it("sin slot B (producto de 1 cara / último slot) → no aplica, sin aviso", async () => {
    const store = setup(1);
    const res = await applyPredesignedToSlot({ store, item: item("g1-ab"), targetSlot: 0 });
    expect(res).toEqual({ ok: true, bBlocked: false });
  });
});

describe("applyPredesignedToSlot — paridad Cara A/B (2026-10-05: nunca cruzar unidades)", () => {
  it("destino en cara B con la A de su par libre → ancla a la A del par y la B cae donde se apuntó", async () => {
    const store = setup(4);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1-ab"),
      targetSlot: 1,
      facesPerUnit: 2,
    });
    expect(res).toEqual({ ok: true, bBlocked: false });
    const slots = store.getState().canvasData!.slots;
    expect(slots[0]!.assetId).toBe("asset-g1-ab-a"); // cara A del MISMO par
    expect(slots[1]!.assetId).toBe("asset-g1-ab-b"); // la B cae en el slot apuntado
    expect(slots[2]!.assetId).toBeNull(); // la unidad siguiente NO se cruza
  });

  it("destino en cara B con la A ocupada → ancla al siguiente par con la A libre", async () => {
    const store = setup(4, [0]);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1-ab"),
      targetSlot: 1,
      facesPerUnit: 2,
    });
    expect(res).toEqual({ ok: true, bBlocked: false });
    const slots = store.getState().canvasData!.slots;
    expect(slots[0]!.assetId).toBe("own-0"); // contenido del usuario intacto
    expect(slots[1]!.assetId).toBeNull(); // la cara B apuntada queda libre
    expect(slots[2]!.assetId).toBe("asset-g1-ab-a");
    expect(slots[3]!.assetId).toBe("asset-g1-ab-b");
  });

  it("la B del ancla reasignado respeta una cara B ocupada (bBlocked)", async () => {
    const store = setup(4, [0, 3]);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1-ab"),
      targetSlot: 1,
      facesPerUnit: 2,
    });
    expect(res).toEqual({ ok: true, bBlocked: true });
    const slots = store.getState().canvasData!.slots;
    expect(slots[2]!.assetId).toBe("asset-g1-ab-a");
    expect(slots[3]!.assetId).toBe("own-3");
  });

  it("sin ninguna cara A libre → falla ANTES de subir el asset con reason no-free-slot", async () => {
    const store = setup(2, [0]);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1-ab"),
      targetSlot: 1,
      facesPerUnit: 2,
    });
    // Fix STG 2026-10-06 — reason propio: el caller muestra "todos los lienzos
    // ya tienen un diseño…", no el toast genérico de error.
    expect(res).toEqual({ ok: false, reason: "no-free-slot", message: "" });
    expect(calls.assign).toHaveLength(0);
  });

  it("prediseñado SIN cara B igual cae en cara A aunque el destino sea una cara B", async () => {
    const store = setup(4);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1"),
      targetSlot: 3,
      facesPerUnit: 2,
    });
    expect(res).toEqual({ ok: true, bBlocked: false });
    const slots = store.getState().canvasData!.slots;
    expect(slots[2]!.assetId).toBe("asset-g1-a");
    expect(slots[3]!.assetId).toBeNull();
  });

  it("destino en cara A (par) → comportamiento de siempre, sin reubicar", async () => {
    const store = setup(4);
    await applyPredesignedToSlot({ store, item: item("g1-ab"), targetSlot: 2, facesPerUnit: 2 });
    const slots = store.getState().canvasData!.slots;
    expect(slots[2]!.assetId).toBe("asset-g1-ab-a");
    expect(slots[3]!.assetId).toBe("asset-g1-ab-b");
  });

  it("producto sin caras (facesPerUnit 1 / ausente) → no se altera el destino", async () => {
    const store = setup(4);
    await applyPredesignedToSlot({ store, item: item("g1-ab"), targetSlot: 1 });
    const slots = store.getState().canvasData!.slots;
    expect(slots[1]!.assetId).toBe("asset-g1-ab-a");
    expect(slots[2]!.assetId).toBe("asset-g1-ab-b");
  });
});

describe("applyPredesignedToSlot — paridad Cara A/B (2026-10-05: nunca cruzar unidades)", () => {
  it("destino en cara B con la A de su par libre → ancla a la A del par y la B cae donde se apuntó", async () => {
    const store = setup(4);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1-ab"),
      targetSlot: 1,
      facesPerUnit: 2,
    });
    expect(res).toEqual({ ok: true, bBlocked: false });
    const slots = store.getState().canvasData!.slots;
    expect(slots[0]!.assetId).toBe("asset-g1-ab-a"); // cara A del MISMO par
    expect(slots[1]!.assetId).toBe("asset-g1-ab-b"); // la B cae en el slot apuntado
    expect(slots[2]!.assetId).toBeNull(); // la unidad siguiente NO se cruza
  });

  it("destino en cara B con la A ocupada → ancla al siguiente par con la A libre", async () => {
    const store = setup(4, [0]);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1-ab"),
      targetSlot: 1,
      facesPerUnit: 2,
    });
    expect(res).toEqual({ ok: true, bBlocked: false });
    const slots = store.getState().canvasData!.slots;
    expect(slots[0]!.assetId).toBe("own-0"); // contenido del usuario intacto
    expect(slots[1]!.assetId).toBeNull(); // la cara B apuntada queda libre
    expect(slots[2]!.assetId).toBe("asset-g1-ab-a");
    expect(slots[3]!.assetId).toBe("asset-g1-ab-b");
  });

  it("la B del ancla reasignado respeta una cara B ocupada (bBlocked)", async () => {
    const store = setup(4, [0, 3]);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1-ab"),
      targetSlot: 1,
      facesPerUnit: 2,
    });
    expect(res).toEqual({ ok: true, bBlocked: true });
    const slots = store.getState().canvasData!.slots;
    expect(slots[2]!.assetId).toBe("asset-g1-ab-a");
    expect(slots[3]!.assetId).toBe("own-3");
  });

  it("sin ninguna cara A libre → falla ANTES de subir el asset con reason no-free-slot", async () => {
    const store = setup(2, [0]);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1-ab"),
      targetSlot: 1,
      facesPerUnit: 2,
    });
    // Fix STG 2026-10-06 — reason propio: el caller muestra "todos los lienzos
    // ya tienen un diseño…", no el toast genérico de error.
    expect(res).toEqual({ ok: false, reason: "no-free-slot", message: "" });
    expect(calls.assign).toHaveLength(0);
  });

  it("prediseñado SIN cara B igual cae en cara A aunque el destino sea una cara B", async () => {
    const store = setup(4);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1"),
      targetSlot: 3,
      facesPerUnit: 2,
    });
    expect(res).toEqual({ ok: true, bBlocked: false });
    const slots = store.getState().canvasData!.slots;
    expect(slots[2]!.assetId).toBe("asset-g1-a");
    expect(slots[3]!.assetId).toBeNull();
  });

  it("destino en cara A (par) → comportamiento de siempre, sin reubicar", async () => {
    const store = setup(4);
    await applyPredesignedToSlot({ store, item: item("g1-ab"), targetSlot: 2, facesPerUnit: 2 });
    const slots = store.getState().canvasData!.slots;
    expect(slots[2]!.assetId).toBe("asset-g1-ab-a");
    expect(slots[3]!.assetId).toBe("asset-g1-ab-b");
  });

  it("producto sin caras (facesPerUnit 1 / ausente) → no se altera el destino", async () => {
    const store = setup(4);
    await applyPredesignedToSlot({ store, item: item("g1-ab"), targetSlot: 1 });
    const slots = store.getState().canvasData!.slots;
    expect(slots[1]!.assetId).toBe("asset-g1-ab-a");
    expect(slots[2]!.assetId).toBe("asset-g1-ab-b");
  });
});

describe("applyPredesignedVarietyToEmptySlots — variedad round-robin (Paquete A)", () => {
  it("3 diseños en 3 slots vacíos: todos distintos", async () => {
    const store = setup(3);
    const res = await applyPredesignedVarietyToEmptySlots({
      store,
      items: [item("g1"), item("g2"), item("g3")],
    });
    expect(res).toEqual({ applied: 3, bBlockedCount: 0, failed: false });
    const assetIds = store.getState().canvasData!.slots.map((s) => s.assetId);
    expect(new Set(assetIds).size).toBe(3);
  });

  it("más slots que diseños: agota el catálogo y repite desde el inicio", async () => {
    const store = setup(5);
    const res = await applyPredesignedVarietyToEmptySlots({
      store,
      items: [item("g1"), item("g2")],
    });
    expect(res.applied).toBe(5);
    const assetIds = store.getState().canvasData!.slots.map((s) => s.assetId);
    expect(assetIds).toEqual([
      "asset-g1-a",
      "asset-g2-a",
      "asset-g1-a",
      "asset-g2-a",
      "asset-g1-a",
    ]);
    // Dedupe: solo 2 subidas al servidor pese a 5 aplicaciones.
    expect(calls.assign).toHaveLength(2);
  });

  it("solo llena slots VACÍOS y, con 2 caras, solo ancla en caras A (pares)", async () => {
    const store = setup(4, [0, 3]);
    const res = await applyPredesignedVarietyToEmptySlots({
      store,
      items: [item("g1-ab"), item("g2-ab")],
      facesPerUnit: 2,
    });
    // Anchors vacíos pares: solo el slot 2 → 1 diseño aplicado con su cara B libre (slot 3 está ocupado → bBlocked).
    expect(res).toEqual({ applied: 1, bBlockedCount: 1, failed: false });
    const slots = store.getState().canvasData!.slots;
    expect(slots[0]!.assetId).toBe("own-0");
    expect(slots[2]!.assetId).toBe("asset-g1-ab-a");
    expect(slots[3]!.assetId).toBe("own-3");
  });

  it("una segunda pasada continúa el round-robin (variedad entre clics)", async () => {
    const store = setup(2);
    const items = [item("g1"), item("g2"), item("g3")];
    await applyPredesignedVarietyToEmptySlots({ store, items });
    // El usuario libera el slot 0 y vuelve a llenar: toca el diseño SIGUIENTE (g3), no g1 otra vez.
    store.getState().clearSlot(0);
    await applyPredesignedVarietyToEmptySlots({ store, items });
    expect(store.getState().canvasData!.slots[0]!.assetId).toBe("asset-g3-a");
  });

  it("sin slots vacíos no hace nada", async () => {
    const store = setup(2, [0, 1]);
    const res = await applyPredesignedVarietyToEmptySlots({ store, items: [item("g1")] });
    expect(res).toEqual({ applied: 0, bBlockedCount: 0, failed: false });
    expect(calls.assign).toHaveLength(0);
  });
});

/*
 * Regla de caras (2026-10-12) — aplicación GLOBAL de un diseño de 1 cara en un
 * producto de 2 caras con cara ELEGIDA por el cliente (sidebar pregunta "¿En
 * qué cara…?" primero). forceTargetSlot salta el re-anclaje a cara A y
 * firstFreeSlotOfFace resuelve el primer slot libre de la cara pedida.
 */
describe("firstFreeSlotOfFace — primer slot libre por cara", () => {
  const slotsOf = (occupied: number[], total = 4) =>
    Array.from({ length: total }, (_, i) => ({
      slotIndex: i,
      assetUrl: occupied.includes(i) ? `https://x/own-${i}.png` : null,
    }));

  it("cara A = slots pares, cara B = impares; respeta ocupados y devuelve el MENOR libre", () => {
    expect(firstFreeSlotOfFace(slotsOf([]), "A")).toBe(0);
    expect(firstFreeSlotOfFace(slotsOf([]), "B")).toBe(1);
    expect(firstFreeSlotOfFace(slotsOf([0]), "A")).toBe(2);
    expect(firstFreeSlotOfFace(slotsOf([1, 3]), "B")).toBeNull();
  });

  it("sin slots de la cara → null (nunca devuelve uno ocupado)", () => {
    expect(firstFreeSlotOfFace(slotsOf([0, 2]), "A")).toBeNull();
    expect(firstFreeSlotOfFace([], "A")).toBeNull();
  });

  it("tolera slots desordenados (devuelve el de menor slotIndex)", () => {
    const messy = [
      { slotIndex: 5, assetUrl: null },
      { slotIndex: 1, assetUrl: "https://x/a.png" },
      { slotIndex: 3, assetUrl: null },
    ];
    expect(firstFreeSlotOfFace(messy, "B")).toBe(3);
  });
});

describe("applyPredesignedToSlot — forceTargetSlot (cara elegida por el cliente, 2026-10-12)", () => {
  it("diseño de 1 cara sobre una cara B libre → cae en ESA cara (sin re-anclar a la A)", async () => {
    const store = setup(4);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1"),
      targetSlot: 3,
      facesPerUnit: 2,
      forceTargetSlot: true,
    });
    expect(res).toEqual({ ok: true, bBlocked: false });
    const slots = store.getState().canvasData!.slots;
    expect(slots[3]!.assetId).toBe("asset-g1-a"); // la cara B elegida
    expect(slots[2]!.assetId).toBeNull(); // la cara A de su par queda libre
  });

  it("sin forceTargetSlot el mismo caso mantiene el re-anclaje a cara A (comportamiento previo)", async () => {
    const store = setup(4);
    await applyPredesignedToSlot({ store, item: item("g1"), targetSlot: 3, facesPerUnit: 2 });
    const slots = store.getState().canvasData!.slots;
    expect(slots[2]!.assetId).toBe("asset-g1-a");
    expect(slots[3]!.assetId).toBeNull();
  });

  it("defensa: un item con cara B server-side aplicado forzado a una cara B NO cruza a la unidad siguiente", async () => {
    const store = setup(4);
    const res = await applyPredesignedToSlot({
      store,
      item: item("g1-ab"),
      targetSlot: 1,
      facesPerUnit: 2,
      forceTargetSlot: true,
    });
    expect(res.ok).toBe(true);
    const slots = store.getState().canvasData!.slots;
    expect(slots[1]!.assetId).toBe("asset-g1-ab-a");
    // La B del diseño NO cae en el slot 2 (cara A de la unidad siguiente).
    expect(slots[2]!.assetId).toBeNull();
  });
});
