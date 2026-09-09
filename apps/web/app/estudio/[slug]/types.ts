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

/**
 * Asset layer (M.3.b.A2 — paradigma pacdora): renderea una imagen SVG/PNG
 * externa como capa visual. Permite plantillas con marcos elaborados,
 * ornamentos, decoraciones, sin tener que codificar paths SVG inline.
 *
 * Layer ordering típico para plantillas WOW:
 *   1. background (color sólido)
 *   2. image-placeholder (foto cliente)        ← se ve por el "hueco" del asset
 *   3. asset (PNG/SVG con área transparente)    ← define el marco visual
 *   4. text (editable, encima del asset)
 *
 * El `src` apunta a `public/templates/<slug>.svg` o `.png`. Solo permitimos
 * paths del repo (no URLs externas) por seguridad — validado en Zod schema.
 */
export type AssetLayer = {
  id: string;
  type: "asset";
  /** Path relativo a /templates/ — ej "/templates/polaroid-romantica.svg" */
  src: string;
  x: number; // top-left
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
};

/**
 * FrameCardLayer (Ola 3, Lucy 2026-07-22) — TARJETA de color de la Polaroid Clásica:
 * un rect redondeado a todo el stage cuyo relleno es el COLOR DEL BORDE elegido en
 * el Estudio (canvasData.borderColor de la paleta frame-palette: blanco/negro/pasteles).
 * `fill` es el fallback cuando el cliente no eligió color (blanco clásico).
 * Va DEBAJO del image-placeholder y del texto (la foto y el mensaje se montan encima).
 * Cuando la plantilla trae esta capa, el marco-stroke de Ola 2A se omite (la tarjeta
 * ES el marco) y el texto por defecto pasa a claro si la tarjeta es oscura.
 */
export type FrameCardLayer = {
  id: string;
  type: "frame-card";
  /** Color fallback (hex) si canvasData.borderColor es null. Default "#FFFFFF". */
  fill?: string;
  /** Radio de esquina en px del stage (la tarjeta física tiene esquinas suaves). */
  cornerRadius?: number;
};

/**
 * ProfilePhotoLayer (Ola 17, Lucy 2026-09-07) — FOTO DE PERFIL del header del post
 * de Instagram (plantilla Polaroid Instagram). El chrome SVG trae un avatar
 * placeholder horneado; esta capa lo cubre con la foto real del cliente recortada
 * a círculo, dejando el anillo de historia visible alrededor.
 * `x`/`y` son el CENTRO del círculo y `radius` su radio (coords del stage).
 * La imagen NO vive en la capa: el slot la aporta vía
 * `slots[i].profileAssetUrl` (igual que image-placeholder usa assetUrl) — cada
 * imán del pack es un post independiente con su propio usuario → POR SLOT.
 * Va INMEDIATAMENTE DESPUÉS del asset "frame" en el orden de capas (encima del SVG).
 */
export type ProfilePhotoLayer = {
  id: string;
  type: "profile-photo";
  x: number;
  y: number;
  radius: number;
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
  | AssetLayer
  | FrameCardLayer
  | ProfilePhotoLayer
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
  /**
   * Ola 17 (Lucy 2026-09-07) — FOTO DE PERFIL del header del post de Instagram
   * (plantilla Polaroid Instagram), POR SLOT: cada imán del pack es un post
   * independiente con su propio usuario. La capa `profile-photo` del unitTemplate
   * las consume. null/ausente = se ve el avatar placeholder horneado del SVG.
   */
  profileAssetId?: string | null;
  profileAssetUrl?: string;
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
  /** M.3.b.D — Overrides por TextLayer editable, indexados por TextLayer.id.
   * Permite múltiples zonas de texto editables por slot (Instagram post:
   * username + likes + caption + hashtags = 4 zonas).
   * Cada override puede sobrescribir text, color, font, size individualmente. */
  textOverrides?: Record<string, TextOverride>;
  /** @deprecated — Usar `textOverrides[layerId].text`. Mantenido por backward compat. */
  textOverride?: string;
  /** M.3.b.UX.v6 (Lucy 2026-05-15) — Transformación de la foto dentro del slot.
   *  - offsetX/Y: pan en coords del stage desde el centro del slot.
   *  - scale: factor sobre el "cover scale" base. 1.0 = cover exacto (puede no
   *    permitir drag en ambos ejes si aspect coincide). El editor aplica un
   *    overscan default 1.15 para garantizar drag siempre.
   *  - rotation (Ola 3c): grados (pasos de 90) para enderezar fotos cuya
   *    orientación no calza la ventana (separadores 6×2, caras verticales).
   *  Valor `undefined` = transform default (centrada, scale cover × 1.15). */
  photoTransform?: { offsetX: number; offsetY: number; scale: number; rotation?: number };
};

