/*
 * Paleta de MARCOS de color para fotoimanes (Ola 2A, Lucy 2026-07-22).
 *
 * El "Estilo" de la Polaroid y el "Marco" de los Fotoimanes Cuadrados dejaron de ser
 * variantes de la PDP: son una PLANTILLA/estilo visual que el cliente elige DENTRO del
 * Estudio como un borde de color alrededor de la foto. La elección viaja en
 * `canvasData.borderColor` (hex) para la cotización y el render de producción.
 *
 * Módulo PURO (sin deps de servidor) → usable desde el editor (cliente), el render de
 * producción (server) y los scripts de seed.
 */

export type FrameColor = {
  /** Id semántico (va en personalizationSchema.frameOptions y en seeds). */
  id: string;
  /** Hex #RRGGBB que se dibuja y se persiste en canvasData.borderColor. */
  hex: string;
  /** Etiqueta visible es-CO. */
  label: string;
};

/** Paleta de marca: blanco/negro + pasteles Lucams. */
export const FRAME_COLORS: readonly FrameColor[] = [
  { id: "blanco", hex: "#FFFFFF", label: "Blanco" },
  { id: "negro", hex: "#221E25", label: "Negro" },
  { id: "aguamarina", hex: "#5DD9D1", label: "Aguamarina" },
  { id: "rosa", hex: "#E85B9F", label: "Rosa" },
  { id: "lavanda", hex: "#7C6AAD", label: "Lavanda" },
  { id: "amarillo", hex: "#FFD93D", label: "Amarillo" },
] as const;

/** Ids por defecto ofrecidos cuando el producto declara marcos (orden de la paleta). */
export const DEFAULT_FRAME_OPTION_IDS: readonly string[] = FRAME_COLORS.map((c) => c.id);

const BY_ID = new Map(FRAME_COLORS.map((c) => [c.id, c]));

export function frameColorById(id: string): FrameColor | null {
  return BY_ID.get(id) ?? null;
}

export function frameColorHex(id: string): string | null {
  return BY_ID.get(id)?.hex ?? null;
}

/** ¿Es un hex #RRGGBB válido? (misma regla que el schema Zod de canvasData). */
export function isValidFrameHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

/**
 * Ola 3 — ¿el color de la tarjeta/marco es OSCURO? (Polaroid Clásica con borde negro:
 * el texto por defecto debe salir CLARO para que se lea). Luminancia relativa simple
 * (Rec. 601) — umbral 0.5: el negro de marca (#221E25) y la lavanda (#7C6AAD) cuentan
 * como oscuros; los pasteles y el blanco, como claros. Módulo puro → mismo criterio en
 * el editor (Konva) y en el render de producción (WYSIWYG).
 */
export function isDarkColor(hex: string): boolean {
  if (!isValidFrameHex(hex)) return false;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 0.5;
}

// ──────────────────────────────────────────────────────────────────────────
// Ola 3b (Lucy 2026-07-22) — MARCO FULL-BLEED ("el fin del papel")
//
// Bug reportado: el marco de color se dibujaba como un STROKE alrededor de la foto
// sobre tarjeta BLANCA — la captura de Lucy mostraba el borde negro alrededor de la
// foto pero la tarjeta exterior seguía blanca. Referencia correcta (su imagen rosa):
// TODA la tarjeta es del color elegido y la foto va inserta (el "marco" es la tarjeta
// misma, como ya hacía la Polaroid Clásica con su capa frame-card).
//
// Para productos con frameOptions, cuando la plantilla NO trae frame-card, el editor
// (Konva) y producción (production-render-canvas) pintan el fondo completo del stage
// con borderColor e INSERTAN la foto garantizando una franja mínima de color. La franja
// es RELATIVA al stage → el ancho proporcional se mantiene igual en 6.5, 8 o 10 cm
// (el stage escala con el tamaño físico de la variante).
// ──────────────────────────────────────────────────────────────────────────

/** Ancho mínimo de la franja de color como fracción del lado menor del stage (4%). */
export const FRAME_BLEED_MARGIN_RATIO = 0.04;

/** Franja mínima de color (px del stage) para el marco full-bleed. */
export function frameBleedMargin(stage: { width: number; height: number }): number {
  return Math.max(6, Math.round(Math.min(stage.width, stage.height) * FRAME_BLEED_MARGIN_RATIO));
}

export type PhotoRect = { x: number; y: number; width: number; height: number };

// ──────────────────────────────────────────────────────────────────────────
// Ola 4 (Lucy 2026-07-23) — Cuadrados: SIN borde → foto a sangre total;
// CON borde → tarjeta de color + foto inserta con franja UNIFORME.
//
// La regla aplica solo a plantillas "tarjeta simple" (fondo + 1 foto, sin
// chrome propio): con borderColor la franja es UNIFORME en los 4 lados (la
// referencia rosa de Lucy), no "los márgenes que traiga la plantilla" (eso
// dejaba la franja asimétrica 40/40/40/100 de libre-photo-pack). Sin
// borderColor la foto cubre TODA la tarjeta (0 margen — antes quedaba la
// franja blanca de la plantilla aunque el cliente eligiera "sin marco").
// ──────────────────────────────────────────────────────────────────────────

