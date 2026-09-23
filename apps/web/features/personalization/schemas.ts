/*
 * Zod schemas — Estudio de Personalización (M.3.b v2).
 *
 * Coexisten 2 versiones de canvasData:
 *   - V1 (CanvasDataV1Schema)   — legacy M.3, 1 image-placeholder por design
 *   - V2 (CanvasDataV2Schema)   — actual M.3.b, slot-por-imán
 *
 * `CanvasDataSchema` es la unión discriminada por `version`. Server acepta
 * ambas; el service layer migra V1→V2 automáticamente al cargar/guardar.
 */

import { z } from "zod";

// ──────────────────────────────────────────────────────────────────
//  Canvas V1 — plantilla unitaria / legacy
// ──────────────────────────────────────────────────────────────────

export const StageSchema = z.object({
  width: z.number().int().min(100).max(8000),
  height: z.number().int().min(100).max(8000),
  dpiPreview: z.number().int().min(72).max(300).default(90),
  dpiProduction: z.number().int().min(150).max(600).default(300),
});

// M.3.b.A2 — Layer asset: regex valida que src sea path local del repo
// (`/templates/<slug>.svg|png|jpg`) y NO URLs externas. Esto previene
// inyección de assets remotos en el editor (XSS via SVG malicioso).
// Auditoría v3 · B5: se permite '_' — el asset del Polaroid es `ig_post.svg`; sin el guion bajo el
// regex rechazaba CADA auto-save del Polaroid → canvasData nunca persistía y el editor mostraba el
// error crudo de Zod. Sigue siendo un path local restringido (sin `..`, sin `/` extra, sin URLs).
const ASSET_SRC_RE = /^\/templates\/[a-z0-9_-]+\.(svg|png|jpg|jpeg|webp)$/;

export const CanvasLayerSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
  })
  .catchall(z.unknown())
  .superRefine((layer, ctx) => {
    // Validar src de AssetLayer si type === "asset"
    if (layer.type === "asset") {
      const src = (layer as { src?: unknown }).src;
      if (typeof src !== "string" || !ASSET_SRC_RE.test(src)) {
        ctx.addIssue({
          code: "custom",
          message: `Asset layer ${layer.id}: src debe matchear /templates/<slug>.svg|png|jpg|webp`,
          path: ["src"],
        });
      }
    }
  });

export const CanvasDataV1Schema = z
  .object({
    version: z.literal(1),
    stage: StageSchema,
    layers: z.array(CanvasLayerSchema).max(200),
  })
  .catchall(z.unknown());

export type CanvasDataV1 = z.infer<typeof CanvasDataV1Schema>;

// ──────────────────────────────────────────────────────────────────
//  Canvas V2 — multi-slot
// ──────────────────────────────────────────────────────────────────

export const PhotoFilterPresetSchema = z.enum(["vintage", "vivid", "bw", "pastel", "polaroid"]);

// Override de un TextLayer editable por el usuario (indexado por TextLayer.id).
export const TextOverrideSchema = z.object({
  text: z.string().max(500).optional(),
  fontFamily: z.string().max(80).optional(),
  fontSize: z.number().min(1).max(4000).optional(),
  fill: z.string().max(40).optional(),
  fontWeight: z.string().max(20).optional(),
});

export const SlotStateSchema = z.object({
  slotIndex: z.number().int().min(0).max(99),
  assetId: z.string().nullable(),
  assetUrl: z.string().nullable(),
  // Per-slot overrides — todos opcionales y validados con rangos sanos.
  cropX: z.number().optional(),
  cropY: z.number().optional(),
  cropW: z.number().optional(),
  cropH: z.number().optional(),
  brightness: z.number().min(-100).max(100).optional(),
  contrast: z.number().min(-100).max(100).optional(),
  saturation: z.number().min(-100).max(100).optional(),
  rotation: z.number().min(-180).max(180).optional(),
  filter: PhotoFilterPresetSchema.nullable().optional(),
  textOverride: z.string().max(500).optional(),
  // Ola 17 (Lucy 2026-09-07) — foto de perfil del header del post de Instagram (capa
  // `profile-photo` de la plantilla Polaroid Instagram), POR SLOT. Sin catchall en este
  // schema: declararlas acá es lo que las hace sobrevivir el auto-save (Zod stripea
  // claves no declaradas) — igual que photoTransform/textOverrides (ADR-057 Fase A).
  profileAssetId: z.string().nullable().optional(),
  profileAssetUrl: z.string().max(2048).optional(),
  // ADR-057 Fase A — ENCUADRE del usuario (pan/zoom de la foto dentro del slot). ANTES no se
  // persistía (Zod strip) → el encuadre manual se perdía al guardar/recargar (bug) y el servidor
  // no podía reconstruir el render fiel. Ahora sobrevive; es la fuente de verdad del encuadre.
  photoTransform: z
    .object({
      offsetX: z.number().min(-20000).max(20000),
      offsetY: z.number().min(-20000).max(20000),
      scale: z.number().min(0.05).max(20),
      // Ola 3c — rotación de la foto (pasos de 90° desde "Ajustar foto"). Útil cuando
      // la orientación de la foto no calza la de la cara/ventana (separadores 6×2).
      rotation: z.number().min(-360).max(360).optional(),
    })
    .optional(),
  // ADR-057 Fase A — texto editado por el usuario, por TextLayer.id (Polaroid, plantillas).
  textOverrides: z.record(z.string().max(80), TextOverrideSchema).optional(),
});

