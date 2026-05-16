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
import { useStore, type StoreApi } from "zustand";
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
import { StudioToolbar, StudioFinalizeFab } from "./studio-toolbar";
import { StudioOnboarding } from "./studio-onboarding";
import { StudioPreviewModal } from "./studio-preview-modal";
import { StudioGesturesHint, GESTURES_HINT_STORAGE_KEY } from "./studio-gestures-hint";
import { StudioAssetPickerModal } from "./studio-asset-picker-modal";
import { StudioPhotoAdjustModal } from "./studio-photo-adjust-modal";
import { StudioTextEditorModal } from "./studio-text-editor-modal";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sparkles } from "lucide-react";
import { createStudioStore, type StudioStoreState } from "./lib/store";
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
  // M.3.b.UX.bug v3 — Modal Vista previa fullscreen (Lucy 2026-05-15).
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  // M.3.b.UX.v12 (Lucy 2026-05-15) — Banner de gestos: open controlado +
  // flag persistent (no auto-dismiss cuando se abre manualmente con "?").
  const [gesturesHintOpen, setGesturesHintOpen] = useState(false);
  const [gesturesHintPersistent, setGesturesHintPersistent] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  // M.3.b.B.1 — Toggle bleed + safe area guides (default off para que cliente
  // no se confunda con líneas de seguridad si no las necesita ver).
  const [showRealismGuides, setShowRealismGuides] = useState(false);
  // A2.8 — Sheet drawer mobile state (sidebar bottom slide-up).
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  // M.3.b.D — Text editor inline state: { slotIndex, textLayerId } o null
  const [textEditTarget, setTextEditTarget] = useState<{
    slotIndex: number;
    textLayerId: string;
  } | null>(null);
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
    // A1.2 — Skeleton premium: hero card con shimmer + grid de placeholders pulse
    // + mensaje contextual. Reemplaza el spinner básico.
    const skelCount = Math.min(photoSlots, 6);
    return (
      <div className="from-brand-cream/40 flex flex-1 flex-col bg-gradient-to-b to-white">
        {/* Header skeleton */}
        <div className="border-brand-purple/10 sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="bg-brand-purple/10 h-6 w-20 animate-pulse rounded" />
            <div className="hidden items-center gap-3 md:flex">
              <div className="bg-brand-purple/10 h-10 w-10 animate-pulse rounded-md" />
              <div className="flex flex-col gap-1.5">
                <div className="bg-brand-purple/10 h-3 w-40 animate-pulse rounded" />
                <div className="bg-brand-purple/10 h-2 w-24 animate-pulse rounded" />
              </div>
            </div>
            <div className="bg-brand-purple/15 h-9 w-24 animate-pulse rounded-md" />
          </div>
        </div>

        {/* Body: mascote contextual + grid de slots fantasma */}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
          <div className="flex items-center gap-3">
            {/* Mascote bobbing */}
            <div className="relative h-12 w-12">
              <div className="from-brand-purple/40 via-brand-pink/30 to-brand-yellow/30 absolute inset-0 animate-pulse rounded-full bg-gradient-to-br shadow-md" />
              <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white">
                <span className="text-xl" role="img" aria-label="mascote">
                  💜
                </span>
              </div>
            </div>
            <div className="flex flex-col">
              <p className="text-brand-purple-dark text-sm font-bold">Preparando tu lienzo...</p>
              <p className="text-brand-purple-dark/55 text-xs">
                Cargando tu producto y plantillas en un instante ✨
              </p>
            </div>
          </div>

          {/* Mini grid skeleton de slots */}
          <div
            className="grid w-full max-w-md gap-2"
            style={{
              gridTemplateColumns: `repeat(${Math.min(3, skelCount)}, 1fr)`,
            }}
            aria-hidden
          >
            {Array.from({ length: skelCount }).map((_, i) => (
              <div
                key={i}
                className="from-brand-cream/80 aspect-square overflow-hidden rounded-md bg-gradient-to-br to-white shadow-sm"
              >
                {/* Shimmer overlay */}
                <div className="relative h-full w-full overflow-hidden">
                  <div
                    className="animate-shimmer absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent"
                    style={{ animationDelay: `${i * 0.12}s` }}
                  />
                  <div className="border-brand-purple/15 absolute inset-3 rounded border-2 border-dashed" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CSS shimmer keyframes inline (sin agregar al globals — local al componente) */}
        <style jsx>{`
          @keyframes shimmer {
            100% {
              transform: translateX(100%);
            }
          }
          :global(.animate-shimmer) {
            animation: shimmer 1.8s infinite;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <StudioToolbar
        store={store}
        productName={product.name}
        productSlug={product.slug}
        productImageUrl={product.images?.[0]}
        productSizeCm={productConfig.sizeCm}
        productSlotCount={photoSlots}
        showRealismGuides={showRealismGuides}
        onToggleRealismGuides={() => setShowRealismGuides((v) => !v)}
        onOpenPreview={() => setShowPreviewModal(true)}
        onOpenGesturesHint={() => {
          setGesturesHintPersistent(true);
          setGesturesHintOpen(true);
        }}
        onFinalize={handleFinalize}
      />

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Sidebar desktop (visible lg+, oculto en mobile — usa sheet drawer) */}
        <aside
          className="border-brand-purple/10 hidden bg-white lg:block lg:w-72 lg:border-r"
          aria-label="Herramientas del Estudio"
        >
          <StudioSidebar
            store={store}
            productName={product.name}
            productSku={product.sku}
            productSizeCm={productConfig.sizeCm}
            productShape={productConfig.shape}
          />
        </aside>

        <section className="flex flex-1 items-start justify-center p-4 pb-24 lg:p-8 lg:pb-8">
          <StudioCanvasGrid
            store={store}
            sizeCm={productConfig.sizeCm}
            shape={productConfig.shape}
            finish={productConfig.finish}
            cornerRadiusPx={productConfig.cornerRadiusPx}
            showRealismGuides={showRealismGuides}
            onSlotClick={handleSlotClick}
            onSlotAdjust={(slotIndex) => setAdjustSlotIndex(slotIndex)}
            onTextEdit={(slotIndex, textLayerId) => setTextEditTarget({ slotIndex, textLayerId })}
            registerSlotStages={(stages) => {
              slotStagesRef.current = stages;
            }}
          />
        </section>
      </div>

      {/* A2.8 — FAB mobile + Sheet drawer bottom para la sidebar */}
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Abrir herramientas (plantillas y fotos)"
            className="bg-brand-turquoise ring-brand-turquoise/30 fixed bottom-4 left-4 z-30 inline-flex h-14 items-center gap-2 rounded-full px-5 text-sm font-bold text-white shadow-xl ring-4 transition-transform hover:scale-105 active:scale-95 lg:hidden"
          >
            <Sparkles className="h-5 w-5" />
            <span>Editar</span>
          </button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="border-brand-purple/10 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t bg-white p-0 lg:hidden"
        >
          <SheetHeader className="border-brand-purple/10 sticky top-0 z-10 border-b bg-white/95 px-4 py-3 backdrop-blur">
            <SheetTitle className="text-brand-purple-dark text-base font-bold">
              Personalizar
            </SheetTitle>
          </SheetHeader>
          {/* Reusa el mismo StudioSidebar — no se duplica el código */}
          <div className="pb-6">
            <StudioSidebar
              store={store}
              productName={product.name}
              productSku={product.sku}
              productSizeCm={productConfig.sizeCm}
              productShape={productConfig.shape}
            />
          </div>
        </SheetContent>
      </Sheet>

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

      {/* M.3.b.D — Modal editor de texto inline */}
      <TextEditorModalWrapper
        store={store}
        target={textEditTarget}
        onClose={() => setTextEditTarget(null)}
      />

      {/* M.3.b.UX.1 — FAB ¡Listo! mobile (visible solo <sm, fixed bottom-right) */}
      <StudioFinalizeFab store={store} onFinalize={handleFinalize} />

      {/* M.3.b.UX.5 — Onboarding tutorial primera vez. Se auto-detecta via
          localStorage; si ya se onboardeó (key="v1"), no muestra nada. */}
      <StudioOnboarding />

      {/* M.3.b.UX.v11/v12 — Banner de gestos. Auto-trigger 1ª vez cuando hay
        foto + abierto manualmente desde botón "?" del toolbar. */}
      <StudioGesturesHintWrapper
        store={store}
        open={gesturesHintOpen}
        persistent={gesturesHintPersistent}
        onClose={() => {
          setGesturesHintOpen(false);
          setGesturesHintPersistent(false);
          // Marca como visto al cerrar (tanto auto como manual close cuentan).
          try {
            window.localStorage.setItem(GESTURES_HINT_STORAGE_KEY, "true");
          } catch {
            // localStorage puede no estar disponible (incognito).
          }
        }}
        onAutoTrigger={() => {
          setGesturesHintPersistent(false);
          setGesturesHintOpen(true);
        }}
      />

      {/* M.3.b.UX.bug v3 — Modal "Vista previa final" (Lucy 2026-05-15). */}
      <StudioPreviewModalWrapper
        store={store}
        open={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        productName={product.name}
        productSizeCm={productConfig.sizeCm}
        shape={productConfig.shape}
        finish={productConfig.finish}
        cornerRadiusPx={productConfig.cornerRadiusPx}
        onFinalize={() => {
          setShowPreviewModal(false);
          handleFinalize();
        }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
//  StudioPreviewModalWrapper — suscribe isFinalizing del store
// ──────────────────────────────────────────────────────────────────
function StudioPreviewModalWrapper({
  store,
  open,
  onClose,
  productName,
  productSizeCm,
  shape,
  finish,
  cornerRadiusPx,
  onFinalize,
}: {
  store: StoreApi<StudioStoreState>;
  open: boolean;
  onClose: () => void;
  productName: string;
  productSizeCm?: string;
  shape?: "rectangle" | "circle" | "heart" | "custom";
  finish?: "matte" | "glossy" | "soft-touch";
  cornerRadiusPx?: number;
  onFinalize: () => void;
}) {
  const isFinalizing = useStore(store, (s) => s.isFinalizing);
  return (
    <StudioPreviewModal
      open={open}
      onClose={onClose}
      store={store}
      productName={productName}
      productSizeCm={productSizeCm}
      shape={shape}
      finish={finish}
      cornerRadiusPx={cornerRadiusPx}
      onFinalize={onFinalize}
      isFinalizing={isFinalizing}
    />
  );
}

// ──────────────────────────────────────────────────────────────────
//  StudioGesturesHintWrapper (Lucy v12) — controla apertura del banner:
//    - Auto-abrir 1ª vez que hay foto cargada (gestionado con localStorage).
//    - Apertura manual cuando se clickea botón "?" del toolbar.
// ──────────────────────────────────────────────────────────────────
function StudioGesturesHintWrapper({
  store,
  open,
  onClose,
  persistent,
  onAutoTrigger,
}: {
  store: ReturnType<typeof createStudioStore>;
  open: boolean;
  onClose: () => void;
  persistent: boolean;
  /** Callback que el editor llama internamente cuando se cumple la condición
   *  de auto-open (filledCount > 0 + localStorage no marcado). */
  onAutoTrigger: () => void;
}) {
  // Conteo de slots con foto — selector atómico primitivo.
  const filledCount = useStore(
    store,
    (s) => s.canvasData?.slots.filter((sl) => !!sl.assetUrl).length ?? 0,
  );

  // Auto-trigger 1ª vez (localStorage check vive acá).
  useEffect(() => {
    if (filledCount === 0) return;
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(GESTURES_HINT_STORAGE_KEY);
    if (seen === "true") return;
    const t = window.setTimeout(() => onAutoTrigger(), 600);
    return () => window.clearTimeout(t);
  }, [filledCount, onAutoTrigger]);

  return <StudioGesturesHint open={open} onClose={onClose} persistent={persistent} />;
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
  // Selectores ATÓMICOS primitivos — evita el re-render infinito que daba
  // selector compuesto `s.canvasData?.slots ?? []` (array literal nuevo cada
  // render → React detecta cambio → loop). Memoria feedback_react_atomic_selectors.
  const slotAssetUrl = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.assetUrl ?? null)
      : null,
  );
  const slotFilter = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.filter ?? null)
      : null,
  );
  // M.3.b.UX.v6 — scale del transform de la foto.
  const slotScale = useStore(
    store,
    (s) =>
      (slotIndex !== null
        ? s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.photoTransform?.scale
        : null) ?? 1,
  );
  const setSlotFilter = useStore(store, (s) => s.setSlotFilter);
  const setSlotPhotoTransform = useStore(store, (s) => s.setSlotPhotoTransform);

  return (
    <StudioPhotoAdjustModal
      isOpen={slotIndex !== null && !!slotAssetUrl}
      photoUrl={slotAssetUrl}
      currentFilter={slotFilter}
      slotIndex={slotIndex}
      currentScale={slotScale}
      onClose={onClose}
      onApply={(filter) => {
        if (slotIndex !== null) setSlotFilter(slotIndex, filter);
      }}
      onScaleChange={(scale) => {
        if (slotIndex !== null) setSlotPhotoTransform(slotIndex, { scale });
      }}
      onResetTransform={() => {
        if (slotIndex !== null) setSlotPhotoTransform(slotIndex, null);
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

// ──────────────────────────────────────────────────────────────────
//  TextEditorModalWrapper — M.3.b.D
//  Extrae text layer base + override actual via store atómicamente.
// ──────────────────────────────────────────────────────────────────

function TextEditorModalWrapper({
  store,
  target,
  onClose,
}: {
  store: ReturnType<typeof createStudioStore>;
  target: { slotIndex: number; textLayerId: string } | null;
  onClose: () => void;
}) {
  // Selectores ATÓMICOS — retornan primitivos para evitar re-render loops
  const layerJson = useStore(store, (s) => {
    if (!target) return null;
    const found = s.canvasData?.unitTemplate?.layers?.find(
      (l) => l.type === "text" && (l as { id: string }).id === target.textLayerId,
    );
    return found ? JSON.stringify(found) : null;
  });

  const overrideJson = useStore(store, (s) => {
    if (!target) return null;
    const slot = s.canvasData?.slots?.find((sl) => sl.slotIndex === target.slotIndex);
    const ov = slot?.textOverrides?.[target.textLayerId];
    return ov ? JSON.stringify(ov) : null;
  });

  const slotCount = useStore(store, (s) => s.canvasData?.slotCount ?? 0);
  const setSlotTextOverride = useStore(store, (s) => s.setSlotTextOverride);

  const layer = layerJson ? (JSON.parse(layerJson) as import("./types").TextLayer) : null;
  const currentOverride = overrideJson
    ? (JSON.parse(overrideJson) as import("./types").TextOverride)
    : undefined;

  return (
    <StudioTextEditorModal
      isOpen={target !== null && layer !== null}
      layer={layer}
      currentOverride={currentOverride}
      slotLabel={target ? `Imán ${target.slotIndex + 1} de ${slotCount}` : undefined}
      onClose={onClose}
      onApply={(override) => {
        if (target) setSlotTextOverride(target.slotIndex, target.textLayerId, override);
      }}
    />
  );
}
