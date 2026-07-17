/*
 * Service layer — Products.
 *
 * Patrón CONVENTIONS § capa de servicio: lógica de dominio pura,
 * sin imports de next/* ni @/lib/supabase. Solo Prisma + tipos.
 * Server actions llaman a este service.
 *
 * Soft delete: `deleteProduct` marca `deletedAt` (no hard delete).
 * Filtros: las queries de listado excluyen soft-deleted por default.
 */

import "server-only";
import { prisma, type Prisma } from "@/lib/db";
import type { ProductCreateInput, ProductUpdateInput } from "./schemas";
import { getEffectiveShippingDims } from "./shipping-schemas";

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  /** Precio más barato entre las opciones activas (para mostrar "desde $X"). */
  priceFrom: number;
  sku: string;
  isActive: boolean;
  isFeatured: boolean;
  isPersonalizable: boolean;
  /** null = no archivado (vivo); Date = archivado en esa fecha. */
  deletedAt: Date | null;
  category: { id: string; name: string; slug: string };
  imagesCount: number;
  variantsCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const LIST_PAGE_SIZE = 20;

export async function listProducts(opts: {
  page?: number;
  search?: string;
  categoryId?: string;
  status?: "all" | "active" | "inactive" | "archived" | "featured";
  sort?:
    | "recent"
    | "name"
    | "price-asc"
    | "price-desc"
    | "sku-asc"
    | "sku-desc"
    | "category-asc"
    | "category-desc";
}): Promise<{ items: ProductListItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1);
  // Default: muestra TODO (activos + inactivos + archivados). Admin gestiona
  // el estado de cada uno desde acá; el storefront filtra por isActive+deletedAt.
  // Lucy 2026-05-22: sin esto el admin no era modular (no podía reactivar archivados).
  const where: Prisma.ProductWhereInput = {
    ...(opts.status === "active" ? { isActive: true, deletedAt: null } : {}),
    ...(opts.status === "inactive" ? { isActive: false, deletedAt: null } : {}),
    ...(opts.status === "archived" ? { deletedAt: { not: null } } : {}),
    ...(opts.status === "featured" ? { isActive: true, isFeatured: true, deletedAt: null } : {}),
    // status "all" o undefined → sin filtro, muestra TODO
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.search
      ? {
          OR: [
            { name: { contains: opts.search, mode: "insensitive" } },
            { sku: { contains: opts.search, mode: "insensitive" } },
            { slug: { contains: opts.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput = (() => {
    switch (opts.sort) {
      case "name":
        return { name: "asc" };
      case "price-asc":
        return { basePrice: "asc" };
      case "price-desc":
        return { basePrice: "desc" };
      case "sku-asc":
        return { sku: "asc" };
      case "sku-desc":
        return { sku: "desc" };
      case "category-asc":
        return { category: { name: "asc" } };
      case "category-desc":
        return { category: { name: "desc" } };
      case "recent":
      default:
        return { updatedAt: "desc" };
    }
  })();

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * LIST_PAGE_SIZE,
      take: LIST_PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        name: true,
        basePrice: true,
        sku: true,
        isActive: true,
        isFeatured: true,
        isPersonalizable: true,
        deletedAt: true,
        images: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { variants: true } },
        // Solo variantes ACTIVAS para el "desde $X" — una opción desactivada no
        // se puede comprar, así que no debe bajar el precio mostrado. (Bug hallado
        // por tests: antes solo filtraba deletedAt, Lucy 2026-06-30.)
        variants: { where: { deletedAt: null, isActive: true }, select: { price: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: items.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      basePrice: p.basePrice,
      // "Desde $X": el más barato entre opciones activas (heredan basePrice si null).
      priceFrom:
        p.variants.length > 0
          ? Math.min(...p.variants.map((v) => v.price ?? p.basePrice))
          : p.basePrice,
      sku: p.sku,
      isActive: p.isActive,
      isFeatured: p.isFeatured,
      isPersonalizable: p.isPersonalizable,
      deletedAt: p.deletedAt,
      category: p.category,
      imagesCount: p.images.length,
      variantsCount: p._count.variants,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    total,
    page,
    pageSize: LIST_PAGE_SIZE,
  };
}

export async function getProductById(id: string) {
  // Admin puede editar TODO (incluso archivados) — Lucy 2026-05-22.
  return prisma.product.findFirst({
    where: { id },
    include: { category: true, variants: true },
  });
}

function buildPhysicalSpecsFromInput(input: {
  weightGrams?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  depthCm?: number | null;
}): Prisma.InputJsonValue | undefined {
  if (
    input.weightGrams == null &&
    input.widthCm == null &&
    input.heightCm == null &&
    input.depthCm == null
  ) {
    return undefined;
  }
  return {
    ...(input.weightGrams != null && { weightGrams: input.weightGrams }),
    ...(input.widthCm != null && { widthCm: input.widthCm }),
    ...(input.heightCm != null && { heightCm: input.heightCm }),
    ...(input.depthCm != null && { depthCm: input.depthCm }),
  } as Prisma.InputJsonValue;
}

export async function createProduct(input: ProductCreateInput, createdBy: string | null) {
  // Verificar unicidad slug + sku (mejor mensaje de error que el de
  // Prisma P2002 genérico).
  const [slugConflict, skuConflict] = await Promise.all([
    prisma.product.findUnique({ where: { slug: input.slug }, select: { id: true } }),
    prisma.product.findUnique({ where: { sku: input.sku }, select: { id: true } }),
  ]);
  if (slugConflict) throw new ProductValidationError("slug", `Slug "${input.slug}" ya existe`);
  if (skuConflict) throw new ProductValidationError("sku", `SKU "${input.sku}" ya existe`);

  // Crear producto + variante default en la misma transacción.
  // CartItem y OrderItem requieren variantId — sin variante el producto
  // no se puede comprar. Pre-variantes-admin: cada producto tiene una
  // "Default" 1:1 con price=null (hereda basePrice) y stock=0 (sin
  // enforcement). Cuando se sumen variantes reales se reemplazan o
  // expanden.
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        basePrice: input.basePrice,
        compareAtPrice: input.compareAtPrice ?? null,
        cost: input.cost ?? null,
        sku: input.sku,
        isPersonalizable: input.isPersonalizable,
        isActive: input.isActive,
        isFeatured: input.isFeatured,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        // PLAN_CATALOG_V2 — campos AI-ready opcionales
        ...(input.richDescription !== undefined && { richDescription: input.richDescription }),
        ...(input.whyChooseThis !== undefined && { whyChooseThis: input.whyChooseThis }),
        ...(input.idealFor !== undefined && { idealFor: input.idealFor }),
        ...(input.warrantyMonths !== undefined && { warrantyMonths: input.warrantyMonths }),
        ...(input.productionDays !== undefined && { productionDays: input.productionDays }),
        ...(input.shippingDaysMin !== undefined && { shippingDaysMin: input.shippingDaysMin }),
        ...(input.shippingDaysMax !== undefined && { shippingDaysMax: input.shippingDaysMax }),
        ...(input.minimumQuantity !== undefined && { minimumQuantity: input.minimumQuantity }),
        ...(input.maximumQuantity !== undefined && { maximumQuantity: input.maximumQuantity }),
        ...(input.premadeSurcharge !== undefined && { premadeSurcharge: input.premadeSurcharge }),
        // PR C — peso/dims iniciales dentro de physicalSpecs Json
        ...(() => {
          const ps = buildPhysicalSpecsFromInput(input);
          return ps !== undefined ? { physicalSpecs: ps } : {};
        })(),
        categoryId: input.categoryId,
        images: [],
        ...(createdBy ? { createdBy } : {}),
      },
    });
    await tx.productVariant.create({
      data: {
        productId: product.id,
        name: "Default",
        sku: `${input.sku}-DEFAULT`,
        price: null,
        stock: 0,
        attributes: {},
        ...(createdBy ? { createdBy } : {}),
      },
    });
    return product;
  });
}

