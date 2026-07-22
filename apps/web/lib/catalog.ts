/*
 * Helpers AI-ready del catálogo — PLAN_CATALOG_V2 ADR-038.
 *
 * Centraliza queries Prisma del catálogo para consumo de:
 *   - UI storefront (`/productos`, PDP, mega-menú, filtros sidebar, wizard)
 *   - API pública `/api/catalog/*` (consumida por bot WhatsApp Fase 5+)
 *
 * Principio AI-ready (decisión 2.11): DB es fuente de verdad, LLM consume API
 * estructurada y nunca inventa.
 *
 * Cache: `unstable_cache` con tag "catalog" → invalidación cuando admin
 * actualiza productos/categorías/ocasiones via `updateTag("catalog")`.
 *
 * try/catch silencioso devuelve [] o null si DB unreachable (build con placeholder).
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

const CATALOG_TAG = "catalog";
const CATALOG_TTL = 3600; // 1h

// ─────────────────── Types públicos (lo que recibe el bot/UI) ───────────────────

export type CategoryNode = {
  slug: string;
  name: string;
  description: string | null;
  richDescription: string | null;
  useCase: string | null;
  image: string | null;
  order: number;
  isActive: boolean;
  defaultSort: string | null;
  visibleFilters: string[];
  featuredProductSlug: string | null;
  productCount: number;
  /** #23 — slug del padre (null si es raíz). Se popula en getCategoryBySlug; opcional para no
   *  obligar a getCategoryTree a rellenarlo. */
  parentSlug?: string | null;
  children: CategoryNode[];
};

export type CatalogProductSummary = {
  slug: string;
  name: string;
  description: string;
  basePrice: number;
  compareAtPrice: number | null;
  images: string[];
  categorySlug: string;
  categoryName: string;
  parentCategorySlug: string | null;
  parentCategoryName: string | null;
  isPersonalizable: boolean;
  personalizationKind: string;
  isFeatured: boolean;
  warrantyMonths: number;
  productionDays: number;
  shippingDaysMin: number;
  shippingDaysMax: number;
  minimumQuantity: number;
  maximumQuantity: number | null;
  premadeSurcharge: number;
  variantCount: number;
  /** #5 — hay al menos una variante activa con stock > 0 (para el badge "Agotado" en las cards). */
  inStock: boolean;
  minPrice: number;
  maxPrice: number;
  ocasionSlugs: string[];
};

export type CatalogProductDetail = CatalogProductSummary & {
  richDescription: string | null;
  whyChooseThis: string | null;
  idealFor: unknown[];
  physicalSpecs: Record<string, unknown> | null;
  seoTitle: string | null;
  seoDescription: string | null;
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    description: string | null;
    price: number | null;
    attributes: Record<string, unknown>;
    isActive: boolean;
  }>;
  templates: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    mode: string;
    kind: string;
    previewUrl: string;
    order: number;
  }>;
  ocasiones: Array<{
    slug: string;
    name: string;
    rationale: string | null;
  }>;
};

export type OcasionData = {
  slug: string;
  name: string;
  description: string;
  monthHint: number | null;
  suggestedQuantityRange: { min: number; ideal: number; max: number } | null;
  productCount: number;
};

export type CatalogFilterContext = {
  context: {
    categorySlug: string | null;
    subCategorySlug: string | null;
    totalProducts: number;
  };
  filters: {
    categories?: Array<{ slug: string; name: string; count: number }>;
    subCategories?: Array<{ slug: string; name: string; count: number }>;
    ocasiones?: Array<{ slug: string; name: string; count: number }>;
    priceRange?: { min: number; max: number };
    personalization?: Array<{ key: string; label: string; count: number }>;
    shapes?: Array<{ key: string; label: string; count: number }>;
  };
};

// ─────────────────── Categorías (árbol jerárquico) ───────────────────

