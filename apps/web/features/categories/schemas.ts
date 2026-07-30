import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Roadmap B3 — visual de catálogo (dato de Category, NO CMS):
//   - icon: nombre lucide en PascalCase ("PartyPopper"). Se resuelve contra el
//     subset curado CATEGORY_ICONS (lib/category-visuals.ts); un nombre fuera
//     del subset no rompe — el storefront cae al fallback.
//   - gradient: clases tailwind separadas por espacio ("from-x/20 via-y to-z/15").
// Ambos regex sin comillas ni `<>` → imposible inyectar HTML/JS en el render.
const iconRegex = /^[A-Z][A-Za-z0-9]{0,49}$/;
const gradientRegex = /^[A-Za-z0-9][A-Za-z0-9\-/%.[\](),#:]*( [A-Za-z0-9\-/%.[\](),#:]+)*$/;

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
  icon: z
    .string()
    .regex(iconRegex, "Nombre de icono lucide en PascalCase (ej. PartyPopper)")
    .nullable()
    .optional(),
  gradient: z
    .string()
    .max(200)
    .regex(
      gradientRegex,
      "Clases de gradiente tailwind (ej. from-brand-pink/30 to-brand-purple/15)",
    )
    .nullable()
    .optional(),
});

export type CategoryCreateInput = z.infer<typeof CategoryCreateSchema>;
