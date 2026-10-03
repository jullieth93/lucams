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

// B-6 (auditoría cableado 2026-10-02) — opciones de `defaultSort` que el PLP
// soporta DE VERDAD: listCatalogProducts (lib/catalog.ts) implementa orderBy
// solo para estos 4 valores ("recent" = createdAt desc, el default actual del
// PLP en /productos/[categoria]/[subcategoria] y en el modelo Prisma).
// El comentario del schema Prisma menciona también "most_purchased", pero ese
// valor NO tiene orderBy en lib/catalog.ts (cae silenciosamente al default) →
// no se ofrece en el admin hasta que el storefront lo implemente.
export const CATEGORY_SORT_OPTIONS = ["recent", "price_asc", "price_desc", "featured"] as const;
export type CategorySortOption = (typeof CATEGORY_SORT_OPTIONS)[number];

// Campos del modelo Category SIN consumidor real (B-6, 2026-10-02):
// `visibleFilters` y `featuredProductSlug` solo viajan en el payload del API
// (`lib/catalog.ts`) y aparecen en fixtures de tests — ningún render del
// storefront ni del bot los usa. Decisión registrada en
// docs/audits/cableado-cliente-admin-20261002.md (B-6): NO se exponen en el
// admin; se implementan cuando tengan consumidor o se retiran del payload.

export const CategoryCreateSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).regex(slugRegex, "Solo minúsculas, números y guiones"),
  description: z.string().max(500).optional().nullable(),
  // B-6 — texto largo SEO/bot: se renderiza en /productos/[cat]/[subcat]
  // (whitespace-pre-line, no HTML) y en la metadata de la página.
  richDescription: z.string().max(5000).optional().nullable(),
  // B-6 — casos de uso (2-3 frases, cursiva bajo el título de la sub-categoría).
  useCase: z.string().max(1000).optional().nullable(),
  // B-6 — orden default del grid de la sub-categoría (ver CATEGORY_SORT_OPTIONS).
  defaultSort: z.enum(CATEGORY_SORT_OPTIONS).nullable().optional(),
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
