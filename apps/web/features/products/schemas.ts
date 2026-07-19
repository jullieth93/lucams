/*
 * Schemas Zod para CRUD de productos en admin.
 *
 * Patrón documentado en docs/CONVENTIONS.md § capa de servicio:
 * schemas.ts vive aparte de service.ts y actions.ts. Server actions
 * importan estos schemas para validar input antes de pasarlo al service.
 *
 * Reglas:
 *  - Precios en CENTAVOS COP (Int), nunca floats — mandato CLAUDE.md.
 *  - Slug en kebab-case (validación regex).
 *  - SKU alphanumeric + guiones, único en DB.
 *  - description min 10 chars (evita placeholders).
 */

import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const skuRegex = /^[A-Z0-9-]+$/;

export const ProductCreateSchema = z.object({
  name: z.string().min(2, "Nombre muy corto (mín 2 chars)").max(120, "Máximo 120 chars"),
  slug: z
    .string()
    .min(2, "Slug muy corto")
    .max(80, "Máximo 80 chars")
    .regex(slugRegex, "Solo minúsculas, números y guiones (ej. iman-foto-personalizado)"),
  description: z
    .string()
    .min(10, "Descripción muy corta (mín 10 chars)")
    .max(5000, "Máximo 5000 chars"),
  basePrice: z
    .number({ message: "Precio inválido" })
    .int("Debe ser un entero (centavos COP)")
    .nonnegative("No puede ser negativo")
    .max(100_000_000, "Demasiado alto"),
  compareAtPrice: z.number().int().nonnegative().max(100_000_000).optional().nullable(),
  cost: z.number().int().nonnegative().max(100_000_000).optional().nullable(),
  sku: z
    .string()
    .min(2)
    .max(40)
    .regex(skuRegex, "Solo mayúsculas, números y guiones (ej. IMAN-FOTO-A4)"),
  categoryId: z.string().cuid("Categoría inválida"),
  isPersonalizable: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  seoTitle: z.string().max(70).optional().nullable(),
  seoDescription: z.string().max(160).optional().nullable(),
  // PLAN_CATALOG_V2 2.10 — campos AI-ready opcionales
  richDescription: z.string().max(5000).optional().nullable(),
  whyChooseThis: z.string().max(2000).optional().nullable(),
  idealFor: z.array(z.string().max(120)).max(20).optional(),
  // PLAN_CATALOG_V2 4.2 — garantía + tiempos. Piso legal 12 meses: la garantía legal (Ley 1480
  // art. 7-8) es de mínimo 1 año e irrenunciable → el admin no puede anunciar menos.
  warrantyMonths: z.number().int().min(12).max(120).optional(),
  productionDays: z.number().int().min(1).max(60).optional(),
  shippingDaysMin: z.number().int().min(0).max(30).optional(),
  shippingDaysMax: z.number().int().min(0).max(60).optional(),
  // PLAN_CATALOG_V2 3.3 — min/max cantidad
  minimumQuantity: z.number().int().min(1).max(10_000).optional(),
  maximumQuantity: z.number().int().min(1).max(10_000).optional().nullable(),
  // PLAN_CATALOG_V2 5.5 — surcharge para templates PREMADE
  premadeSurcharge: z.number().int().min(0).max(100).optional(),
  // PR C (Lucy 2026-05-21) — Envío: peso + dims del paquete final.
  // Opcionales individualmente; el checkout valida que estén COMPLETOS
  // (los 4) antes de cotizar Aveonline.
  weightGrams: z.number().int().min(50).max(50_000).optional().nullable(),
  widthCm: z.number().int().min(1).max(100).optional().nullable(),
  heightCm: z.number().int().min(1).max(100).optional().nullable(),
  depthCm: z.number().int().min(1).max(100).optional().nullable(),
});

export type ProductCreateInput = z.infer<typeof ProductCreateSchema>;

export const ProductUpdateSchema = ProductCreateSchema.partial().extend({
  id: z.string().cuid(),
});

export type ProductUpdateInput = z.infer<typeof ProductUpdateSchema>;