/** Tipos de capa que le dan layout propio a la plantilla (chrome/marca), no "tarjeta simple". */
const DECOR_LAYER_TYPES = new Set(["asset", "shape"]);

/**
 * ¿La plantilla es una "tarjeta simple"? (fondo + foto, SIN chrome propio: sin frame-card,
 * sin capas asset/shape y sin texto VISIBLE para el producto). Solo a esas les aplica la
 * regla cuadrados (sangre total / franja uniforme). Las demás conservan su layout
 * (Polaroid Clásica con frame-card, Instagram con chrome SVG, tiras con frame-card).
 */
export function isSimpleCardTemplate(
  layers: ReadonlyArray<{ type: string }>,
  opts?: { hasFrameCard?: boolean; textIsVisible?: boolean },
): boolean {
  if (opts?.hasFrameCard ?? layers.some((l) => l.type === "frame-card")) return false;
  if (layers.some((l) => DECOR_LAYER_TYPES.has(l.type))) return false;
  if ((opts?.textIsVisible ?? false) && layers.some((l) => l.type === "text")) return false;
  return true;
}

/**
 * Ventana de foto para "tarjeta simple" de un producto con frameOptions:
 *   - borderColor set → franja UNIFORME de `margin` px en los 4 lados (tarjeta de color).
 *   - borderColor null → la foto cubre TODA la tarjeta (0 margen).
 */
