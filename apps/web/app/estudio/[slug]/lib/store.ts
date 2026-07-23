/*
 * Zustand store interno del Estudio v2 (M.3.b Capa 2).
 *
 * Por qué store + no useState plano:
 *   - El editor tiene 5+ pieces de state interdependientes (canvasData,
 *     selectedSlotIndex, autoSaveStatus, isFinalizing, isDirty, error,
 *     undoStack, redoStack). Pasarlas por props 4 niveles abajo es
 *     ergonómicamente malo y propaga renders innecesarios.
 *   - Zustand selectivo (con selector function) re-renderea solo cuando
 *     el slice consumido cambia, sin Context provider boilerplate.
 *   - Store es INTERNO del módulo `/estudio/[slug]` — no global de la app.
 *     Cada mount del editor crea su propia instancia via `createStudioStore()`.
 *
 * Reglas de diseño:
 *   1. State es SoT del cliente — server hace save al commit final.
 *   2. Auto-save 2s debounce: el editor llama `markDirty()` en cada cambio;
 *      un effect externo observa `isDirty` y dispara `saveCanvasAction`.
 *   3. Undo/redo: stack de hasta 20 snapshots de canvasData. Drag/click ops
 *      sí van al stack; auto-save no.
 *   4. Selección de slot: solo 1 a la vez (no multi-select V2).
 *
 * El store NO contiene UI estado puro como modals abiertos — eso lo maneja
 * cada componente con useState local. El store es para data del design.
 */

import { create } from "zustand";
import type {
  CanvasDataV2,
  ImagePlaceholderLayer,
  SlotState,
  StudioAsset,
  StudioTemplate,
} from "../types";

const UNDO_LIMIT = 20;

export type AutoSaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

export type StudioStoreState = {
  // Identidad
  designId: string | null;
  productSlug: string;
  slotCount: number;

  // Canvas data (V2 multi-slot)
  canvasData: CanvasDataV2 | null;

  // Selección
  selectedSlotIndex: number | null;
  selectedTemplateId: string | null;

  // Assets subidos por el cliente en esta sesión
  assets: StudioAsset[];

  // Plantillas disponibles para el kind del producto
  templates: StudioTemplate[];

  // Auto-save tracking
  isDirty: boolean;
  autoSaveStatus: AutoSaveStatus;

  // Finalize tracking
  isFinalizing: boolean;

  // Undo/redo (snapshots de canvasData)
  undoStack: CanvasDataV2[];
  redoStack: CanvasDataV2[];

  // Actions
  init: (input: {
    designId: string;
    productSlug: string;
    canvasData: CanvasDataV2;
    templates: StudioTemplate[];
    selectedTemplateId?: string | null;
  }) => void;
  setCanvasData: (data: CanvasDataV2, opts?: { skipUndo?: boolean }) => void;
  assignAssetToSlot: (slotIndex: number, asset: StudioAsset) => void;
  clearSlot: (slotIndex: number) => void;
  swapSlots: (a: number, b: number) => void;
  autoFillSlots: () => void;
  /** M.3.b.B.3 — Aplicar/quitar filter preset a un slot específico. */
  setSlotFilter: (slotIndex: number, filter: import("../types").PhotoFilterPreset | null) => void;
  /** M.3.b.D — Aplicar/quitar override de un text layer editable en un slot.
   *  Si `override === null`, limpia el override del textLayerId (vuelve al
   *  texto/color/fuente base del template). */
  setSlotTextOverride: (
    slotIndex: number,
    textLayerId: string,
    override: import("../types").TextOverride | null,
  ) => void;
  /** M.3.b.UX.v6 — Set parcial del transform de la foto del slot.
   *  - `transform = null` → reset al default (offsetX/Y=0, scale=1, rotation=0).
   *  - `transform = { offsetX?, offsetY?, scale?, rotation? }` → merge sobre el actual.
   *  El editor aplica el overscan default 1.15× internamente, scale=1 acá
   *  significa "cover × 1.15" (default). scale > 1 → cliente hace zoom in. */
  setSlotPhotoTransform: (
    slotIndex: number,
    transform: { offsetX?: number; offsetY?: number; scale?: number; rotation?: number } | null,
  ) => void;
  /** Ola 3c — escribe el override de un text layer en TODOS los slots del pack
   *  (el "Tu mensaje" de la sidebar es pack-level: la misma frase en cada imán).
   *  `override === null` limpia el override en todos (vuelve al texto base). */
  setTextOverrideAllSlots: (
    textLayerId: string,
    override: import("../types").TextOverride | null,
  ) => void;
  /** Ola 3c — reescribe la geometría del image-placeholder del unitTemplate
   *  (toggle "sin borde" de la Polaroid Instagram: la foto crece a sangre bajo
   *  el chrome; producción la dibuja igual porque viaja en canvasData → WYSIWYG). */
  setImagePlaceholderRect: (rect: { x: number; y: number; width: number; height: number }) => void;
  selectSlot: (slotIndex: number | null) => void;
  setSelectedTemplate: (templateId: string | null) => void;
  applyTemplate: (template: StudioTemplate) => void;
  /** Ola 2A — color del marco alrededor de la foto (hex #RRGGBB) o null = sin marco. */
  setBorderColor: (color: string | null) => void;
  addAsset: (asset: StudioAsset) => void;
  removeAsset: (assetId: string) => void;
  setAutoSaveStatus: (status: AutoSaveStatus) => void;
  setIsFinalizing: (v: boolean) => void;
  markClean: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  reset: () => void;
};

