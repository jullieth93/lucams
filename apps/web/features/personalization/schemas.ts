/*
 * Zod schemas — Estudio de Personalización (M.3).
 *
 * Las shapes están alineadas con los modelos Prisma Design/DesignAsset
 * y el formato `canvasData` definido en seed-templates.mjs.
 *
 * `CanvasDataSchema` es deliberadamente laxo en `layers[].type` (passthrough)
 * porque el editor agregará tipos de capa nuevos a lo largo del tiempo
 * (sticker, decoration, mask, etc.) sin romper validación. Lo crítico es
 * que `stage` esté presente y `layers` sea array.
 */

import { z } from "zod";

// ──────────── Canvas data ────────────
//
// Shape mínimo. Layers son objetos arbitrarios; el editor cliente sabe
// renderearlos según su `type`. Server NO interpreta capas — solo persiste.

export const StageSchema = z.object({
  width: z.number().int().min(100).max(8000),
  height: z.number().int().min(100).max(8000),
  dpiPreview: z.number().int().min(72).max(300).default(90),
  dpiProduction: z.number().int().min(150).max(600).default(300),
});

export const CanvasLayerSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
  })
  .catchall(z.unknown());

export const CanvasDataSchema = z
  .object({
    version: z.number().int().min(1).default(1),
    stage: StageSchema,
    layers: z.array(CanvasLayerSchema).max(200),
  })
  .catchall(z.unknown()); // permite extras: grid, perMonth, etc.

export type CanvasData = z.infer<typeof CanvasDataSchema>;

// ──────────── Create draft ────────────

export const CreateDraftDesignSchema = z.object({
  productId: z.string().min(1),
  templateId: z.string().optional(),
});
export type CreateDraftDesignInput = z.infer<typeof CreateDraftDesignSchema>;

// ──────────── Save canvas (auto-save 2s debounce desde cliente) ────────────

export const SaveCanvasSchema = z.object({
  designId: z.string().min(1),
  canvasData: CanvasDataSchema,
});
export type SaveCanvasInput = z.infer<typeof SaveCanvasSchema>;

// ──────────── Finalize (snapshot READY) ────────────

// Las dataURL pueden ser muy grandes (~2-4MB en base64 a 1080×1080 PNG +
// 6-12MB a 6480×6480). Validamos el prefijo data:image/(png|webp) y limit
// de tamaño general (20MB base64 = ~15MB binario).
const DATA_URL_RE = /^data:image\/(png|webp|jpeg);base64,/;

export const FinalizeDesignSchema = z.object({
  designId: z.string().min(1),
  previewDataUrl: z
    .string()
    .max(8 * 1024 * 1024) // 8MB base64 ≈ 6MB binario para preview 1080×1080
    .regex(DATA_URL_RE, "Formato inválido (debe ser data:image/png|webp)"),
  productionDataUrl: z
    .string()
    .max(20 * 1024 * 1024) // 20MB base64 ≈ 15MB binario para 300 DPI render
    .regex(DATA_URL_RE),
});
export type FinalizeDesignInput = z.infer<typeof FinalizeDesignSchema>;

// ──────────── Upload asset ────────────

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

export const UploadAssetMetadataSchema = z.object({
  designId: z.string().min(1).optional(), // null si el cliente sube antes de crear el draft
  mimeType: z.enum(ALLOWED_MIME),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024), // 10 MB max
});
export type UploadAssetMetadata = z.infer<typeof UploadAssetMetadataSchema>;