export async function updateProduct(input: ProductUpdateInput, updatedBy: string | null) {
  const { id, ...rest } = input;

  // Si cambian slug/sku, verificar unicidad excluyendo el propio.
  if (rest.slug) {
    const conflict = await prisma.product.findFirst({
      where: { slug: rest.slug, id: { not: id }, deletedAt: null },
      select: { id: true },
    });
    if (conflict) throw new ProductValidationError("slug", `Slug "${rest.slug}" ya existe`);
  }
  if (rest.sku) {
    const conflict = await prisma.product.findFirst({
      where: { sku: rest.sku, id: { not: id }, deletedAt: null },
      select: { id: true },
    });
    if (conflict) throw new ProductValidationError("sku", `SKU "${rest.sku}" ya existe`);
  }

  // PR C — peso/dims se persisten dentro de physicalSpecs Json (mergeado
  // con specs existentes para no pisar otras keys como `material`).
  const { weightGrams, widthCm, heightCm, depthCm, ...restNoShipping } = rest;
  let physicalSpecsUpdate: Prisma.InputJsonValue | undefined;
  if (
    weightGrams !== undefined ||
    widthCm !== undefined ||
    heightCm !== undefined ||
    depthCm !== undefined
  ) {
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { physicalSpecs: true },
    });
    const current = (existing?.physicalSpecs as Record<string, unknown> | null | undefined) ?? {};
    physicalSpecsUpdate = {
      ...current,
      ...(weightGrams !== undefined && weightGrams !== null && { weightGrams }),
      ...(widthCm !== undefined && widthCm !== null && { widthCm }),
      ...(heightCm !== undefined && heightCm !== null && { heightCm }),
      ...(depthCm !== undefined && depthCm !== null && { depthCm }),
    } as Prisma.InputJsonValue;
  }

  // idealFor es Json — necesita tratamiento especial para tipos Prisma.
  const { idealFor, ...restWithoutJson } = restNoShipping;
  return prisma.product.update({
    where: { id },
    data: {
      ...restWithoutJson,
      ...(idealFor !== undefined && { idealFor }),
      ...(physicalSpecsUpdate !== undefined && { physicalSpecs: physicalSpecsUpdate }),
      ...(updatedBy ? { updatedBy } : {}),
    },
  });
}

