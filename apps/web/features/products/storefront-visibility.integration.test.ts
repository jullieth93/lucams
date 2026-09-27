/*
 * Integración del GATE DE VISIBILIDAD STOREFRONT (F-04 / A4-02, cert 2026-09-26)
 * — verifica que AMBOS stacks de catálogo aplican el predicado compartido
 * STOREFRONT_PRODUCT_WHERE de storefront-visibility.ts:
 *
 *   Stack SSR (features/products/public-service.ts):
 *     listStorefrontProducts / getStorefrontProductBySlug
 *   Stack AI-ready (lib/catalog.ts — /ocasion, cross-sell, recomendador, bot):
 *     listCatalogProducts / getCatalogProductDetail / searchCatalog /
 *     recommendProducts / getCategoryTree / getCategoryBySlug
 *
 * Escenario raíz del finding: admin desactiva o archiva una CATEGORÍA con
 * productos activos → esos productos desaparecen de TODAS las superficies
 * cliente (antes el stack B los seguía sirviendo: card fantasma → PDP 404).
 *
 * `lib/catalog.ts` envuelve casi todo en `unstable_cache`; fuera de un request
 * real eso lanza `Invariant: incrementalCache missing`, así que se mockea
 * `next/cache` con passthrough (mismo patrón que lib/catalog.integration.test.ts).
 *
 * Requiere DATABASE_URL (Supabase local); sin DB se salta (skipIf).
 * Aislamiento: todo fixture con prefijo RUN; limpieza scoped en afterAll.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getStorefrontProductBySlug, listStorefrontProducts } from "./public-service";
import {
  getCatalogProductDetail,
  getCategoryBySlug,
  getCategoryTree,
  listCatalogProducts,
  recommendProducts,
  searchCatalog,
} from "@/lib/catalog";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `gate${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;

let activeCatId = "";
let activeCatSlug = "";
let inactiveCatSlug = "";
let archivedCatSlug = "";
let okSlug = "";
let ghostInactiveSlug = "";
let ghostArchivedSlug = "";
let ocasionId = "";

describe.skipIf(!hasDb)("storefront visibility gate — ambos stacks (F-04)", { timeout: T }, () => {
  beforeAll(async () => {
    const activeCat = await prisma.category.create({
      data: { slug: `${RUN}-activa`, name: `Activa ${RUN}` },
    });
    activeCatId = activeCat.id;
    activeCatSlug = activeCat.slug;
    const inactiveCat = await prisma.category.create({
      data: { slug: `${RUN}-pausada`, name: `Pausada ${RUN}`, isActive: false },
    });
    inactiveCatSlug = inactiveCat.slug;
    const archivedCat = await prisma.category.create({
      data: { slug: `${RUN}-archivada`, name: `Archivada ${RUN}`, deletedAt: new Date() },
    });
    archivedCatSlug = archivedCat.slug;

    const ocasion = await prisma.ocasionTag.create({
      data: { slug: `${RUN}-oc`, name: `Ocasión ${RUN}`, description: "fixture del gate" },
    });
    ocasionId = ocasion.id;

    const mk = (categoryId: string, slug: string) =>
      prisma.product.create({
        data: {
          slug,
          name: `Fotoimán Gate ${RUN}`,
          description: `fixture gate ${slug}`,
          basePrice: 10_000,
          sku: slug.toUpperCase(),
          categoryId,
          ocasionTags: { create: [{ ocasionTagId: ocasionId }] },
        },
        select: { slug: true },
      });

    okSlug = (await mk(activeCatId, `${RUN}-ok`)).slug;
    ghostInactiveSlug = (await mk(inactiveCat.id, `${RUN}-ghost-pausada`)).slug;
    ghostArchivedSlug = (await mk(archivedCat.id, `${RUN}-ghost-archivada`)).slug;
  }, T);

  afterAll(async () => {
    await prisma.productOcasionTag.deleteMany({ where: { ocasionTagId: ocasionId } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: RUN } } });
    await prisma.ocasionTag.deleteMany({ where: { slug: { startsWith: RUN } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: RUN } } });
  }, T);

  describe("stack SSR (features/products/public-service)", () => {
    it("listStorefrontProducts excluye productos de categorías pausadas/archivadas", async () => {
      const slugs = (await listStorefrontProducts({ limit: 200 })).map((p) => p.slug);
      expect(slugs).toContain(okSlug);
      expect(slugs).not.toContain(ghostInactiveSlug);
      expect(slugs).not.toContain(ghostArchivedSlug);
    });

    it("getStorefrontProductBySlug devuelve null para producto de categoría pausada/archivada", async () => {
      expect(await getStorefrontProductBySlug(okSlug)).not.toBeNull();
      expect(await getStorefrontProductBySlug(ghostInactiveSlug)).toBeNull();
      expect(await getStorefrontProductBySlug(ghostArchivedSlug)).toBeNull();
    });
  });

  describe("stack AI-ready (lib/catalog)", () => {
    it("listCatalogProducts excluye productos de categorías pausadas/archivadas", async () => {
      const slugs = (await listCatalogProducts({ limit: 200 })).map((p) => p.slug);
      expect(slugs).toContain(okSlug);
      expect(slugs).not.toContain(ghostInactiveSlug);
      expect(slugs).not.toContain(ghostArchivedSlug);
    });

    it("listCatalogProducts con filtro por la categoría pausada/archivada devuelve 0", async () => {
      expect(await listCatalogProducts({ categorySlug: inactiveCatSlug, limit: 50 })).toEqual([]);
      expect(await listCatalogProducts({ categorySlug: archivedCatSlug, limit: 50 })).toEqual([]);
    });

    it("getCatalogProductDetail devuelve null para producto de categoría pausada/archivada", async () => {
      expect(await getCatalogProductDetail(okSlug)).not.toBeNull();
      expect(await getCatalogProductDetail(ghostInactiveSlug)).toBeNull();
      expect(await getCatalogProductDetail(ghostArchivedSlug)).toBeNull();
    });

    it("searchCatalog no devuelve productos de categorías pausadas/archivadas", async () => {
      const results = await searchCatalog(`Fotoimán Gate ${RUN}`, 20);
      const slugs = results.map((r) => r.slug);
      expect(slugs).toContain(okSlug);
      expect(slugs).not.toContain(ghostInactiveSlug);
      expect(slugs).not.toContain(ghostArchivedSlug);
    });

    it("recommendProducts no recomienda productos de categorías pausadas/archivadas", async () => {
      // Los 3 productos están tagueados con la ocasión (+3 → superan el cutoff);
      // solo el de categoría activa puede aparecer.
      const recs = await recommendProducts({ ocasionSlugs: [`${RUN}-oc`] });
      const slugs = recs.map((r) => r.slug);
      expect(slugs).toContain(okSlug);
      expect(slugs).not.toContain(ghostInactiveSlug);
      expect(slugs).not.toContain(ghostArchivedSlug);
    });

    it("getCategoryTree omite categorías pausadas/archivadas aunque tengan productos activos", async () => {
      const tree = await getCategoryTree();
      const slugs = tree.map((c) => c.slug);
      expect(slugs).toContain(activeCatSlug);
      expect(slugs).not.toContain(inactiveCatSlug);
      expect(slugs).not.toContain(archivedCatSlug);
    });

    it("getCategoryBySlug devuelve null para categoría pausada/archivada", async () => {
      expect(await getCategoryBySlug(activeCatSlug)).not.toBeNull();
      expect(await getCategoryBySlug(inactiveCatSlug)).toBeNull();
      expect(await getCategoryBySlug(archivedCatSlug)).toBeNull();
    });
  });
});
