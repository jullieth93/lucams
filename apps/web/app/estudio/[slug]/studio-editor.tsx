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
import { useDialogA11y } from "./use-dialog-a11y";
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
import { StudioToolbar, StudioFinalizeFab } from "./studio-toolbar";
import { StudioOnboarding } from "./studio-onboarding";
import { StudioGesturesHint, GESTURES_HINT_STORAGE_KEY } from "./studio-gestures-hint";
import { StudioAssetPickerModal } from "./studio-asset-picker-modal";
import { StudioPhotoAdjustModal } from "./studio-photo-adjust-modal";
import { StudioSlotFocus } from "./studio-slot-focus";
import { StudioPreviewModal } from "./studio-preview-modal";
import { StudioTextEditorModal } from "./studio-text-editor-modal";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsTouch } from "./use-is-touch";
import { Sparkles, Box, X, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import nextDynamic from "next/dynamic";
import type { Magnet3D } from "./fridge-3d-view";
import { StudioAiPanel } from "./studio-ai-panel";
import {
  composeCalendarPages,
  buildCalendarPageInputs,
  buildCalendarPreviewMontage,
} from "./lib/compose-calendar-page";
import { SceneGallery } from "./scene-gallery";
import { MONTH_NAMES_ES } from "@/features/personalization/calendar-grid";

// FOTO4 — la galería de escenas del fotoimán (nevera/mural/repisa/regalo). Las vistas 3D pesadas
// (three.js) van diferidas DENTRO de SceneGallery, así que este import estático no infla el bundle
// del editor con WebGL.
// CAL4 — preview inmersivo del calendario (client-only, diferido igual que las vistas 3D).
const CalendarView3D = nextDynamic(() => import("./calendar-view-3d"), {
  ssr: false,
  loading: () => (
    <div className="text-brand-muted flex h-full items-center justify-center text-sm">
      Cargando tu calendario 3D…
    </div>
  ),
});
// SEP1 — preview inmersivo de separadores en un libro (los separadores no son imanes → su hogar es
// un libro, no la nevera). Client-only, diferido.
const BookView3D = nextDynamic(() => import("./book-view-3d"), {
  ssr: false,
  loading: () => (
    <div className="text-brand-muted flex h-full items-center justify-center text-sm">
      Cargando tu libro 3D…
    </div>
  ),
});
import { createStudioStore } from "./lib/store";
import type { CanvasData, CanvasDataV2, StudioAsset, StudioProduct, StudioTemplate } from "./types";
import { ensureCanvasV2 } from "./lib/canvas-migrate";

const AUTO_SAVE_DELAY_MS = 2000;

/**
 * Convierte un data URL base64 a Blob binario. Usado al finalizar el
 * diseño para enviar los PNGs como bytes raw vía FormData en vez de
 * strings base64 (que disparan "Maximum array nesting exceeded" en el
 * protocolo React Flight de Next 16 Server Actions).
 */
function dataURLtoBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) throw new Error("dataURL inválido (sin coma)");
  const meta = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = meta.match(/^data:([^;]+)/);
  const mime = mimeMatch?.[1] ?? "image/png";
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export type StudioEditorProps = {
  product: StudioProduct;
  templates: StudioTemplate[];
  initialDesignId: string | null;
  initialDesignCanvas: CanvasData | null;
  initialDesignAssets: StudioAsset[];
  photoSlots: number;
  /**
   * Variant ID elegido en PDP (`/estudio/[slug]?variant=X`). Se propaga
   * al cart al finalizar para que el CartItem use la variant correcta
   * (cantidad/tamaño/etc.) — antes de M.3.b.CAT había siempre 1 variant
   * "-DEFAULT" por producto, ahora hay N por size/qty.
   */
  variantId?: string;
  /** Precio (centavos COP) de la variante elegida — se muestra en la vista previa pre-carrito. */
  unitPriceCents: number;
  /** Edición desde el carrito: id del diseño original a reemplazar al finalizar (no duplicar). */
  replacesCartDesignId?: string | null;
  /** ADR-057 B2 — diseños prediseñados aplicables por slot (galería). */
  predesigned?: import("./studio-asset-picker-modal").PredesignedItem[];
  /** ADR-057 Fase D — etiquetas por slot (meses del calendario). */
  slotLabels?: string[];
  /** ADR-057 Fase D — año del calendario (para el badge del editor). */
  calendarYear?: number;
};

