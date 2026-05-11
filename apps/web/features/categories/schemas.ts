import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CategoryCreateSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(slugRegex, "Solo minúsculas, números y guiones"),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  order: z.number().int().min(0).max(9999).default(0),
});

export type CategoryCreateInput = z.infer<typeof CategoryCreateSchema>;
