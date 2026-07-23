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