export const GridLayoutSchema = z.object({
  cols: z.number().int().min(1).max(20),
  rows: z.number().int().min(1).max(20),
  gap: z.number().int().min(0).max(64),
});

// ──────────────────────────────────────────────────────────────────
//  Tipo de letra del calendario (Lucy 2026-09-07)
// ──────────────────────────────────────────────────────────────────

// Selector de fuente del TÍTULO/mes de la tarjeta del calendario (set 12 tarjetas).
// "fredoka" (default) mantiene el look actual; el body/grilla SIEMPRE es Inter.
// La clave viaja en canvasData (persistida) → producción la re-mapea a la familia
// registrada vía lista blanca (NUNCA un string libre del cliente).
// 2026-09-14 (owner): de 3 a 8 opciones — cada key tiene su TTF registrado en el
// render de servidor (assets/fonts) y su CSS var de next/font en app/layout.tsx.
export const CalendarFontKeySchema = z.enum([
  "fredoka",
  "inter",
  "caveat",
  "baloo2",
  "nunito",
  "patrick",
  "playfair",
  "dancing",
]);
export type CalendarFontKey = z.infer<typeof CalendarFontKeySchema>;

/** Opciones curadas del selector (en ese orden). Los labels en español viven en studio-texts. */
export const CALENDAR_FONT_OPTIONS: readonly CalendarFontKey[] = [
  "fredoka",
  "inter",
  "caveat",
  "baloo2",
  "nunito",
  "patrick",
  "playfair",
  "dancing",
];

/** Retrocompatibilidad: ausente/inválido → fredoka (look histórico del calendario). */
export function calendarFontOrDefault(key: unknown): CalendarFontKey {
  return CalendarFontKeySchema.safeParse(key).success ? (key as CalendarFontKey) : "fredoka";
}

export const CanvasDataV2Schema = z.object({
  version: z.literal(2),
  unitTemplate: CanvasDataV1Schema,
  slotCount: z.number().int().min(1).max(50), // soporte hasta 50 slots (calendarios + extreme cases)
  slots: z.array(SlotStateSchema).max(50),
  gridLayout: GridLayoutSchema,
  // Ola 2A — color del marco alrededor de la foto (estilo elegido en el Estudio; viaja a la
  // cotización y al render de producción). null = sin marco.
  borderColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  // Lucy 2026-09-05 — packs de fotoimanes: N de fotos por imán elegido DENTRO del
  // Estudio (antes era dimensión de variante elegida en la PDP) + tamaño físico
  // elegido en la PDP. Persisten en el canvasData para que el carrito resuelva
  // la variante server-side sin confiar en un variantId del cliente
  // (features/products/photo-pack-resolve.ts). SIN catchall en este schema: Zod
  // stripea claves desconocidas, así que declararlas acá es lo que las hace
  // sobrevivir el auto-save.
  photoSlots: z.number().int().min(1).max(50).optional(),
  sizeCm: z.string().max(40).optional(),
  // Lucy 2026-09-08 — "¿Con imán?" en los packs de foto: la elección de la PDP
  // (dimensión `magnet` de la variante) persiste acá para que el carrito la incluya
  // al resolver la variante server-side. Ausente = legacy → resuelve a Con imán.
  magnet: z.boolean().optional(),
  // Lucy 2026-09-07 — tipo de letra del título/mes del calendario (selector en el banner
  // del Estudio). Ausente = "fredoka" (retrocompatible con diseños guardados antes de
  // esta ola). Sin catchall en este schema: declararla acá es lo que la hace sobrevivir
  // el auto-save (Zod stripea claves no declaradas).
  calendarFont: CalendarFontKeySchema.optional(),
  // Modelo MULTI-UNIDAD (owner 2026-09-09 — regla general): N unidades físicas del mismo
  // producto, CADA UNA diseñable por separado en el Estudio (2 tiras = 2 × unitSlots;
  // 2 calendarios = 2 × 12). Aditivo: ausentes = 1 unidad (diseños legacy intactos).
  // Invariante: slotCount = unitCount × unitSlots; el editor solo los escribe cuando
  // unitSlots > 1 (los packs de imán suelto no los declaran — su variante YA es el pack).
  // El precio NUNCA confía en estos campos: se deriva de slotCount (design-units.ts).
  unitCount: z.number().int().min(1).max(50).optional(),
  unitSlots: z.number().int().min(1).max(50).optional(),
});