export function StudioEditor({
  product,
  templates,
  initialDesignId,
  initialDesignCanvas,
  initialDesignAssets,
  photoSlots,
  variantId,
  unitPriceCents,
  replacesCartDesignId,
  predesigned = [],
  slotLabels,
  calendarYear,
}: StudioEditorProps) {
  const router = useRouter();
  const store = useMemo(() => createStudioStore(), []);
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);
  // M.3.b.B.3 — Slot index del modal de ajustar foto (filtros).
  const [adjustSlotIndex, setAdjustSlotIndex] = useState<number | null>(null);
  // FB4 — slot abierto en el editor a pantalla completa (solo táctil: ahí se hace pan/zoom + filtros).
  const [focusSlotIndex, setFocusSlotIndex] = useState<number | null>(null);
  // M.3.b.UX.v12 (Lucy 2026-05-15) — Banner de gestos: open controlado +
  // flag persistent (no auto-dismiss cuando se abre manualmente con "?").
  const [gesturesHintOpen, setGesturesHintOpen] = useState(false);
  const [gesturesHintPersistent, setGesturesHintPersistent] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  // PR A.3 (Lucy 2026-05-21) — Vista previa pre-carrito: al click "Listo!"
  // generamos preview compositado client-side y abrimos modal. El upload
  // real (production PNGs + finalize + addToCart) solo se dispara si el
  // cliente confirma "Sí, agregar al carrito" desde el modal.
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Lucy 2026-05-21 round 4: guías eliminadas. La línea punteada del
  // "safe area" confundía al cliente porque no matcheaba visualmente la
  // silueta del corazón/círculo. La silueta del producto ya define el
  // borde de impresión, no necesitamos UI adicional.
  // Hardcoded false; el código de overlay las ignora.
  const showRealismGuides = false;
  // A2.8 — Sheet drawer mobile state (sidebar bottom slide-up).
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  // M.3.b.D — Text editor inline state: { slotIndex, textLayerId } o null
  const [textEditTarget, setTextEditTarget] = useState<{
    slotIndex: number;
    textLayerId: string;
  } | null>(null);
  const slotStagesRef = useRef<Map<number, Konva.Stage | null>>(new Map());
  // ADR-063 T5 — cuando hay muchos slots, el grid monta solo los cercanos al viewport (lazy). Antes
  // de CUALQUIER snapshot (preview, producción, 3D) forzamos el montaje de todos y esperamos a que
  // Konva registre sus stages, para no snapshotear un slot vacío.
  const [forceMountAll, setForceMountAll] = useState(false);
  const ensureAllStagesMounted = useCallback(async () => {
    const expected = store.getState().canvasData?.slotCount ?? 0;
    const allPresent = () => {
      if (expected <= 0) return true;
      for (let i = 0; i < expected; i++) if (!slotStagesRef.current.get(i)) return false;
      return true;
    };
    if (allPresent()) return;
    setForceMountAll(true);
    await new Promise<void>((resolve) => {
      const deadline = performance.now() + 2000;
      const tick = () => {
        if (allPresent() || performance.now() > deadline) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, [store]);
  // FOTO4 — galería de escenas del fotoimán (nevera/mural/repisa/regalo). null = cerrada; objeto =
  // texturas por imán + columnas del grid (se calculan una vez al abrir).
  const [sceneMagnets, setSceneMagnets] = useState<{ magnets: Magnet3D[]; cols: number } | null>(
    null,
  );
  const [sceneBuilding, setSceneBuilding] = useState(false);
  // CAL4 — preview inmersivo del calendario. null = cerrado; array = páginas de mes compuestas.
  const [calendarPages, setCalendarPages] = useState<string[] | null>(null);
  const [calendarMonthIndex, setCalendarMonthIndex] = useState(0);
  const [calendarBuilding, setCalendarBuilding] = useState(false);
  // SEP1 — preview inmersivo de separadores en un libro. null = cerrado; array = texturas de marcador.
  const [book3D, setBook3D] = useState<Magnet3D[] | null>(null);
  // #15 — a11y de los dos overlays 3D (foco inicial + trap + Escape + retorno). onClose estable
  // (useCallback) para no re-armar el trap en cada render.
  const book3DRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const closeBook3D = useCallback(() => setBook3D(null), []);
  const closeCalendar = useCallback(() => setCalendarPages(null), []);
  useDialogA11y(book3DRef, { onClose: closeBook3D, active: book3D !== null });
  useDialogA11y(calendarRef, { onClose: closeCalendar, active: calendarPages !== null });
  // P1.5 — Asistente IA de ideas (ADR-058).
  const [aiOpen, setAiOpen] = useState(false);
  const allowText = (product.personalizationSchema as { allowText?: boolean })?.allowText === true;

  // M.3.b.A2.5 — Lee `sizeCm` del producto para badge visual en cada slot.
  // Producto config viene como JSON unknown, parsePhotoProductConfig hace
  // safeParse Zod con fallback a {photoSlots: 1}. Solo usamos sizeCm.
  const productConfig = useMemo(
    () => parsePhotoProductConfig(product.personalizationSchema),
    [product.personalizationSchema],
  );

  // ADR-063 CAL2 — el año del calendario lo ELIGE el cliente (antes era un badge fijo del schema
  // del producto, y podía venir vacío). Default = año del producto → próximo año. Se ofrece un
  // rango seguro (nunca un año pasado) y se persiste por-diseño en el finalize.
  const isCalendarMonth = product.personalizationKind === "CALENDAR_PHOTO_MONTH";
  // SEP1 — separadores (galleryTag "separadores"): su vista inmersiva es un LIBRO, no la nevera.
  const isBookmark =
    (product.personalizationSchema as { galleryTag?: string } | null)?.galleryTag === "separadores";
  // #14 — sustantivo del slot: en separadores el producto NO es un imán → "separador" en los labels,
  // aria y onboarding (pantalla=físico). Deriva de isBookmark; el calendario usa slotLabels propios.
  const slotNoun = isBookmark ? "separador" : "imán";
  const isTouch = useIsTouch(); // #9 — copy del gesto de zoom del libro 3D según táctil vs mouse.
  // FOTO4 — la galería de escenas "en tu espacio" (nevera/mural/repisa/regalo) es la vista por
  // defecto del fotoimán: se muestra cuando NO es calendario ni separador (el `else` del botón).
  const defaultCalendarYear = calendarYear ?? new Date().getFullYear() + 1;
  const [selectedYear, setSelectedYear] = useState(defaultCalendarYear);
  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const set = new Set<number>([now, now + 1, now + 2, defaultCalendarYear]);
    return [...set].filter((y) => y >= now).sort((a, b) => a - b);
  }, [defaultCalendarYear]);

  // Subscribir reactivamente al modal — assets/designId del store, no snapshot
  const modalAssets = useStore(store, (s) => s.assets);
  const modalDesignId = useStore(store, (s) => s.designId);
  // PR A.3 — Subscribir reactivamente al flag de finalizing del store
  // para que el modal preview muestre el spinner durante upload.
  const isFinalizingFlag = useStore(store, (s) => s.isFinalizing);

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
          // ADR-063 T4 — sin plantillas curadas, degradar a un template por defecto (mismo que el
          // server arma en createDraftDesign) en vez de crashear el editor. Boot funcional para
          // cualquier producto; la foto tiene un placeholder full-stage donde ubicarse.
          const unitTemplate = firstTemplate?.canvasData ?? {
            version: 1 as const,
            stage: { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 },
            layers: [
              { id: "background", type: "background", color: "#FFF8F0" },
              {
                id: "photo",
                type: "image-placeholder",
                x: 0,
                y: 0,
                width: 1080,
                height: 1080,
                cornerRadius: 0,
              },
            ],
          };
          templateId = firstTemplate?.id ?? null;
          canvasData = {
            version: 2,
            unitTemplate,
            slotCount: photoSlots,
            slots: Array.from({ length: photoSlots }, (_, idx) => ({
              slotIndex: idx,
              assetId: null,
              assetUrl: null,
            })),
            gridLayout: defaultGridFor(photoSlots, unitTemplate.stage),
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
        // #14 — el detalle técnico (inglés/stack) va al log; al cliente un mensaje claro es-CO.
        console.error("[studio.boot]", err);
        setBootError("No pudimos abrir el Estudio. Recarga la página o escríbenos por WhatsApp.");
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
  const handleSlotClick = useCallback(
    (slotIndex: number) => {
      // FB4 — en táctil, tocar un slot YA LLENO abre el editor a pantalla completa (pan/zoom/filtros),
      // no el picker; un slot vacío siempre abre el picker para subir la foto. En desktop, tocar abre
      // el picker como siempre (el pan/zoom es inline con el mouse).
      const filled = !!store.getState().canvasData?.slots?.find((s) => s.slotIndex === slotIndex)
        ?.assetUrl;
      if (isTouch && filled) setFocusSlotIndex(slotIndex);
      else setPickerSlotIndex(slotIndex);
    },
    [isTouch, store],
  );

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

  // ──────────── Step 1: Listo! → genera preview compositado + abre modal ────────────
  //
  // PR A.3 (Lucy 2026-05-21): partimos el finalize en 2 fases. Esta solo
  // genera el preview client-side (rápido, sin red), abre el modal para
  // que el cliente confirme. No sube nada todavía.
  const handleFinalize = useCallback(async () => {
    const state = store.getState();
    if (!state.designId || !state.canvasData || state.isFinalizing) return;
    setPreviewError(null);
    try {
      // #3 (auditoría v3) — CALENDARIO: el preview de confirmación debe mostrar las PÁGINAS reales
      // (mes + grilla + festivos), no las fotos sueltas rotuladas "imanes". Reusa composeCalendarPages
      // (mismas páginas WYSIWYG que producción/3D) y las apila en un montaje. No usa Konva/stages.
      if (isCalendarMonth) {
        const startMonth =
          (product.personalizationSchema as { startMonth?: number })?.startMonth ?? 0;
        const inputs = buildCalendarPageInputs(state.canvasData.slots, startMonth);
        const pages = await composeCalendarPages(inputs, selectedYear);
        setPreviewDataUrl(await buildCalendarPreviewMontage(pages));
        setPreviewModalOpen(true);
        return;
      }
      await ensureAllStagesMounted(); // T5: montar todos los slots antes del snapshot compositado
      // Pasar shape del producto para que el preview compositado respete
      // la silueta real (corazón, círculo, etc.) y no se vea un rectángulo
      // Lucy 2026-05-21 feedback: "se ve completa, no como corazón".
      const previewUrl = await buildCompositedPreview(
        state.canvasData,
        slotStagesRef.current,
        productConfig.shape,
      );
      setPreviewDataUrl(previewUrl);
      setPreviewModalOpen(true);
    } catch (err) {
      // #14 — detalle técnico al log; al cliente un mensaje claro es-CO.
      console.error("[studio.preview]", err);
      state.setAutoSaveStatus({
        kind: "error",
        message: "No pudimos preparar la vista previa. Intenta de nuevo en un momento.",
      });
    }
  }, [
    store,
    productConfig.shape,
    ensureAllStagesMounted,
    isCalendarMonth,
    selectedYear,
    product.personalizationSchema,
  ]);

  // SEP1 — Abrir el libro 3D del separador: captura un snapshot recortado a la silueta física
  // (transparente afuera) y lo pasa como textura. Solo para separadores (no son imanes → su hogar es
  // un libro, no la nevera). Si la captura falla, no rompemos el Estudio — solo no abrimos el 3D.
  const handleOpen3D = useCallback(async () => {
    const state = store.getState();
    if (!state.canvasData) return;
    try {
      await ensureAllStagesMounted(); // T5: la vista 3D necesita la textura de TODOS los slots
      const textures = await buildMagnetTextures(
        state.canvasData,
        slotStagesRef.current,
        productConfig.shape,
      );
      setBook3D(textures);
    } catch (err) {
      state.setAutoSaveStatus({
        kind: "error",
        message: "No pudimos abrir la vista 3D. Intenta de nuevo.",
      });
      void err;
    }
  }, [store, productConfig.shape, ensureAllStagesMounted]);

  // FOTO4 — Abrir la galería de escenas "en tu espacio" (nevera/mural/repisa/regalo). Calcula UNA vez
  // la textura por imán (recortada a su silueta) y la pasa a la galería, que arma cada escena bajo
  // demanda. Si la captura falla, no rompemos el Estudio — solo no abrimos la galería.
  const handleOpenScene = useCallback(async () => {
    const state = store.getState();
    if (!state.canvasData || sceneBuilding) return;
    setSceneBuilding(true);
    try {
      await ensureAllStagesMounted(); // T5: la galería necesita la textura de TODOS los slots
      const textures = await buildMagnetTextures(
        state.canvasData,
        slotStagesRef.current,
        productConfig.shape,
      );
      setSceneMagnets({ magnets: textures, cols: state.canvasData.gridLayout.cols });
    } catch (err) {
      state.setAutoSaveStatus({
        kind: "error",
        message: "No pudimos abrir la vista de tu espacio. Intenta de nuevo.",
      });
      void err;
    } finally {
      setSceneBuilding(false);
    }
  }, [store, productConfig.shape, ensureAllStagesMounted, sceneBuilding]);

  // CAL4 — Abrir el calendario 3D: compone cada página de mes (foto + mes + año + grilla) con el
  // MISMO dibujo que producción (WYSIWYG) y las muestra en un calendario de pared navegable. Usa la
  // foto ORIGINAL + encuadre de cada slot (no Konva) → no depende del montaje de stages.
  const handleOpenCalendar3D = useCallback(async () => {
    const state = store.getState();
    if (!state.canvasData || calendarBuilding) return;
    setCalendarBuilding(true);
    try {
      const startMonth =
        (product.personalizationSchema as { startMonth?: number })?.startMonth ?? 0;
      const inputs = buildCalendarPageInputs(state.canvasData.slots, startMonth);
      const pages = await composeCalendarPages(inputs, selectedYear);
      setCalendarMonthIndex(0);
      setCalendarPages(pages);
    } catch (err) {
      state.setAutoSaveStatus({
        kind: "error",
        message: "No pudimos armar tu calendario. Intenta de nuevo.",
      });
      void err;
    } finally {
      setCalendarBuilding(false);
    }
  }, [store, product.personalizationSchema, selectedYear, calendarBuilding]);

  // El Escape de ambos overlays 3D lo maneja ahora useDialogA11y (#15, arriba); la galería de
  // escenas maneja el suyo internamente.

  // ──────────── Step 2: Confirmar → upload + add to cart + redirect ────────────
  //
  // Solo se invoca si el cliente confirma desde el modal. Si vuelve a editar,
  // nada se sube y el editor queda intacto.
  const handleConfirmFinalize = useCallback(async () => {
    const state = store.getState();
    if (!state.designId || !state.canvasData || state.isFinalizing || !previewDataUrl) return;
    state.setIsFinalizing(true);
    setPreviewError(null);
    try {
      await ensureAllStagesMounted(); // T5: garantizar los N stages antes de snapshotear producción
      // Generar productionDataUrls (uno por slot). H5 (auditoría v3): el pixelRatio va RELATIVO al
      // tamaño LÓGICO del stage, no al display responsive — así el PNG de imprenta sale a resolución
      // FIJA (ancho lógico × 3, = los 3240px del render server para 1080) igual en móvil y en desktop
      // (antes toDataURL({pixelRatio:3}) sobre un slot de ~171px móvil daba ~186 DPI, borroso).
      const logicalStageW = state.canvasData.unitTemplate.stage.width;
      const productionDataUrls: string[] = [];
      for (const slot of state.canvasData.slots) {
        const stage = slotStagesRef.current.get(slot.slotIndex);
        if (!stage) {
          throw new Error(`No se pudo encontrar el slot ${slot.slotIndex + 1} para snapshot`);
        }
        // ADR-063 T3 + H6 — archivo de imprenta LIMPIO: la sombra/glossy/edge (`name="realism"`) y los
        // indicadores de edición (recuadro punteado + dot, `name="edit-indicator"`) son adornos de
        // PANTALLA; NO deben hornearse en el PNG 300 DPI. Se ocultan solo durante el snapshot y se
        // restauran de inmediato. (El preview compositado conserva el realismo, pero NO los
        // indicadores — se ocultan también allá.)
        const hiddenForSnapshot = [...stage.find(".realism"), ...stage.find(".edit-indicator")];
        hiddenForSnapshot.forEach((l) => l.hide());
        let dataUrl: string;
        try {
          const displayW = stage.width() || logicalStageW;
          const pixelRatio = (logicalStageW * 3) / displayW;
          dataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
        } finally {
          hiddenForSnapshot.forEach((l) => l.show());
        }
        // FOTO1 (fallback de cliente): heart/circle → recortar a la silueta (transparente afuera).
        dataUrl = await clipProductionSnapshotToShape(dataUrl, productConfig.shape);
        productionDataUrls.push(dataUrl);
      }

      // FormData con blobs binarios — bypassea límite de array nesting de
      // React Flight protocol de Next 16 (ver lib/wompi.ts comment también).
      const fd = new FormData();
      fd.set("designId", state.designId);
      fd.set("slotCount", String(productionDataUrls.length));
      // ADR-063 CAL2 — para calendarios mes-a-mes, el año elegido viaja al server (que lo hornea en
      // cada página del mes y lo persiste por-diseño).
      if (isCalendarMonth) fd.set("calendarYear", String(selectedYear));
      fd.set("preview", dataURLtoBlob(previewDataUrl), "preview.png");
      productionDataUrls.forEach((url, i) => {
        fd.set(`production_${i}`, dataURLtoBlob(url), `slot-${i + 1}.png`);
      });

      const result = await finalizeDesignAction(fd);
      if (!result.ok) {
        state.setIsFinalizing(false);
        setPreviewError(result.message);
        return;
      }

      // Add to cart — pasamos variantId del PDP (consolidación familias M.3.b.CAT).
      // replacesCartDesignId: si venimos de "Editar" desde el carrito, reemplaza el item original.
      const addResult = await addPersonalizedToCartAction({
        designId: state.designId,
        qty: 1,
        variantId,
        replaceDesignId: replacesCartDesignId ?? undefined,
      });
      if (!addResult.ok) {
        state.setIsFinalizing(false);
        setPreviewError(
          `Diseño guardado pero no pudimos agregarlo al carrito: ${addResult.message}`,
        );
        return;
      }

      // Cerramos modal antes de redirigir para evitar flicker visual.
      setPreviewModalOpen(false);
      router.push("/carrito?personalized=1");
    } catch (err) {
      state.setIsFinalizing(false);
      setPreviewError(err instanceof Error ? err.message : String(err));
    }
  }, [
    router,
    store,
    variantId,
    previewDataUrl,
    replacesCartDesignId,
    productConfig.shape,
    isCalendarMonth,
    selectedYear,
    ensureAllStagesMounted,
  ]);

  // Cerrar modal "Volver a editar": libera estado para no acumular preview
  // viejo si edita y vuelve a "Listo!".
  const handleClosePreviewModal = useCallback(() => {
    setPreviewModalOpen(false);
    setPreviewDataUrl(null);
    setPreviewError(null);
  }, []);

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
              <p className="text-brand-muted text-xs">
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
        showRealismGuides={false}
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

        {/* Auditoría v3 · H15: flex-COL para que el banner del calendario quede ARRIBA del grid (antes
            era flex-row → banner y grid en fila → overflow horizontal y slots sangrando). El banner ya
            trae mb-3, pensado para apilado. */}
        <section className="flex flex-1 flex-col items-center p-4 pb-24 lg:p-8 lg:pb-8">
          {/* ADR-057 Fase D + CAL2 — banner de calendario: el cliente elige el AÑO (selector) y
              pone una foto por mes. */}
          {isCalendarMonth && (
            <div className="border-brand-purple/15 bg-brand-cream/60 text-brand-purple-dark mb-3 flex flex-wrap items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold">
              <span>📅 Calendario</span>
              <label className="flex items-center gap-1.5">
                <span className="sr-only">Año del calendario</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="border-brand-purple/30 focus-visible:ring-brand-purple/40 rounded-lg border bg-white px-2 py-1 text-sm font-bold focus-visible:ring-2 focus-visible:outline-none"
                  aria-label="Año del calendario"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <span>· una foto por mes (toca cada mes para elegir tu foto)</span>
            </div>
          )}
          <StudioCanvasGrid
            store={store}
            sizeCm={productConfig.sizeCm}
            shape={productConfig.shape}
            finish={productConfig.finish}
            cornerRadiusPx={productConfig.cornerRadiusPx}
            showRealismGuides={showRealismGuides}
            slotLabels={slotLabels}
            slotNoun={slotNoun}
            interactiveSlots={!isTouch}
            onSlotClick={handleSlotClick}
            onSlotAdjust={(slotIndex) =>
              isTouch ? setFocusSlotIndex(slotIndex) : setAdjustSlotIndex(slotIndex)
            }
            onTextEdit={(slotIndex, textLayerId) => setTextEditTarget({ slotIndex, textLayerId })}
            registerSlotStages={(stages) => {
              slotStagesRef.current = stages;
            }}
            forceMountAll={forceMountAll}
          />
        </section>
      </div>

      {/* P1.4/P1.5 — Botones flotantes: Ideas (IA) + Ver en 3D/tu espacio. Auditoría v3 · H14: en
          pantallas chicas el grupo central chocaba con el FAB de Editar (izq) y el de ¡Listo! (der).
          Se sube a una FILA PROPIA por encima (bottom-24) en móvil; en sm+ hay ancho de sobra y baja
          a bottom-4. flex-wrap por si el texto es largo. */}
      <div className="fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 sm:bottom-4">
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          aria-label="Pedir ideas al asistente"
          className="bg-brand-pink ring-brand-pink/25 inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-bold text-white shadow-xl ring-4 transition-transform hover:scale-105 active:scale-95"
        >
          <Sparkles className="h-5 w-5" />
          <span>Ideas</span>
        </button>
        {isCalendarMonth ? (
          <button
            type="button"
            onClick={handleOpenCalendar3D}
            disabled={calendarBuilding}
            aria-label="Ver tu calendario en 3D"
            className="bg-brand-purple ring-brand-purple/25 inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-bold text-white shadow-xl ring-4 transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
          >
            <CalendarDays className="h-5 w-5" />
            <span>{calendarBuilding ? "Armando…" : "Ver mi calendario"}</span>
          </button>
        ) : isBookmark ? (
          <button
            type="button"
            onClick={handleOpen3D}
            aria-label="Ver tu separador en un libro 3D"
            className="bg-brand-purple ring-brand-purple/25 inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-bold text-white shadow-xl ring-4 transition-transform hover:scale-105 active:scale-95"
          >
            <Box className="h-5 w-5" />
            <span>Ver en un libro</span>
          </button>
        ) : (
          // FOTO4 — un solo botón abre la galería con TODAS las escenas (nevera/mural/repisa/regalo).
          <button
            type="button"
            onClick={handleOpenScene}
            disabled={sceneBuilding}
            aria-label="Míralo en tu espacio: nevera, mural, repisa o regalo"
            className="bg-brand-purple ring-brand-purple/25 inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-bold text-white shadow-xl ring-4 transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
          >
            <Box className="h-5 w-5" />
            <span>{sceneBuilding ? "Armando…" : "Ver en tu espacio"}</span>
          </button>
        )}
      </div>

      {/* P1.5 — Panel del asistente IA de ideas */}
      <StudioAiPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        productName={product.name}
        slotCount={photoSlots}
        allowText={allowText}
      />

      {/* FOTO4 — Galería de escenas del fotoimán (nevera/mural/repisa/regalo) en un solo modal. */}
      {sceneMagnets !== null && (
        <SceneGallery
          magnets={sceneMagnets.magnets}
          cols={sceneMagnets.cols}
          onClose={() => setSceneMagnets(null)}
        />
      )}

      {/* SEP1 — Modal del separador en un libro 3D (lazy, client-only). */}
      {book3D !== null && (
        <div
          ref={book3DRef}
          role="dialog"
          aria-modal="true"
          aria-label="Vista 3D de tu separador en un libro"
          tabIndex={-1}
          className="bg-brand-purple-dark/85 fixed inset-0 z-50 flex flex-col backdrop-blur-sm outline-none"
        >
          <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
            <span className="font-display text-lg font-bold">📖 Tu separador en un libro</span>
            <button
              type="button"
              onClick={closeBook3D}
              aria-label="Cerrar vista 3D"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative flex-1">
            <BookView3D bookmarks={book3D} />
            <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1.5 text-center text-xs text-white">
              {isTouch
                ? "Arrastra para girar · pellizca con 2 dedos para acercar"
                : "Arrastra para girar · rueda o pellizca para acercar"}
            </p>
          </div>
        </div>
      )}

      {/* CAL4 — Modal del calendario 3D navegable (lazy, client-only). */}
      {calendarPages !== null && (
        <div
          ref={calendarRef}
          role="dialog"
          aria-modal="true"
          aria-label="Vista 3D de tu calendario"
          tabIndex={-1}
          className="bg-brand-purple-dark/85 fixed inset-0 z-50 flex flex-col backdrop-blur-sm outline-none"
        >
          <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
            <span className="font-display text-lg font-bold">📅 Tu calendario {selectedYear}</span>
            <button
              type="button"
              onClick={closeCalendar}
              aria-label="Cerrar calendario 3D"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative flex-1">
            <CalendarView3D pages={calendarPages} index={calendarMonthIndex} />
            {/* Navegación mes a mes */}
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setCalendarMonthIndex(
                    (i) => (i - 1 + calendarPages.length) % calendarPages.length,
                  )
                }
                aria-label="Mes anterior"
                className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/35 focus:ring-2 focus:ring-white focus:outline-none"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <span className="pointer-events-none min-w-40 rounded-full bg-black/45 px-4 py-2 text-center text-sm font-semibold text-white">
                {MONTH_NAMES_ES[
                  (((((product.personalizationSchema as { startMonth?: number })?.startMonth ?? 0) +
                    calendarMonthIndex) %
                    12) +
                    12) %
                    12
                ] ?? ""}{" "}
                {selectedYear}
              </span>
              <button
                type="button"
                onClick={() => setCalendarMonthIndex((i) => (i + 1) % calendarPages.length)}
                aria-label="Mes siguiente"
                className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/35 focus:ring-2 focus:ring-white focus:outline-none"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      )}

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
          // #6 — la X por defecto del sheet queda ENTERRADA bajo este header sticky (sin z-index) →
          // invisible e intappable en móvil. La suprimimos y ponemos una propia DENTRO del header,
          // en el mismo contexto de apilamiento, con target de 44px (antes 28px, bajo el mínimo táctil).
          showCloseButton={false}
          className="border-brand-purple/10 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t bg-white p-0 lg:hidden"
        >
          <SheetHeader className="border-brand-purple/10 sticky top-0 z-10 flex-row items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur">
            <SheetTitle className="text-brand-purple-dark text-base font-bold">
              Personalizar
            </SheetTitle>
            <SheetClose asChild>
              <button
                type="button"
                aria-label="Cerrar personalización"
                className="text-brand-purple-dark/70 hover:bg-brand-purple/10 hover:text-brand-purple-dark -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors"
              >
                <X className="size-5" aria-hidden />
              </button>
            </SheetClose>
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
        predesigned={predesigned}
        onClose={() => setPickerSlotIndex(null)}
        onSelectAsset={handleAssetSelected}
        onAssetUploaded={handleAssetUploaded}
      />

      {/* M.3.b.B.3 — Modal de ajustar foto (encuadre + filtros). H4: en calendarios se oculta la
          sección de filtros (no llegan al PNG del calendario → romperían WYSIWYG); el encuadre sí. */}
      <PhotoAdjustModalWrapper
        store={store}
        slotIndex={adjustSlotIndex}
        allowFilters={!isCalendarMonth}
        onClose={() => setAdjustSlotIndex(null)}
      />

      {/* FB4 — editor de foto a PANTALLA COMPLETA (táctil): pan/zoom + filtros sin atrapar el scroll
          de la grilla. Solo se abre en táctil (focusSlotIndex); en desktop se usa el panel flotante. */}
      <StudioSlotFocus
        store={store}
        slotIndex={focusSlotIndex}
        shape={productConfig.shape}
        finish={productConfig.finish}
        cornerRadiusPx={productConfig.cornerRadiusPx}
        sizeCm={productConfig.sizeCm}
        allowFilters={!isCalendarMonth}
        onClose={() => setFocusSlotIndex(null)}
      />

      {/* M.3.b.D — Modal editor de texto inline */}
      <TextEditorModalWrapper
        store={store}
        target={textEditTarget}
        slotNoun={slotNoun}
        onClose={() => setTextEditTarget(null)}
      />

      {/* PR A.3 (Lucy 2026-05-21) — Vista previa pre-carrito */}
      <StudioPreviewModal
        isOpen={previewModalOpen}
        previewUrl={previewDataUrl}
        productName={product.name}
        slotCount={photoSlots}
        sizeCm={productConfig.sizeCm}
        unitPrice={unitPriceCents}
        isFinalizing={isFinalizingFlag}
        errorMessage={previewError}
        productKind={isCalendarMonth ? "calendar" : "magnets"}
        calendarYear={selectedYear}
        onEdit={handleClosePreviewModal}
        onConfirm={handleConfirmFinalize}
      />

      {/* M.3.b.UX.1 — FAB ¡Listo! mobile (visible solo <sm, fixed bottom-right) */}
      <StudioFinalizeFab store={store} onFinalize={handleFinalize} />

      {/* M.3.b.UX.5 — Onboarding tutorial primera vez. Se auto-detecta via
          localStorage; si ya se onboardeó (key="v1"), no muestra nada. */}
      <StudioOnboarding slotNoun={slotNoun} />

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
      {/* M.3.b.UX.v13 (Lucy 2026-05-15) — Vista Previa eliminada. La preview
        compositada se hace solo al finalizar (snapshot pipeline). En el editor
        el cliente ya ve cada imán a tamaño físico real con su shape. */}
    </div>
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
  allowFilters = true,
}: {
  store: ReturnType<typeof createStudioStore>;
  slotIndex: number | null;
  onClose: () => void;
  allowFilters?: boolean;
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
  // #18 — selectores ATÓMICOS del transform (no un objeto compuesto → evita el loop de re-render).
  const slotScale = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.photoTransform?.scale ?? 1)
      : 1,
  );
  const slotOffsetX = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.photoTransform?.offsetX ??
        0)
      : 0,
  );
  const slotOffsetY = useStore(store, (s) =>
    slotIndex !== null
      ? (s.canvasData?.slots?.find((sl) => sl.slotIndex === slotIndex)?.photoTransform?.offsetY ??
        0)
      : 0,
  );
  const setSlotFilter = useStore(store, (s) => s.setSlotFilter);
  const setSlotPhotoTransform = useStore(store, (s) => s.setSlotPhotoTransform);

  return (
    <StudioPhotoAdjustModal
      isOpen={slotIndex !== null && !!slotAssetUrl}
      photoUrl={slotAssetUrl}
      currentFilter={slotFilter}
      slotIndex={slotIndex}
      allowFilters={allowFilters}
      onClose={onClose}
      onApply={(filter) => {
        if (slotIndex !== null) setSlotFilter(slotIndex, filter);
      }}
      onResetTransform={() => {
        if (slotIndex !== null) setSlotPhotoTransform(slotIndex, null);
      }}
      photoTransform={{ offsetX: slotOffsetX, offsetY: slotOffsetY, scale: slotScale }}
      onZoomChange={(percent) => {
        if (slotIndex !== null)
          setSlotPhotoTransform(slotIndex, { scale: Math.max(0.5, Math.min(3, percent / 100)) });
      }}
      onNudge={(dx, dy) => {
        if (slotIndex !== null)
          setSlotPhotoTransform(slotIndex, {
            offsetX: slotOffsetX + dx,
            offsetY: slotOffsetY + dy,
          });
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
/**
 * Construye un Path2D según el shape del imán físico (heart/circle/rectangle).
 * El caller puede usarlo para `ctx.clip(path)` o `ctx.stroke(path)`.
 * El path está normalizado a objectBoundingBox 0-1 y se escala al cell.
 *
 * Coords del heart match el SVG clipPath inline de studio-slot.tsx
 * (M.3.b.UX.v13) para que el preview matchee 1:1 lo que ve el cliente
 * en el editor.
 */
function buildShapePath(
  shape: "rectangle" | "circle" | "heart" | "custom" | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
): Path2D {
  const path = new Path2D();
  if (!shape || shape === "rectangle" || shape === "custom") {
    const r = Math.min(8, w / 12);
    path.moveTo(x + r, y);
    path.lineTo(x + w - r, y);
    path.quadraticCurveTo(x + w, y, x + w, y + r);
    path.lineTo(x + w, y + h - r);
    path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    path.lineTo(x + r, y + h);
    path.quadraticCurveTo(x, y + h, x, y + h - r);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
    path.closePath();
    return path;
  }
  if (shape === "circle") {
    path.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    return path;
  }
  // heart — path normalizado matchea studio-slot.tsx SVG clipPath M.3.b.UX.v13
  const sx = (n: number) => x + n * w;
  const sy = (n: number) => y + n * h;
  path.moveTo(sx(0.5), sy(0.82));
  path.bezierCurveTo(sx(0.28), sy(0.68), sx(0.06), sy(0.52), sx(0.06), sy(0.32));
  path.bezierCurveTo(sx(0.06), sy(0.18), sx(0.16), sy(0.08), sx(0.28), sy(0.08));
  path.bezierCurveTo(sx(0.38), sy(0.08), sx(0.44), sy(0.12), sx(0.5), sy(0.22));
  path.bezierCurveTo(sx(0.56), sy(0.12), sx(0.62), sy(0.08), sx(0.72), sy(0.08));
  path.bezierCurveTo(sx(0.84), sy(0.08), sx(0.94), sy(0.18), sx(0.94), sy(0.32));
  path.bezierCurveTo(sx(0.94), sy(0.52), sx(0.72), sy(0.68), sx(0.5), sy(0.82));
  path.closePath();
  return path;
}

/**
 * ADR-063 FOTO1/T3 — recorta un snapshot de producción (ya limpio, sin realismo) a la SILUETA
 * física para heart/circle, dejando transparente afuera → la imprenta troquela por ese borde.
 * Rectángulo/custom no se tocan (el corte lo da el propio borde del PNG). Se usa en el fallback de
 * cliente (slots con filtro, que el render server-side no reproduce): así un corazón con filtro
 * imprime como corazón, igual que el corazón sin filtro (que sí pasa por el compositor canvas).
 */
async function clipProductionSnapshotToShape(
  dataUrl: string,
  shape: "rectangle" | "circle" | "heart" | "custom" | undefined,
): Promise<string> {
  if (!shape || shape === "rectangle" || shape === "custom") return dataUrl;
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo crear contexto canvas para recorte de silueta"));
        return;
      }
      ctx.save();
      ctx.clip(buildShapePath(shape, 0, 0, c.width, c.height));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      ctx.restore();
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("No se pudo cargar snapshot para recorte de silueta"));
    img.src = dataUrl;
  });
}

