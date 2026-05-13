/*
 * Types del Estudio (M.3.b — versión v2 multi-slot canvas).
 *
 * Estos types son client-safe (no importan de @prisma/client ni de service-only
 * código). El servidor convierte modelos Prisma a estos shapes plain JSON antes
 * de pasar al cliente.
 *
 * Coexisten dos versiones de `canvasData`:
 *   - V1 (CanvasDataV1)             — modelo legacy de M.3, 1 image-placeholder
 *                                     por design. Designs creados antes del
 *                                     2026-05-13 lo usan. Migra a V2 al cargar
 *                                     via `lib/canvas-migrate.ts`.
 *   - V2 (MultiSlotCanvasData)      — modelo actual M.3.b. Slot-por-imán:
 *                                     `unitTemplate` (plantilla unitaria V1) +
 *                                     `slots[]` con N estados independientes.
 *
 * Helper de discriminación: `isCanvasV2(data)` chequea `data.version === 2`.
 */

// ──────────────────────────────────────────────────────────────────
//  Enum compartido — mantener alineado con Prisma `PersonalizationKind`
// ──────────────────────────────────────────────────────────────────

export type PersonalizationKind =
  | "PHOTO_PACK"
  | "PHOTO_GRID"
  | "CALENDAR_PHOTO_MONTH"
  | "CALENDAR_PHOTO_HERO"
  | "EVENT_FAVOR"
  | "BUSINESS_LOGO"
  | "CUSTOM_DECOR"
  | "TEXT_ONLY";

// ──────────────────────────────────────────────────────────────────
//  Producto + plantilla — pasados como props del server al client
// ──────────────────────────────────────────────────────────────────

export type StudioProduct = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  personalizationKind: PersonalizationKind;
  /**
   * JSON libre con metadata del kind. Para PHOTO_PACK/PHOTO_GRID típicamente
   * `{ photoSlots: 6, aspectRatio: "1:1", sizeCm: "5×5" }`. El editor lo
   * interpreta para configurar el grid y la validación.
   */
  personalizationSchema: unknown;
  images: string[];
};

export type StudioTemplate = {
  id: string;
  slug: string;
  name: string;
  previewUrl: string;
  /**
   * canvasData de la plantilla. Siempre V1 (plantilla unitaria = cómo se ve
   * UN imán). El editor la usa como `unitTemplate` del MultiSlotCanvasData V2.
   */
  canvasData: CanvasDataV1;
};

// ──────────────────────────────────────────────────────────────────
//  Canvas V1 — plantilla unitaria (1 imán, layers Konva)
// ──────────────────────────────────────────────────────────────────

export type CanvasStage = {
  width: number;
  height: number;
  dpiPreview?: number;
  dpiProduction?: number;
};

export type BackgroundLayer = {
  id: string;
  type: "background";
  color: string;
};

export type ImagePlaceholderLayer = {
  id: string;
  type: "image-placeholder";
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
  rotation?: number;
  label?: string;
  /**
   * Solo V1 legacy — en V2 el assetUrl vive en `slots[i].assetUrl`, no en el
   * layer. Estos campos quedan para migración V1→V2 (donde se extrae el
   * asset y se mueve a `slots[0]`).
   */
  assetId?: string;
  assetUrl?: string;
};

export type TextLayer = {
  id: string;
  type: "text";
  x: number;
  y: number;
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  fontWeight?: string;
  align?: "left" | "center" | "right";
  editable?: boolean;
};

export type ShapeLayer = {
  id: string;
  type: "shape";
  kind: "rect" | "circle" | "heart";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  rotation?: number;
};

type UnknownLayer = {
  id: string;
  type: string;
  [key: string]: unknown;
};

export type CanvasLayer =
  | BackgroundLayer
  | ImagePlaceholderLayer
  | TextLayer
  | ShapeLayer
  | UnknownLayer;

export type CanvasDataV1 = {
  version: 1;
  stage: CanvasStage;
  layers: CanvasLayer[];
  // Permitir extras del seed (perMonth para calendarios, grid para PHOTO_GRID, etc.)
  [key: string]: unknown;
};

// ──────────────────────────────────────────────────────────────────
//  Canvas V2 — multi-slot (M.3.b)
// ──────────────────────────────────────────────────────────────────

/**
 * Estado por slot. Cada slot = 1 imán físico del pack.
 *
 * Per-slot overrides permiten al cliente personalizar cada imán
 * independientemente (ej. ajustar brillo solo de slot 3 sin tocar los otros).
 */