export async function softDeleteProduct(id: string, deletedBy: string | null) {
  return prisma.product.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      ...(deletedBy ? { deletedBy } : {}),
      isActive: false, // dejarlo invisible al storefront además del soft delete
    },
  });
}

/** Restaura un producto archivado (deletedAt = null). isActive queda en false
 * por seguridad — admin debe revisarlo + activarlo explícito. */
export async function restoreProduct(id: string, restoredBy: string | null) {
  return prisma.product.update({
    where: { id },
    data: {
      deletedAt: null,
      deletedBy: null,
      isActive: false,
      ...(restoredBy ? { updatedBy: restoredBy } : {}),
    },
  });
}

/** Toggle isActive de un producto (activa/desactiva sin archivar). */
/**
 * Verifica que cada producto (por id) sea COTIZABLE: para toda su variante viva,
 * getEffectiveShippingDims (override de variante → dims base del producto) resuelve.
 * Publicar un producto sin peso/dimensiones lo vuelve comprable pero rompe la
 * cotización de TODO carrito que lo incluya, con un fallo silencioso al cliente
 * (revisión adversarial #1, 2026-07-11). Se corre SOLO al activar (isActive=true);
 * desactivar/archivar nunca se bloquea.
 */
async function assertProductsQuotable(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      name: true,
      physicalSpecs: true,
      variants: { where: { deletedAt: null }, select: { attributes: true } },
    },
  });
  const missing = products.filter((p) => {
    // Sin variantes vivas, evaluamos solo las dims base (una Default implícita).
    const variants = p.variants.length > 0 ? p.variants : [{ attributes: {} }];
    return variants.some((v) => getEffectiveShippingDims(p.physicalSpecs, v.attributes) === null);
  });
  if (missing.length > 0) {
    const names = missing
      .slice(0, 5)
      .map((p) => `"${p.name}"`)
      .join(", ");
    throw new ProductValidationError(
      "general",
      `No puedes publicar ${
        missing.length === 1
          ? names
          : `${missing.length} productos (${names}${missing.length > 5 ? "…" : ""})`
      } sin peso y dimensiones de envío. Complétalos en la sección "📦 Empaque para el envío" del producto antes de activarlo.`,
    );
  }
}

