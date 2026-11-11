/*
 * Tests del cache de snapshots Konva por slot (Paquete J, 2026-10-02).
 *
 * Lo que se congela acá es la INVALIDACIÓN — el riesgo real del feature:
 * un snapshot viejo en la Vista previa/3D sería un bug de fidelidad de
 * imprenta. El stage es un fake estructural (SnapshotStageSource), sin Konva.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas, Image as NapiImage, loadImage as napiLoadImage } from "@napi-rs/canvas";
import {
  clearSlotSnapshotCache,
  evictSlotSnapshotCache,
  isValidRasterDataUrl,
  SLOT_SNAPSHOT_CACHE_LIMIT,
  snapshotRasterPlan,
  snapshotSlotForPreview,
  slotSnapshotCacheSize,
  type SnapshotStageSource,
} from "./slot-snapshot-cache";
import {
  buildMagnetTextures,
  buildOrnamentPreview,
  clearPreviewSlot2DCache,
  renderSlotToDataUrl2D,
} from "./production-preview-render";
import type { CanvasDataV1, CanvasDataV2, SlotState } from "../types";

function makeSlot(index: number, extra: Partial<SlotState> = {}): SlotState {
  return { slotIndex: index, assetId: `a${index}`, assetUrl: `https://x/${index}.png`, ...extra };
}

function makeTemplate(tag: string): CanvasDataV1 {
  return {
    version: 1,
    stage: { width: 100, height: 100 },
    layers: [],
    background: null,
    tag,
  } as unknown as CanvasDataV1;
}

function makeStage(w = 450, h = 575) {
  const indicator = { hide: vi.fn(), show: vi.fn() };
  const stage: SnapshotStageSource & { toDataURL: ReturnType<typeof vi.fn> } = {
    width: () => w,
    height: () => h,
    find: vi.fn(() => [indicator]),
    toDataURL: vi.fn(() => `data:image/png;base64,shot-${Math.random()}`),
  };
  return { stage, indicator };
}

describe("snapshotSlotForPreview — cache e invalidación", () => {
  beforeEach(() => clearSlotSnapshotCache());

  it("mismo slot (misma referencia) + mismo contexto → rasteriza UNA vez", () => {
    const { stage } = makeStage();
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const first = snapshotSlotForPreview(stage, slot, ctx);
    const second = snapshotSlotForPreview(stage, slot, ctx);
    expect(second).toBe(first);
    expect(stage.toDataURL).toHaveBeenCalledTimes(1);
  });

  it("slot con contenido NUEVO (nueva referencia) → invalida y re-rasteriza", () => {
    const { stage } = makeStage();
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    snapshotSlotForPreview(stage, makeSlot(0), ctx);
    // El store es inmutable: cualquier cambio (foto/encuadre/filtro/texto)
    // produce un objeto slot nuevo aunque tenga los mismos campos visibles.
    snapshotSlotForPreview(stage, makeSlot(0), ctx);
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });

  it("cambio de borderColor (estilo de tarjeta) → invalida", () => {
    const { stage } = makeStage();
    const slot = makeSlot(0);
    const unitTemplate = makeTemplate("t1");
    snapshotSlotForPreview(stage, slot, { unitTemplate, borderColor: null });
    snapshotSlotForPreview(stage, slot, { unitTemplate, borderColor: "#FF0000" });
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });

  it("cambio de plantilla (unitTemplate nuevo) → invalida", () => {
    const { stage } = makeStage();
    const slot = makeSlot(0);
    snapshotSlotForPreview(stage, slot, { unitTemplate: makeTemplate("t1"), borderColor: null });
    snapshotSlotForPreview(stage, slot, { unitTemplate: makeTemplate("t2"), borderColor: null });
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });

  it("cambio de tamaño DISPLAY del stage (zoom de lienzo) NO invalida: la salida es fija", () => {
    // Fix STG 2026-10-05 — el snapshot se rasteriza al ancho objetivo (720px),
    // no al tamaño display: el mismo diseño al mismo tamaño de salida produce
    // el mismo PNG aunque el stage esté zoomado, así que el cache PEGA.
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const a = makeStage(450, 575);
    const first = snapshotSlotForPreview(a.stage, slot, ctx);
    const b = makeStage(900, 1150); // zoom 200%
    const second = snapshotSlotForPreview(b.stage, slot, ctx);
    expect(second).toBe(first);
    expect(b.stage.toDataURL).not.toHaveBeenCalled();
  });

  it("cambio de tamaño objetivo (otro consumidor) → invalida y re-rasteriza", () => {
    const { stage } = makeStage();
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    snapshotSlotForPreview(stage, slot, ctx);
    snapshotSlotForPreview(stage, slot, ctx, { targetWidth: 1024 });
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });

  it("los indicadores de edición se ocultan SOLO al rasterizar (no en cache hit)", () => {
    const { stage, indicator } = makeStage();
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    snapshotSlotForPreview(stage, slot, ctx);
    expect(indicator.hide).toHaveBeenCalledTimes(1);
    expect(indicator.show).toHaveBeenCalledTimes(1);
    snapshotSlotForPreview(stage, slot, ctx);
    expect(indicator.hide).toHaveBeenCalledTimes(1);
  });

  it("los indicadores se restauran aunque toDataURL lance", () => {
    const { stage, indicator } = makeStage();
    stage.toDataURL.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() =>
      snapshotSlotForPreview(stage, makeSlot(0), { unitTemplate: makeTemplate("t1") }),
    ).toThrow("boom");
    expect(indicator.show).toHaveBeenCalledTimes(1);
  });

  it("desaloja FIFO al superar el tope (memoria acotada)", () => {
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const count = SLOT_SNAPSHOT_CACHE_LIMIT + 2;
    const slots = Array.from({ length: count }, (_, i) => makeSlot(i));
    const stages = slots.map(() => makeStage());
    slots.forEach((slot, i) => snapshotSlotForPreview(stages[i]!.stage, slot, ctx));
    expect(slotSnapshotCacheSize()).toBe(SLOT_SNAPSHOT_CACHE_LIMIT);
    // El slot 0 (el más viejo) fue desalojado → miss → segunda rasterización.
    snapshotSlotForPreview(stages[0]!.stage, slots[0]!, ctx);
    expect(stages[0]!.stage.toDataURL).toHaveBeenCalledTimes(2);
    // El último sigue en cache → hit, NO vuelve a rasterizar.
    const last = count - 1;
    snapshotSlotForPreview(stages[last]!.stage, slots[last]!, ctx);
    expect(stages[last]!.stage.toDataURL).toHaveBeenCalledTimes(1);
  });

  it("cachear no confunde slots distintos con el mismo stage", () => {
    const { stage } = makeStage();
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const a = snapshotSlotForPreview(stage, makeSlot(0), ctx);
    const b = snapshotSlotForPreview(stage, makeSlot(1), ctx);
    expect(a).not.toBe(b);
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });
});

describe("snapshotRasterPlan — tamaño de salida fijo (fix STG 2026-10-05)", () => {
  it("stage grande (zoom/desktop) se rasteriza al ancho objetivo, no al display", () => {
    // 1200px display → 720px de salida (era 1200 a pixelRatio 1).
    const plan = snapshotRasterPlan(1200, 1520);
    expect(plan.outW).toBe(720);
    expect(plan.pixelRatio).toBeCloseTo(0.6);
    expect(plan.outH).toBe(Math.round(1520 * plan.pixelRatio));
  });

  it("stage pequeño no se sobremuestrea más allá de pixelRatio 2", () => {
    const plan = snapshotRasterPlan(300, 380);
    expect(plan.pixelRatio).toBe(2);
    expect(plan.outW).toBe(600);
  });

  it("toDataURL recibe el pixelRatio del plan (no 1 fijo)", () => {
    clearSlotSnapshotCache();
    const { stage } = makeStage(1200, 1520);
    snapshotSlotForPreview(stage, makeSlot(0), {
      unitTemplate: makeTemplate("t1"),
      borderColor: null,
    });
    expect(stage.toDataURL).toHaveBeenCalledWith({
      pixelRatio: expect.closeTo(0.6) as unknown as number,
      mimeType: "image/png",
    });
  });

  it("stage degenerado (0) cae a pixelRatio 1 sin dividir por cero", () => {
    expect(snapshotRasterPlan(0, 0)).toEqual({ pixelRatio: 1, outW: 0, outH: 0 });
  });
});

// ──────────────────────────────────────────────────────────────────
//  Auto-cura de snapshots tomados a medio cargar (bug STG 2026-10-08 —
//  separador plano "en blanco" en el libro 3D, frente y respaldo)
// ──────────────────────────────────────────────────────────────────

/**
 * Fake cuyo `find` distingue selectores: `.edit-indicator` siempre devuelve el
 * indicador; `.slot-photo` solo cuando `photoLoaded` es true (espejo de la rama
 * de ImagePlaceholder: el nodo de la foto SOLO existe con la imagen decodificada;
 * mientras carga, el stage dibuja el placeholder #F4ECFF sin ese nodo).
 */