const initialState = {
  designId: null,
  productSlug: "",
  slotCount: 0,
  canvasData: null,
  selectedSlotIndex: null,
  selectedTemplateId: null,
  assets: [],
  templates: [],
  isDirty: false,
  autoSaveStatus: { kind: "idle" } as AutoSaveStatus,
  isFinalizing: false,
  undoStack: [],
  redoStack: [],
};

/**
 * Factory para crear una instancia fresca del store por cada mount del
 * editor. No usar `useStudioStore` directamente — el componente padre
 * crea la instancia via `useMemo(() => createStudioStore(), [])` y la
 * pasa via Context o directamente como prop.
 */
export function createStudioStore() {
  return create<StudioStoreState>((set, get) => ({
    ...initialState,

    init: (input) => {
      set({
        designId: input.designId,
        productSlug: input.productSlug,
        slotCount: input.canvasData.slotCount,
        canvasData: input.canvasData,
        templates: input.templates,
        selectedTemplateId: input.selectedTemplateId ?? null,
        // Hidratar assets desde slots ya llenos del canvasData (caso recover Design existente)
        assets: extractAssetsFromCanvas(input.canvasData),
        undoStack: [],
        redoStack: [],
        isDirty: false,
      });
    },

    setCanvasData: (data, opts) => {
      const state = get();
      const nextUndo =
        opts?.skipUndo || !state.canvasData
          ? state.undoStack
          : [...state.undoStack.slice(-(UNDO_LIMIT - 1)), state.canvasData];
      set({
        canvasData: data,
        undoStack: nextUndo,
        redoStack: [],
        isDirty: true,
      });
    },

    assignAssetToSlot: (slotIndex, asset) => {
      const { canvasData } = get();
      if (!canvasData) return;
      const next: CanvasDataV2 = {
        ...canvasData,
        slots: canvasData.slots.map((s) =>
          s.slotIndex === slotIndex ? { ...s, assetId: asset.id, assetUrl: asset.signedUrl } : s,
        ),
      };
      get().setCanvasData(next);
      // Auto-seleccionar el slot recién asignado para feedback visual
      set({ selectedSlotIndex: slotIndex });
    },

    clearSlot: (slotIndex) => {
      const { canvasData } = get();
      if (!canvasData) return;
      // M.3.b.UX.bug — Lucy 2026-05-15: al borrar foto, también se limpian
      // textOverrides + filter del slot. Razón: el cliente había editado
      // "Aceite de Coco" sobre la foto de un frasco; al borrar la foto el
      // texto quedaba huérfano sin contexto. Mejor reset completo: pasar el
      // slot a estado "vacío" puro. Si el cliente quiere conservar texto,
      // que cambie de foto via picker (no clear).
      const next: CanvasDataV2 = {
        ...canvasData,
        slots: canvasData.slots.map((s) =>
          s.slotIndex === slotIndex
            ? {
                ...s,
                assetId: null,
                assetUrl: null,
                filter: null,
                textOverrides: undefined,
                photoTransform: undefined,
              }
            : s,
        ),
      };
      get().setCanvasData(next);
    },

    setSlotFilter: (slotIndex, filter) => {
      const { canvasData } = get();
      if (!canvasData) return;
      const next: CanvasDataV2 = {
        ...canvasData,
        slots: canvasData.slots.map((s) => (s.slotIndex === slotIndex ? { ...s, filter } : s)),
      };
      get().setCanvasData(next);
    },

    setSlotPhotoTransform: (slotIndex, transform) => {
      const { canvasData } = get();
      if (!canvasData) return;
      const next: CanvasDataV2 = {
        ...canvasData,
        slots: canvasData.slots.map((s) => {
          if (s.slotIndex !== slotIndex) return s;
          if (transform === null) return { ...s, photoTransform: undefined };
          // Merge: solo override los campos provistos.
          const current = s.photoTransform ?? { offsetX: 0, offsetY: 0, scale: 1 };
          return {
            ...s,
            photoTransform: {
              offsetX: transform.offsetX ?? current.offsetX,
              offsetY: transform.offsetY ?? current.offsetY,
              scale: transform.scale ?? current.scale,
              rotation: transform.rotation ?? current.rotation,
            },
          };
        }),
      };
      get().setCanvasData(next);
    },

    setTextOverrideAllSlots: (textLayerId, override) => {
      const { canvasData } = get();
      if (!canvasData) return;
      const next: CanvasDataV2 = {
        ...canvasData,
        slots: canvasData.slots.map((s) => {
          const nextOverrides = { ...(s.textOverrides ?? {}) };
          if (override === null) {
            delete nextOverrides[textLayerId];
          } else {
            nextOverrides[textLayerId] = override;
          }
          const finalOverrides =
            Object.keys(nextOverrides).length === 0 ? undefined : nextOverrides;
          return { ...s, textOverrides: finalOverrides };
        }),
      };
      get().setCanvasData(next);
    },

    setImagePlaceholderRect: (rect) => {
      const { canvasData } = get();
      if (!canvasData) return;
      const next: CanvasDataV2 = {
        ...canvasData,
        unitTemplate: {
          ...canvasData.unitTemplate,
          layers: canvasData.unitTemplate.layers.map((l) =>
            l.type === "image-placeholder" ? { ...l, ...rect } : l,
          ),
        },
      };
      get().setCanvasData(next);
    },

    setSlotTextOverride: (slotIndex, textLayerId, override) => {
      const { canvasData } = get();
      if (!canvasData) return;
      const next: CanvasDataV2 = {
        ...canvasData,
        slots: canvasData.slots.map((s) => {
          if (s.slotIndex !== slotIndex) return s;
          const nextOverrides = { ...(s.textOverrides ?? {}) };
          if (override === null) {
            delete nextOverrides[textLayerId];
          } else {
            nextOverrides[textLayerId] = override;
          }
          // Si no quedan overrides, eliminar el objeto entero (cleanup)
          const finalOverrides =
            Object.keys(nextOverrides).length === 0 ? undefined : nextOverrides;
          return { ...s, textOverrides: finalOverrides };
        }),
      };
      get().setCanvasData(next);
    },

    swapSlots: (a, b) => {
      const { canvasData } = get();
      if (!canvasData) return;
      const slotA = canvasData.slots.find((s) => s.slotIndex === a);
      const slotB = canvasData.slots.find((s) => s.slotIndex === b);
      if (!slotA || !slotB) return;
      const next: CanvasDataV2 = {
        ...canvasData,
        slots: canvasData.slots.map((s) => {
          if (s.slotIndex === a) return { ...slotB, slotIndex: a };
          if (s.slotIndex === b) return { ...slotA, slotIndex: b };
          return s;
        }),
      };
      get().setCanvasData(next);
    },

    autoFillSlots: () => {
      const { canvasData, assets } = get();
      if (!canvasData || assets.length === 0) return;
      // Tomar assets en orden y asignarlos a slots vacíos también en orden.
      // Slots ya llenos se preservan (no se pisan).
      const emptySlots = canvasData.slots
        .filter((s) => !s.assetUrl)
        .map((s) => s.slotIndex)
        .sort((x, y) => x - y);
      const next: CanvasDataV2 = {
        ...canvasData,
        slots: canvasData.slots.map((s) => {
          if (s.assetUrl) return s; // ya lleno
          const idxInEmpty = emptySlots.indexOf(s.slotIndex);
          const asset = assets[idxInEmpty];
          if (asset) {
            return { ...s, assetId: asset.id, assetUrl: asset.signedUrl };
          }
          return s; // no había suficientes assets
        }),
      };
      get().setCanvasData(next);
    },

    selectSlot: (slotIndex) => set({ selectedSlotIndex: slotIndex }),

    setSelectedTemplate: (templateId) => set({ selectedTemplateId: templateId }),

    applyTemplate: (template) => {
      const { canvasData } = get();
      if (!canvasData) return;
      // Preservar slots ya llenos por slotIndex matching. La plantilla nueva
      // hereda el slotCount actual (no cambia, eso lo dicta el producto).
      const next: CanvasDataV2 = {
        ...canvasData,
        unitTemplate: template.canvasData,
        // gridLayout no cambia: depende de slotCount + aspect del stage del
        // nuevo template. Recalcular solo si stage del template difiere.
        // Ola 2A — la plantilla puede fijar las columnas (tira fotobooth: gridCols=1).
        gridLayout:
          template.canvasData.stage.width === canvasData.unitTemplate.stage.width &&
          template.canvasData.stage.height === canvasData.unitTemplate.stage.height
            ? canvasData.gridLayout
            : recalcGridLayout(
                canvasData.slotCount,
                template.canvasData.stage,
                typeof (template.canvasData as { gridCols?: unknown }).gridCols === "number"
                  ? (template.canvasData as { gridCols?: number }).gridCols
                  : undefined,
                typeof (template.canvasData as { gridGap?: unknown }).gridGap === "number"
                  ? (template.canvasData as { gridGap?: number }).gridGap
                  : undefined,
              ),
      };
      get().setCanvasData(next);
      set({ selectedTemplateId: template.id });
    },

    setBorderColor: (color) => {
      const { canvasData } = get();
      if (!canvasData) return;
      if ((canvasData.borderColor ?? null) === color) return;
      get().setCanvasData({ ...canvasData, borderColor: color });
    },

    addAsset: (asset) => {
      set((state) => ({ assets: [...state.assets, asset] }));
    },

    removeAsset: (assetId) => {
      const { canvasData, assets } = get();
      set({ assets: assets.filter((a) => a.id !== assetId) });
      if (!canvasData) return;
      // Limpiar también el asset de cualquier slot que lo tenga asignado
      const affected = canvasData.slots.some((s) => s.assetId === assetId);
      if (affected) {
        const next: CanvasDataV2 = {
          ...canvasData,
          slots: canvasData.slots.map((s) =>
            s.assetId === assetId ? { ...s, assetId: null, assetUrl: null } : s,
          ),
        };
        get().setCanvasData(next);
      }
    },

    setAutoSaveStatus: (status) => set({ autoSaveStatus: status }),
    setIsFinalizing: (v) => set({ isFinalizing: v }),
    markClean: () => set({ isDirty: false }),

    undo: () => {
      const state = get();
      const prev = state.undoStack[state.undoStack.length - 1];
      if (!prev || !state.canvasData) return;
      set({
        canvasData: prev,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.canvasData].slice(-UNDO_LIMIT),
        isDirty: true,
      });
    },

    redo: () => {
      const state = get();
      const next = state.redoStack[state.redoStack.length - 1];
      if (!next || !state.canvasData) return;
      set({
        canvasData: next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, state.canvasData].slice(-UNDO_LIMIT),
        isDirty: true,
      });
    },

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    reset: () => set({ ...initialState }),
  }));
}

