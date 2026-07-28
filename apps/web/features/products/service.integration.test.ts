/*
 * Tests de integración del SERVICE de PRODUCTOS (admin/catálogo) contra la DB real.
 *
 * `@/features/products/service.ts` es lógica de dominio casi-PURA-de-next (solo Prisma
 * + tipos; la única excepción es `next/cache.updateTag` para invalidar el caché
 * `catalog` tras cada mutación): toda su superficie pega a la DB. Por eso es
 * 100% test de integración.
 *
 * `next/cache.updateTag` se mockea a no-op: fuera de un Server Action real lanza
 * ("can only be called from within a Server Action"). El service lo invoca tras
 * cada mutación; aquí no nos interesa la revalidación sino el efecto en DB.
 *
 * Cobertura:
 *   - listProducts: filtros (search por name/sku/slug, categoryId, status
 *     all/active/inactive/archived/featured), orden (recent/name/price-asc/
 *     price-desc/sku-asc/sku-desc/category-asc/category-desc), paginación
 *     (pageSize 20, skip/take, total), y campos derivados (priceFrom,
 *     imagesCount, variantsCount).
 *   - getProductById: incluye category + variants (incluso archivadas), id inexistente.
 *   - createProduct: unicidad slug/sku (incl. vs soft-deleted), crea variante
 *     "Default" 1:1 price=null, campos opcionales AI-ready + physicalSpecs.
 *   - updateProduct: unicidad slug/sku excluyendo el propio y EXCLUYENDO
 *     soft-deleted (asimetría vs create), merge de physicalSpecs sin pisar
 *     keys ajenas, idealFor Json.
 *   - softDeleteProduct / restoreProduct / toggleProductActive: transiciones de
 *     estado (deletedAt, isActive) y campos de auditoría.
 *   - bulkUpdateProductsActive / bulkUpdateProductsFeatured: count, exclusión de
 *     soft-deleted, lista vacía noop.
 *   - listCategoriesForSelect: jerarquía padre→hijo, orden, exclusión de
 *     archivadas/inactivas, huérfanas al final.
 *   - listVariantsByProduct / getVariantById: filtrado de archivadas, orden createdAt.
 *   - syncProductBasePrice: deriva basePrice = mín precio entre opciones ACTIVAS
 *     con price propio; idempotente; ignora inactivas; fallback si ninguna tiene price.
 *   - createVariant / updateVariant: unicidad sku, sync de basePrice tras cambio.
 *   - softDeleteVariant: rechazo si es la única no-archivada, sync tras borrar.
 *   - ProductValidationError / VariantValidationError: forma del error.
 *
 * Requiere DATABASE_URL (corre vía `dotenv -e ../../.env.local -- vitest`). Si no
 * está, se salta (skipIf) para no romper CI sin DB.
 *
 * Aislamiento: TODO fixture lleva el prefijo RUN único por corrida (slug, sku,
 * category.slug, variant.sku). Limpieza en afterAll SCOPED por categoryId/RUN —
 * JAMÁS toca datos reales (seed, cuenta de Lucy). El service NO valida shape de
 * slug/sku (eso es Zod en actions.ts), así que usamos identificadores legibles
 * y filtrables por prefijo.
 */

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import { prisma, type Prisma } from "@/lib/db";
import {
  ProductValidationError,
  VariantValidationError,
  bulkUpdateProductsActive,
  bulkUpdateProductsFeatured,
  createProduct,
  createVariant,
  getProductById,
  getVariantById,
  listCategoriesForSelect,
  listProducts,
  listVariantsByProduct,
  restoreProduct,
  softDeleteProduct,
  softDeleteVariant,
  syncProductBasePrice,
  toggleProductActive,
  updateProduct,
  updateVariant,
} from "./service";
import type { ProductCreateInput } from "./schemas";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Toda fila creada lo lleva → limpieza scoped.
const RUN = `prod${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const SKU_RUN = RUN.toUpperCase();

// El pooler de Supabase (pgbouncer :6543) es lento bajo concurrencia; 5s default
// no alcanza. Espeja el patrón de los otros .integration.test.ts del repo.
const T = 30_000;

/** Sufijo único por invocación → tolera el retry de vitest (retry:2) sin colisiones unique. */
function uniq(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// ─────────────────── helpers de creación de fixtures ───────────────────

/** Crea una categoría RUN-prefijada. Devuelve {id, slug}. */
async function makeCategory(opts?: {
  label?: string;
  name?: string;
  parentId?: string | null;
  order?: number;
  isActive?: boolean;
  deletedAt?: Date | null;
}) {
  const u = uniq();
  return prisma.category.create({
    data: {
      slug: `${RUN}-${opts?.label ?? "cat"}-${u}`,
      name: opts?.name ?? `Cat ${RUN} ${u}`,
      parentId: opts?.parentId ?? undefined,
      order: opts?.order ?? 0,
      // Default false: un fixture huérfano (test que falla antes del cleanup)
      // NUNCA debe volverse visible en el storefront. Los tests que necesitan
      // categorías activas lo declaran explícito con isActive: true.
      isActive: opts?.isActive ?? false,
      deletedAt: opts?.deletedAt ?? undefined,
    },
    select: { id: true, slug: true, name: true },
  });
}

/**
 * Crea un producto RUN-prefijado directo vía Prisma (bypassa el service para
 * armar el escenario sin pasar por createProduct). Devuelve la fila completa.
 */
async function makeProduct(data: {
  categoryId: string;
  label: string;
  name?: string;
  basePrice?: number;
  sku?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  deletedAt?: Date | null;
  images?: string[];
  // Dims de envío base. Default: completas (para que el gate de publicación
  // assertProductsQuotable pase). Pasa {} para simular un producto SIN dims.
  physicalSpecs?: Prisma.InputJsonValue;
  variants?: Array<{
    name: string;
    skuSuffix: string;
    price?: number | null;
    compareAtPrice?: number | null;
    isActive?: boolean;
    deletedAt?: Date | null;
    stock?: number;
  }>;
}) {
  const u = uniq();
  return prisma.product.create({
    data: {
      slug: `${RUN}-${data.label}-${u}`,
      name: data.name ?? `${data.label} ${RUN}`,
      description: `fixture ${data.label} description text`,
      basePrice: data.basePrice ?? 10_000,
      sku: `${SKU_RUN}-${data.label}-${u}`.toUpperCase(),
      categoryId: data.categoryId,
      isActive: data.isActive ?? true,
      isFeatured: data.isFeatured ?? false,
      deletedAt: data.deletedAt ?? undefined,
      images: data.images ?? [],
      physicalSpecs: data.physicalSpecs ?? {
        weightGrams: 200,
        widthCm: 10,
        heightCm: 10,
        depthCm: 10,
      },
      variants: data.variants
        ? {
            create: data.variants.map((v) => ({
              name: v.name,
              sku: `${SKU_RUN}-${data.label}-${v.skuSuffix}-${u}`.toUpperCase(),
              price: v.price ?? null,
              compareAtPrice: v.compareAtPrice ?? null,
              isActive: v.isActive ?? true,
              deletedAt: v.deletedAt ?? undefined,
              stock: v.stock ?? 0,
              attributes: {},
            })),
          }
        : undefined,
    },
    include: { variants: true, category: true },
  });
}

/** Input válido mínimo para createProduct, con overrides. */
function productInput(
  categoryId: string,
  over: Partial<ProductCreateInput> = {},
): ProductCreateInput {
  const u = uniq();
  return {
    name: over.name ?? `Created ${RUN} ${u}`,
    slug: over.slug ?? `${RUN}-created-${u}`,
    description: over.description ?? "Producto creado vía service con descripción válida",
    basePrice: over.basePrice ?? 25_000,
    compareAtPrice: over.compareAtPrice ?? null,
    cost: over.cost ?? null,
    sku: over.sku ?? `${SKU_RUN}-CREATED-${u}`.toUpperCase(),
    categoryId,
    isPersonalizable: over.isPersonalizable ?? false,
    isActive: over.isActive ?? true,
    isFeatured: over.isFeatured ?? false,
    seoTitle: over.seoTitle ?? null,
    seoDescription: over.seoDescription ?? null,
    ...over,
  } as ProductCreateInput;
}

describe.skipIf(!hasDb)("products/service — integración DB", { timeout: T }, () => {
  // Limpieza global SCOPED: borra todo lo que lleve el RUN. El orden respeta FKs:
  // variantes (Cascade vía product, pero las borramos explícito) → productos →
  // categorías. Solo toca filas RUN-prefijadas.
  afterAll(async () => {
    await prisma.productVariant.deleteMany({ where: { product: { slug: { startsWith: RUN } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: RUN } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: RUN } } });
  });

  // ════════════════════════════════════════════════════════════════════════
  // listProducts — filtros, orden, paginación, campos derivados
  // ════════════════════════════════════════════════════════════════════════

  describe("listProducts", () => {
    it("filtra por categoryId: solo devuelve productos de esa categoría", async () => {
      const catA = await makeCategory({ label: "lp-cata" });
      const catB = await makeCategory({ label: "lp-catb" });
      const pA = await makeProduct({ categoryId: catA.id, label: "lp-a", basePrice: 1_000 });
      await makeProduct({ categoryId: catB.id, label: "lp-b", basePrice: 2_000 });

      const res = await listProducts({ categoryId: catA.id });
      expect(res.items.map((i) => i.id)).toEqual([pA.id]);
      expect(res.total).toBe(1);
      expect(res.pageSize).toBe(20);
      expect(res.page).toBe(1);
      expect(res.items[0].category).toMatchObject({ id: catA.id, slug: catA.slug });
    });

    it("search hace match insensible a mayúsculas en name, sku y slug (OR)", async () => {
      const cat = await makeCategory({ label: "lp-search" });
      const token = `zxq${uniq()}`; // token improbable, único
      // name match
      const byName = await makeProduct({
        categoryId: cat.id,
        label: "lp-n",
        name: `Imán ${token} bonito`,
      });
      // sku match (token va en el sku)
      const bySku = await prisma.product.create({
        data: {
          slug: `${RUN}-lp-sku-${uniq()}`,
          name: "Producto sku match",
          description: "fixture search por sku",
          basePrice: 3_000,
          sku: `${SKU_RUN}-${token}-X`.toUpperCase(),
          categoryId: cat.id,
        },
        select: { id: true },
      });
      // slug match
      const bySlug = await prisma.product.create({
        data: {
          slug: `${RUN}-${token}-slug-${uniq()}`,
          name: "Producto slug match",
          description: "fixture search por slug",
          basePrice: 4_000,
          sku: `${SKU_RUN}-SLUGM-${uniq()}`.toUpperCase(),
          categoryId: cat.id,
        },
        select: { id: true },
      });
      // ruido: no contiene el token
      await makeProduct({ categoryId: cat.id, label: "lp-noise", name: "nada que ver" });

      // búsqueda en MAYÚSCULAS debe matchear igual (mode insensitive)
      const res = await listProducts({ categoryId: cat.id, search: token.toUpperCase() });
      const ids = res.items.map((i) => i.id).sort();
      expect(ids).toEqual([byName.id, bySku.id, bySlug.id].sort());
      expect(res.total).toBe(3);
    });

    it("status='active' → solo isActive=true && deletedAt=null", async () => {
      const cat = await makeCategory({ label: "lp-active" });
      const active = await makeProduct({ categoryId: cat.id, label: "act", isActive: true });
      await makeProduct({ categoryId: cat.id, label: "ina", isActive: false });
      await makeProduct({
        categoryId: cat.id,
        label: "arch",
        isActive: true,
        deletedAt: new Date(),
      });

      const res = await listProducts({ categoryId: cat.id, status: "active" });
      expect(res.items.map((i) => i.id)).toEqual([active.id]);
      expect(res.items[0].isActive).toBe(true);
      expect(res.items[0].deletedAt).toBeNull();
    });

    it("status='inactive' → isActive=false && deletedAt=null (no incluye archivados)", async () => {
      const cat = await makeCategory({ label: "lp-inactive" });
      await makeProduct({ categoryId: cat.id, label: "act2", isActive: true });
      const inactive = await makeProduct({ categoryId: cat.id, label: "ina2", isActive: false });
      // archivado que TAMBIÉN está inactivo: no debe aparecer (deletedAt != null lo excluye)
      await makeProduct({
        categoryId: cat.id,
        label: "archina",
        isActive: false,
        deletedAt: new Date(),
      });

      const res = await listProducts({ categoryId: cat.id, status: "inactive" });
      expect(res.items.map((i) => i.id)).toEqual([inactive.id]);
    });

    it("status='archived' → solo deletedAt != null (ignora isActive)", async () => {
      const cat = await makeCategory({ label: "lp-archived" });
      await makeProduct({ categoryId: cat.id, label: "live", isActive: true });
      const arch1 = await makeProduct({
        categoryId: cat.id,
        label: "ar1",
        isActive: false,
        deletedAt: new Date(),
      });
      const arch2 = await makeProduct({
        categoryId: cat.id,
        label: "ar2",
        isActive: true,
        deletedAt: new Date(),
      });

      const res = await listProducts({ categoryId: cat.id, status: "archived" });
      expect(res.items.map((i) => i.id).sort()).toEqual([arch1.id, arch2.id].sort());
      expect(res.items.every((i) => i.deletedAt !== null)).toBe(true);
    });

    it("status='featured' → isActive && isFeatured && deletedAt=null", async () => {
      const cat = await makeCategory({ label: "lp-featured" });
      const feat = await makeProduct({
        categoryId: cat.id,
        label: "feat",
        isActive: true,
        isFeatured: true,
      });
      await makeProduct({
        categoryId: cat.id,
        label: "featina",
        isActive: false,
        isFeatured: true,
      }); // inactivo
      await makeProduct({
        categoryId: cat.id,
        label: "notfeat",
        isActive: true,
        isFeatured: false,
      }); // no featured
      await makeProduct({
        categoryId: cat.id,
        label: "featarch",
        isActive: true,
        isFeatured: true,
        deletedAt: new Date(),
      }); // archivado

      const res = await listProducts({ categoryId: cat.id, status: "featured" });
      expect(res.items.map((i) => i.id)).toEqual([feat.id]);
      expect(res.items[0].isFeatured).toBe(true);
    });

    it("status='all' (default) muestra activos + inactivos + archivados", async () => {
      const cat = await makeCategory({ label: "lp-all" });
      const a = await makeProduct({ categoryId: cat.id, label: "all-a", isActive: true });
      const b = await makeProduct({ categoryId: cat.id, label: "all-b", isActive: false });
      const c = await makeProduct({ categoryId: cat.id, label: "all-c", deletedAt: new Date() });

      const res = await listProducts({ categoryId: cat.id, status: "all" });
      expect(res.items.map((i) => i.id).sort()).toEqual([a.id, b.id, c.id].sort());
      expect(res.total).toBe(3);

      // sin status === undefined → mismo comportamiento que "all"
      const noStatus = await listProducts({ categoryId: cat.id });
      expect(noStatus.total).toBe(3);
    });

    it("orden price-asc / price-desc ordenan por basePrice", async () => {
      const cat = await makeCategory({ label: "lp-price" });
      await makeProduct({ categoryId: cat.id, label: "p-mid", basePrice: 5_000 });
      await makeProduct({ categoryId: cat.id, label: "p-low", basePrice: 1_000 });
      await makeProduct({ categoryId: cat.id, label: "p-high", basePrice: 9_000 });

      const asc = await listProducts({ categoryId: cat.id, sort: "price-asc" });
      expect(asc.items.map((i) => i.basePrice)).toEqual([1_000, 5_000, 9_000]);

      const desc = await listProducts({ categoryId: cat.id, sort: "price-desc" });
      expect(desc.items.map((i) => i.basePrice)).toEqual([9_000, 5_000, 1_000]);
    });

    it("orden name='asc' y sku-asc/sku-desc ordenan alfabéticamente", async () => {
      const cat = await makeCategory({ label: "lp-name" });
      await makeProduct({ categoryId: cat.id, label: "nm-c", name: `${RUN}-NameC` });
      await makeProduct({ categoryId: cat.id, label: "nm-a", name: `${RUN}-NameA` });
      await makeProduct({ categoryId: cat.id, label: "nm-b", name: `${RUN}-NameB` });

      const byName = await listProducts({ categoryId: cat.id, sort: "name" });
      expect(byName.items.map((i) => i.name)).toEqual([
        `${RUN}-NameA`,
        `${RUN}-NameB`,
        `${RUN}-NameC`,
      ]);

      const skuAsc = await listProducts({ categoryId: cat.id, sort: "sku-asc" });
      const skuDesc = await listProducts({ categoryId: cat.id, sort: "sku-desc" });
      // sku-desc es el reverse exacto de sku-asc
      expect(skuDesc.items.map((i) => i.sku)).toEqual(
        [...skuAsc.items.map((i) => i.sku)].reverse(),
      );
    });

    it("orden category-asc / category-desc ordena por nombre de la categoría", async () => {
      // Dos categorías con nombres ordenables; un producto en cada una.
      const catA = await makeCategory({ label: "lp-cord-a", name: `${RUN}-AAA-cat` });
      const catZ = await makeCategory({ label: "lp-cord-z", name: `${RUN}-ZZZ-cat` });
      const inA = await makeProduct({ categoryId: catA.id, label: "cord-a" });
      const inZ = await makeProduct({ categoryId: catZ.id, label: "cord-z" });

      // Buscamos por el RUN (search) para acotar a estos dos productos.
      const asc = await listProducts({ search: `${RUN}-cord`, sort: "category-asc" });
      const ascRelevant = asc.items.filter((i) => [inA.id, inZ.id].includes(i.id));
      expect(ascRelevant.map((i) => i.id)).toEqual([inA.id, inZ.id]);

      const desc = await listProducts({ search: `${RUN}-cord`, sort: "category-desc" });
      const descRelevant = desc.items.filter((i) => [inA.id, inZ.id].includes(i.id));
      expect(descRelevant.map((i) => i.id)).toEqual([inZ.id, inA.id]);
    });

    it("default sort = 'recent' (updatedAt desc)", async () => {
      const cat = await makeCategory({ label: "lp-recent" });
      const first = await makeProduct({ categoryId: cat.id, label: "rec-1" });
      const second = await makeProduct({ categoryId: cat.id, label: "rec-2" });
      // Forzar updatedAt distinto y conocido: tocar 'first' después → queda más reciente.
      await new Promise((r) => setTimeout(r, 10));
      await prisma.product.update({
        where: { id: first.id },
        data: { name: `${first.name} touched` },
      });

      const res = await listProducts({ categoryId: cat.id }); // sin sort → recent
      expect(res.items.map((i) => i.id)).toEqual([first.id, second.id]);
    });

    it("paginación: pageSize fijo 20, page 2 saltea los primeros 20, total cuenta todo", async () => {
      const cat = await makeCategory({ label: "lp-page" });
      // Creamos 22 productos numerados por basePrice para orden determinista.
      // createMany (1 round-trip) en vez de 22 inserts seriales — el pooler de
      // Supabase es lento y 22 round-trips superan el timeout del test.
      const N = 22;
      const u = uniq();
      await prisma.product.createMany({
        data: Array.from({ length: N }, (_, i) => ({
          slug: `${RUN}-pg-${i}-${u}`,
          name: `Page ${RUN} ${i}`,
          description: "fixture paginación",
          basePrice: 1_000 + i,
          sku: `${SKU_RUN}-PG-${i}-${u}`.toUpperCase(),
          categoryId: cat.id,
        })),
      });
      const page1 = await listProducts({ categoryId: cat.id, sort: "price-asc", page: 1 });
      expect(page1.items).toHaveLength(20);
      expect(page1.total).toBe(N);
      expect(page1.page).toBe(1);
      expect(page1.items[0].basePrice).toBe(1_000); // el más barato primero

      const page2 = await listProducts({ categoryId: cat.id, sort: "price-asc", page: 2 });
      expect(page2.items).toHaveLength(N - 20); // 2 restantes
      expect(page2.page).toBe(2);
      expect(page2.items[0].basePrice).toBe(1_020); // el 21° (índice 20)
      // No hay solapamiento entre página 1 y 2.
      const overlap = page1.items.filter((p) => page2.items.some((q) => q.id === p.id));
      expect(overlap).toHaveLength(0);
    });

    it("page <= 0 se normaliza a 1 (Math.max(1, ...))", async () => {
      const cat = await makeCategory({ label: "lp-pageclamp" });
      await makeProduct({ categoryId: cat.id, label: "pc-1" });
      const res = await listProducts({ categoryId: cat.id, page: 0 });
      expect(res.page).toBe(1);
      expect(res.items).toHaveLength(1);

      const neg = await listProducts({ categoryId: cat.id, page: -5 });
      expect(neg.page).toBe(1);
    });

    it("priceFrom = mín precio entre variantes NO archivadas (la default null hereda basePrice)", async () => {
      const cat = await makeCategory({ label: "lp-pricefrom" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "pf",
        basePrice: 9_999,
        variants: [
          { name: "Default", skuSuffix: "DEFAULT", price: null }, // hereda basePrice 9999
          { name: "Cheap", skuSuffix: "CHEAP", price: 3_000 },
          { name: "Mid", skuSuffix: "MID", price: 7_000 },
        ],
      });
      const res = await listProducts({ categoryId: cat.id });
      const item = res.items.find((i) => i.id === p.id)!;
      expect(item.priceFrom).toBe(3_000); // mín(9999, 3000, 7000)
      expect(item.variantsCount).toBe(3);
    });

    it("priceFrom = basePrice cuando el producto no tiene ninguna variante", async () => {
      const cat = await makeCategory({ label: "lp-novar" });
      const p = await makeProduct({ categoryId: cat.id, label: "novar", basePrice: 4_321 });
      const res = await listProducts({ categoryId: cat.id });
      const item = res.items.find((i) => i.id === p.id)!;
      expect(item.priceFrom).toBe(4_321);
      expect(item.variantsCount).toBe(0);
    });

    it("priceFrom EXCLUYE variantes INACTIVAS (solo cuenta opciones comprables)", async () => {
      // Una opción desactivada no se puede comprar, así que no debe bajar el
      // "desde $X". La query filtra isActive:true (fix del bug hallado por tests).
      const cat = await makeCategory({ label: "lp-pfinactive" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "pfina",
        basePrice: 9_999,
        variants: [
          { name: "Active", skuSuffix: "ACT", price: 5_000, isActive: true },
          { name: "InactiveCheap", skuSuffix: "INA", price: 1_000, isActive: false },
        ],
      });
      const res = await listProducts({ categoryId: cat.id });
      const item = res.items.find((i) => i.id === p.id)!;
      // La inactiva ($1000) se ignora → "desde $5000" (la activa más barata).
      expect(item.priceFrom).toBe(5_000);
    });

    it("priceFrom EXCLUYE variantes archivadas (deletedAt != null) pero variantsCount las INCLUYE", async () => {
      const cat = await makeCategory({ label: "lp-pfarch" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "pfarch",
        basePrice: 8_000,
        variants: [
          { name: "Live", skuSuffix: "LIVE", price: 6_000 },
          { name: "ArchivedCheap", skuSuffix: "ARCH", price: 500, deletedAt: new Date() },
        ],
      });
      const res = await listProducts({ categoryId: cat.id });
      const item = res.items.find((i) => i.id === p.id)!;
      // priceFrom ignora la archivada (500) → queda 6000.
      expect(item.priceFrom).toBe(6_000);
      // _count.variants NO filtra deletedAt → cuenta las 2.
      expect(item.variantsCount).toBe(2);
    });

    it("imagesCount refleja el largo del array images", async () => {
      const cat = await makeCategory({ label: "lp-images" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "imgs",
        images: ["https://cdn/1.png", "https://cdn/2.png", "https://cdn/3.png"],
      });
      const res = await listProducts({ categoryId: cat.id });
      const item = res.items.find((i) => i.id === p.id)!;
      expect(item.imagesCount).toBe(3);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // getProductById
  // ════════════════════════════════════════════════════════════════════════

  describe("getProductById", () => {
    it("devuelve el producto con category + TODAS las variants (incl. archivadas)", async () => {
      const cat = await makeCategory({ label: "gp" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "gp-prod",
        variants: [
          { name: "Live", skuSuffix: "LIVE", price: 1_000 },
          { name: "Archived", skuSuffix: "ARCH", price: 2_000, deletedAt: new Date() },
        ],
      });
      const found = await getProductById(p.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(p.id);
      expect(found!.category.id).toBe(cat.id);
      // include: { variants: true } SIN filtro deletedAt → incluye la archivada.
      expect(found!.variants).toHaveLength(2);
    });

    it("encuentra incluso productos archivados (admin edita todo)", async () => {
      const cat = await makeCategory({ label: "gp-arch" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "gp-archived",
        deletedAt: new Date(),
      });
      const found = await getProductById(p.id);
      expect(found).not.toBeNull();
      expect(found!.deletedAt).not.toBeNull();
    });

    it("devuelve null para id inexistente", async () => {
      expect(await getProductById(`${RUN}-no-such-product`)).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // createProduct
  // ════════════════════════════════════════════════════════════════════════

  describe("createProduct", () => {
    it("crea el producto + una variante 'Default' con sku '<SKU>-DEFAULT' price=null stock=0", async () => {
      const cat = await makeCategory({ label: "cp" });
      const input = productInput(cat.id);
      const product = await createProduct(input, "admin-1");

      expect(product.slug).toBe(input.slug);
      expect(product.sku).toBe(input.sku);
      expect(product.basePrice).toBe(input.basePrice);
      expect(product.createdBy).toBe("admin-1");

      const variants = await prisma.productVariant.findMany({ where: { productId: product.id } });
      expect(variants).toHaveLength(1);
      expect(variants[0].name).toBe("Default");
      expect(variants[0].sku).toBe(`${input.sku}-DEFAULT`);
      expect(variants[0].price).toBeNull();
      expect(variants[0].stock).toBe(0);
      expect(variants[0].createdBy).toBe("admin-1");
    });

    it("createdBy null no setea el campo (queda null)", async () => {
      const cat = await makeCategory({ label: "cp-nullby" });
      const product = await createProduct(productInput(cat.id), null);
      expect(product.createdBy).toBeNull();
    });

    it("persiste campos AI-ready opcionales (idealFor, warrantyMonths) cuando se pasan", async () => {
      const cat = await makeCategory({ label: "cp-ai" });
      const input = productInput(cat.id, {
        idealFor: ["regalo aniversario", "decoración cuarto"],
        warrantyMonths: 24,
        productionDays: 5,
      });
      const product = await createProduct(input, null);
      const row = await prisma.product.findUnique({
        where: { id: product.id },
        select: { idealFor: true, warrantyMonths: true, productionDays: true },
      });
      expect(row!.idealFor).toEqual(["regalo aniversario", "decoración cuarto"]);
      expect(row!.warrantyMonths).toBe(24);
      expect(row!.productionDays).toBe(5);
    });

    it("persiste physicalSpecs cuando se pasan dimensiones/peso", async () => {
      const cat = await makeCategory({ label: "cp-specs" });
      const input = productInput(cat.id, { weightGrams: 250, widthCm: 10, heightCm: 15 });
      const product = await createProduct(input, null);
      const row = await prisma.product.findUnique({
        where: { id: product.id },
        select: { physicalSpecs: true },
      });
      expect(row!.physicalSpecs).toMatchObject({ weightGrams: 250, widthCm: 10, heightCm: 15 });
      // depthCm no se pasó → no aparece.
      expect((row!.physicalSpecs as Record<string, unknown>).depthCm).toBeUndefined();
    });

    it("slug duplicado lanza ProductValidationError(field='slug')", async () => {
      const cat = await makeCategory({ label: "cp-dupslug" });
      const first = productInput(cat.id);
      await createProduct(first, null);
      const dup = productInput(cat.id, { slug: first.slug }); // mismo slug, sku distinto
      await expect(createProduct(dup, null)).rejects.toMatchObject({
        name: "ProductValidationError",
        field: "slug",
      });
    });

    it("sku duplicado lanza ProductValidationError(field='sku')", async () => {
      const cat = await makeCategory({ label: "cp-dupsku" });
      const first = productInput(cat.id);
      await createProduct(first, null);
      const dup = productInput(cat.id, { sku: first.sku }); // mismo sku, slug distinto
      await expect(createProduct(dup, null)).rejects.toMatchObject({
        name: "ProductValidationError",
        field: "sku",
      });
    });

    it("slug de un producto SOFT-DELETED también cuenta como conflicto (findUnique no filtra deletedAt)", async () => {
      // Asimetría con updateProduct (que SÍ filtra deletedAt=null). El unique de DB
      // sigue ocupado por el soft-deleted, así que createProduct lo detecta.
      const cat = await makeCategory({ label: "cp-delslug" });
      const ghost = await makeProduct({
        categoryId: cat.id,
        label: "cp-ghost",
        deletedAt: new Date(),
      });
      const input = productInput(cat.id, { slug: ghost.slug });
      await expect(createProduct(input, null)).rejects.toMatchObject({ field: "slug" });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // updateProduct
  // ════════════════════════════════════════════════════════════════════════

  describe("updateProduct", () => {
    it("actualiza campos simples y setea updatedBy", async () => {
      const cat = await makeCategory({ label: "up" });
      const p = await makeProduct({ categoryId: cat.id, label: "up-prod", basePrice: 1_000 });
      const updated = await updateProduct(
        { id: p.id, name: "Nuevo nombre", basePrice: 2_000 },
        "admin-X",
      );
      expect(updated.name).toBe("Nuevo nombre");
      expect(updated.basePrice).toBe(2_000);
      expect(updated.updatedBy).toBe("admin-X");
    });

    it("permite re-guardar el MISMO slug/sku del propio producto (excluye id propio)", async () => {
      const cat = await makeCategory({ label: "up-self" });
      const p = await makeProduct({ categoryId: cat.id, label: "up-self-prod" });
      // Pasar el slug/sku actual no debe disparar conflicto.
      const updated = await updateProduct(
        { id: p.id, slug: p.slug, sku: p.sku, name: "renombrado" },
        null,
      );
      expect(updated.name).toBe("renombrado");
    });

    it("slug en uso por OTRO producto vivo lanza ProductValidationError(field='slug')", async () => {
      const cat = await makeCategory({ label: "up-dupslug" });
      const a = await makeProduct({ categoryId: cat.id, label: "up-a" });
      const b = await makeProduct({ categoryId: cat.id, label: "up-b" });
      await expect(updateProduct({ id: b.id, slug: a.slug }, null)).rejects.toMatchObject({
        field: "slug",
      });
    });

    it("sku en uso por OTRO producto vivo lanza ProductValidationError(field='sku')", async () => {
      const cat = await makeCategory({ label: "up-dupsku" });
      const a = await makeProduct({ categoryId: cat.id, label: "up-ska" });
      const b = await makeProduct({ categoryId: cat.id, label: "up-skb" });
      await expect(updateProduct({ id: b.id, sku: a.sku }, null)).rejects.toMatchObject({
        field: "sku",
      });
    });

    it("slug de un producto SOFT-DELETED NO bloquea el update (chequeo filtra deletedAt=null)", async () => {
      // Asimetría documentada vs createProduct. El update IGNORA el conflicto contra
      // soft-deleted en su pre-check; pero el unique de DB sigue ocupado → Prisma
      // lanzaría P2002 al persistir. Verificamos AMBOS hechos.
      const cat = await makeCategory({ label: "up-delslug" });
      const ghost = await makeProduct({
        categoryId: cat.id,
        label: "up-ghost",
        deletedAt: new Date(),
      });
      const live = await makeProduct({ categoryId: cat.id, label: "up-live" });

      // El pre-check NO lanza ProductValidationError (no es nuestro error de dominio)...
      await expect(updateProduct({ id: live.id, slug: ghost.slug }, null)).rejects.toMatchObject({
        // ...pero Prisma sí rechaza por el unique global (P2002) → no es ProductValidationError.
        code: "P2002",
      });
    });

    it("merge de physicalSpecs: actualizar weightGrams NO pisa keys existentes (material)", async () => {
      const cat = await makeCategory({ label: "up-specs" });
      const p = await makeProduct({ categoryId: cat.id, label: "up-specs-prod" });
      // Sembrar specs con una key ajena (material).
      await prisma.product.update({
        where: { id: p.id },
        data: { physicalSpecs: { material: "acrílico", weightGrams: 100 } },
      });
      const updated = await updateProduct({ id: p.id, weightGrams: 300, widthCm: 12 }, null);
      const specs = updated.physicalSpecs as Record<string, unknown>;
      expect(specs.material).toBe("acrílico"); // key ajena preservada
      expect(specs.weightGrams).toBe(300); // sobrescrita
      expect(specs.widthCm).toBe(12); // nueva
    });

    it("idealFor (Json) se actualiza correctamente", async () => {
      const cat = await makeCategory({ label: "up-idealfor" });
      const p = await makeProduct({ categoryId: cat.id, label: "up-if-prod" });
      const updated = await updateProduct(
        { id: p.id, idealFor: ["baby shower", "matrimonio"] },
        null,
      );
      expect(updated.idealFor).toEqual(["baby shower", "matrimonio"]);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // softDeleteProduct / restoreProduct / toggleProductActive
  // ════════════════════════════════════════════════════════════════════════

  describe("softDeleteProduct / restoreProduct / toggleProductActive", () => {
    it("softDeleteProduct setea deletedAt, isActive=false y deletedBy (no hard-delete)", async () => {
      const cat = await makeCategory({ label: "sd" });
      const p = await makeProduct({ categoryId: cat.id, label: "sd-prod", isActive: true });
      const deleted = await softDeleteProduct(p.id, "admin-del");
      expect(deleted.deletedAt).not.toBeNull();
      expect(deleted.isActive).toBe(false);
      expect(deleted.deletedBy).toBe("admin-del");
      // Sigue existiendo en DB (soft, no hard).
      expect(await prisma.product.count({ where: { id: p.id } })).toBe(1);
    });

    it("restoreProduct limpia deletedAt/deletedBy pero deja isActive=false (revisión manual)", async () => {
      const cat = await makeCategory({ label: "rp" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "rp-prod",
        isActive: true,
        deletedAt: new Date(),
      });
      await prisma.product.update({ where: { id: p.id }, data: { deletedBy: "someone" } });
      const restored = await restoreProduct(p.id, "admin-restore");
      expect(restored.deletedAt).toBeNull();
      expect(restored.deletedBy).toBeNull();
      expect(restored.isActive).toBe(false); // queda inactivo por seguridad
      expect(restored.updatedBy).toBe("admin-restore");
    });

    it("toggleProductActive cambia isActive sin tocar deletedAt", async () => {
      const cat = await makeCategory({ label: "tp" });
      const p = await makeProduct({ categoryId: cat.id, label: "tp-prod", isActive: false });
      const on = await toggleProductActive(p.id, true, "admin-toggle");
      expect(on.isActive).toBe(true);
      expect(on.deletedAt).toBeNull();
      expect(on.updatedBy).toBe("admin-toggle");

      const off = await toggleProductActive(p.id, false, null);
      expect(off.isActive).toBe(false);
    });

    it("toggleProductActive BLOQUEA publicar un producto sin peso/dimensiones", async () => {
      const cat = await makeCategory({ label: "tp-nodims" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "tp-nodims",
        isActive: false,
        physicalSpecs: {}, // sin dims → no cotizable
      });
      await expect(toggleProductActive(p.id, true, "admin")).rejects.toBeInstanceOf(
        ProductValidationError,
      );
      // Sigue inactivo (el update nunca corrió).
      const row = await prisma.product.findUnique({
        where: { id: p.id },
        select: { isActive: true },
      });
      expect(row!.isActive).toBe(false);
      // Desactivar un sin-dims NO se bloquea (el gate es solo al activar).
      await expect(toggleProductActive(p.id, false, null)).resolves.toMatchObject({
        isActive: false,
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // bulkUpdateProductsActive / bulkUpdateProductsFeatured
  // ════════════════════════════════════════════════════════════════════════

  describe("bulkUpdateProductsActive / bulkUpdateProductsFeatured", () => {
    it("bulkUpdateProductsActive cambia N productos vivos y devuelve el count", async () => {
      const cat = await makeCategory({ label: "bulk-act" });
      const a = await makeProduct({ categoryId: cat.id, label: "ba-a", isActive: false });
      const b = await makeProduct({ categoryId: cat.id, label: "ba-b", isActive: false });
      const res = await bulkUpdateProductsActive([a.id, b.id], true, "admin-bulk");
      expect(res.count).toBe(2);
      const rows = await prisma.product.findMany({
        where: { id: { in: [a.id, b.id] } },
        select: { isActive: true, updatedBy: true },
      });
      expect(rows.every((r) => r.isActive === true)).toBe(true);
      expect(rows.every((r) => r.updatedBy === "admin-bulk")).toBe(true);
    });

    it("bulkUpdateProductsActive EXCLUYE soft-deleted del update (no los toca, no los cuenta)", async () => {
      const cat = await makeCategory({ label: "bulk-actdel" });
      const live = await makeProduct({ categoryId: cat.id, label: "bad-live", isActive: false });
      const archived = await makeProduct({
        categoryId: cat.id,
        label: "bad-arch",
        isActive: false,
        deletedAt: new Date(),
      });
      const res = await bulkUpdateProductsActive([live.id, archived.id], true, null);
      expect(res.count).toBe(1); // solo el vivo
      const archivedRow = await prisma.product.findUnique({
        where: { id: archived.id },
        select: { isActive: true },
      });
      expect(archivedRow!.isActive).toBe(false); // intacto
    });

    it("bulkUpdateProductsActive con lista vacía es noop (count 0, sin query)", async () => {
      const res = await bulkUpdateProductsActive([], true, null);
      expect(res).toEqual({ count: 0 });
    });

    it("bulkUpdateProductsActive BLOQUEA si ALGÚN producto del lote no tiene dims", async () => {
      const cat = await makeCategory({ label: "bulk-nodims" });
      const ok = await makeProduct({ categoryId: cat.id, label: "bnd-ok", isActive: false });
      const bad = await makeProduct({
        categoryId: cat.id,
        label: "bnd-bad",
        isActive: false,
        physicalSpecs: {},
      });
      await expect(bulkUpdateProductsActive([ok.id, bad.id], true, null)).rejects.toBeInstanceOf(
        ProductValidationError,
      );
      // Nada se activó (el gate corre ANTES del updateMany).
      const rows = await prisma.product.findMany({
        where: { id: { in: [ok.id, bad.id] } },
        select: { isActive: true },
      });
      expect(rows.every((r) => r.isActive === false)).toBe(true);
    });

    it("bulkUpdateProductsFeatured destaca N productos y devuelve el count", async () => {
      const cat = await makeCategory({ label: "bulk-feat" });
      const a = await makeProduct({ categoryId: cat.id, label: "bf-a", isFeatured: false });
      const b = await makeProduct({ categoryId: cat.id, label: "bf-b", isFeatured: false });
      const res = await bulkUpdateProductsFeatured([a.id, b.id], true, "admin-feat");
      expect(res.count).toBe(2);
      const rows = await prisma.product.findMany({
        where: { id: { in: [a.id, b.id] } },
        select: { isFeatured: true },
      });
      expect(rows.every((r) => r.isFeatured === true)).toBe(true);
    });

    it("bulkUpdateProductsFeatured con lista vacía es noop (count 0)", async () => {
      expect(await bulkUpdateProductsFeatured([], true, null)).toEqual({ count: 0 });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // listCategoriesForSelect — jerarquía
  // ════════════════════════════════════════════════════════════════════════

  describe("listCategoriesForSelect", () => {
    it("ordena padre primero y luego sus hijos indentados (isSub), excluye inactivas/archivadas", async () => {
      // Padre con 2 hijas; una categoría inactiva y una archivada (deben excluirse).
      const parent = await makeCategory({
        label: "lcs-parent",
        name: `${RUN}-ParentCat`,
        order: 0,
        isActive: true,
      });
      const childB = await makeCategory({
        label: "lcs-childb",
        name: `${RUN}-ChildB`,
        parentId: parent.id,
        order: 2,
        isActive: true,
      });
      const childA = await makeCategory({
        label: "lcs-childa",
        name: `${RUN}-ChildA`,
        parentId: parent.id,
        order: 1,
        isActive: true,
      });
      const inactive = await makeCategory({
        label: "lcs-inactive",
        name: `${RUN}-InactiveCat`,
        isActive: false,
      });
      const archived = await makeCategory({
        label: "lcs-archived",
        name: `${RUN}-ArchivedCat`,
        deletedAt: new Date(),
      });

      const list = await listCategoriesForSelect();
      const ours = list.filter((c) => c.name.startsWith(RUN));
      const ids = ours.map((c) => c.id);

      // Inactiva y archivada NO aparecen.
      expect(ids).not.toContain(inactive.id);
      expect(ids).not.toContain(archived.id);

      // El padre aparece antes que sus hijos, y los hijos justo después en orden 'order'.
      const parentIdx = ids.indexOf(parent.id);
      const childAIdx = ids.indexOf(childA.id);
      const childBIdx = ids.indexOf(childB.id);
      expect(parentIdx).toBeGreaterThanOrEqual(0);
      expect(parentIdx).toBeLessThan(childAIdx);
      expect(childAIdx).toBeLessThan(childBIdx); // childA (order 1) antes que childB (order 2)

      // Flags isSub.
      expect(ours.find((c) => c.id === parent.id)!.isSub).toBe(false);
      expect(ours.find((c) => c.id === childA.id)!.isSub).toBe(true);
      expect(ours.find((c) => c.id === childB.id)!.isSub).toBe(true);
    });

    it("sub-categoría huérfana (padre archivado) cae al final como isSub=true", async () => {
      // Padre archivado (no aparece en raw) + hija activa cuyo parentId apunta a él.
      const orphanParent = await makeCategory({
        label: "lcs-oparent",
        name: `${RUN}-OrphanParent`,
        deletedAt: new Date(),
      });
      const orphanChild = await makeCategory({
        label: "lcs-ochild",
        name: `${RUN}-OrphanChild`,
        parentId: orphanParent.id,
        isActive: true,
      });

      const list = await listCategoriesForSelect();
      const entry = list.find((c) => c.id === orphanChild.id);
      // La huérfana SÍ aparece (no se pierde) y se marca como sub.
      expect(entry).toBeDefined();
      expect(entry!.isSub).toBe(true);
      // El padre archivado no aparece.
      expect(list.find((c) => c.id === orphanParent.id)).toBeUndefined();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // listVariantsByProduct / getVariantById
  // ════════════════════════════════════════════════════════════════════════

  describe("listVariantsByProduct / getVariantById", () => {
    it("listVariantsByProduct devuelve NO archivadas ordenadas por createdAt asc", async () => {
      const cat = await makeCategory({ label: "lv" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "lv-prod",
        variants: [
          { name: "First", skuSuffix: "F", price: 1_000 },
          { name: "Second", skuSuffix: "S", price: 2_000 },
          { name: "Archived", skuSuffix: "ARCH", price: 3_000, deletedAt: new Date() },
        ],
      });
      const variants = await listVariantsByProduct(p.id);
      // Solo las 2 no archivadas.
      expect(variants).toHaveLength(2);
      expect(variants.map((v) => v.name)).toEqual(["First", "Second"]); // orden createdAt
      expect(variants.every((v) => v.deletedAt === null)).toBe(true);
    });

    it("getVariantById devuelve la variante con su producto embebido; null si archivada o inexistente", async () => {
      const cat = await makeCategory({ label: "gv" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "gv-prod",
        variants: [
          { name: "Live", skuSuffix: "LIVE", price: 5_000 },
          { name: "Archived", skuSuffix: "ARCH", price: 6_000, deletedAt: new Date() },
        ],
      });
      const live = p.variants.find((v) => v.name === "Live")!;
      const archived = p.variants.find((v) => v.name === "Archived")!;

      const found = await getVariantById(live.id);
      expect(found).not.toBeNull();
      expect(found!.product.id).toBe(p.id);
      expect(found!.product.slug).toBe(p.slug);

      // Archivada → null (filtro deletedAt:null).
      expect(await getVariantById(archived.id)).toBeNull();
      // Inexistente → null.
      expect(await getVariantById(`${RUN}-no-variant`)).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // syncProductBasePrice
  // ════════════════════════════════════════════════════════════════════════

  describe("syncProductBasePrice", () => {
    it("fija basePrice = mín precio entre variantes ACTIVAS con price propio", async () => {
      const cat = await makeCategory({ label: "sync" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "sync-prod",
        basePrice: 99_999,
        variants: [
          { name: "Mid", skuSuffix: "MID", price: 7_000, isActive: true },
          { name: "Cheap", skuSuffix: "CHEAP", price: 3_000, isActive: true },
        ],
      });
      await syncProductBasePrice(p.id);
      const row = await prisma.product.findUnique({
        where: { id: p.id },
        select: { basePrice: true },
      });
      expect(row!.basePrice).toBe(3_000);
    });

    it("IGNORA variantes inactivas y archivadas al elegir el mínimo", async () => {
      const cat = await makeCategory({ label: "sync-ignore" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "sync-ig-prod",
        basePrice: 50_000,
        variants: [
          { name: "Active", skuSuffix: "ACT", price: 8_000, isActive: true },
          { name: "InactiveCheaper", skuSuffix: "INA", price: 2_000, isActive: false },
          {
            name: "ArchivedCheapest",
            skuSuffix: "ARCH",
            price: 500,
            isActive: true,
            deletedAt: new Date(),
          },
        ],
      });
      await syncProductBasePrice(p.id);
      const row = await prisma.product.findUnique({
        where: { id: p.id },
        select: { basePrice: true },
      });
      // Solo la activa-no-archivada (8000) cuenta. Ignora 2000 (inactiva) y 500 (archivada).
      expect(row!.basePrice).toBe(8_000);
    });

    it("NO pisa basePrice cuando ninguna variante activa tiene price propio (todas null)", async () => {
      const cat = await makeCategory({ label: "sync-nullprices" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "sync-null-prod",
        basePrice: 12_345,
        variants: [{ name: "Default", skuSuffix: "DEFAULT", price: null, isActive: true }],
      });
      await syncProductBasePrice(p.id);
      const row = await prisma.product.findUnique({
        where: { id: p.id },
        select: { basePrice: true },
      });
      expect(row!.basePrice).toBe(12_345); // fallback: no se toca
    });

    it("denormaliza compareAtPrice de la opción más barata SOLO si es promo válida (> price)", async () => {
      const cat = await makeCategory({ label: "sync-cmp" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "sync-cmp-prod",
        basePrice: 99_999,
        variants: [
          {
            name: "Promo",
            skuSuffix: "PROMO",
            price: 6_000,
            compareAtPrice: 10_000,
            isActive: true,
          },
        ],
      });
      await syncProductBasePrice(p.id);
      const row = await prisma.product.findUnique({
        where: { id: p.id },
        select: { basePrice: true, compareAtPrice: true },
      });
      expect(row!.basePrice).toBe(6_000);
      expect(row!.compareAtPrice).toBe(10_000); // 10000 > 6000 → promo válida
    });

    it("limpia compareAtPrice a null cuando la promo NO es válida (<= price)", async () => {
      const cat = await makeCategory({ label: "sync-cmpinv" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "sync-cmpinv-prod",
        basePrice: 99_999,
        variants: [
          {
            name: "BadPromo",
            skuSuffix: "BAD",
            price: 6_000,
            compareAtPrice: 5_000,
            isActive: true,
          },
        ],
      });
      // Sembrar un compareAtPrice previo para confirmar que se limpia.
      await prisma.product.update({ where: { id: p.id }, data: { compareAtPrice: 20_000 } });
      await syncProductBasePrice(p.id);
      const row = await prisma.product.findUnique({
        where: { id: p.id },
        select: { compareAtPrice: true },
      });
      expect(row!.compareAtPrice).toBeNull(); // 5000 <= 6000 → no es promo → null
    });

    it("es idempotente: llamarlo dos veces deja el mismo basePrice", async () => {
      const cat = await makeCategory({ label: "sync-idem" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "sync-idem-prod",
        basePrice: 99_999,
        variants: [{ name: "Only", skuSuffix: "ONLY", price: 4_500, isActive: true }],
      });
      await syncProductBasePrice(p.id);
      await syncProductBasePrice(p.id);
      const row = await prisma.product.findUnique({
        where: { id: p.id },
        select: { basePrice: true },
      });
      expect(row!.basePrice).toBe(4_500);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // createVariant / updateVariant
  // ════════════════════════════════════════════════════════════════════════

  describe("createVariant / updateVariant", () => {
    it("createVariant inserta la variante y re-sincroniza el basePrice del producto", async () => {
      const cat = await makeCategory({ label: "cv" });
      // Producto con basePrice alto y default null → al crear una variante con price
      // 4000, syncProductBasePrice debe bajar el basePrice a 4000.
      const p = await makeProduct({
        categoryId: cat.id,
        label: "cv-prod",
        basePrice: 80_000,
        variants: [{ name: "Default", skuSuffix: "DEFAULT", price: null }],
      });
      const created = await createVariant(
        {
          productId: p.id,
          name: "Set 6",
          sku: `${SKU_RUN}-CV-NEW-${uniq()}`.toUpperCase(),
          price: 4_000,
          compareAtPrice: null,
          stock: 10,
          isActive: true,
          attributes: {},
        },
        "admin-cv",
      );
      expect(created.name).toBe("Set 6");
      expect(created.price).toBe(4_000);
      expect(created.createdBy).toBe("admin-cv");

      const row = await prisma.product.findUnique({
        where: { id: p.id },
        select: { basePrice: true },
      });
      expect(row!.basePrice).toBe(4_000); // sync corrió
    });

    it("createVariant con SKU duplicado lanza VariantValidationError(field='sku')", async () => {
      const cat = await makeCategory({ label: "cv-dup" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "cv-dup-prod",
        variants: [{ name: "Existing", skuSuffix: "EXIST", price: 1_000 }],
      });
      const existingSku = p.variants[0].sku;
      await expect(
        createVariant(
          {
            productId: p.id,
            name: "Clash",
            sku: existingSku,
            price: 2_000,
            compareAtPrice: null,
            stock: 0,
            isActive: true,
            attributes: {},
          },
          null,
        ),
      ).rejects.toMatchObject({ name: "VariantValidationError", field: "sku" });
    });

    it("updateVariant cambia campos, re-sincroniza basePrice y setea updatedBy", async () => {
      const cat = await makeCategory({ label: "uv" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "uv-prod",
        basePrice: 9_000,
        variants: [{ name: "V", skuSuffix: "V", price: 9_000, isActive: true }],
      });
      const variant = p.variants[0];
      const updated = await updateVariant({ id: variant.id, price: 2_500 }, "admin-uv");
      expect(updated.price).toBe(2_500);
      expect(updated.updatedBy).toBe("admin-uv");
      const row = await prisma.product.findUnique({
        where: { id: p.id },
        select: { basePrice: true },
      });
      expect(row!.basePrice).toBe(2_500); // sync corrió tras update
    });

    it("updateVariant con SKU de OTRA variante viva lanza VariantValidationError(field='sku')", async () => {
      const cat = await makeCategory({ label: "uv-dup" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "uv-dup-prod",
        variants: [
          { name: "A", skuSuffix: "A", price: 1_000 },
          { name: "B", skuSuffix: "B", price: 2_000 },
        ],
      });
      const a = p.variants.find((v) => v.name === "A")!;
      const b = p.variants.find((v) => v.name === "B")!;
      await expect(updateVariant({ id: b.id, sku: a.sku }, null)).rejects.toMatchObject({
        field: "sku",
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // softDeleteVariant — protección de la última variante
  // ════════════════════════════════════════════════════════════════════════

  describe("softDeleteVariant", () => {
    it("archiva una variante (deletedAt + isActive=false) cuando NO es la única, y re-sincroniza basePrice", async () => {
      const cat = await makeCategory({ label: "sdv" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "sdv-prod",
        basePrice: 99_999,
        variants: [
          { name: "Cheap", skuSuffix: "CHEAP", price: 2_000, isActive: true },
          { name: "Expensive", skuSuffix: "EXP", price: 9_000, isActive: true },
        ],
      });
      const cheap = p.variants.find((v) => v.name === "Cheap")!;
      // basePrice tras crear queda en el mín explícito (2000) si sync corrió en make? No —
      // makeProduct NO llama sync. Lo dejamos como está; el delete sí dispara sync.
      const deleted = await softDeleteVariant(cheap.id, "admin-sdv");
      expect(deleted.deletedAt).not.toBeNull();
      expect(deleted.isActive).toBe(false);
      expect(deleted.deletedBy).toBe("admin-sdv");

      // Tras archivar la barata, sync recalcula basePrice = mín de las vivas = 9000.
      const row = await prisma.product.findUnique({
        where: { id: p.id },
        select: { basePrice: true },
      });
      expect(row!.basePrice).toBe(9_000);

      // Sigue existiendo (soft).
      const stillThere = await prisma.productVariant.findUnique({ where: { id: cheap.id } });
      expect(stillThere).not.toBeNull();
    });

    it("rechaza archivar la ÚNICA variante no-archivada del producto", async () => {
      const cat = await makeCategory({ label: "sdv-last" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "sdv-last-prod",
        variants: [{ name: "Only", skuSuffix: "ONLY", price: 1_000 }],
      });
      const only = p.variants[0];
      await expect(softDeleteVariant(only.id, null)).rejects.toMatchObject({
        name: "VariantValidationError",
        field: "general",
      });
      // No se archivó.
      const row = await prisma.productVariant.findUnique({
        where: { id: only.id },
        select: { deletedAt: true },
      });
      expect(row!.deletedAt).toBeNull();
    });

    it("lanza error si la variante no existe o ya está archivada", async () => {
      const cat = await makeCategory({ label: "sdv-ghost" });
      const p = await makeProduct({
        categoryId: cat.id,
        label: "sdv-ghost-prod",
        variants: [
          { name: "Live", skuSuffix: "LIVE", price: 1_000 },
          { name: "Already", skuSuffix: "ALR", price: 2_000, deletedAt: new Date() },
        ],
      });
      const already = p.variants.find((v) => v.name === "Already")!;
      // Variante inexistente.
      await expect(softDeleteVariant(`${RUN}-no-variant`, null)).rejects.toMatchObject({
        field: "general",
      });
      // Variante ya archivada.
      await expect(softDeleteVariant(already.id, null)).rejects.toMatchObject({ field: "general" });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Errores de dominio — forma
  // ════════════════════════════════════════════════════════════════════════

  describe("ProductValidationError / VariantValidationError", () => {
    it("ProductValidationError es Error con name, field y message", () => {
      const e = new ProductValidationError("slug", "Slug ya existe");
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe("ProductValidationError");
      expect(e.field).toBe("slug");
      expect(e.message).toBe("Slug ya existe");
    });

    it("VariantValidationError es Error con name, field y message", () => {
      const e = new VariantValidationError("sku", "SKU ya existe");
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe("VariantValidationError");
      expect(e.field).toBe("sku");
      expect(e.message).toBe("SKU ya existe");
    });
  });
});
