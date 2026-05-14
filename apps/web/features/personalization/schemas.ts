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
const ASSET_SRC_RE = /^\/templates\/[a-z0-9-]+\.(svg|png|jpg|jpeg|webp)$/;

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
});

export const GridLayoutSchema = z.object({
  cols: z.number().int().min(1).max(20),
  rows: z.number().int().min(1).max(20),
  gap: z.number().int().min(0).max(64),
});

export const CanvasDataV2Schema = z.object({
  version: z.literal(2),
  unitTemplate: CanvasDataV1Schema,
  slotCount: z.number().int().min(1).max(50), // soporte hasta 50 slots (calendarios + extreme cases)
  slots: z.array(SlotStateSchema).max(50),
  gridLayout: GridLayoutSchema,
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

export const UploadAssetMetadataSchema = z.object({
  designId: z.string().min(1).optional(),
  mimeType: z.enum(ALLOWED_MIME),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
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