export type StudioStore = ReturnType<typeof createStudioStore>;

// ──────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────

/**
 * Recalcula gridLayout cuando la plantilla cambia y el stage difiere.
 * Replica de `lib/grid-layout.ts → generateGridLayout` (no podemos import
 * directo para evitar circular dependency en algunos contextos).
 */
function recalcGridLayout(
  slotCount: number,
  stage: { width: number; height: number },
  forcedCols?: number,
  forcedGap?: number,
) {
  const presets: Record<number, { cols: number; rows: number }> = {
    1: { cols: 1, rows: 1 },
    2: { cols: 2, rows: 1 },
    3: { cols: 3, rows: 1 },
    4: { cols: 2, rows: 2 },
    6: { cols: 3, rows: 2 },
    8: { cols: 4, rows: 2 },
    9: { cols: 3, rows: 3 },
    10: { cols: 5, rows: 2 },
    12: { cols: 4, rows: 3 },
    16: { cols: 4, rows: 4 },
    20: { cols: 5, rows: 4 },
  };
  let cols = presets[slotCount]?.cols ?? Math.ceil(Math.sqrt(slotCount));
  let rows = presets[slotCount]?.rows ?? Math.ceil(slotCount / cols);
  const aspect = stage.width / stage.height;
  if (aspect > 2.0 && cols > rows) [cols, rows] = [rows, cols];
  if (aspect < 0.5 && rows > cols) [cols, rows] = [rows, cols];
  // Ola 2A — la plantilla puede fijar las columnas (tira fotobooth: gridCols=1).
  if (typeof forcedCols === "number" && forcedCols >= 1) {
    cols = Math.min(forcedCols, slotCount);
    rows = Math.ceil(slotCount / cols);
  }
  // Ola 3c — la plantilla puede fijar el gap (tira photobooth: gridGap=0 → las
  // celdas se tocan y la tira se lee como UNA pieza continua de color).
  const gap =
    typeof forcedGap === "number" && forcedGap >= 0
      ? forcedGap
      : slotCount <= 4
        ? 24
        : slotCount <= 9
          ? 16
          : slotCount <= 12
            ? 12
            : 8;
  return { cols, rows, gap };
}

