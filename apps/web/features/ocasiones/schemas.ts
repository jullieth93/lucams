import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * PLAN_CATALOG_V2 1.5 + 2.10 + 3.4 — Schema de OcasionTag.
 *
 * description es OBLIGATORIA porque alimenta al bot AI Fase 5+ con contexto
 * semántico para responder consultas. Sin description el bot no sabe explicar
 * la ocasión.
 */
export const OcasionCreateSchema = z.object({
  slug: z.string().min(2).max(60).regex(slugRegex, "Solo minúsculas, números y guiones"),
  name: z.string().min(2).max(80),
  description: z.string().min(20).max(2000),
  monthHint: z.number().int().min(1).max(12).optional().nullable(),
  suggestedQuantityRange: z
    .object({
      min: z.number().int().min(1).max(1000),
      ideal: z.number().int().min(1).max(1000),
      max: z.number().int().min(1).max(1000),
    })
    .optional()
    .nullable(),
  order: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
export type OcasionCreateInput = z.infer<typeof OcasionCreateSchema>;

export const OcasionUpdateSchema = OcasionCreateSchema.partial().extend({
  id: z.string().cuid(),
});
export type OcasionUpdateInput = z.infer<typeof OcasionUpdateSchema>;