export type SlotState = {
  slotIndex: number;
  assetId: string | null;
  assetUrl: string | null;
  // Per-slot overrides (Capa 4 — filtros y ajustes foto in-canvas):
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
  brightness?: number; // -100 a +100
  contrast?: number; // -100 a +100
  saturation?: number; // -100 a +100
  rotation?: number; // grados (-180 a +180)
  filter?: PhotoFilterPreset | null;
  /** Si el template tiene un TextLayer editable, este override lo reemplaza por slot. */
  textOverride?: string;
};

export type PhotoFilterPreset = "vintage" | "vivid" | "bw" | "pastel" | "polaroid";

export type GridLayout = {
  cols: number;
  rows: number;
  /** Gap en pixels lógicos del grid (no del unit template). */
  gap: number;
};

export type MultiSlotCanvasData = {
  version: 2;
  /** Plantilla unitaria (cómo se ve 1 imán). Layers V1 + stage. */
  unitTemplate: CanvasDataV1;
  /** Cantidad total de imanes/slots del producto (= product.personalizationSchema.photoSlots). */
  slotCount: number;
  /** Estado de cada slot. Longitud === slotCount. */
  slots: SlotState[];
  /** Layout del grid de preview (cols × rows). Calculado al crear/migrar. */
  gridLayout: GridLayout;
};

/** Alias de conveniencia — algunos consumidores usan `CanvasDataV2` por simetría con V1. */
export type CanvasDataV2 = MultiSlotCanvasData;

/**
 * Unión discriminada — el editor maneja ambas versiones via type guard
 * `isCanvasV2()`. Designs nuevos crean directamente V2; designs legacy V1
 * migran al cargar.
 */
export type CanvasData = CanvasDataV1 | MultiSlotCanvasData;

// ──────────────────────────────────────────────────────────────────
//  Type guards
// ──────────────────────────────────────────────────────────────────

export function isCanvasV2(data: CanvasData): data is MultiSlotCanvasData {
  return data.version === 2;
}

export function isCanvasV1(data: CanvasData): data is CanvasDataV1 {
  return data.version === 1;
}

// ──────────────────────────────────────────────────────────────────
//  UI helpers
// ──────────────────────────────────────────────────────────────────

export type StudioAsset = {
  id: string;
  signedUrl: string;
  width: number;
  height: number;
  /**
   * Resultado de validación sharp server-side. `level === 'error'` bloquea
   * el upload; los otros niveles permiten pero muestran warning UI.
   */
  validationLevel?: "ok" | "warning-soft" | "warning-strong" | "error";
  validationMessage?: string;
};

export type AutoSaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

/**
 * Resumen del progreso de completado del design — usado por toolbar/sidebar
 * para mostrar "3/6 fotos cargadas" + color del badge (rojo/naranja/verde).
 *
 * - `filled` cuenta slots con assetUrl set
 * - `withWarnings` cuenta slots cuya foto tiene validación warning-strong
 *   (resolución demasiado baja, foto oscura/borrosa) — Lucy puede continuar
 *   pero el badge queda naranja
 * - `complete` true ↔ filled === slotCount
 */
export type SlotProgress = {
  filled: number;
  total: number;
  withWarnings: number;
  complete: boolean;
  /** Slot indices que están vacíos (para highlight UI en validación). */
  emptySlotIndices: number[];
};

// ──────────────────────────────────────────────────────────────────
//  Per-product config — extracted from personalizationSchema
// ──────────────────────────────────────────────────────────────────

/**
 * Shape esperado de `Product.personalizationSchema` para kinds que tienen
 * slots de foto. Se parsea con Zod runtime para tolerar campos extra o
 * missing (kinds sin foto como TEXT_ONLY no necesitan photoSlots).
 */
export type PhotoProductConfig = {
  photoSlots: number;
  /** Aspect ratio nominal del imán físico (informativo, UX). */
  aspectRatio?: string;
  /** Tamaño físico real para validación resolución + indicador "tamaño real". */
  sizeCm?: string;
  /** Forma del imán físico — afecta cornerRadius del slot en realismo overlay. */
  shape?: "rectangle" | "circle" | "heart" | "custom";
  /** Cantidad mínima de pedido (para kinds B2B como BUSINESS_LOGO). */
  minQuantity?: number;
};