/**
 * Cuando el editor recupera un Design existente con slots ya llenos,
 * extrae los assets para mostrarlos en la sidebar como si los hubiera
 * subido recién. Server-side regenera signed URLs si caducaron.
 */
function extractAssetsFromCanvas(canvasData: CanvasDataV2): StudioAsset[] {
  const seen = new Set<string>();
  const assets: StudioAsset[] = [];
  for (const slot of canvasData.slots) {
    if (slot.assetId && slot.assetUrl && !seen.has(slot.assetId)) {
      seen.add(slot.assetId);
      // Width/height no se conocen del slot; usamos placeholders. M.3.b Capa 4
      // expone esto via metadata del DesignAsset cuando se cargue del server.
      assets.push({
        id: slot.assetId,
        signedUrl: slot.assetUrl,
        width: 0,
        height: 0,
      });
    }
  }
  return assets;
}

/**
 * Selectores ATÓMICOS para slot progress. Cada hook retorna un primitivo
 * → comparación Object.is funciona sin shallow ni memoization.
 *
 * Patrón crítico (lección 2026-05-13): un selector compuesto
 * `selectSlotProgress` que retorna `{ filled, total, emptySlotIndices: [...] }`
 * crea referencias nuevas en cada call. `useShallow` no funciona con
 * arrays anidados (compara `===` element-by-element pero la REFERENCIA del
 * array es nueva → shallow ve diff → re-render infinito).
 *
 * Solución: 1 hook = 1 primitive. Combina los hooks en el componente.
 */