export function simpleCardPhotoRect(
  stage: { width: number; height: number },
  borderColor: string | null | undefined,
  margin: number,
): PhotoRect {
  if (!borderColor) return { x: 0, y: 0, width: stage.width, height: stage.height };
  return {
    x: margin,
    y: margin,
    width: Math.max(10, stage.width - margin * 2),
    height: Math.max(10, stage.height - margin * 2),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Ola 4 (Lucy 2026-07-23) — TIRA photobooth: UNA pieza continua.
//
// La plantilla de celda (gridCols:1 + gridGap:0) trae la foto a sangre vertical
// (y=0) para que las fotos de celdas vecinas SE TOQUEN (gap 0 real). El borde
// EXTERIOR de la tira (arriba de la 1ª foto, abajo de la última) no puede vivir
// en la plantilla (es uniforme por celda) → lo aplica el código por posición.
// ──────────────────────────────────────────────────────────────────────────

/** ¿La plantilla es una celda de tira photobooth? (marcadores gridCols=1 + gridGap=0). */
export function isStripTemplate(unitTemplate: { gridCols?: unknown; gridGap?: unknown }): boolean {
  return unitTemplate.gridCols === 1 && unitTemplate.gridGap === 0;
}

export type StripPosition = "first" | "middle" | "last" | "single";

/** Posición del slot dentro de la tira (para el borde exterior). */
export function stripPositionOf(slotIndex: number, slotCount: number): StripPosition {
  if (slotCount <= 1) return "single";
  if (slotIndex === 0) return "first";
  if (slotIndex === slotCount - 1) return "last";
  return "middle";
}

/**
 * Grosor del borde exterior de la tira (px del stage). ≈2 mm a 300 DPI sobre una tira
 * de 6.5 cm de ancho (390 px → 12 px); proporcional al ancho del stage.
 */
export function stripOuterInset(stage: { width: number; height: number }): number {
  return Math.max(6, Math.round(stage.width * 0.03));
}

/**
 * Aplica el borde EXTERIOR de la tira a la ventana de foto de una celda:
 * first/single → inset arriba; last/single → inset abajo; middle → fotos se tocan.
 * Los lados los maneja la plantilla (ventana con margen lateral uniforme).
 */
export function stripPhotoRect(
  ph: PhotoRect,
  stage: { width: number; height: number },
  position: StripPosition,
): PhotoRect {
  const inset = stripOuterInset(stage);
  const top = position === "first" || position === "single" ? inset : 0;
  const bottom = position === "last" || position === "single" ? inset : 0;
  return { ...ph, y: ph.y + top, height: Math.max(10, ph.height - top - bottom) };
}

// ──────────────────────────────────────────────────────────────────────────
// Ola 4 (Lucy 2026-07-23) — Polaroid Instagram: fondo SOLO blanco/negro con
// contraste automático de textos (fondo blanco → textos negros; fondo negro →
// textos blancos). El chrome (SVG) también tiene variante oscura.
// ──────────────────────────────────────────────────────────────────────────

/** ¿La plantilla es la Polaroid Instagram? (chrome SVG ig_post). */
export function isInstagramTemplate(
  layers: ReadonlyArray<{ type: string; src?: unknown }>,
): boolean {
  return layers.some(
    (l) => l.type === "asset" && typeof l.src === "string" && l.src.includes("ig_post"),
  );
}

/**
 * Fondo EFECTIVO de la tarjeta Instagram: binario blanco/negro. borderColor oscuro
 * (negro de marca) → fondo negro; cualquier otro caso (null, blanco o un pastel
 * residual de otra plantilla) → el fondo blanco de la capa background.
 */
export function instagramBackgroundHex(
  borderColor: string | null | undefined,
  fallbackHex: string,
): string {
  if (borderColor && isDarkColor(borderColor)) return borderColor;
  return fallbackHex;
}

/**
 * Variante del chrome SVG para fondo oscuro: `ig_post_3x4.svg` → `ig_post_3x4_dark.svg`.
 * Si no hay variante conocida, devuelve el src intacto.
 */
export function darkChromeSrc(src: string, darkBackground: boolean): string {
  if (!darkBackground) return src;
  if (src.endsWith("_dark.svg")) return src;
  return src.replace(/\.svg$/i, "_dark.svg");
}

/**
 * Variante del chrome SVG para modo SIN BORDE (foto a sangre): el asset deja de
 * pintar la tarjeta/marco y solo dibuja el chrome (header + iconos). La foto del
 * cliente cubre todo el stage y el color de tarjeta lo pone el canvas.
 * Combina con `_dark` cuando el fondo es oscuro.
 */
export function noBorderChromeSrc(src: string, noBorder: boolean, darkBackground = false): string {
  if (!noBorder) return darkChromeSrc(src, darkBackground);
  const base = src.replace(/_dark\.svg$/i, "").replace(/\.svg$/i, "");
  return `${base}${darkBackground ? "_dark" : ""}_noborder.svg`;
}

/**
 * ¿La plantilla Instagram está en modo SIN BORDE?
 * Detecta por el rect del image-placeholder: si la foto cubre TODO el stage
 * (x=0 y=0 w=450 h=600 en el stage 450×600), el asset debe usar su variante
 * `_noborder` (sin tarjeta/marco, solo chrome sobre la foto).
 */
export function isInstagramNoBorder(
  photoRect: { x?: number; y?: number; width?: number; height?: number } | undefined,
  stage: { width: number; height: number },
): boolean {
  if (!photoRect) return false;
  const base = { width: 450, height: 600 };
  const scale = stage.width / base.width;
  const x = 0;
  const y = 0;
  const w = Math.round(base.width * scale);
  const h = Math.round(base.height * scale);
  return photoRect.x === x && photoRect.y === y && photoRect.width === w && photoRect.height === h;
}

/**
 * Inserta la ventana de foto para el marco full-bleed: garantiza una franja de color
 * de al menos `margin` px en CADA lado, respetando los márgenes mayores que ya traiga
 * la plantilla (ej. libre-photo-pack con 40px de aire conserva su margen; una ventana
 * a sangre como foto-rectangular-simple se encoge hasta dejar la franja mínima).
 * Si el resultado sería degenerado (ventana < 10px), devuelve la ventana intacta.
 */
export function insetToMinMargin(
  ph: PhotoRect,
  stage: { width: number; height: number },
  margin: number,
): PhotoRect {
  const x = Math.max(ph.x, margin);
  const y = Math.max(ph.y, margin);
  const right = Math.min(ph.x + ph.width, stage.width - margin);
  const bottom = Math.min(ph.y + ph.height, stage.height - margin);
  if (right - x < 10 || bottom - y < 10) return ph;
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Marco inicial del Estudio según la variante que venía elegida de la PDP (schema ya
 * mergeado). La dimensión ya no se muestra en la PDP, pero la variante sigue trayendo
 * el dato → el Estudio PRESELECCIONA el marco equivalente y el cliente lo puede cambiar.
 *   - Fotoimanes Cuadrados: frameStyle "blanco" | "negro" → ese marco.
 *   - Polaroid: variantStyle "blanco-clasico" → blanco; "pasteles" → aguamarina (1er pastel);
 *     "instagram" → sin marco (la plantilla Instagram ya trae su propio marco SVG).
 */
export function initialFrameColorFromSchema(schema: unknown): string | null {
  if (!schema || typeof schema !== "object") return null;
  const s = schema as { frameStyle?: unknown; variantStyle?: unknown };
  if (typeof s.frameStyle === "string") {
    const hex = frameColorHex(s.frameStyle);
    if (hex) return hex;
  }
  if (s.variantStyle === "blanco-clasico") return frameColorHex("blanco");
  if (s.variantStyle === "pasteles") return frameColorHex("aguamarina");
  return null;
}