async function buildCompositedPreview(
  canvasData: CanvasDataV2,
  stages: Map<number, Konva.Stage | null>,
  shape?: "rectangle" | "circle" | "heart" | "custom",
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

  // Apilar cada slot — clipping por shape del imán físico para que el
  // preview muestre la silueta real (corazón, círculo, etc.) y no un
  // rectángulo. El Konva Stage devuelve siempre un rectángulo
  // (clipping CSS no se traduce a toDataURL); el clip va acá en Canvas2D.
  for (const slot of slots) {
    const stage = stages.get(slot.slotIndex);
    if (!stage) continue;
    // H6 (auditoría v3): ocultar los indicadores de edición (recuadro punteado + dot) en el preview
    // de confirmación — el cliente debe ver el producto final, no los hints de edición. El realismo
    // (sombra/glossy) SÍ se conserva acá (hace ver el imán físico).
    const indicators = stage.find(".edit-indicator");
    indicators.forEach((l) => l.hide());
    let slotDataUrl: string;
    try {
      slotDataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
    } finally {
      indicators.forEach((l) => l.show());
    }
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const col = slot.slotIndex % gridLayout.cols;
        const row = Math.floor(slot.slotIndex / gridLayout.cols);
        const x = col * (cellW + gap);
        const y = row * (cellH + gap);
        const path = buildShapePath(shape, x, y, cellW, cellH);
        // 1) Foto clipeada al shape (sin fill blanco previo — la propia foto
        //    es el fondo). Sombra externa via stroke ancho + transparencia.
        ctx.save();
        ctx.clip(path);
        ctx.drawImage(img, x, y, cellW, cellH);
        ctx.restore();
        // 2) Borde visible para destacar la silueta sobre el fondo crema
        //    (Lucy 2026-05-21: "el corazón y el fondo es blanco y no se
        //    detalla bien el contorno").
        ctx.save();
        ctx.strokeStyle = "rgba(124, 106, 173, 0.7)"; // brand-purple/70
        ctx.lineWidth = 2.5;
        ctx.stroke(path);
        ctx.restore();
        resolve();
      };
      img.onerror = () => reject(new Error("No se pudo cargar snapshot del slot"));
      img.src = slotDataUrl;
    });
  }

  return compositeCanvas.toDataURL("image/png");
}