/** Cuenta de slots con assetUrl. Primitive number → Object.is funciona. */
export function selectFilledSlotCount(state: StudioStoreState): number {
  if (!state.canvasData) return 0;
  return state.canvasData.slots.filter((s) => !!s.assetUrl).length;
}

/** Total de slots del design. Primitive number. */
export function selectTotalSlotCount(state: StudioStoreState): number {
  return state.canvasData?.slotCount ?? 0;
}

/** Boolean derivado — todos los slots tienen asset. */
export function selectIsComplete(state: StudioStoreState): boolean {
  if (!state.canvasData) return false;
  const total = state.canvasData.slotCount;
  if (total === 0) return false;
  return state.canvasData.slots.filter((s) => !!s.assetUrl).length === total;
}

/**
 * P0.2 — Boolean primitivo: ¿este assetId está usado en algún slot?
 * Curried para que el componente pueda llamarlo per-asset sin re-render
 * de los demás.
 */
export function selectAssetIsUsed(assetId: string) {
  return (state: StudioStoreState): boolean => {
    if (!state.canvasData) return false;
    return state.canvasData.slots.some((s) => s.assetId === assetId);
  };
}

/**
 * Slot por índice. Usado por StudioSlot para suscribirse solo a su propio
 * slice del state (no re-renderea si otros slots cambian).
 */
export function selectSlotState(slotIndex: number) {
  return (state: StudioStoreState): SlotState | null => {
    if (!state.canvasData) return null;
    return state.canvasData.slots.find((s) => s.slotIndex === slotIndex) ?? null;
  };
}

/**
 * Layer image-placeholder del unitTemplate. Usado por StudioSlot para
 * renderear su frame Konva.
 */
export function selectUnitImagePlaceholder(state: StudioStoreState): ImagePlaceholderLayer | null {
  if (!state.canvasData) return null;
  const layer = state.canvasData.unitTemplate.layers.find((l) => l.type === "image-placeholder");
  return (layer as ImagePlaceholderLayer) ?? null;
}
