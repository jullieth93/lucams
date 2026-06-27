import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CategoryCreateSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).regex(slugRegex, "Solo minúsculas, números y guiones"),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  // D2 (Lucy 2026-06-27): sub-categorías. parentId = categoría madre (1 nivel).
  parentId: z.string().cuid().nullable().optional(),
  // D3: el `order` ya NO lo escribe Lucy — se auto-asigna y se reordena con
  // flechas ↑/↓. Queda opcional por compatibilidad (seed / migraciones).
  order: z.number().int().min(0).max(9999).optional(),
});

export type CategoryCreateInput = z.infer<typeof CategoryCreateSchema>;
