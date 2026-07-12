/*
 * Schemas Zod para acciones de carrito.
 *
 * Patrón documentado en docs/CONVENTIONS.md § capa de servicio:
 * schemas.ts vive aparte de service.ts y actions.ts. Server actions
 * validan input antes de pasarlo al service.
 */

import { z } from "zod";

// slug: kebab-case alfanumérico — debe matchear el formato de
// features/products/schemas.ts ProductCreateSchema.slug.
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const AddToCartSchema = z.object({
  slug: z
    .string()
    .min(2, "Slug inválido")
    .max(80, "Slug muy largo")
    .regex(slugRegex, "Slug con formato inválido"),
  qty: z
    .number({ message: "Cantidad inválida" })
    .int("Cantidad debe ser entero")
    .min(1, "Mínimo 1")
    .max(99, "Máximo 99 por agregada"),
  returnTo: z
    .string()
    .max(500)
    .regex(/^\/[a-zA-Z0-9/_-]*$/, "Path inválido")
    .optional(),
  /** Variante elegida en el selector de la ficha (ADR-057). Opcional (legacy usa -DEFAULT). */
  variantId: z.string().min(1).max(40).optional(),
});

export type AddToCartInput = z.infer<typeof AddToCartSchema>;

export const UpdateQtySchema = z.object({
  itemId: z.string().cuid("ID de ítem inválido"),
  qty: z.number().int().min(0).max(99),
});

export type UpdateQtyInput = z.infer<typeof UpdateQtySchema>;

export const RemoveItemSchema = z.object({
  itemId: z.string().cuid("ID de ítem inválido"),
});

export type RemoveItemInput = z.infer<typeof RemoveItemSchema>;