export type CanvasDataV2 = z.infer<typeof CanvasDataV2Schema>;

// ──────────────────────────────────────────────────────────────────
//  Unión discriminada V1 | V2
// ──────────────────────────────────────────────────────────────────

export const CanvasDataSchema = z.discriminatedUnion("version", [
  CanvasDataV1Schema,
  CanvasDataV2Schema,
]);

export type CanvasData = z.infer<typeof CanvasDataSchema>;

// ──────────────────────────────────────────────────────────────────
//  Server Action inputs
// ──────────────────────────────────────────────────────────────────

export const CreateDraftDesignSchema = z.object({
  productId: z.string().min(1),
  templateId: z.string().optional(),
});
export type CreateDraftDesignInput = z.infer<typeof CreateDraftDesignSchema>;

// M.3.b.fix — Cap defensivo de tamaño JSON del canvasData. Un canvasData V2
// típico pesa 8-30 KB; cualquier payload > 1 MB indica bug (ej. cliente
// enviando dataURL base64 por error). 1 MB es ~2.5× el ancho de banda
// realistic worst-case (calendario 12 slots con metadata extensa).
const MAX_CANVAS_DATA_BYTES = 1 * 1024 * 1024;

export const SaveCanvasSchema = z
  .object({
    designId: z.string().min(1),
    canvasData: CanvasDataSchema,
    // N-08 (2026-09-11) — plantilla aplicada en el sidebar: viaja con el auto-save
    // para que Design.templateId la refleje. El service la re-valida contra el
    // producto (kind/EDITABLE/activa) antes de persistirla.
    templateId: z.string().min(1).max(40).optional(),
  })
  .superRefine((data, ctx) => {
    const size = JSON.stringify(data.canvasData).length;
    if (size > MAX_CANVAS_DATA_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: `canvasData excede ${MAX_CANVAS_DATA_BYTES / 1024 / 1024} MB (recibido ${(size / 1024 / 1024).toFixed(2)} MB) — posible payload corrupto`,
        path: ["canvasData"],
      });
    }
  });
export type SaveCanvasInput = z.infer<typeof SaveCanvasSchema>;

// ──────────────────────── Finalize (M.3.b — N PNGs por producto) ────────────────────────
//
// V2 emite múltiples productionDataUrls (uno por imán físico) en lugar de 1.
// El cliente genera N snapshots via stage.toDataURL() por cada slot llenado
// y los envía juntos al server.
//
// `previewDataUrl` es el snapshot del grid completo (preview compositado)
// usado en cart/order para mostrar al cliente "esto es lo que vas a recibir".

const DATA_URL_RE = /^data:image\/(png|webp|jpeg);base64,/;
const PREVIEW_MAX_BYTES = 8 * 1024 * 1024; // 8 MB base64 ≈ 6 MB binario
const PRODUCTION_MAX_BYTES = 20 * 1024 * 1024; // 20 MB base64 por slot
const MAX_TOTAL_PRODUCTION_BYTES = 120 * 1024 * 1024; // 120 MB total (20 slots × ~6 MB)

const DataUrlSchema = z
  .string()
  .max(PRODUCTION_MAX_BYTES)
  .regex(DATA_URL_RE, "Formato inválido (debe ser data:image/png|webp|jpeg)");

export const FinalizeDesignSchema = z
  .object({
    designId: z.string().min(1),
    /** Preview compositado del grid (1080×1080 PNG típico). */
    previewDataUrl: z.string().max(PREVIEW_MAX_BYTES).regex(DATA_URL_RE),
    /**
     * Uno por slot. Array de longitud === Design.slotCount. Cada elemento
     * es PNG 300 DPI del slot individual (para producción).
     */
    productionDataUrls: z.array(DataUrlSchema).min(1).max(50),
  })
  .refine(
    (data) =>
      data.productionDataUrls.reduce((sum, url) => sum + url.length, 0) <=
      MAX_TOTAL_PRODUCTION_BYTES,
    {
      message: `Tamaño total de producción excede ${MAX_TOTAL_PRODUCTION_BYTES / 1024 / 1024} MB`,
      path: ["productionDataUrls"],
    },
  );