/** M.3.b.D — Override de un TextLayer específico. Cualquier campo no
 *  declarado mantiene el valor del layer base del unitTemplate. */
export type TextOverride = {
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  fontWeight?: string;
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
  /**
   * Ola 2A (Lucy 2026-07-22) — color del MARCO alrededor de la foto (hex #RRGGBB), elegido
   * en el Estudio como estilo visual (antes era la variante "Estilo"/"Marco" de la PDP).
   * null/undefined = sin marco. Viaja con el diseño a la cotización y al render de producción.
   */
  borderColor?: string | null;
  /**
   * Lucy 2026-09-05 — packs de fotoimanes: N de fotos por imán elegido con el
   * control del Estudio (antes dimensión `photoSlots` de variante en la PDP).
   * slotCount sigue siendo N × facesPerUnit. Persiste en el canvasData (auto-save)
   * para que el carrito resuelva la variante server-side sin variantId del cliente.
   */
  photoSlots?: number;
  /** Mismo feature — tamaño físico elegido en la PDP (deep-link ?variant=). */
  sizeCm?: string;
  /**
   * Lucy 2026-09-08 — "¿Con imán?" también en los packs de foto: la PDP elige
   * Con/Sin imán (dimensión `magnet` de la variante) y el Estudio lo MUESTRA
   * (badge read-only junto al stepper de fotos), no lo cambia — una sola fuente
   * de verdad. Persiste en el canvasData (auto-save) para que el carrito resuelva
   * la variante server-side incluyendo el imán (features/products/photo-pack-resolve.ts).
   * Ausente = diseño legacy de antes de esta ola → la resolución cae a Con imán
   * (magnet: true), que es lo que el producto siempre fue.
   */
  magnet?: boolean;
  /**
   * Lucy 2026-09-07 — tipo de letra del TÍTULO/mes del calendario (selector del banner del
   * Estudio): "fredoka" (default, ausente = look histórico) | "inter" | "caveat". Persiste
   * en el canvasData (auto-save) → producción lo re-mapea a la familia registrada vía lista
   * blanca. La grilla/body del calendario SIEMPRE es Inter (no cambia con esta clave).
   */
  calendarFont?: import("@/features/personalization/schemas").CalendarFontKey;
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
  /**
   * Acabado del imán físico — afecta overlay de realismo:
   *   - "matte"  → sin reflejo, textura neutral (default)
   *   - "glossy" → gradient blanco semi-transparente top-left simula reflejo
   *   - "soft-touch" → muy sutil reflejo (placeholder, ahora se renderea como matte)
   * M.3.b.B.1.
   */
  finish?: "matte" | "glossy" | "soft-touch";
  /**
   * cornerRadius del imán físico en px (sobre stage del unitTemplate).
   * Default 0. Imanes tipo "card" típicamente 24-32 sobre stage 1080.
   * Si shape === "circle" o "heart" se ignora (la forma define el contorno).
   */
  cornerRadiusPx?: number;
  /**
   * Ola 2A — ids de marco de color ofrecidos en el Estudio (paleta frame-palette).
   * Si está presente y no vacío, el Estudio muestra el selector "Marco" (borde de
   * color alrededor de la foto). Ej: ["blanco","negro","aguamarina","rosa","lavanda","amarillo"].
   */
  frameOptions?: string[];
  /**
   * Ola 3 — ¿el producto admite texto editable? Default false (Fotoimanes Cuadrados
   * NO llevan texto; la Polaroid sí). Espejo del campo Zod en schemas.ts.
   */
  allowText?: boolean;
  /**
   * Ola 3 — caras de diseño por unidad física (separadores: 2 → slotCount=2N,
   * slots 2k=cara A / 2k+1=cara B). Default 1. Espejo del campo Zod en schemas.ts.
   */
  facesPerUnit?: number;
};
