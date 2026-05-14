"use client";

/*
 * StudioEditor — orquestador client del Estudio v2 (M.3.b Capa 2).
 *
 * Responsabilidades:
 *   1. Crear/recuperar Design + canvasData V2 al montar
 *   2. Inicializar el zustand store del editor
 *   3. Coordinar auto-save 2s debounce (effect observa store.isDirty)
 *   4. Manejar finalize: snapshots por slot via Konva stage.toDataURL +
 *      preview compositado via canvas API + llamada server action
 *   5. Conectar modal asset picker
 *   6. Add-to-cart redirect post-finalize
 *
 * Lo que NO hace este componente:
 *   - Render del canvas (delegado a StudioCanvasGrid)
 *   - Render de sidebar (delegado a StudioSidebar)
 *   - Render de toolbar (delegado a StudioToolbar)
 *   - State management (delegado al zustand store interno)
 *
 * Bloqueado-en-construcción: no renderea hasta tener canvasData válido del
 * server. Show loading skeleton.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "zustand";
import type Konva from "konva";
import {
  createDraftDesignAction,
  finalizeDesignAction,
  saveCanvasAction,
} from "@/features/personalization/actions";
import { parsePhotoProductConfig } from "@/features/personalization/schemas";
import { addPersonalizedToCartAction } from "@/app/carrito/actions";
import { StudioCanvasGrid } from "./studio-canvas-grid";
import { StudioSidebar } from "./studio-sidebar";
import { StudioToolbar } from "./studio-toolbar";
import { StudioAssetPickerModal } from "./studio-asset-picker-modal";
import { StudioPhotoAdjustModal } from "./studio-photo-adjust-modal";
import { createStudioStore } from "./lib/store";
import type { CanvasData, CanvasDataV2, StudioAsset, StudioProduct, StudioTemplate } from "./types";
import { ensureCanvasV2 } from "./lib/canvas-migrate";

const AUTO_SAVE_DELAY_MS = 2000;

type StudioEditorProps = {
  product: StudioProduct;
  templates: StudioTemplate[];
  initialDesignId: string | null;
  initialDesignCanvas: CanvasData | null;
  initialDesignAssets: StudioAsset[];
  photoSlots: number;
};

export function StudioEditor({
  product,
  templates,
  initialDesignId,
  initialDesignCanvas,
  initialDesignAssets,
  photoSlots,
}: StudioEditorProps) {
  const router = useRouter();
  const store = useMemo(() => createStudioStore(), []);
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);
  // M.3.b.B.3 — Slot index del modal de ajustar foto (filtros).
  const [adjustSlotIndex, setAdjustSlotIndex] = useState<number | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  // M.3.b.B.1 — Toggle bleed + safe area guides (default off para que cliente
  // no se confunda con líneas de seguridad si no las necesita ver).
  const [showRealismGuides, setShowRealismGuides] = useState(false);
  const slotStagesRef = useRef<Map<number, Konva.Stage | null>>(new Map());

  // M.3.b.A2.5 — Lee `sizeCm` del producto para badge visual en cada slot.
  // Producto config viene como JSON unknown, parsePhotoProductConfig hace
  // safeParse Zod con fallback a {photoSlots: 1}. Solo usamos sizeCm.
  const productConfig = useMemo(
    () => parsePhotoProductConfig(product.personalizationSchema),
    [product.personalizationSchema],
  );

  // Subscribir reactivamente al modal — assets/designId del store, no snapshot
  const modalAssets = useStore(store, (s) => s.assets);
  const modalDesignId = useStore(store, (s) => s.designId);

  // ──────────── Boot: crear draft (o recuperar existente) ────────────
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        let designId = initialDesignId;
        let canvasData: CanvasDataV2;
        let templateId: string | null = null;

        if (designId && initialDesignCanvas) {
          // Design existente: asegurar V2 (migrar V1 si hace falta)
          canvasData = ensureCanvasV2(initialDesignCanvas, photoSlots);
        } else {
          // Crear draft nuevo
          const result = await createDraftDesignAction({ productId: product.id });
          if (!result.ok) {
            throw new Error(result.message);
          }
          designId = result.designId;
          // Recargar canvasData del nuevo draft. Como acabamos de crearlo
          // server-side con V2, asumimos shape correcto.
          // Para evitar un round-trip extra, reconstruimos el shape esperado:
          const firstTemplate = templates[0];
          if (!firstTemplate) {
            throw new Error("No hay plantillas disponibles para este producto");
          }
          templateId = firstTemplate.id;
          canvasData = {
            version: 2,
            unitTemplate: firstTemplate.canvasData,
            slotCount: photoSlots,
            slots: Array.from({ length: photoSlots }, (_, idx) => ({
              slotIndex: idx,
              assetId: null,
              assetUrl: null,
            })),
            gridLayout: defaultGridFor(photoSlots, firstTemplate.canvasData.stage),
          };
        }

        if (cancelled) return;

        store.getState().init({
          designId: designId!,
          productSlug: product.slug,
          canvasData,
          templates,
          selectedTemplateId: templateId ?? findTemplateIdForCanvas(canvasData, templates),
        });

        // Hidratar assets pre-existentes (Design recuperado)
        for (const asset of initialDesignAssets) {
          store.getState().addAsset(asset);
        }

        setBooting(false);
      } catch (err) {
        if (cancelled) return;
        setBootError(err instanceof Error ? err.message : String(err));
        setBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [
    initialDesignId,
    initialDesignCanvas,
    initialDesignAssets,
    product.id,
    product.slug,
    photoSlots,
    templates,
    store,
  ]);

  // ──────────── Auto-save 2s debounce ────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = store.subscribe((state, prev) => {
      // Solo disparar al cambiar canvasData (no en cada update menor)
      if (state.canvasData === prev.canvasData) return;
      if (!state.isDirty || !state.designId || !state.canvasData) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const current = store.getState();
        if (!current.designId || !current.canvasData) return;
        current.setAutoSaveStatus({ kind: "saving" });
        const result = await saveCanvasAction({
          designId: current.designId,
          canvasData: current.canvasData,
        });
        if (result.ok) {
          current.setAutoSaveStatus({ kind: "saved", at: Date.now() });
          current.markClean();
        } else {
          current.setAutoSaveStatus({ kind: "error", message: result.message });
        }
      }, AUTO_SAVE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [store]);

  // ──────────── Click slot → abrir asset picker ────────────
  const handleSlotClick = useCallback((slotIndex: number) => {
    setPickerSlotIndex(slotIndex);
  }, []);

  const handleAssetSelected = useCallback(
    (asset: StudioAsset) => {
      if (pickerSlotIndex === null) return;
      store.getState().assignAssetToSlot(pickerSlotIndex, asset);
    },
    [pickerSlotIndex, store],
  );

  const handleAssetUploaded = useCallback(
    (asset: StudioAsset) => {
      store.getState().addAsset(asset);
    },
    [store],
  );

  // ──────────── Finalize: snapshots N + preview compositado ────────────
  const handleFinalize = useCallback(async () => {
    const state = store.getState();
    if (!state.designId || !state.canvasData || state.isFinalizing) return;
    state.setIsFinalizing(true);
    try {
      // Generar productionDataUrls (uno por slot, pixelRatio 3 para 300 DPI aprox)
      const productionDataUrls: string[] = [];
      for (const slot of state.canvasData.slots) {
        const stage = slotStagesRef.current.get(slot.slotIndex);
        if (!stage) {
          throw new Error(`No se pudo encontrar el slot ${slot.slotIndex + 1} para snapshot`);
        }
        const dataUrl = stage.toDataURL({ pixelRatio: 3, mimeType: "image/png" });
        productionDataUrls.push(dataUrl);
      }

      // Generar preview compositado del grid completo via canvas API
      const previewDataUrl = await buildCompositedPreview(state.canvasData, slotStagesRef.current);

      // Llamar server action finalize
      const result = await finalizeDesignAction({
        designId: state.designId,
        previewDataUrl,
        productionDataUrls,
      });

      if (!result.ok) {
        state.setIsFinalizing(false);
        state.setAutoSaveStatus({ kind: "error", message: result.message });
        return;
      }

      // Add to cart
      const addResult = await addPersonalizedToCartAction({
        designId: state.designId,
        qty: 1,
      });
      if (!addResult.ok) {
        state.setIsFinalizing(false);
        state.setAutoSaveStatus({
          kind: "error",
          message: `Diseño guardado pero no pudimos agregarlo al carrito: ${addResult.message}`,
        });
        return;
      }

      // Redirect al carrito
      router.push("/carrito?personalized=1");
    } catch (err) {
      state.setIsFinalizing(false);
      state.setAutoSaveStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [router, store]);

  // ──────────── Estados de boot ────────────
  if (bootError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <p className="text-brand-purple-dark text-lg font-semibold">
            No pudimos abrir el Estudio
          </p>
          <p className="text-brand-purple-dark/70 mt-2 text-sm">{bootError}</p>
        </div>
      </div>
    );
  }

  if (booting) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="text-brand-purple/70 flex items-center gap-3">
          <div className="border-brand-purple/30 border-t-brand-purple h-6 w-6 animate-spin rounded-full border-2" />
          <span>Preparando lienzo...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <StudioToolbar
        store={store}
        productName={product.name}
        productSlug={product.slug}
        showRealismGuides={showRealismGuides}
        onToggleRealismGuides={() => setShowRealismGuides((v) => !v)}
        onFinalize={handleFinalize}
      />

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside
          className="border-brand-purple/10 bg-white lg:w-72 lg:border-r"
          aria-label="Herramientas del Estudio"
        >
          <StudioSidebar store={store} productName={product.name} productSku={product.sku} />
        </aside>

        <section className="flex flex-1 items-start justify-center p-4 lg:p-8">
          <StudioCanvasGrid
            store={store}
            sizeCm={productConfig.sizeCm}
            shape={productConfig.shape}
            finish={productConfig.finish}
            cornerRadiusPx={productConfig.cornerRadiusPx}
            showRealismGuides={showRealismGuides}
            onSlotClick={handleSlotClick}
            onSlotAdjust={(slotIndex) => setAdjustSlotIndex(slotIndex)}
            registerSlotStages={(stages) => {
              slotStagesRef.current = stages;
            }}
          />
        </section>
      </div>

      <StudioAssetPickerModal
        isOpen={pickerSlotIndex !== null}
        slotIndex={pickerSlotIndex}
        totalSlots={photoSlots}
        assets={modalAssets}
        designId={modalDesignId}
        onClose={() => setPickerSlotIndex(null)}
        onSelectAsset={handleAssetSelected}
        onAssetUploaded={handleAssetUploaded}
      />

      {/* M.3.b.B.3 — Modal de ajustar foto (filtros) */}
      <PhotoAdjustModalWrapper
        store={store}
        slotIndex={adjustSlotIndex}
        onClose={() => setAdjustSlotIndex(null)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
//  PhotoAdjustModalWrapper — extrae slot state via store + monta modal
// ──────────────────────────────────────────────────────────────────

function PhotoAdjustModalWrapper({
  store,
  slotIndex,
  onClose,
}: {
  store: ReturnType<typeof createStudioStore>;
  slotIndex: number | null;
  onClose: () => void;
}) {
  const slots = useStore(store, (s) => s.canvasData?.slots ?? []);
  const setSlotFilter = useStore(store, (s) => s.setSlotFilter);
  const slot = slotIndex !== null ? slots.find((s) => s.slotIndex === slotIndex) : null;

  return (
    <StudioPhotoAdjustModal
      isOpen={slotIndex !== null && !!slot?.assetUrl}
      photoUrl={slot?.assetUrl ?? null}
      currentFilter={slot?.filter ?? null}
      slotIndex={slotIndex}
      onClose={onClose}
      onApply={(filter) => {
        if (slotIndex !== null) setSlotFilter(slotIndex, filter);
      }}
    />
  );
}

// ──────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────

function defaultGridFor(slotCount: number, stage: { width: number; height: number }) {
  const presets: Record<number, { cols: number; rows: number }> = {
    1: { cols: 1, rows: 1 },
    2: { cols: 2, rows: 1 },
    3: { cols: 3, rows: 1 },
    4: { cols: 2, rows: 2 },
    6: { cols: 3, rows: 2 },
    9: { cols: 3, rows: 3 },
    12: { cols: 4, rows: 3 },
    20: { cols: 5, rows: 4 },
  };
  let cols = presets[slotCount]?.cols ?? Math.ceil(Math.sqrt(slotCount));
  let rows = presets[slotCount]?.rows ?? Math.ceil(slotCount / cols);
  const aspect = stage.width / stage.height;
  if (aspect > 2.0 && cols > rows) [cols, rows] = [rows, cols];
  if (aspect < 0.5 && rows > cols) [cols, rows] = [rows, cols];
  const gap = slotCount <= 4 ? 24 : slotCount <= 9 ? 16 : slotCount <= 12 ? 12 : 8;
  return { cols, rows, gap };
}

function findTemplateIdForCanvas(canvas: CanvasDataV2, templates: StudioTemplate[]): string | null {
  // Best-effort: matchear por stage dimensions del unitTemplate
  const match = templates.find(
    (t) =>
      t.canvasData.stage.width === canvas.unitTemplate.stage.width &&
      t.canvasData.stage.height === canvas.unitTemplate.stage.height,
  );
  return match?.id ?? null;
}

/**
 * Componer preview del grid completo via Canvas API nativo. Toma los snapshots
 * individuales de cada slot Konva stage y los apila en un mosaico con el
 * gridLayout. Resultado: 1 PNG 1080×~810 (según rows) que el cart muestra.
 */
async function buildCompositedPreview(
  canvasData: CanvasDataV2,
  stages: Map<number, Konva.Stage | null>,
): Promise<string> {
  const { gridLayout, unitTemplate, slots } = canvasData;
  // Cell size: 360×(360 * aspect) por slot en el preview
  const cellW = 360;
  const cellH = Math.floor(360 * (unitTemplate.stage.height / unitTemplate.stage.width));
  const gap = gridLayout.gap;
  const canvasW = gridLayout.cols * cellW + (gridLayout.cols - 1) * gap;
  const canvasH = gridLayout.rows * cellH + (gridLayout.rows - 1) * gap;

  const compositeCanvas = document.createElement("canvas");
  compositeCanvas.width = canvasW;
  compositeCanvas.height = canvasH;
  const ctx = compositeCanvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear contexto canvas para preview");

  // Background brand-cream
  ctx.fillStyle = "#FFF8F0";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Apilar cada slot
  for (const slot of slots) {
    const stage = stages.get(slot.slotIndex);
    if (!stage) continue;
    const slotDataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const col = slot.slotIndex % gridLayout.cols;
        const row = Math.floor(slot.slotIndex / gridLayout.cols);
        const x = col * (cellW + gap);
        const y = row * (cellH + gap);
        ctx.drawImage(img, x, y, cellW, cellH);
        resolve();
      };
      img.onerror = () => reject(new Error("No se pudo cargar snapshot del slot"));
      img.src = slotDataUrl;
    });
  }

  return compositeCanvas.toDataURL("image/png");
}