// P1.4 — Genera una textura PNG por slot para la vista 3D: el snapshot del imán recortado a su
// silueta física (transparente afuera), para que en la nevera 3D cada imán tenga su forma real
// (rectángulo/corazón/círculo) y no un rectángulo. Reusa buildShapePath (misma silueta que el
// preview 2D). Devuelve, además, la proporción física para escalar el plano en la escena.
async function buildMagnetTextures(
  canvasData: CanvasDataV2,
  stages: Map<number, Konva.Stage | null>,
  shape?: "rectangle" | "circle" | "heart" | "custom",
): Promise<Magnet3D[]> {
  const { unitTemplate, slots } = canvasData;
  const texW = 512;
  const texH = Math.max(
    64,
    Math.round(512 * (unitTemplate.stage.height / unitTemplate.stage.width)),
  );
  const out: Magnet3D[] = [];
  for (const slot of slots) {
    const stage = stages.get(slot.slotIndex);
    if (!stage) continue;
    // H6: sin indicadores de edición en las texturas 3D (nevera/mural/etc.) — muestran el producto.
    const indicators = stage.find(".edit-indicator");
    indicators.forEach((l) => l.hide());
    let slotDataUrl: string;
    try {
      slotDataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
    } finally {
      indicators.forEach((l) => l.show());
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = texW;
        c.height = texH;
        const ctx = c.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo crear contexto canvas para textura 3D"));
          return;
        }
        // Recorte a la silueta física → transparencia fuera (sin fondo).
        const path = buildShapePath(shape, 0, 0, texW, texH);
        ctx.save();
        ctx.clip(path);
        ctx.drawImage(img, 0, 0, texW, texH);
        ctx.restore();
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("No se pudo cargar snapshot del slot para 3D"));
      img.src = slotDataUrl;
    });
    out.push({
      dataUrl,
      wRatio: unitTemplate.stage.width,
      hRatio: unitTemplate.stage.height,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────
//  TextEditorModalWrapper — M.3.b.D
//  Extrae text layer base + override actual via store atómicamente.
// ──────────────────────────────────────────────────────────────────

function TextEditorModalWrapper({
  store,
  target,
  slotNoun = "imán",
  onClose,
}: {
  store: ReturnType<typeof createStudioStore>;
  target: { slotIndex: number; textLayerId: string } | null;
  slotNoun?: string;
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
      slotLabel={
        target
          ? `${slotNoun.charAt(0).toUpperCase()}${slotNoun.slice(1)} ${target.slotIndex + 1} de ${slotCount}`
          : undefined
      }
      onClose={onClose}
      onApply={(override) => {
        if (target) setSlotTextOverride(target.slotIndex, target.textLayerId, override);
      }}
    />
  );
}