export const getCategoryTree = unstable_cache(
  async (): Promise<CategoryNode[]> => {
    try {
      const all = await prisma.category.findMany({
        where: { deletedAt: null },
        // Desempate por nombre: si dos categorías tienen el mismo `order` (caso
        // común: todas en 0), Postgres devolvía orden indeterminado en el menú
        // del cliente. Bug reportado por Lucy 2026-06-27.
        orderBy: [{ order: "asc" }, { name: "asc" }],
        include: {
          _count: { select: { products: { where: { isActive: true, deletedAt: null } } } },
        },
      });

      const map = new Map<string, CategoryNode>();
      const roots: CategoryNode[] = [];

      for (const cat of all) {
        map.set(cat.id, {
          slug: cat.slug,
          name: cat.name,
          description: cat.description,
          richDescription: cat.richDescription,
          useCase: cat.useCase,
          image: cat.image,
          order: cat.order,
          isActive: cat.isActive,
          defaultSort: cat.defaultSort,
          visibleFilters: cat.visibleFilters,
          featuredProductSlug: cat.featuredProductSlug,
          productCount: cat._count.products,
          children: [],
        });
      }

      for (const cat of all) {
        const node = map.get(cat.id)!;
        if (cat.parentId) {
          const parent = map.get(cat.parentId);
          if (parent) parent.children.push(node);
        } else {
          roots.push(node);
        }
      }

      // Categorías vacías (Lucy 2026-07-22): se podan del árbol público las
      // categorías sin productos comprables (isActive + no borrados), para que el
      // mega-menú nunca enlace a una categoría vacía ("Animales/Frutas" y basura
      // futura). Regla (árbol de 1 nivel): una hija con 0 productos directos sale;
      // una raíz con 0 directos Y sin hijas con productos también sale.
      // El productCount de la raíz pasa a ser EFECTIVO (directos + hijas visibles):
      // el mega-menú muestra "N productos" y el filtro /productos?categoria=raíz
      // incluye las hijas → el número coincide con lo que el cliente verá.
      for (const node of map.values()) {
        node.children = node.children.filter((child) => child.productCount > 0);
      }
      const visibleRoots: CategoryNode[] = [];
      for (const root of roots) {
        const childrenCount = root.children.reduce((acc, c) => acc + c.productCount, 0);
        if (root.productCount + childrenCount === 0) continue;
        root.productCount += childrenCount;
        visibleRoots.push(root);
      }
      return visibleRoots;
    } catch {
      return [];
    }
  },
  ["catalog-categories"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

export const getCategoryBySlug = unstable_cache(
  async (slug: string): Promise<CategoryNode | null> => {
    try {
      const cat = await prisma.category.findUnique({
        where: { slug },
        include: {
          parent: { select: { slug: true } }, // #23 — para validar la ruta padre/hijo
          children: {
            where: { deletedAt: null, isActive: true },
            orderBy: [{ order: "asc" }, { name: "asc" }],
            include: {
              _count: {
                select: { products: { where: { isActive: true, deletedAt: null } } },
              },
            },
          },
          _count: {
            select: { products: { where: { isActive: true, deletedAt: null } } },
          },
        },
      });
      if (!cat || cat.deletedAt) return null;
      return {
        slug: cat.slug,
        name: cat.name,
        description: cat.description,
        richDescription: cat.richDescription,
        useCase: cat.useCase,
        image: cat.image,
        order: cat.order,
        isActive: cat.isActive,
        defaultSort: cat.defaultSort,
        visibleFilters: cat.visibleFilters,
        featuredProductSlug: cat.featuredProductSlug,
        productCount: cat._count.products,
        parentSlug: cat.parent?.slug ?? null,
        children: cat.children.map((c) => ({
          slug: c.slug,
          name: c.name,
          description: c.description,
          richDescription: c.richDescription,
          useCase: c.useCase,
          image: c.image,
          order: c.order,
          isActive: c.isActive,
          defaultSort: c.defaultSort,
          visibleFilters: c.visibleFilters,
          featuredProductSlug: c.featuredProductSlug,
          productCount: c._count.products,
          children: [],
        })),
      };
    } catch {
      return null;
    }
  },
  ["catalog-category-by-slug"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

// ─────────────────── Listado de productos con filtros ───────────────────

export type ProductListFilters = {
  categorySlug?: string;
  subCategorySlug?: string;
  ocasionSlug?: string;
  priceMin?: number;
  priceMax?: number;
  isPersonalizable?: boolean;
  sort?: "recent" | "price_asc" | "price_desc" | "featured" | "most_purchased";
  limit?: number;
  offset?: number;
};

function summarizeProduct(p: ProductWithIncludes): CatalogProductSummary {
  const variantPrices = p.variants
    .filter((v) => v.isActive && !v.deletedAt && v.price !== null)
    .map((v) => v.price as number);
  const allPrices = variantPrices.length > 0 ? variantPrices : [p.basePrice];
  return {
    slug: p.slug,
    name: p.name,
    description: p.description,
    basePrice: p.basePrice,
    compareAtPrice: p.compareAtPrice,
    images: p.images,
    categorySlug: p.category.slug,
    categoryName: p.category.name,
    parentCategorySlug: p.category.parent?.slug ?? null,
    parentCategoryName: p.category.parent?.name ?? null,
    isPersonalizable: p.isPersonalizable,
    personalizationKind: p.personalizationKind,
    isFeatured: p.isFeatured,
    warrantyMonths: p.warrantyMonths,
    productionDays: p.productionDays,
    shippingDaysMin: p.shippingDaysMin,
    shippingDaysMax: p.shippingDaysMax,
    minimumQuantity: p.minimumQuantity,
    maximumQuantity: p.maximumQuantity,
    premadeSurcharge: p.premadeSurcharge,
    variantCount: p.variants.filter((v) => v.isActive && !v.deletedAt).length,
    inStock: p.variants.some((v) => v.isActive && !v.deletedAt && v.stock > 0), // #5
    minPrice: Math.min(...allPrices),
    maxPrice: Math.max(...allPrices),
    ocasionSlugs: p.ocasionTags.map((t) => t.ocasionTag.slug),
  };
}

type ProductWithIncludes = Awaited<ReturnType<typeof prisma.product.findFirst>> & {
  category: { slug: string; name: string; parent: { slug: string; name: string } | null };
  variants: Array<{
    price: number | null;
    stock: number;
    isActive: boolean;
    deletedAt: Date | null;
  }>;
  ocasionTags: Array<{ ocasionTag: { slug: string } }>;
};

export const listCatalogProducts = unstable_cache(
  async (filters: ProductListFilters): Promise<CatalogProductSummary[]> => {
    try {
      const where: Record<string, unknown> = {
        isActive: true,
        deletedAt: null,
      };

      // Filtro por categoría/sub-categoría
      if (filters.subCategorySlug) {
        where.category = { slug: filters.subCategorySlug };
      } else if (filters.categorySlug) {
        // Match en categoría padre O cualquier sub-categoría hija
        where.OR = [
          { category: { slug: filters.categorySlug } },
          { category: { parent: { slug: filters.categorySlug } } },
        ];
      }

      // Filtro personalización
      if (filters.isPersonalizable === true) {
        where.personalizationKind = { not: "NONE" };
      } else if (filters.isPersonalizable === false) {
        where.personalizationKind = "NONE";
      }

      // Filtro ocasión
      if (filters.ocasionSlug) {
        where.ocasionTags = {
          some: { ocasionTag: { slug: filters.ocasionSlug } },
        };
      }

      // Sort
      let orderBy: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">> = {
        createdAt: "desc",
      };
      if (filters.sort === "price_asc") orderBy = { basePrice: "asc" };
      else if (filters.sort === "price_desc") orderBy = { basePrice: "desc" };
      else if (filters.sort === "featured")
        orderBy = [{ isFeatured: "desc" }, { createdAt: "desc" }];

      const products = await prisma.product.findMany({
        where,
        orderBy,
        take: filters.limit ?? 24,
        skip: filters.offset ?? 0,
        include: {
          category: { include: { parent: true } },
          variants: { select: { price: true, stock: true, isActive: true, deletedAt: true } },
          ocasionTags: { include: { ocasionTag: { select: { slug: true } } } },
        },
      });

      let summaries = products.map((p) => summarizeProduct(p as ProductWithIncludes));

      // Price filter post-fetch (Prisma no soporta filter sobre min de relación cleanly)
      if (filters.priceMin !== undefined) {
        summaries = summaries.filter((s) => s.minPrice >= (filters.priceMin as number));
      }
      if (filters.priceMax !== undefined) {
        summaries = summaries.filter((s) => s.minPrice <= (filters.priceMax as number));
      }

      return summaries;
    } catch {
      return [];
    }
  },
  ["catalog-list-products"],
  { tags: [CATALOG_TAG], revalidate: 300 }, // 5 min para listas (más fresco que detalle)
);

// ─────────────────── Detalle de producto ───────────────────

export const getCatalogProductDetail = unstable_cache(
  async (slug: string): Promise<CatalogProductDetail | null> => {
    try {
      const product = await prisma.product.findFirst({
        where: { slug, isActive: true, deletedAt: null },
        include: {
          category: { include: { parent: true } },
          variants: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              sku: true,
              name: true,
              description: true,
              price: true,
              stock: true, // #5 — para inStock consistente en summarizeProduct
              attributes: true,
              isActive: true,
            },
          },
          templates: {
            where: { isActive: true, deletedAt: null },
            orderBy: { order: "asc" },
            select: {
              id: true,
              slug: true,
              name: true,
              description: true,
              mode: true,
              kind: true,
              previewUrl: true,
              order: true,
            },
          },
          ocasionTags: {
            include: {
              ocasionTag: { select: { slug: true, name: true } },
            },
          },
        },
      });
      if (!product) return null;

      const summary = summarizeProduct(product as unknown as ProductWithIncludes);
      return {
        ...summary,
        richDescription: product.richDescription,
        whyChooseThis: product.whyChooseThis,
        idealFor: Array.isArray(product.idealFor) ? product.idealFor : [],
        physicalSpecs: (product.physicalSpecs as Record<string, unknown> | null) ?? null,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        variants: product.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          name: v.name,
          description: v.description,
          price: v.price,
          attributes: (v.attributes as Record<string, unknown>) ?? {},
          isActive: v.isActive,
        })),
        templates: product.templates.map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          description: t.description,
          mode: t.mode,
          kind: t.kind,
          previewUrl: t.previewUrl,
          order: t.order,
        })),
        ocasiones: product.ocasionTags.map((t) => ({
          slug: t.ocasionTag.slug,
          name: t.ocasionTag.name,
          rationale: t.rationale,
        })),
      };
    } catch {
      return null;
    }
  },
  ["catalog-product-detail"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

// ─────────────────── Ocasiones ───────────────────

export const listOcasiones = unstable_cache(
  async (): Promise<OcasionData[]> => {
    try {
      const ocasiones = await prisma.ocasionTag.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { order: "asc" },
        include: {
          // #6 — contar solo productos ACTIVOS no borrados (vía el pivot product), igual que el grid
          // y que los conteos de categoría; antes contaba todo el pivot y descuadraba con el grid.
          _count: {
            select: { products: { where: { product: { isActive: true, deletedAt: null } } } },
          },
        },
      });
      return ocasiones.map((o) => ({
        slug: o.slug,
        name: o.name,
        description: o.description,
        monthHint: o.monthHint,
        suggestedQuantityRange:
          (o.suggestedQuantityRange as { min: number; ideal: number; max: number } | null) ?? null,
        productCount: o._count.products,
      }));
    } catch {
      return [];
    }
  },
  ["catalog-ocasiones"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

export const getOcasionBySlug = unstable_cache(
  async (slug: string): Promise<OcasionData | null> => {
    try {
      const o = await prisma.ocasionTag.findUnique({
        where: { slug },
        // #6 — ver listOcasiones: contar solo productos activos no borrados vía el pivot.
        include: {
          _count: {
            select: { products: { where: { product: { isActive: true, deletedAt: null } } } },
          },
        },
      });
      if (!o || o.deletedAt || !o.isActive) return null;
      return {
        slug: o.slug,
        name: o.name,
        description: o.description,
        monthHint: o.monthHint,
        suggestedQuantityRange:
          (o.suggestedQuantityRange as { min: number; ideal: number; max: number } | null) ?? null,
        productCount: o._count.products,
      };
    } catch {
      return null;
    }
  },
  ["catalog-ocasion-by-slug"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

// ─────────────────── Recomendaciones (wizard + bot + cross-sell) ───────────────────

export type RecommendInput = {
  ocasionSlugs?: string[]; // multi-select de ocasiones
  destinatario?: string; // "mi" | "pareja" | "familia" | "amigo" | "empresa" | "nino" | "adolescente"
  priceMin?: number;
  priceMax?: number;
  personalizationPreference?: "personalizable" | "premade" | "any";
  excludeSlugs?: string[]; // productos ya en cart o el actual en PDP
  limit?: number;
};

export type RecommendationResult = CatalogProductSummary & {
  score: number;
  reasons: string[];
};

// #2 — normaliza a minúsculas sin tildes (mismo patrón que lib/format.ts:formatCityDept).
// Estándar ECMAScript/Unicode (String.prototype.normalize("NFD") + strip de combining marks).
const stripAccents = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// #2 — vocabulario controlado: value del destinatario (wizard) → tokens (sin acentos) que
// aparecen en Product.idealFor (ver packages/db/scripts/seed-catalog-v2.mjs). Mantener alineado
// con DESTINATARIOS del wizard y con el idealFor que Lucy captura en el admin.
const DESTINATARIO_KEYWORDS: Record<string, string[]> = {
  mi: ["personal", "coleccionable"],
  pareja: ["pareja", "romantico", "aniversario"],
  familia: ["familiar", "familia", "hogar"],
  amigo: ["amigo", "amistad"],
  empresa: ["empresarial", "corporativo", "empresa", "negocio"],
  nino: ["nino", "infantil", "bebe"],
  adolescente: ["adolescente", "joven"],
};

// #2 — etiqueta legible es-CO (tuteo) para la razón visible; nunca el value crudo ("mi" → "ti").
const DESTINATARIO_LABELS: Record<string, string> = {
  mi: "ti",
  pareja: "tu pareja",
  familia: "la familia",
  amigo: "un amigo/a",
  empresa: "tus clientes",
  nino: "un niño/a",
  adolescente: "un/a adolescente",
};

/**
 * Scoring sin ML (PLAN_CATALOG_V2 decisión 6.2):
 *   +3 por match de ocasión
 *   +2 por match destinatario en idealFor
 *   +1 por match rango precio
 *   +1 por match preferencia personalización
 *   +0.5 boost si isFeatured
 *   cutoff: score > 2
 */
export async function recommendProducts(input: RecommendInput): Promise<RecommendationResult[]> {
  try {
    const where: Record<string, unknown> = {
      isActive: true,
      deletedAt: null,
    };

    // Personalización
    if (input.personalizationPreference === "personalizable") {
      where.personalizationKind = { not: "NONE" };
    } else if (input.personalizationPreference === "premade") {
      where.personalizationKind = "NONE";
    }

    // Filtro ocasión (al menos una match)
    if (input.ocasionSlugs && input.ocasionSlugs.length > 0) {
      where.ocasionTags = {
        some: { ocasionTag: { slug: { in: input.ocasionSlugs } } },
      };
    }

    // Excluir
    if (input.excludeSlugs && input.excludeSlugs.length > 0) {
      where.slug = { notIn: input.excludeSlugs };
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: { include: { parent: true } },
        variants: { select: { price: true, stock: true, isActive: true, deletedAt: true } },
        ocasionTags: {
          include: { ocasionTag: { select: { slug: true, name: true } } },
        },
      },
      // #11 — pool determinista: cuando el catálogo supere 50 productos que cumplan el where,
      // tomamos "destacados primero, luego más recientes" en vez de un slice arbitrario de
      // Postgres. Respaldado por @@index([isActive, isFeatured]). Los empates de score luego
      // conservan este orden (sort estable, ES2019).
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      take: 50, // pool inicial, después filtramos por score
    });

    const scored: RecommendationResult[] = [];
    for (const p of products) {
      const summary = summarizeProduct(p as ProductWithIncludes);
      let score = 0;
      const reasons: string[] = [];

      // +3 por cada match de ocasión
      if (input.ocasionSlugs) {
        const matches = p.ocasionTags.filter((t) =>
          input.ocasionSlugs?.includes(t.ocasionTag.slug),
        );
        if (matches.length > 0) {
          score += matches.length * 3;
          reasons.push(`Ocasión: ${matches.map((m) => m.ocasionTag.name).join(", ")}`);
        }
      }

      // +2 por match destinatario en idealFor — token exacto sobre vocabulario controlado
      // (no substring). Antes `includes("mi")` daba falso positivo en "faMIliar" y la razón
      // mostraba el enum crudo sin tilde ("Ideal para mi"). Ahora tokeniza idealFor sin acentos
      // y compara contra DESTINATARIO_KEYWORDS; la razón usa la etiqueta legible en tuteo.
      if (input.destinatario && Array.isArray(p.idealFor)) {
        const keywords = DESTINATARIO_KEYWORDS[input.destinatario] ?? [];
        if (keywords.length > 0) {
          const tokens = new Set(
            (p.idealFor as string[]).flatMap((s) =>
              stripAccents(s)
                .split(/[^a-z0-9]+/)
                .filter(Boolean),
            ),
          );
          if (keywords.some((k) => tokens.has(stripAccents(k)))) {
            score += 2;
            reasons.push(
              `Ideal para ${DESTINATARIO_LABELS[input.destinatario] ?? input.destinatario}`,
            );
          }
        }
      }

      // #1 — presupuesto = filtro DURO (respeta el paso 3 del wizard, respuesta explícita del
      // cliente). Overlap sobre el rango COMPLETO de variantes: el producto cabe si alguna
      // variante entra en [priceMin, priceMax]. Antes solo miraba minPrice y era un +1 blando:
      // dejaba fuera productos con variantes económicas del bucket "Más de $200k" y colaba
      // productos sobre presupuesto vía el +3 de ocasión. El `continue` descarta antes del cutoff.
      if (input.priceMin !== undefined || input.priceMax !== undefined) {
        const min = input.priceMin ?? 0;
        const max = input.priceMax ?? Number.MAX_SAFE_INTEGER;
        const overlaps = summary.minPrice <= max && summary.maxPrice >= min;
        if (!overlaps) continue; // fuera de presupuesto → no se recomienda
        score += 1;
        reasons.push("Dentro de tu presupuesto");
      }

      // +1 por match preferencia
      if (input.personalizationPreference && input.personalizationPreference !== "any") {
        score += 1;
        if (input.personalizationPreference === "personalizable") {
          reasons.push("Personalizable");
        } else {
          reasons.push("Diseño listo");
        }
      }

      // +0.5 por featured
      if (p.isFeatured) {
        score += 0.5;
      }

      if (score > 2) {
        scored.push({ ...summary, score, reasons });
      }
    }

    // #5 — comprables primero (nunca un agotado como "Tu match" #1), luego score desc.
    // #11 — empates de score → orden del pool preservado (isFeatured desc, createdAt desc) por
    // el sort estable (ES2019). Los agotados siguen VISIBLES con su badge, solo despriorizados.
    scored.sort((a, b) => Number(b.inStock) - Number(a.inStock) || b.score - a.score);

    return scored.slice(0, input.limit ?? 12);
  } catch {
    return [];
  }
}

// ─────────────────── Filtros disponibles según contexto ───────────────────

export const getCatalogFilters = unstable_cache(
  async (categorySlug?: string, subCategorySlug?: string): Promise<CatalogFilterContext> => {
    try {
      const where: Record<string, unknown> = {
        isActive: true,
        deletedAt: null,
      };
      if (subCategorySlug) {
        where.category = { slug: subCategorySlug };
      } else if (categorySlug) {
        where.OR = [
          { category: { slug: categorySlug } },
          { category: { parent: { slug: categorySlug } } },
        ];
      }

      const products = await prisma.product.findMany({
        where,
        include: {
          category: { include: { parent: true } },
          variants: { select: { price: true, stock: true, isActive: true, deletedAt: true } },
          ocasionTags: {
            include: { ocasionTag: { select: { slug: true, name: true } } },
          },
        },
      });

      // Facet count: sub-cats
      const subCatMap = new Map<string, { slug: string; name: string; count: number }>();
      for (const p of products) {
        if (p.category.parent) {
          const key = p.category.slug;
          if (!subCatMap.has(key)) {
            subCatMap.set(key, { slug: p.category.slug, name: p.category.name, count: 0 });
          }
          subCatMap.get(key)!.count++;
        }
      }

      // Facet count: ocasiones
      const ocasionMap = new Map<string, { slug: string; name: string; count: number }>();
      for (const p of products) {
        for (const t of p.ocasionTags) {
          const key = t.ocasionTag.slug;
          if (!ocasionMap.has(key)) {
            ocasionMap.set(key, {
              slug: t.ocasionTag.slug,
              name: t.ocasionTag.name,
              count: 0,
            });
          }
          ocasionMap.get(key)!.count++;
        }
      }

      // Rango de precios
      const allPrices: number[] = [];
      for (const p of products) {
        const variantPrices = p.variants
          .filter((v) => v.isActive && !v.deletedAt && v.price !== null)
          .map((v) => v.price as number);
        if (variantPrices.length > 0) {
          allPrices.push(...variantPrices);
        } else {
          allPrices.push(p.basePrice);
        }
      }
      const priceRange =
        allPrices.length > 0
          ? { min: Math.min(...allPrices), max: Math.max(...allPrices) }
          : { min: 0, max: 0 };

      // Personalización facet
      const personalizableCount = products.filter((p) => p.personalizationKind !== "NONE").length;
      const premadeCount = products.length - personalizableCount;

      return {
        context: {
          categorySlug: categorySlug ?? null,
          subCategorySlug: subCategorySlug ?? null,
          totalProducts: products.length,
        },
        filters: {
          subCategories: Array.from(subCatMap.values()).sort((a, b) => b.count - a.count),
          ocasiones: Array.from(ocasionMap.values()).sort((a, b) => b.count - a.count),
          priceRange,
          personalization: [
            { key: "personalizable", label: "Personalizable", count: personalizableCount },
            { key: "premade", label: "Diseño listo", count: premadeCount },
          ],
        },
      };
    } catch {
      return {
        context: {
          categorySlug: categorySlug ?? null,
          subCategorySlug: subCategorySlug ?? null,
          totalProducts: 0,
        },
        filters: {},
      };
    }
  },
  ["catalog-filters"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

// ─────────────────── Búsqueda fuzzy (pg_trgm) ───────────────────

export type CatalogSearchResult = CatalogProductSummary & { rank: number };

export async function searchCatalog(query: string, limit = 20): Promise<CatalogSearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const q = query.trim().toLowerCase();
    // pg_trgm + unaccent. Búsqueda en name + richDescription + idealFor concatenado.
    // Usamos $queryRaw para soporte de pg_trgm similarity().
    const rows = await prisma.$queryRaw<Array<{ id: string; rank: number }>>`
      SELECT id,
             GREATEST(
               similarity(unaccent(lower(name)), unaccent(lower(${q}))),
               similarity(unaccent(lower(COALESCE("richDescription", ''))), unaccent(lower(${q})))
             ) as rank
      FROM "Product"
      WHERE "isActive" = true
        AND "deletedAt" IS NULL
        AND (
          unaccent(lower(name)) % unaccent(lower(${q}))
          OR unaccent(lower(COALESCE("richDescription", ''))) % unaccent(lower(${q}))
          OR unaccent(lower(COALESCE("description", ''))) % unaccent(lower(${q}))
        )
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    if (rows.length === 0) return [];

    const products = await prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: {
        category: { include: { parent: true } },
        variants: { select: { price: true, stock: true, isActive: true, deletedAt: true } },
        ocasionTags: { include: { ocasionTag: { select: { slug: true } } } },
      },
    });

    const ranked = rows
      .map((r) => {
        const p = products.find((p) => p.id === r.id);
        if (!p) return null;
        return {
          ...summarizeProduct(p as ProductWithIncludes),
          rank: r.rank,
        };
      })
      .filter((x): x is CatalogSearchResult => x !== null);

    return ranked;
  } catch {
    return [];
  }
}

// ─────────────────── Plantillas (templates) ───────────────────

export type CatalogTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  mode: string;
  kind: string;
  previewUrl: string;
  productSlug: string | null;
  order: number;
};

export const listTemplatesByProduct = unstable_cache(
  async (productSlug: string, mode?: "EDITABLE" | "PREMADE"): Promise<CatalogTemplate[]> => {
    try {
      const product = await prisma.product.findUnique({ where: { slug: productSlug } });
      if (!product) return [];
      const where: Record<string, unknown> = {
        isActive: true,
        deletedAt: null,
        productId: product.id,
      };
      if (mode) where.mode = mode;

      const templates = await prisma.personalizationTemplate.findMany({
        where,
        orderBy: { order: "asc" },
      });

      return templates.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        mode: t.mode,
        kind: t.kind,
        previewUrl: t.previewUrl,
        productSlug,
        order: t.order,
      }));
    } catch {
      return [];
    }
  },
  ["catalog-templates-by-product"],
  { tags: [CATALOG_TAG], revalidate: CATALOG_TTL },
);

// ─────────────────── Cupones públicos (decisión 3.9) ───────────────────

export type PublicCoupon = {
  code: string;
  type: string;
  value: number;
  description: string | null;
  minOrder: number | null;
  requiresMinQuantity: number | null;
  appliesToCategories: string[];
  appliesToProductSlugs: string[];
  validUntil: Date;
};

export const listPublicCoupons = unstable_cache(
  async (): Promise<PublicCoupon[]> => {
    try {
      const now = new Date();
      const coupons = await prisma.coupon.findMany({
        where: {
          isActive: true,
          isPublic: true,
          deletedAt: null,
          validFrom: { lte: now },
          validTo: { gte: now },
        },
        orderBy: { validTo: "asc" },
      });
      return coupons.map((c) => ({
        code: c.code,
        type: c.type,
        value: c.value,
        description: c.description,
        minOrder: c.minOrder,
        requiresMinQuantity: c.requiresMinQuantity,
        appliesToCategories: c.appliesToCategories,
        appliesToProductSlugs: c.appliesToProductSlugs,
        validUntil: c.validTo,
      }));
    } catch {
      return [];
    }
  },
  ["catalog-public-coupons"],
  { tags: [CATALOG_TAG, "coupons"], revalidate: 600 }, // 10 min — cupones cambian más rápido
);

// ─────────────────── Productos relacionados (PDP — decisión 6.4) ───────────────────
// Scoring 3 capas: ocasión > sub-cat > cat. Excluye producto actual.

export async function getRelatedProducts(
  slug: string,
  limit = 4,
): Promise<CatalogProductSummary[]> {
  try {
    const current = await prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        ocasionTags: { select: { ocasionTagId: true } },
      },
    });
    if (!current) return [];

    const ocasionIds = current.ocasionTags.map((t) => t.ocasionTagId);
    // Buscar pool amplio: misma ocasión OR misma sub-cat OR misma cat
    const where: Record<string, unknown> = {
      isActive: true,
      deletedAt: null,
      slug: { not: slug },
      OR: [
        { ocasionTags: { some: { ocasionTagId: { in: ocasionIds } } } },
        { categoryId: current.categoryId },
        {
          category: {
            parentId: current.category.parentId ?? current.categoryId,
          },
        },
      ],
    };

    const pool = await prisma.product.findMany({
      where,
      take: 30,
      include: {
        category: { include: { parent: true } },
        variants: { select: { price: true, stock: true, isActive: true, deletedAt: true } },
        ocasionTags: {
          include: { ocasionTag: { select: { slug: true, name: true } } },
        },
      },
    });

    // Scoring 3 capas
    const scored = pool.map((p) => {
      let score = 0;
      // Capa 1: ocasión compartida (+3 cada una)
      const sharedOcasiones = p.ocasionTags.filter((t) =>
        ocasionIds.includes(t.ocasionTagId),
      ).length;
      score += sharedOcasiones * 3;
      // Capa 2: misma sub-cat (+2)
      if (p.categoryId === current.categoryId) score += 2;
      // Capa 3: misma cat padre (+1)
      else if (current.category.parentId && p.category.parentId === current.category.parentId) {
        score += 1;
      }
      // Boost featured (+0.5)
      if (p.isFeatured) score += 0.5;

      return { product: p, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => summarizeProduct(s.product as ProductWithIncludes));
  } catch {
    return [];
  }
}