export type FinalizeDesignInput = z.infer<typeof FinalizeDesignSchema>;

// ──────────────────────── Upload asset ────────────────────────

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

// Versión de la política de derechos de imagen aceptada al subir (Ley 1581 + plan de
// producción). Se persiste por asset junto con rightsAcceptedAt como evidencia. Subir
// la versión cuando cambie el texto de la declaración obliga a re-aceptar en futuras subidas.
export const IMAGE_RIGHTS_POLICY_VERSION = "2026-07";

export const UploadAssetMetadataSchema = z.object({
  designId: z.string().min(1).optional(),
  mimeType: z.enum(ALLOWED_MIME),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
  // Consentimiento OBLIGATORIO por-subida: el que sube declara tener derecho a usar la
  // imagen y autoriza su impresión (transfiere la responsabilidad + derecho a la propia
  // imagen, Ley 1581). Sin true, la subida se rechaza con VALIDATION.
  rightsAccepted: z.literal(true, {
    error: "Confirma que tienes derecho a usar la imagen que subes.",
  }),
});
export type UploadAssetMetadata = z.infer<typeof UploadAssetMetadataSchema>;

// ──────────────────────── Product personalization schema ────────────────────────
//
// Validar el shape de `Product.personalizationSchema` (JSON libre) al usarlo.
// El editor lo lee para configurar el grid de slots + indicadores de tamaño.

export const PhotoProductConfigSchema = z.object({
  photoSlots: z.number().int().min(1).max(50),
  aspectRatio: z.string().optional(),
  sizeCm: z.string().optional(),
  shape: z.enum(["rectangle", "circle", "heart", "custom"]).optional(),
  minQuantity: z.number().int().min(1).optional(),
  // M.3.b.B.1 — realismo del imán físico
  finish: z.enum(["matte", "glossy", "soft-touch"]).optional(),
  cornerRadiusPx: z.number().int().min(0).max(500).optional(),
  // Ola 2A — ids de marco de color ofrecidos en el Estudio (paleta frame-palette).
  frameOptions: z.array(z.string().max(24)).max(12).optional(),
  /**
   * Ola 3 (Lucy 2026-07-22) — ¿el producto admite TEXTO editable en el Estudio?
   * Default false: solo los productos que lo declaran (Polaroid) muestran/editan
   * capas de texto. Fotoimanes Cuadrados NO llevan texto (feedback Lucy: el texto
   * es de la Polaroid). El render de producción respeta el mismo flag (WYSIWYG).
   */
  allowText: z.boolean().optional(),
  /**
   * Ola 3 (Lucy 2026-07-22) — caras de diseño por unidad física. Separadores de
   * libros: la pieza real es una tira doblada con 2 caras (cara A / cara B, cada
   * una con su imagen). `2` → el Estudio crea 2 slots por unidad (slotCount=2N,
   * slots 2k=cara A y 2k+1=cara B) y producción compone la tira desplegada.
   * Default 1 (productos normales, 1 slot = 1 pieza).
   */
  facesPerUnit: z.number().int().min(1).max(2).optional(),
  /**
   * Ola 17 (Lucy 2026-07-24) — separadores ALARGADOS: la pieza es PLANA (marcapáginas
   * clásico, no se dobla sobre el borde de la página). `true` → la vista 3D de libro
   * la muestra ACOSTADA sobre la hoja en vez de doblada (BookView3D modo flat).
   * Las 2 caras se siguen personalizando (frente/reverso) y producción imprime ambas
   * espalda con espalda, igual que los separadores doblados. Default false/undefined.
   */
  noFold: z.boolean().optional(),
  /**
   * Cara B OPCIONAL (2026-09-22 — separadores magnéticos 2×6/4×4.2 y alargados):
   * el cliente puede dejar el reverso sin diseñar. `true` → finalize exige
   * snapshots solo para las caras A (slots pares, 2k) y permite B faltantes;
   * producción duplica la cara A en la B vacía. Solo tiene sentido con
   * facesPerUnit=2. Default false/undefined (las 2 caras son obligatorias).
   */
  backOptional: z.boolean().optional(),
});
export type PhotoProductConfig = z.infer<typeof PhotoProductConfigSchema>;

/**
 * Helper: parse personalizationSchema con default seguro (1 slot) si no
 * matchea el shape esperado. Usado por el editor para fallback graceful.
 */
export function parsePhotoProductConfig(raw: unknown): PhotoProductConfig {
  const parsed = PhotoProductConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { photoSlots: 1 };
}