export async function toggleProductActive(
  id: string,
  isActive: boolean,
  actorAdminId: string | null,
) {
  // Al PUBLICAR: exigir dims de envío (sino la cotización del cliente falla).
  if (isActive) await assertProductsQuotable([id]);
  return prisma.product.update({
    where: { id },
    data: { isActive, ...(actorAdminId ? { updatedBy: actorAdminId } : {}) },
  });
}

/**
 * Bulk: cambia isActive de N productos en una sola operación.
 * Lucy 2026-06-26 — Opción C Sprint 3: para no clickear uno por uno cuando
 * quiere pausar/activar varios en lote.
 *
 * Solo afecta productos no soft-deleted. Devuelve count para feedback.
 */
export async function bulkUpdateProductsActive(
  ids: string[],
  isActive: boolean,
  actorAdminId: string | null,
): Promise<{ count: number }> {
  if (ids.length === 0) return { count: 0 };
  // Al PUBLICAR en lote: mismo gate de dims que el toggle individual.
  if (isActive) await assertProductsQuotable(ids);
  const result = await prisma.product.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { isActive, ...(actorAdminId ? { updatedBy: actorAdminId } : {}) },
  });
  return { count: result.count };
}

/**
 * Bulk: cambia isFeatured de N productos.
 * Usado por Lucy para "destacar 5 productos para Día de la Madre" sin tener
 * que entrar a cada uno.
 */
export async function bulkUpdateProductsFeatured(
  ids: string[],
  isFeatured: boolean,
  actorAdminId: string | null,
): Promise<{ count: number }> {
  if (ids.length === 0) return { count: 0 };
  const result = await prisma.product.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { isFeatured, ...(actorAdminId ? { updatedBy: actorAdminId } : {}) },
  });
  return { count: result.count };
}

/**
 * Lista categorías para `<select>` del ProductForm con jerarquía:
 * primero todas las padre alfabéticas, después cada hija indentada con
 * "— " debajo de su padre. Si las categorías están ordenadas por
 * `order` en admin, ese orden se respeta.
 */
export async function listCategoriesForSelect() {
  const raw = await prisma.category.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true, slug: true, parentId: true, order: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  // Reordenar: padre, luego hijos justo debajo (recursivo simple 2 niveles).
  const parents = raw.filter((c) => c.parentId === null);
  const childrenByParent = raw.reduce<Record<string, typeof raw>>((acc, c) => {
    if (c.parentId) {
      (acc[c.parentId] ??= []).push(c);
    }
    return acc;
  }, {});
  const ordered: Array<{ id: string; name: string; slug: string; isSub: boolean }> = [];
  for (const p of parents) {
    ordered.push({ id: p.id, name: p.name, slug: p.slug, isSub: false });
    const subs = childrenByParent[p.id] ?? [];
    for (const sub of subs) {
      ordered.push({ id: sub.id, name: sub.name, slug: sub.slug, isSub: true });
    }
  }
  // Sub-cats huérfanas (parentId apunta a categoría archivada) — agregarlas al final
  const orderedIds = new Set(ordered.map((c) => c.id));
  for (const c of raw) {
    if (!orderedIds.has(c.id)) {
      ordered.push({ id: c.id, name: c.name, slug: c.slug, isSub: true });
    }
  }
  return ordered;
}

// ─────────────────────────────────────────────────────────────────────
// CRUD de Variants (M.3.b.CAT.9 — Admin variants UI 2026-05-18)
// ─────────────────────────────────────────────────────────────────────

import type { VariantCreateInput, VariantUpdateInput } from "./variant-schemas";

/**
 * Lista todas las variants no archivadas de un producto, ordenadas por
 * created date (más antiguas primero — incluyendo el "Default").
 */