function makePhotoStage(photoLoaded: { value: boolean }) {
  const indicator = { hide: vi.fn(), show: vi.fn() };
  const photoNode = { hide: vi.fn(), show: vi.fn() };
  const stage: SnapshotStageSource & { toDataURL: ReturnType<typeof vi.fn> } = {
    width: () => 450,
    height: () => 575,
    find: vi.fn((selector: string) => {
      if (selector === ".slot-photo") return photoLoaded.value ? [photoNode] : [];
      return [indicator];
    }),
    toDataURL: vi.fn(() => `data:image/png;base64,shot-${Math.random()}`),
  };
  return { stage };
}

describe("photoPending — snapshot a medio cargar (placeholder #F4ECFF)", () => {
  beforeEach(() => clearSlotSnapshotCache());

  it("se re-rasteriza cuando la foto aparece, AUNQUE la referencia del slot no cambie", () => {
    // La carga de useImage NO toca el store: sin la re-validación photoPending,
    // la clave (misma referencia de slot) serviría el placeholder para siempre.
    const loaded = { value: false };
    const { stage } = makePhotoStage(loaded);
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    snapshotSlotForPreview(stage, slot, ctx); // placeholder horneado (cargando)
    expect(stage.toDataURL).toHaveBeenCalledTimes(1);
    loaded.value = true; // useImage resolvió y el slot renderizó la foto
    const second = snapshotSlotForPreview(stage, slot, ctx);
    expect(stage.toDataURL).toHaveBeenCalledTimes(2); // auto-cura: re-rasteriza
    expect(second).not.toBe(""); // dataURL nuevo (con la foto)
    // Tercera llamada: la entrada ya es buena → hit normal, sin re-rasterizar.
    snapshotSlotForPreview(stage, slot, ctx);
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });

  it("mientras la foto SIGUE cargando, el hit provisional se sirve (re-rasterizar daría el mismo placeholder)", () => {
    const loaded = { value: false };
    const { stage } = makePhotoStage(loaded);
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const first = snapshotSlotForPreview(stage, slot, ctx);
    const second = snapshotSlotForPreview(stage, slot, ctx);
    expect(second).toBe(first);
    expect(stage.toDataURL).toHaveBeenCalledTimes(1);
  });

  it("slot SIN assetUrl nunca queda provisional (placeholder de slot vacío es contenido válido)", () => {
    const loaded = { value: false }; // sin foto que esperar
    const { stage } = makePhotoStage(loaded);
    const slot = makeSlot(0, { assetUrl: undefined });
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    snapshotSlotForPreview(stage, slot, ctx);
    snapshotSlotForPreview(stage, slot, ctx);
    expect(stage.toDataURL).toHaveBeenCalledTimes(1);
  });

  it("profileAssetUrl pendiente de .slot-profile-photo se marca provisional y se auto-cura al cargar", () => {
    const profileLoaded = { value: false };
    const indicator = { hide: vi.fn(), show: vi.fn() };
    const node = { hide: vi.fn(), show: vi.fn() };
    const stage: SnapshotStageSource & { toDataURL: ReturnType<typeof vi.fn> } = {
      width: () => 450,
      height: () => 575,
      find: vi.fn((selector: string) => {
        if (selector === ".slot-photo") return [node];
        if (selector === ".slot-profile-photo") return profileLoaded.value ? [node] : [];
        return [indicator];
      }),
      toDataURL: vi.fn(() => `data:image/png;base64,shot-${Math.random()}`),
    };
    const slot = makeSlot(0, { profileAssetUrl: "https://x/avatar.png" });
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    snapshotSlotForPreview(stage, slot, ctx);
    expect(stage.toDataURL).toHaveBeenCalledTimes(1);
    profileLoaded.value = true;
    snapshotSlotForPreview(stage, slot, ctx);
    expect(stage.toDataURL).toHaveBeenCalledTimes(2);
  });

  it("rechaza y NO cachea salidas degeneradas ('data:,' o vacío) por agotamiento de memoria Canvas2D", () => {
    expect(isValidRasterDataUrl("")).toBe(false);
    expect(isValidRasterDataUrl("data:,")).toBe(false);
    expect(isValidRasterDataUrl("data:image/png;base64,")).toBe(false);
    expect(isValidRasterDataUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);

    const { stage } = makeStage();
    stage.toDataURL.mockReturnValueOnce("data:,");
    const slot = makeSlot(0);
    const ctx = { unitTemplate: makeTemplate("t1"), borderColor: null };
    const degenerate = snapshotSlotForPreview(stage, slot, ctx);
    expect(isValidRasterDataUrl(degenerate)).toBe(false);
    expect(slotSnapshotCacheSize()).toBe(0);

    // En la siguiente llamada con memoria recuperada, vuelve a rasterizar y cachea el PNG sano.
    const healthy = snapshotSlotForPreview(stage, slot, ctx);
    expect(isValidRasterDataUrl(healthy)).toBe(true);
    expect(slotSnapshotCacheSize()).toBe(1);
    evictSlotSnapshotCache(0);
    expect(slotSnapshotCacheSize()).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Motor Canvas2D determinista (sin Konva Stage) — regresión móvil
//  «Editar desde /carrito» en Bola Navideña (5 bolas = 10 caras)
// ──────────────────────────────────────────────────────────────────

describe("renderSlotToDataUrl2D + buildOrnamentPreview + buildMagnetTextures (@napi-rs/canvas)", () => {
  const prevDocument = globalThis.document;
  const prevImage = globalThis.Image;

  function makeSolidDataUrl(r: number, g: number, b: number, size = 64): string {
    const c = createCanvas(size, size);
    const ctx = c.getContext("2d");
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, size, size);
    return c.toDataURL("image/png");
  }

  async function decodePixels(dataUrl: string) {
    const comma = dataUrl.indexOf(",");
    const buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
    const img = await napiLoadImage(buf);
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return {
      width: img.width,
      height: img.height,
      px: (x: number, y: number) =>
        Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data),
    };
  }

  function makeOrnamentCanvas(
    crimsonUrl: string,
    royalBlueUrl: string,
    unitCount = 5,
  ): CanvasDataV2 {
    const unitTemplate: CanvasDataV1 = {
      version: 1,
      stage: { width: 480, height: 480 },
      background: "#FFF8F0",
      layers: [
        {
          id: "photo",
          type: "image-placeholder",
          x: 0,
          y: 0,
          width: 480,
          height: 480,
          fit: "cover",
        },
        {
          id: "cut",
          type: "shape",
          shape: "circle",
          x: 0,
          y: 0,
          width: 480,
          height: 480,
        },
      ],
    };
    const slots: SlotState[] = Array.from({ length: unitCount * 2 }, (_, idx) => ({
      slotIndex: idx,
      assetId: idx % 2 === 0 ? `asset-a-${idx}` : `asset-b-${idx}`,
      assetUrl: idx % 2 === 0 ? crimsonUrl : royalBlueUrl,
    }));
    return {
      version: 2,
      slotCount: unitCount * 2,
      unitCount,
      unitSlots: 2,
      photoSlots: unitCount * 2,
      gridLayout: { cols: 2, rows: unitCount, gap: 16 },
      unitTemplate,
      slots,
    };
  }

  beforeAll(() => {
    const nativeSrcDesc = Object.getOwnPropertyDescriptor(NapiImage.prototype, "src")!;
    function BrowserImageShim() {
      const img = new NapiImage();
      Object.defineProperty(img, "crossOrigin", { value: null, writable: true });
      Object.defineProperty(img, "src", {
        configurable: true,
        get() {
          return nativeSrcDesc.get?.call(img);
        },
        set(val: string | Buffer) {
          if (Buffer.isBuffer(val)) {
            nativeSrcDesc.set!.call(img, val);
            return;
          }
          if (typeof val === "string" && val.startsWith("data:")) {
            const comma = val.indexOf(",");
            nativeSrcDesc.set!.call(img, Buffer.from(val.slice(comma + 1), "base64"));
            return;
          }
          queueMicrotask(() =>
            (img.onerror as ((err?: unknown) => void) | null)?.(
              new Error(`Mock failed load: ${String(val)}`),
            ),
          );
        },
      });
      return img;
    }

    (globalThis as unknown as { Image: unknown }).Image = BrowserImageShim;
    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => {
        if (tag === "canvas") return createCanvas(1, 1);
        throw new Error(`Unsupported element in test: ${tag}`);
      },
      fonts: { status: "loaded" },
    };
  });

  afterAll(() => {
    (globalThis as unknown as { document: unknown }).document = prevDocument;
    (globalThis as unknown as { Image: unknown }).Image = prevImage;
  });

  beforeEach(() => {
    clearSlotSnapshotCache();
    clearPreviewSlot2DCache();
  });

  it("renderSlotToDataUrl2D renderiza foto circular real con esquinas transparentes y cachea por referencia", async () => {
    const crimson = makeSolidDataUrl(220, 20, 60);
    const canvasData = makeOrnamentCanvas(crimson, crimson, 1);
    const slot = canvasData.slots[0]!;

    const first = await renderSlotToDataUrl2D({
      unitTemplate: canvasData.unitTemplate,
      slot,
      totalSlots: 2,
      shape: "circle",
    });
    expect(first.assetMissing).toBe(false);
    const decoded = await decodePixels(first.dataUrl);
    // Esquina fuera del círculo → alfa 0.
    expect(decoded.px(2, 2)[3]).toBe(0);
    // Centro del inserto circular → rojo carmesí sólido.
    const [r, g, b, a] = decoded.px(decoded.width / 2, decoded.height / 2);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(50);
    expect(b).toBeLessThan(80);

    // Misma referencia de slot → cache hit exacto.
    const second = await renderSlotToDataUrl2D({
      unitTemplate: canvasData.unitTemplate,
      slot,
      totalSlots: 2,
      shape: "circle",
    });
    expect(second.dataUrl).toBe(first.dataUrl);
  });

  it("5 bolas SIN ningún Konva Stage montado (stages vacío): Bola 1 y Bola 5 pintan Cara A roja y Cara B azul en Ver diseño y 3D", async () => {
    const crimson = makeSolidDataUrl(220, 20, 60);
    const royalBlue = makeSolidDataUrl(30, 80, 220);
    const canvasData = makeOrnamentCanvas(crimson, royalBlue, 5);
    const emptyStages = new Map();

    // «Ver diseño» — Bola 1 (unitIndex=0) y Bola 5 (unitIndex=4, off-screen en LazySlotPlaceholder).
    for (const unitIndex of [0, 4]) {
      const previewUrl = await buildOrnamentPreview(
        canvasData,
        emptyStages,
        { faceA: "Cara A", faceB: "Cara B" },
        unitIndex,
        { allowText: false, frameFullBleed: false },
      );
      const preview = await decodePixels(previewUrl);
      const [ar, ag, ab] = preview.px(preview.width * 0.26, preview.height * 0.45);
      const [br, bg, bb] = preview.px(preview.width * 0.74, preview.height * 0.45);
      expect(ar).toBeGreaterThan(180);
      expect(ag).toBeLessThan(70);
      expect(ab).toBeLessThan(95);
      expect(bb).toBeGreaterThan(180);
      expect(br).toBeLessThan(80);
      expect(bg).toBeLessThan(120);
    }

    // «Míralo en tu espacio» (3D) — 10 texturas (slots 0..9) con 0 stages Konva montados.
    const textures = await buildMagnetTextures(canvasData, emptyStages, "circle", 256, {
      allowText: false,
      frameFullBleed: false,
    });
    expect(textures).toHaveLength(10);

    for (const [slotIdx, kind] of [
      [0, "crimson"],
      [1, "blue"],
      [8, "crimson"],
      [9, "blue"],
    ] as const) {
      const tex = await decodePixels(textures[slotIdx]!.dataUrl);
      expect(tex.px(2, 2)[3]).toBe(0); // exterior del troquel circular transparente
      const [r, g, b, a] = tex.px(tex.width / 2, tex.height / 2);
      expect(a).toBe(255);
      if (kind === "crimson") {
        expect(r).toBeGreaterThan(200);
        expect(g).toBeLessThan(50);
      } else {
        expect(b).toBeGreaterThan(200);
        expect(r).toBeLessThan(60);
      }
    }
  });

  it("refresca URLs firmadas expiradas UNA sola vez (refreshExpiredAssets) y reintenta con las fotos frescas", async () => {
    const crimson = makeSolidDataUrl(220, 20, 60);
    const royalBlue = makeSolidDataUrl(30, 80, 220);
    const expiredCanvas = makeOrnamentCanvas(
      "https://example.supabase.co/storage/v1/object/sign/customer-uploads/expired-a.jpg?token=old",
      "https://example.supabase.co/storage/v1/object/sign/customer-uploads/expired-b.jpg?token=old",
      1,
    );
    const freshCanvas = makeOrnamentCanvas(crimson, royalBlue, 1);
    const refreshSpy = vi.fn(async () => freshCanvas);

    const textures = await buildMagnetTextures(expiredCanvas, new Map(), "circle", 256, {
      allowText: false,
      frameFullBleed: false,
      refreshExpiredAssets: refreshSpy,
    });

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    const texA = await decodePixels(textures[0]!.dataUrl);
    const texB = await decodePixels(textures[1]!.dataUrl);
    expect(texA.px(texA.width / 2, texA.height / 2)[0]).toBeGreaterThan(200);
    expect(texB.px(texB.width / 2, texB.height / 2)[2]).toBeGreaterThan(200);
  });

  it("buildCompositedPreview + tarjeta Polaroid con frame-card, borderColor, texto y filtro CSS degrada limpio sin stage Konva", async () => {
    const { buildCompositedPreview } = await import("./production-preview-render");
    const crimson = makeSolidDataUrl(220, 20, 60);
    const polaroidTemplate: CanvasDataV1 = {
      version: 1,
      stage: { width: 450, height: 575 },
      background: "#FFFFFF",
      layers: [
        {
          id: "card",
          type: "frame-card",
          x: 0,
          y: 0,
          width: 450,
          height: 575,
          fill: "#FFFFFF",
          cornerRadius: 12,
        },
        {
          id: "photo",
          type: "image-placeholder",
          x: 28,
          y: 28,
          width: 394,
          height: 394,
          fit: "cover",
        },
        {
          id: "caption",
          type: "text",
          x: 28,
          y: 450,
          width: 394,
          text: "Feliz Navidad",
          fontFamily: "Fredoka",
          fontSize: 28,
          fill: "#3D2E5C",
          align: "center",
          editable: true,
        },
      ],
    };
    const canvasData: CanvasDataV2 = {
      version: 2,
      slotCount: 1,
      unitCount: 1,
      unitSlots: 1,
      photoSlots: 1,
      borderColor: "#7C6AAD",
      gridLayout: { cols: 1, rows: 1, gap: 16 },
      unitTemplate: polaroidTemplate,
      slots: [
        {
          slotIndex: 0,
          assetId: "asset-pol-0",
          assetUrl: crimson,
          filter: "vivid",
          textOverrides: { caption: { text: "Recuerdo 2026" } },
        },
      ],
    };

    const previewDataUrl = await buildCompositedPreview(canvasData, new Map(), "rectangle", {
      allowText: true,
      frameFullBleed: true,
    });
    const decoded = await decodePixels(previewDataUrl);
    // Zona de la foto central → rojiza; franja inferior de la tarjeta → púrpura `#7C6AAD`.
    const [pr, pg] = decoded.px(decoded.width / 2, decoded.height * 0.35);
    const [br, , bb] = decoded.px(decoded.width / 2, decoded.height * 0.9);
    expect(pr).toBeGreaterThan(160);
    expect(pg).toBeLessThan(80);
    expect(bb).toBeGreaterThan(130);
    expect(br).toBeGreaterThan(90);
  });
});