export async function listVariantsByProduct(productId: string) {
  return prisma.productVariant.findMany({
    where: { productId, deletedAt: null },
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function getVariantById(id: string) {
  return prisma.productVariant.findFirst({
    where: { id, deletedAt: null },
    include: { product: { select: { id: true, slug: true, name: true, basePrice: true } } },
  });
}

/**
 * Crea variant nueva. SKU debe ser único globalmente; se valida antes
 * de insertar para dar mejor mensaje de error que el P2002 genérico.
 */
/**
 * D4 (Lucy 2026-06-27): `Product.basePrice` se auto-deriva de las opciones —
 * Lucy ya no lo edita a mano (campo escondido). Lo fijamos = precio MÍNIMO
 * explícito entre las opciones activas, para que coincida con el "desde $X"
 * que ve el cliente. Si ninguna opción tiene precio propio, se deja el basePrice
 * actual como fallback (no lo pisamos con 0). Idempotente.
 */
export async function syncProductBasePrice(productId: string): Promise<void> {
  const cheapest = await prisma.productVariant.findFirst({
    where: { productId, deletedAt: null, isActive: true, price: { not: null } },
    orderBy: { price: "asc" },
    select: { price: true, compareAtPrice: true },
  });
  if (cheapest?.price == null) return;
  await prisma.product.update({
    where: { id: productId },
    data: {
      basePrice: cheapest.price,
      // Lucy 2026-06-27: denormalizamos el "precio tachado" del producto = el de
      // la opción más barata. Las cards del storefront leen product.compareAtPrice,
      // así que con esto muestran el descuento correcto de la opción "desde" sin
      // recalcular por opción. Solo si es una promo válida (> precio).
      compareAtPrice:
        cheapest.compareAtPrice != null && cheapest.compareAtPrice > cheapest.price
          ? cheapest.compareAtPrice
          : null,
    },
  });
}

export async function createVariant(input: VariantCreateInput, createdBy: string | null) {
  const skuConflict = await prisma.productVariant.findUnique({
    where: { sku: input.sku },
    select: { id: true },
  });
  if (skuConflict) throw new VariantValidationError("sku", `SKU "${input.sku}" ya existe`);

  const created = await prisma.productVariant.create({
    data: {
      productId: input.productId,
      name: input.name,
      sku: input.sku,
      description: input.description ?? null,
      price: input.price ?? null,
      compareAtPrice: input.compareAtPrice ?? null,
      stock: input.stock,
      isActive: input.isActive,
      attributes: input.attributes,
      ...(createdBy ? { createdBy } : {}),
    },
  });
  await syncProductBasePrice(input.productId);
  return created;
}

/**
 * Edita variant. Si cambia el SKU, valida unicidad excluyendo la propia.
 */
export async function updateVariant(input: VariantUpdateInput, updatedBy: string | null) {
  const { id, attributes, ...rest } = input;

  if (rest.sku) {
    const conflict = await prisma.productVariant.findFirst({
      where: { sku: rest.sku, id: { not: id }, deletedAt: null },
      select: { id: true },
    });
    if (conflict) throw new VariantValidationError("sku", `SKU "${rest.sku}" ya existe`);
  }

  const updated = await prisma.productVariant.update({
    where: { id },
    data: {
      ...rest,
      ...(attributes !== undefined && { attributes }),
      ...(updatedBy ? { updatedBy } : {}),
    },
  });
  await syncProductBasePrice(updated.productId);
  return updated;
}

/**
 * Soft-delete variant. Si es la única variant activa del producto, la
 * función rechaza (un producto debe tener al menos una variant para que
 * cartItem/orderItem.variantId siga apuntando a algo válido).
 */
export async function softDeleteVariant(id: string, deletedBy: string | null) {
  const variant = await prisma.productVariant.findUnique({
    where: { id },
    select: { productId: true, deletedAt: true },
  });
  if (!variant || variant.deletedAt) {
    throw new VariantValidationError("general", "Variant no encontrada");
  }
  const activeCount = await prisma.productVariant.count({
    where: { productId: variant.productId, deletedAt: null },
  });
  if (activeCount <= 1) {
    throw new VariantValidationError(
      "general",
      "No se puede archivar la única variant activa del producto",
    );
  }
  const deleted = await prisma.productVariant.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      ...(deletedBy ? { deletedBy } : {}),
    },
  });
  await syncProductBasePrice(variant.productId);
  return deleted;
}

export class VariantValidationError extends Error {
  constructor(
    public field: "sku" | "name" | "price" | "stock" | "general",
    message: string,
  ) {
    super(message);
    this.name = "VariantValidationError";
  }
}

// ─────────────────────────────────────────────────────────────────────
// Errores específicos del dominio products. Se mapean a fieldErrors en
// las server actions.

export class ProductValidationError extends Error {
  constructor(
    public field: "slug" | "sku" | "categoryId" | "general",
    message: string,
  ) {
    super(message);
    this.name = "ProductValidationError";
  }
}
