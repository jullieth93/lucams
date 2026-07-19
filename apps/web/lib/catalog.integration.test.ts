/*
 * Tests de integración del MÓDULO DE CATÁLOGO (`@/lib/catalog`) contra la DB real.
 *
 * `lib/catalog.ts` centraliza las queries Prisma del storefront (listados,
 * filtros, agregaciones, recomendaciones, búsqueda). La mayoría de funciones
 * están envueltas en `unstable_cache` de `next/cache`; fuera de un request real
 * de Next eso lanza `Invariant: incrementalCache missing`. Por eso, igual que
 * `features/checkout/service.integration.test.ts`, mockeamos `next/cache` con un
 * `unstable_cache` passthrough → la lógica Prisma corre tal cual contra la DB.
 *
 * Cobertura:
 *   - getCategoryTree / getCategoryBySlug: árbol jerárquico, soft-delete,
 *     productCount (solo productos activos no borrados), desempate order+name,
 *     hijos activos, categoría inexistente/borrada.
 *   - listCatalogProducts: filtro categoría padre↔hija (OR), sub-categoría,
 *     ocasión, personalización, rango de precio post-fetch (sobre minPrice),
 *     sort (recent/price_asc/price_desc/featured), paginación (take/skip),
 *     exclusión de inactivos/borrados, agregación minPrice/maxPrice/variantCount.
 *   - getCatalogProductDetail: detalle con variantes/templates/ocasiones,
 *     inactivo/borrado/inexistente → null, idealFor/physicalSpecs defensivos.
 *   - listOcasiones / getOcasionBySlug: orden, activo, soft-delete, productCount.
 *   - recommendProducts: scoring sin ML (ocasión +3, destinatario +2, precio +1,
 *     preferencia +1, featured +0.5), cutoff > 2, exclusión, orden por score, limit.
 *   - getCatalogFilters: facets (sub-cats, ocasiones, priceRange, personalización),
 *     contexto vacío, totalProducts.
 *   - searchCatalog: pg_trgm fuzzy, query < 2 chars → [], unaccent, ranking.
 *   - listTemplatesByProduct: filtro por mode, producto inexistente → [], orden.
 *   - listPublicCoupons: solo públicos+activos+vigentes (ventana validFrom/validTo).
 *   - getRelatedProducts: scoring 3 capas (ocasión > sub-cat > cat), excluye actual.
 *
 * Requiere DATABASE_URL (corre vía `dotenv -e .env.local -- vitest`). Sin DB se
 * salta (skipIf) para no romper CI sin DB.
 *
 * Aislamiento: TODA fila lleva el prefijo RUN único por corrida. La limpieza en
 * afterAll está SCOPED a ese prefijo (categoría raíz de la corrida) — JAMÁS toca
 * datos reales (seed, cuenta de Lucy).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ───────────────────────── Mock next/cache (antes de importar el SUT) ─────────────────────────
// unstable_cache passthrough: ejecuta el callback directo, sin incremental cache.
// Espeja el patrón de features/checkout/service.integration.test.ts.
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
import {
  getCategoryTree,
  getCategoryBySlug,
  listCatalogProducts,
  getCatalogProductDetail,
  listOcasiones,
  getOcasionBySlug,
  recommendProducts,
  getCatalogFilters,
  searchCatalog,
  listTemplatesByProduct,
  listPublicCoupons,
  getRelatedProducts,
} from "./catalog";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Toda fila creada lo lleva → limpieza scoped.
const RUN = `cat${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

// Timeout generoso: el pooler de Supabase (pgbouncer :6543) es lento bajo
// concurrencia. Espeja los otros .integration.test.ts.
const T = 30_000;

// ───────────────────────── IDs de fixtures (se llenan en beforeAll) ─────────────────────────

// Categoría raíz de ESTA corrida — todo el árbol cuelga de acá; cleanup la usa
// como ancla scoped.
let rootCatId = "";
let rootCatSlug = "";
// Dos sub-categorías de la raíz.
let subA_Id = "";
let subA_Slug = "";
let subB_Id = "";
let subB_Slug = "";
// Categoría hermana de la raíz (otro árbol top-level) para aislar filtros.
let siblingCatId = "";
let _siblingCatSlug = "";
// Categoría soft-deleted (no debe aparecer en el árbol).
let deletedCatSlug = "";

// Ocasiones.
let ocasionMatrimonioId = "";
let ocasionMatrimonioSlug = "";
let ocasionCumpleId = "";
let ocasionCumpleSlug = "";
let ocasionInactivaSlug = "";
let ocasionDeletedSlug = "";

// Productos. Todos cuelgan de sub-categorías de la raíz salvo donde se indique.
// p1: subA, personalizable, featured, basePrice 10000, 2 variantes con price → minPrice 8000.
let p1Slug = "";
const P1_BASE = 10_000;
const P1_VAR_MIN = 8_000;
const P1_VAR_MAX = 22_000;
// p2: subA, NO personalizable (NONE), basePrice 30000, sin variantes con price → min/max = base.
let p2Slug = "";
const P2_BASE = 30_000;
// p3: subB, personalizable, basePrice 50000, ocasión cumpleaños.
let p3Slug = "";
const P3_BASE = 50_000;
// p4: sibling category, basePrice 5000 — NO debe aparecer al filtrar por la raíz.
let p4Slug = "";
// pInactive: subA, isActive=false.
let pInactiveSlug = "";
// pDeleted: subA, deletedAt set.
let pDeletedSlug = "";

// Template activo y premade sobre p1.
let p1Id = "";

// ───────────────────────── helpers ─────────────────────────

function _uniq(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

describe.skipIf(!hasDb)("lib/catalog — integración DB", { timeout: T }, () => {
  beforeAll(async () => {
    // ── Árbol de categorías ──
    const root = await prisma.category.create({
      data: { slug: `${RUN}-root`, name: `ZZ Root ${RUN}`, order: 0 },
    });
    rootCatId = root.id;
    rootCatSlug = root.slug;

    // Sub A — order 5, name "Beta" ; Sub B — order 5, name "Alfa".
    // Mismo `order` → el desempate por name debe poner "Alfa" (B) antes que "Beta" (A).
    const subA = await prisma.category.create({
      data: { slug: `${RUN}-sub-a`, name: `Beta ${RUN}`, parentId: rootCatId, order: 5 },
    });
    subA_Id = subA.id;
    subA_Slug = subA.slug;
    const subB = await prisma.category.create({
      data: { slug: `${RUN}-sub-b`, name: `Alfa ${RUN}`, parentId: rootCatId, order: 5 },
    });
    subB_Id = subB.id;
    subB_Slug = subB.slug;

    // Categoría hermana top-level (otro árbol).
    const sibling = await prisma.category.create({
      data: { slug: `${RUN}-sibling`, name: `YY Sibling ${RUN}`, order: 1 },
    });
    siblingCatId = sibling.id;
    _siblingCatSlug = sibling.slug;

    // Sub-categoría soft-deleted bajo la raíz (no debe aparecer en el árbol).
    const deletedCat = await prisma.category.create({
      data: {
        slug: `${RUN}-sub-deleted`,
        name: `Deleted ${RUN}`,
        parentId: rootCatId,
        deletedAt: new Date(),
      },
    });
    deletedCatSlug = deletedCat.slug;

    // ── Ocasiones ──
    const ocasionMatrimonio = await prisma.ocasionTag.create({
      data: {
        slug: `${RUN}-matrimonio`,
        name: `Matrimonio ${RUN}`,
        description: "Bodas y aniversarios",
        order: 1,
        monthHint: 6,
        suggestedQuantityRange: { min: 30, ideal: 60, max: 120 },
      },
    });
    ocasionMatrimonioId = ocasionMatrimonio.id;
    ocasionMatrimonioSlug = ocasionMatrimonio.slug;

    const ocasionCumple = await prisma.ocasionTag.create({
      data: {
        slug: `${RUN}-cumple`,
        name: `Cumpleaños ${RUN}`,
        description: "Celebración de cumpleaños",
        order: 2,
      },
    });
    ocasionCumpleId = ocasionCumple.id;
    ocasionCumpleSlug = ocasionCumple.slug;

    const ocasionInactiva = await prisma.ocasionTag.create({
      data: {
        slug: `${RUN}-inactiva`,
        name: `Inactiva ${RUN}`,
        description: "no listada",
        isActive: false,
        order: 3,
      },
    });
    ocasionInactivaSlug = ocasionInactiva.slug;

    const ocasionDeleted = await prisma.ocasionTag.create({
      data: {
        slug: `${RUN}-oc-deleted`,
        name: `OcDeleted ${RUN}`,
        description: "borrada",
        deletedAt: new Date(),
        order: 4,
      },
    });
    ocasionDeletedSlug = ocasionDeleted.slug;

    // ── Productos ──
    // p1: subA, personalizable PHOTO_PACK, featured, ocasión matrimonio.
    // basePrice 10000; variantes con price 8000 y 22000 → minPrice 8000, maxPrice 22000.
    const p1 = await prisma.product.create({
      data: {
        slug: `${RUN}-p1-fotoiman-corazon`,
        name: `Fotoimán Corazón ${RUN}`,
        description: "Imán de corazón con tu foto",
        richDescription: "Fotoimán en forma de corazón ideal para recuerdos de boda y matrimonio.",
        basePrice: P1_BASE,
        compareAtPrice: 15_000,
        sku: `${RUN}-P1`.toUpperCase(),
        categoryId: subA_Id,
        isPersonalizable: true,
        personalizationKind: "PHOTO_PACK",
        isFeatured: true,
        idealFor: ["regalo pareja aniversario", "recuerdo matrimonio"],
        images: ["https://cdn.lucams.test/p1.png"],
        warrantyMonths: 12,
        productionDays: 3,
        variants: {
          create: [
            {
              name: "Set 6",
              sku: `${RUN}-P1-A`.toUpperCase(),
              price: P1_VAR_MIN,
              stock: 50,
              attributes: {},
            },
            {
              name: "Set 12",
              sku: `${RUN}-P1-B`.toUpperCase(),
              price: P1_VAR_MAX,
              stock: 50,
              attributes: {},
            },
          ],
        },
        ocasionTags: {
          create: [{ ocasionTagId: ocasionMatrimonioId, rationale: "Perfecto para los novios" }],
        },
      },
      select: { id: true, slug: true },
    });
    p1Id = p1.id;
    p1Slug = p1.slug;

    // p2: subA, NO personalizable (NONE), sin variantes con price → min/max = basePrice.
    const p2 = await prisma.product.create({
      data: {
        slug: `${RUN}-p2-coleccionable`,
        name: `Coleccionable Premium ${RUN}`,
        description: "Imán coleccionable prearmado",
        basePrice: P2_BASE,
        sku: `${RUN}-P2`.toUpperCase(),
        categoryId: subA_Id,
        personalizationKind: "NONE",
        isPersonalizable: false,
        idealFor: ["decoración cocina"],
        // Variante sin price → cae a basePrice en la agregación.
        variants: {
          create: [
            {
              name: "Único",
              sku: `${RUN}-P2-A`.toUpperCase(),
              price: null,
              stock: 10,
              attributes: {},
            },
          ],
        },
      },
      select: { slug: true },
    });
    p2Slug = p2.slug;

    // p3: subB, personalizable, ocasión cumpleaños, basePrice 50000.
    const p3 = await prisma.product.create({
      data: {
        slug: `${RUN}-p3-cuadro`,
        name: `Cuadro con Foto ${RUN}`,
        description: "Cuadro magnético con tu foto",
        basePrice: P3_BASE,
        sku: `${RUN}-P3`.toUpperCase(),
        categoryId: subB_Id,
        personalizationKind: "CUSTOM_DECOR",
        isPersonalizable: true,
        idealFor: ["regalo cumpleaños amigo"],
        ocasionTags: {
          create: [{ ocasionTagId: ocasionCumpleId, rationale: "Detalle de cumpleaños" }],
        },
      },
      select: { slug: true },
    });
    p3Slug = p3.slug;

    // p4: categoría hermana (NO debe aparecer al filtrar por la raíz).
    const p4 = await prisma.product.create({
      data: {
        slug: `${RUN}-p4-otro`,
        name: `Producto Hermano ${RUN}`,
        description: "Producto en otro árbol",
        basePrice: 5_000,
        sku: `${RUN}-P4`.toUpperCase(),
        categoryId: siblingCatId,
        personalizationKind: "NONE",
      },
      select: { slug: true },
    });
    p4Slug = p4.slug;

    // pInactive: subA, isActive=false.
    const pInactive = await prisma.product.create({
      data: {
        slug: `${RUN}-p-inactive`,
        name: `Inactivo ${RUN}`,
        description: "no comprable",
        basePrice: 9_000,
        sku: `${RUN}-PINACTIVE`.toUpperCase(),
        categoryId: subA_Id,
        isActive: false,
      },
      select: { slug: true },
    });
    pInactiveSlug = pInactive.slug;

    // pDeleted: subA, soft-deleted.
    const pDeleted = await prisma.product.create({
      data: {
        slug: `${RUN}-p-deleted`,
        name: `Borrado ${RUN}`,
        description: "soft-deleted",
        basePrice: 9_500,
        sku: `${RUN}-PDELETED`.toUpperCase(),
        categoryId: subA_Id,
        deletedAt: new Date(),
      },
      select: { slug: true },
    });
    pDeletedSlug = pDeleted.slug;

    // ── Templates sobre p1 ──
    await prisma.personalizationTemplate.create({
      data: {
        productId: p1Id,
        kind: "PHOTO_PACK",
        mode: "EDITABLE",
        name: `Polaroid ${RUN}`,
        slug: `${RUN}-tpl-editable`,
        previewUrl: "https://cdn.lucams.test/tpl-editable.png",
        canvasData: {},
        order: 1,
        isActive: true,
      },
    });
    await prisma.personalizationTemplate.create({
      data: {
        productId: p1Id,
        kind: "PHOTO_PACK",
        mode: "PREMADE",
        name: `Marco corazón ${RUN}`,
        slug: `${RUN}-tpl-premade`,
        previewUrl: "https://cdn.lucams.test/tpl-premade.png",
        canvasData: {},
        order: 0,
        isActive: true,
      },
    });
    // Template inactivo (no debe aparecer en detalle).
    await prisma.personalizationTemplate.create({
      data: {
        productId: p1Id,
        kind: "PHOTO_PACK",
        mode: "EDITABLE",
        name: `Inactivo ${RUN}`,
        slug: `${RUN}-tpl-inactive`,
        previewUrl: "https://cdn.lucams.test/tpl-inactive.png",
        canvasData: {},
        order: 2,
        isActive: false,
      },
    });

    // ── Cupones ──
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    // Público + activo + vigente → DEBE listarse.
    await prisma.coupon.create({
      data: {
        code: `${RUN}-PUBLIC10`.toUpperCase(),
        type: "PERCENT",
        value: 10,
        validFrom: yesterday,
        validTo: tomorrow,
        isPublic: true,
        isActive: true,
        description: "10% público vigente",
        minOrder: 50_000,
        appliesToCategories: [rootCatSlug],
        appliesToProductSlugs: [p1Slug],
      },
    });
    // Privado (isPublic=false) → NO listarse.
    await prisma.coupon.create({
      data: {
        code: `${RUN}-PRIVATE`.toUpperCase(),
        type: "PERCENT",
        value: 20,
        validFrom: yesterday,
        validTo: tomorrow,
        isPublic: false,
        isActive: true,
      },
    });
    // Público pero EXPIRADO (validTo en el pasado) → NO listarse.
    await prisma.coupon.create({
      data: {
        code: `${RUN}-EXPIRED`.toUpperCase(),
        type: "FIXED",
        value: 5_000,
        validFrom: lastWeek,
        validTo: yesterday,
        isPublic: true,
        isActive: true,
      },
    });
    // Público pero AÚN NO vigente (validFrom en el futuro) → NO listarse.
    await prisma.coupon.create({
      data: {
        code: `${RUN}-FUTURE`.toUpperCase(),
        type: "FIXED",
        value: 3_000,
        validFrom: tomorrow,
        validTo: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
        isPublic: true,
        isActive: true,
      },
    });
    // Público + vigente pero isActive=false → NO listarse.
    await prisma.coupon.create({
      data: {
        code: `${RUN}-INACTIVE`.toUpperCase(),
        type: "PERCENT",
        value: 15,
        validFrom: yesterday,
        validTo: tomorrow,
        isPublic: true,
        isActive: false,
      },
    });
  }, T);

  afterAll(async () => {
    // Orden FK: pivots → templates → variants → products → coupons → ocasiones → categorías.
    // Todo scoped al RUN (categorías de la corrida + slugs prefijados).
    const catIds = [rootCatId, subA_Id, subB_Id, siblingCatId].filter(Boolean);
    await prisma.productOcasionTag.deleteMany({
      where: { product: { categoryId: { in: catIds } } },
    });
    await prisma.personalizationTemplate.deleteMany({
      where: { product: { categoryId: { in: catIds } } },
    });
    await prisma.productVariant.deleteMany({ where: { product: { categoryId: { in: catIds } } } });
    await prisma.product.deleteMany({ where: { categoryId: { in: catIds } } });
    await prisma.coupon.deleteMany({ where: { code: { startsWith: RUN.toUpperCase() } } });
    await prisma.ocasionTag.deleteMany({ where: { slug: { startsWith: RUN } } });
    // Categorías: hijos antes que padre (parent es Restrict). Borramos todas las
    // de la corrida por slug-prefix (incluye la soft-deleted).
    await prisma.category.deleteMany({ where: { parentId: { in: catIds } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: RUN } } });
  }, T);

  // ════════════════════════════════════════════════════════════════════════
  // getCategoryTree
  // ════════════════════════════════════════════════════════════════════════

  describe("getCategoryTree", () => {
    it("devuelve solo roots (parentId=null) con sus hijos anidados", async () => {
      const tree = await getCategoryTree();
      const root = tree.find((c) => c.slug === rootCatSlug);
      expect(root).toBeDefined();
      // Los hijos NO aparecen como roots top-level.
      expect(tree.some((c) => c.slug === subA_Slug)).toBe(false);
      // El árbol expone sus hijos anidados.
      const childSlugs = root!.children.map((c) => c.slug);
      expect(childSlugs).toContain(subA_Slug);
      expect(childSlugs).toContain(subB_Slug);
    });

    it("excluye categorías soft-deleted (deletedAt) del árbol", async () => {
      const tree = await getCategoryTree();
      const root = tree.find((c) => c.slug === rootCatSlug)!;
      // La sub-categoría soft-deleted no aparece ni como root ni como hijo.
      expect(tree.some((c) => c.slug === deletedCatSlug)).toBe(false);
      expect(root.children.some((c) => c.slug === deletedCatSlug)).toBe(false);
    });

    it("productCount cuenta SOLO productos activos no borrados", async () => {
      const tree = await getCategoryTree();
      const root = tree.find((c) => c.slug === rootCatSlug)!;
      const subA = root.children.find((c) => c.slug === subA_Slug)!;
      // subA tiene p1 (activo) + p2 (activo) + pInactive (inactivo) + pDeleted (borrado).
      // Solo p1 y p2 cuentan.
      expect(subA.productCount).toBe(2);
      const subB = root.children.find((c) => c.slug === subB_Slug)!;
      // subB tiene solo p3.
      expect(subB.productCount).toBe(1);
    });

    it("desempata categorías con el mismo order por name asc (bug Lucy 2026-06-27)", async () => {
      const tree = await getCategoryTree();
      const root = tree.find((c) => c.slug === rootCatSlug)!;
      // subA name="Beta", subB name="Alfa", ambas order=5. "Alfa" (subB) va primero.
      const idxA = root.children.findIndex((c) => c.slug === subA_Slug);
      const idxB = root.children.findIndex((c) => c.slug === subB_Slug);
      expect(idxB).toBeLessThan(idxA);
    });

    it("expone los campos AI-ready (richDescription, useCase, visibleFilters, etc.)", async () => {
      const tree = await getCategoryTree();
      const root = tree.find((c) => c.slug === rootCatSlug)!;
      expect(root).toMatchObject({
        slug: rootCatSlug,
        isActive: true,
        order: 0,
      });
      expect(Array.isArray(root.visibleFilters)).toBe(true);
      // defaultSort tiene default "recent" en el schema.
      expect(root.defaultSort).toBe("recent");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // getCategoryBySlug
  // ════════════════════════════════════════════════════════════════════════

  describe("getCategoryBySlug", () => {
    it("devuelve la categoría raíz con sus hijos activos (productCount correcto)", async () => {
      const cat = await getCategoryBySlug(rootCatSlug);
      expect(cat).not.toBeNull();
      expect(cat!.slug).toBe(rootCatSlug);
      const childSlugs = cat!.children.map((c) => c.slug).sort();
      expect(childSlugs).toEqual([subA_Slug, subB_Slug].sort());
      // El hijo soft-deleted NO aparece.
      expect(cat!.children.some((c) => c.slug === deletedCatSlug)).toBe(false);
    });

    it("ordena los hijos por order+name (Alfa antes que Beta con mismo order)", async () => {
      const cat = await getCategoryBySlug(rootCatSlug);
      const idxA = cat!.children.findIndex((c) => c.slug === subA_Slug);
      const idxB = cat!.children.findIndex((c) => c.slug === subB_Slug);
      expect(idxB).toBeLessThan(idxA);
    });

    it("una sub-categoría hoja devuelve children vacío", async () => {
      const cat = await getCategoryBySlug(subA_Slug);
      expect(cat).not.toBeNull();
      expect(cat!.children).toEqual([]);
      // productCount de subA = p1 + p2 activos.
      expect(cat!.productCount).toBe(2);
    });

    it("slug inexistente devuelve null", async () => {
      expect(await getCategoryBySlug(`${RUN}-ghost-cat`)).toBeNull();
    });

    it("categoría soft-deleted devuelve null (cat.deletedAt guard)", async () => {
      expect(await getCategoryBySlug(deletedCatSlug)).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // listCatalogProducts — filtros, sort, paginación, agregación
  // ════════════════════════════════════════════════════════════════════════

  describe("listCatalogProducts", () => {
    it("filtrar por categoría PADRE incluye productos de TODAS sus sub-categorías", async () => {
      const list = await listCatalogProducts({ categorySlug: rootCatSlug, limit: 50 });
      const slugs = list.map((p) => p.slug);
      // p1, p2 (subA) y p3 (subB) → todos bajo la raíz.
      expect(slugs).toContain(p1Slug);
      expect(slugs).toContain(p2Slug);
      expect(slugs).toContain(p3Slug);
      // p4 está en la categoría hermana → NO incluido.
      expect(slugs).not.toContain(p4Slug);
      // Inactivo y borrado nunca aparecen.
      expect(slugs).not.toContain(pInactiveSlug);
      expect(slugs).not.toContain(pDeletedSlug);
    });

    it("filtrar por SUB-categoría devuelve solo los productos de esa sub-cat", async () => {
      const list = await listCatalogProducts({ subCategorySlug: subA_Slug, limit: 50 });
      const slugs = list.map((p) => p.slug);
      expect(slugs).toContain(p1Slug);
      expect(slugs).toContain(p2Slug);
      // p3 está en subB → NO.
      expect(slugs).not.toContain(p3Slug);
    });

    it("subCategorySlug tiene precedencia sobre categorySlug", async () => {
      // Pasar ambos: el código usa subCategorySlug y descarta categorySlug.
      const list = await listCatalogProducts({
        categorySlug: rootCatSlug,
        subCategorySlug: subB_Slug,
        limit: 50,
      });
      const slugs = list.map((p) => p.slug);
      expect(slugs).toEqual([p3Slug]); // solo el producto de subB
    });

    it("agrega minPrice/maxPrice desde las variantes activas con price (no basePrice)", async () => {
      const list = await listCatalogProducts({ subCategorySlug: subA_Slug, limit: 50 });
      const p1 = list.find((p) => p.slug === p1Slug)!;
      // p1 tiene variantes 8000 y 22000 → min 8000, max 22000 (ignora basePrice 10000).
      expect(p1.minPrice).toBe(P1_VAR_MIN);
      expect(p1.maxPrice).toBe(P1_VAR_MAX);
      expect(p1.variantCount).toBe(2);
    });

    it("cae a basePrice cuando ninguna variante tiene price", async () => {
      const list = await listCatalogProducts({ subCategorySlug: subA_Slug, limit: 50 });
      const p2 = list.find((p) => p.slug === p2Slug)!;
      // p2 tiene una variante con price=null → min/max = basePrice.
      expect(p2.minPrice).toBe(P2_BASE);
      expect(p2.maxPrice).toBe(P2_BASE);
      // variantCount cuenta variantes activas no borradas (1, aunque sin price).
      expect(p2.variantCount).toBe(1);
    });

    it("filtra por personalización=true (personalizationKind != NONE)", async () => {
      const list = await listCatalogProducts({
        categorySlug: rootCatSlug,
        isPersonalizable: true,
        limit: 50,
      });
      const slugs = list.map((p) => p.slug);
      expect(slugs).toContain(p1Slug); // PHOTO_PACK
      expect(slugs).toContain(p3Slug); // CUSTOM_DECOR
      expect(slugs).not.toContain(p2Slug); // NONE
    });

    it("filtra por personalización=false (personalizationKind == NONE)", async () => {
      const list = await listCatalogProducts({
        categorySlug: rootCatSlug,
        isPersonalizable: false,
        limit: 50,
      });
      const slugs = list.map((p) => p.slug);
      expect(slugs).toContain(p2Slug); // NONE
      expect(slugs).not.toContain(p1Slug);
      expect(slugs).not.toContain(p3Slug);
    });

    it("filtra por ocasión (some ocasionTag.slug)", async () => {
      const list = await listCatalogProducts({ ocasionSlug: ocasionMatrimonioSlug, limit: 50 });
      const slugs = list.map((p) => p.slug);
      expect(slugs).toContain(p1Slug);
      expect(slugs).not.toContain(p3Slug); // p3 es cumpleaños
      // Cada summary expone los slugs de ocasión.
      const p1 = list.find((p) => p.slug === p1Slug)!;
      expect(p1.ocasionSlugs).toContain(ocasionMatrimonioSlug);
    });

    it("filtro de precio (priceMin/priceMax) opera POST-fetch sobre minPrice", async () => {
      // priceMin 9000 excluye p1 (minPrice 8000) pero incluye p2 (30000) y p3 (50000).
      const list = await listCatalogProducts({
        categorySlug: rootCatSlug,
        priceMin: 9_000,
        limit: 50,
      });
      const slugs = list.map((p) => p.slug);
      expect(slugs).not.toContain(p1Slug); // minPrice 8000 < 9000
      expect(slugs).toContain(p2Slug);
      expect(slugs).toContain(p3Slug);
    });

    it("priceMax filtra por minPrice <= max", async () => {
      // priceMax 9000 incluye solo p1 (minPrice 8000); excluye p2 (30000) y p3 (50000).
      const list = await listCatalogProducts({
        categorySlug: rootCatSlug,
        priceMax: 9_000,
        limit: 50,
      });
      const slugs = list.map((p) => p.slug);
      expect(slugs).toContain(p1Slug);
      expect(slugs).not.toContain(p2Slug);
      expect(slugs).not.toContain(p3Slug);
    });

    it("sort=price_asc ordena por basePrice ascendente", async () => {
      const list = await listCatalogProducts({
        categorySlug: rootCatSlug,
        sort: "price_asc",
        limit: 50,
      });
      const ours = list.filter((p) => [p1Slug, p2Slug, p3Slug].includes(p.slug));
      const prices = ours.map((p) => p.basePrice);
      // Orden por basePrice asc: p1(10000) < p2(30000) < p3(50000).
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      expect(ours[0].slug).toBe(p1Slug);
    });

    it("sort=price_desc ordena por basePrice descendente", async () => {
      const list = await listCatalogProducts({
        categorySlug: rootCatSlug,
        sort: "price_desc",
        limit: 50,
      });
      const ours = list.filter((p) => [p1Slug, p2Slug, p3Slug].includes(p.slug));
      expect(ours[0].slug).toBe(p3Slug); // 50000 primero
    });

    it("sort=featured pone los productos isFeatured primero", async () => {
      const list = await listCatalogProducts({
        categorySlug: rootCatSlug,
        sort: "featured",
        limit: 50,
      });
      const ours = list.filter((p) => [p1Slug, p2Slug, p3Slug].includes(p.slug));
      // p1 es el único featured → debe ir primero entre los nuestros.
      expect(ours[0].slug).toBe(p1Slug);
      expect(ours[0].isFeatured).toBe(true);
    });

    it("paginación: limit topa el número de resultados", async () => {
      const list = await listCatalogProducts({ categorySlug: rootCatSlug, limit: 1 });
      expect(list).toHaveLength(1);
    });

    it("paginación: offset salta resultados (página 2 distinta de página 1)", async () => {
      const page1 = await listCatalogProducts({
        categorySlug: rootCatSlug,
        sort: "price_asc",
        limit: 1,
        offset: 0,
      });
      const page2 = await listCatalogProducts({
        categorySlug: rootCatSlug,
        sort: "price_asc",
        limit: 1,
        offset: 1,
      });
      expect(page1).toHaveLength(1);
      expect(page2).toHaveLength(1);
      expect(page1[0].slug).not.toBe(page2[0].slug);
    });

    it("filtros sin match devuelven array vacío (no error)", async () => {
      const list = await listCatalogProducts({ subCategorySlug: `${RUN}-no-such-cat`, limit: 50 });
      expect(list).toEqual([]);
    });

    it("expone parentCategorySlug/Name de la jerarquía", async () => {
      const list = await listCatalogProducts({ subCategorySlug: subA_Slug, limit: 50 });
      const p1 = list.find((p) => p.slug === p1Slug)!;
      expect(p1.categorySlug).toBe(subA_Slug);
      expect(p1.parentCategorySlug).toBe(rootCatSlug);
      expect(p1.parentCategoryName).toBe(`ZZ Root ${RUN}`);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // getCatalogProductDetail
  // ════════════════════════════════════════════════════════════════════════

  describe("getCatalogProductDetail", () => {
    it("devuelve detalle con variantes, templates activos y ocasiones", async () => {
      const detail = await getCatalogProductDetail(p1Slug);
      expect(detail).not.toBeNull();
      expect(detail!.slug).toBe(p1Slug);
      // Variantes (orden createdAt asc): Set 6, Set 12.
      expect(detail!.variants).toHaveLength(2);
      expect(detail!.variants[0].name).toBe("Set 6");
      // Templates activos: editable + premade (el inactivo se excluye), orden por order asc.
      expect(detail!.templates).toHaveLength(2);
      expect(detail!.templates[0].mode).toBe("PREMADE"); // order 0 primero
      expect(detail!.templates[1].mode).toBe("EDITABLE"); // order 1
      // Ocasiones con rationale.
      expect(detail!.ocasiones).toHaveLength(1);
      expect(detail!.ocasiones[0].slug).toBe(ocasionMatrimonioSlug);
      expect(detail!.ocasiones[0].rationale).toBe("Perfecto para los novios");
    });

    it("incluye campos extendidos del summary (minPrice, compareAtPrice, idealFor)", async () => {
      const detail = await getCatalogProductDetail(p1Slug);
      expect(detail!.minPrice).toBe(P1_VAR_MIN);
      expect(detail!.maxPrice).toBe(P1_VAR_MAX);
      expect(detail!.compareAtPrice).toBe(15_000);
      // idealFor es array (defensive: si no fuera array, []).
      expect(Array.isArray(detail!.idealFor)).toBe(true);
      expect(detail!.idealFor).toContain("recuerdo matrimonio");
    });

    it("slug inexistente devuelve null", async () => {
      expect(await getCatalogProductDetail(`${RUN}-ghost-product`)).toBeNull();
    });

    it("producto inactivo (isActive=false) devuelve null", async () => {
      expect(await getCatalogProductDetail(pInactiveSlug)).toBeNull();
    });

    it("producto soft-deleted devuelve null", async () => {
      expect(await getCatalogProductDetail(pDeletedSlug)).toBeNull();
    });

    it("physicalSpecs ausente → null; idealFor no-array → [] (defensivo)", async () => {
      // p3 no setea physicalSpecs ni idealFor array vacío; idealFor sí es array.
      const detail = await getCatalogProductDetail(p3Slug);
      expect(detail!.physicalSpecs).toBeNull();
      expect(detail!.templates).toEqual([]); // p3 no tiene templates
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // listOcasiones / getOcasionBySlug
  // ════════════════════════════════════════════════════════════════════════

  describe("listOcasiones", () => {
    it("lista solo ocasiones activas no borradas, ordenadas por order asc", async () => {
      const list = await listOcasiones();
      const slugs = list.map((o) => o.slug);
      expect(slugs).toContain(ocasionMatrimonioSlug);
      expect(slugs).toContain(ocasionCumpleSlug);
      // Inactiva y borrada NO aparecen.
      expect(slugs).not.toContain(ocasionInactivaSlug);
      expect(slugs).not.toContain(ocasionDeletedSlug);
      // Orden: matrimonio (order 1) antes que cumple (order 2).
      const idxMat = slugs.indexOf(ocasionMatrimonioSlug);
      const idxCum = slugs.indexOf(ocasionCumpleSlug);
      expect(idxMat).toBeLessThan(idxCum);
    });

    it("expone monthHint y suggestedQuantityRange tipados", async () => {
      const list = await listOcasiones();
      const mat = list.find((o) => o.slug === ocasionMatrimonioSlug)!;
      expect(mat.monthHint).toBe(6);
      expect(mat.suggestedQuantityRange).toEqual({ min: 30, ideal: 60, max: 120 });
      const cum = list.find((o) => o.slug === ocasionCumpleSlug)!;
      // cumple no setea ninguno → null.
      expect(cum.monthHint).toBeNull();
      expect(cum.suggestedQuantityRange).toBeNull();
    });

    it("productCount cuenta las relaciones ProductOcasionTag de la ocasión", async () => {
      const list = await listOcasiones();
      const mat = list.find((o) => o.slug === ocasionMatrimonioSlug)!;
      // Solo p1 está tagueado con matrimonio.
      expect(mat.productCount).toBe(1);
    });
  });

  describe("getOcasionBySlug", () => {
    it("devuelve la ocasión activa por slug", async () => {
      const o = await getOcasionBySlug(ocasionMatrimonioSlug);
      expect(o).not.toBeNull();
      expect(o!.slug).toBe(ocasionMatrimonioSlug);
      expect(o!.productCount).toBe(1);
    });

    it("slug inexistente devuelve null", async () => {
      expect(await getOcasionBySlug(`${RUN}-no-ocasion`)).toBeNull();
    });

    it("ocasión inactiva devuelve null (guard !o.isActive)", async () => {
      expect(await getOcasionBySlug(ocasionInactivaSlug)).toBeNull();
    });

    it("ocasión soft-deleted devuelve null (guard o.deletedAt)", async () => {
      expect(await getOcasionBySlug(ocasionDeletedSlug)).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // recommendProducts — scoring sin ML
  // ════════════════════════════════════════════════════════════════════════

  describe("recommendProducts", () => {
    it("ocasión + preferencia personalizable supera el cutoff y suma reasons", async () => {
      // p1: ocasión matrimonio (+3) + personalizable preferencia (+1) + featured (+0.5) = 4.5 > 2.
      const recs = await recommendProducts({
        ocasionSlugs: [ocasionMatrimonioSlug],
        personalizationPreference: "personalizable",
      });
      const p1 = recs.find((r) => r.slug === p1Slug);
      expect(p1).toBeDefined();
      expect(p1!.score).toBeGreaterThan(2);
      expect(p1!.reasons.some((r) => r.includes("Ocasión"))).toBe(true);
      expect(p1!.reasons).toContain("Personalizable");
    });

    it("destinatario matchea idealFor por token exacto (no substring) sumando +2", async () => {
      // #2 — p1.idealFor incluye "regalo pareja aniversario" → token "pareja" matchea el
      // vocabulario de destinatario "pareja". La razón usa la etiqueta legible en tuteo
      // ("tu pareja"), no el value crudo ("pareja").
      const recs = await recommendProducts({
        ocasionSlugs: [ocasionMatrimonioSlug],
        destinatario: "pareja",
      });
      const p1 = recs.find((r) => r.slug === p1Slug);
      expect(p1).toBeDefined();
      // ocasión 3 + destinatario 2 + featured 0.5 = 5.5.
      expect(p1!.score).toBeGreaterThanOrEqual(5);
      expect(p1!.reasons).toContain("Ideal para tu pareja");
    });

    it("destinatario: token exacto matchea y no-token no suma (#2)", async () => {
      // p3.idealFor = ["regalo cumpleaños amigo"]. destinatario "amigo" → token "amigo" matchea.
      const conAmigo = await recommendProducts({
        ocasionSlugs: [ocasionCumpleSlug],
        destinatario: "amigo",
      });
      const p3amigo = conAmigo.find((r) => r.slug === p3Slug);
      expect(p3amigo).toBeDefined();
      expect(p3amigo!.reasons).toContain("Ideal para un amigo/a");

      // destinatario "familia" NO tiene ningún token (familiar/familia/hogar) en ese idealFor →
      // no suma +2 ni añade razón (antes un substring hubiera podido colar falsos positivos).
      const conFamilia = await recommendProducts({
        ocasionSlugs: [ocasionCumpleSlug],
        destinatario: "familia",
      });
      const p3fam = conFamilia.find((r) => r.slug === p3Slug);
      expect(p3fam).toBeDefined();
      expect(p3fam!.reasons.some((r) => r.includes("Ideal para"))).toBe(false);
    });

    it("excludeSlugs quita productos del pool", async () => {
      const recs = await recommendProducts({
        ocasionSlugs: [ocasionMatrimonioSlug],
        personalizationPreference: "personalizable",
        excludeSlugs: [p1Slug],
      });
      expect(recs.some((r) => r.slug === p1Slug)).toBe(false);
    });

    it("ordena por score desc y respeta el cutoff > 2 (solo matches relevantes)", async () => {
      const recs = await recommendProducts({
        ocasionSlugs: [ocasionMatrimonioSlug, ocasionCumpleSlug],
        personalizationPreference: "personalizable",
      });
      // Score monotónicamente no creciente.
      for (let i = 1; i < recs.length; i++) {
        expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
      }
      // Todos por encima del cutoff.
      expect(recs.every((r) => r.score > 2)).toBe(true);
    });

    it("limit topa el número de recomendaciones devueltas", async () => {
      const recs = await recommendProducts({
        ocasionSlugs: [ocasionMatrimonioSlug, ocasionCumpleSlug],
        personalizationPreference: "personalizable",
        limit: 1,
      });
      expect(recs.length).toBeLessThanOrEqual(1);
    });

    it("input que no alcanza el cutoff devuelve lista vacía", async () => {
      // Sin ocasión, sin destinatario, sin preferencia, solo precio que matchea (+1)
      // → score 1 (+0.5 si featured = 1.5) nunca supera 2 para no-featured.
      const recs = await recommendProducts({
        ocasionSlugs: [`${RUN}-no-ocasion-real`],
        priceMin: 1,
      });
      expect(recs).toEqual([]);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // getCatalogFilters — facets
  // ════════════════════════════════════════════════════════════════════════

  describe("getCatalogFilters", () => {
    it("contexto raíz: totalProducts cuenta todos los activos del árbol", async () => {
      const f = await getCatalogFilters(rootCatSlug);
      expect(f.context.categorySlug).toBe(rootCatSlug);
      expect(f.context.subCategorySlug).toBeNull();
      // p1, p2 (subA) + p3 (subB) = 3 activos.
      expect(f.context.totalProducts).toBe(3);
    });

    it("facet sub-categorías cuenta productos por sub-cat hija", async () => {
      const f = await getCatalogFilters(rootCatSlug);
      const subCats = f.filters.subCategories ?? [];
      const a = subCats.find((s) => s.slug === subA_Slug);
      const b = subCats.find((s) => s.slug === subB_Slug);
      expect(a?.count).toBe(2); // p1, p2
      expect(b?.count).toBe(1); // p3
    });

    it("facet ocasiones cuenta productos por tag", async () => {
      const f = await getCatalogFilters(rootCatSlug);
      const ocasiones = f.filters.ocasiones ?? [];
      const mat = ocasiones.find((o) => o.slug === ocasionMatrimonioSlug);
      const cum = ocasiones.find((o) => o.slug === ocasionCumpleSlug);
      expect(mat?.count).toBe(1); // p1
      expect(cum?.count).toBe(1); // p3
    });

    it("priceRange agrega min/max de variantes (o basePrice)", async () => {
      const f = await getCatalogFilters(rootCatSlug);
      // Precios en el pool: p1 variantes 8000/22000, p2 base 30000, p3 base 50000.
      expect(f.filters.priceRange!.min).toBe(P1_VAR_MIN); // 8000
      expect(f.filters.priceRange!.max).toBe(P3_BASE); // 50000
    });

    it("facet personalización separa personalizable vs premade", async () => {
      const f = await getCatalogFilters(rootCatSlug);
      const perso = f.filters.personalization ?? [];
      const personalizable = perso.find((p) => p.key === "personalizable");
      const premade = perso.find((p) => p.key === "premade");
      // p1 + p3 personalizables, p2 premade.
      expect(personalizable?.count).toBe(2);
      expect(premade?.count).toBe(1);
    });

    it("contexto sin productos: priceRange {0,0} y totalProducts 0", async () => {
      const f = await getCatalogFilters(`${RUN}-empty-cat`);
      expect(f.context.totalProducts).toBe(0);
      expect(f.filters.priceRange).toEqual({ min: 0, max: 0 });
    });

    it("filtrar por sub-categoría acota el contexto", async () => {
      const f = await getCatalogFilters(undefined, subB_Slug);
      expect(f.context.subCategorySlug).toBe(subB_Slug);
      expect(f.context.totalProducts).toBe(1); // solo p3
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // searchCatalog — pg_trgm fuzzy
  // ════════════════════════════════════════════════════════════════════════

  describe("searchCatalog", () => {
    it("query con menos de 2 caracteres devuelve [] sin tocar la DB", async () => {
      expect(await searchCatalog("a")).toEqual([]);
      expect(await searchCatalog("")).toEqual([]);
      expect(await searchCatalog("   ")).toEqual([]);
    });

    it("encuentra el producto por similitud de nombre (pg_trgm)", async () => {
      // El nombre de p1 contiene "Fotoimán Corazón <RUN>". Buscar por una parte
      // del nombre debe rankear p1.
      const results = await searchCatalog(`Fotoimán Corazón ${RUN}`, 20);
      const found = results.find((r) => r.slug === p1Slug);
      expect(found).toBeDefined();
      // rank es un número de similitud (0..1).
      expect(typeof found!.rank).toBe("number");
      expect(found!.rank).toBeGreaterThan(0);
    });

    it("búsqueda insensible a acentos (unaccent): 'corazon' matchea 'Corazón'", async () => {
      const results = await searchCatalog(`Fotoiman Corazon ${RUN}`, 20);
      expect(results.some((r) => r.slug === p1Slug)).toBe(true);
    });

    it("query que no matchea nada devuelve []", async () => {
      const results = await searchCatalog("zxqwvkjhnmplfff-nomatch-9999", 20);
      expect(results).toEqual([]);
    });

    it("respeta el límite de resultados", async () => {
      const results = await searchCatalog(`${RUN}`, 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // listTemplatesByProduct
  // ════════════════════════════════════════════════════════════════════════

  describe("listTemplatesByProduct", () => {
    it("lista los templates activos del producto, orden por order asc", async () => {
      const templates = await listTemplatesByProduct(p1Slug);
      // 2 activos (premade order 0, editable order 1); el inactivo se excluye.
      expect(templates).toHaveLength(2);
      expect(templates[0].order).toBeLessThanOrEqual(templates[1].order);
      expect(templates[0].mode).toBe("PREMADE");
      // productSlug se propaga al resultado.
      expect(templates[0].productSlug).toBe(p1Slug);
    });

    it("filtra por mode=PREMADE", async () => {
      const templates = await listTemplatesByProduct(p1Slug, "PREMADE");
      expect(templates).toHaveLength(1);
      expect(templates[0].mode).toBe("PREMADE");
    });

    it("filtra por mode=EDITABLE (excluye el inactivo aunque sea EDITABLE)", async () => {
      const templates = await listTemplatesByProduct(p1Slug, "EDITABLE");
      // Solo el editable activo; el editable inactivo no cuenta.
      // toHaveLength(1) ya prueba que el EDITABLE inactivo se excluyó (el tipo
      // CatalogTemplate no expone isActive porque la query solo trae activos).
      expect(templates).toHaveLength(1);
      expect(templates[0].mode).toBe("EDITABLE");
    });

    it("producto inexistente devuelve []", async () => {
      expect(await listTemplatesByProduct(`${RUN}-no-product`)).toEqual([]);
    });

    it("producto sin templates devuelve []", async () => {
      expect(await listTemplatesByProduct(p3Slug)).toEqual([]);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // listPublicCoupons — ventana de vigencia
  // ════════════════════════════════════════════════════════════════════════

  describe("listPublicCoupons", () => {
    it("lista SOLO cupones públicos, activos y vigentes (ventana validFrom..validTo)", async () => {
      const coupons = await listPublicCoupons();
      const ours = coupons.filter((c) => c.code.startsWith(RUN.toUpperCase()));
      const codes = ours.map((c) => c.code);
      // Solo el PUBLIC10 cumple las 4 condiciones.
      expect(codes).toContain(`${RUN}-PUBLIC10`.toUpperCase());
      // Excluidos: privado, expirado, futuro, inactivo.
      expect(codes).not.toContain(`${RUN}-PRIVATE`.toUpperCase());
      expect(codes).not.toContain(`${RUN}-EXPIRED`.toUpperCase());
      expect(codes).not.toContain(`${RUN}-FUTURE`.toUpperCase());
      expect(codes).not.toContain(`${RUN}-INACTIVE`.toUpperCase());
    });

    it("expone los campos públicos del cupón (value, minOrder, applies, validUntil)", async () => {
      const coupons = await listPublicCoupons();
      const pub = coupons.find((c) => c.code === `${RUN}-PUBLIC10`.toUpperCase())!;
      expect(pub.type).toBe("PERCENT");
      expect(pub.value).toBe(10);
      expect(pub.minOrder).toBe(50_000);
      expect(pub.appliesToCategories).toContain(rootCatSlug);
      expect(pub.appliesToProductSlugs).toContain(p1Slug);
      // validUntil es el validTo del cupón (Date).
      expect(pub.validUntil).toBeInstanceOf(Date);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // getRelatedProducts — scoring 3 capas
  // ════════════════════════════════════════════════════════════════════════

  describe("getRelatedProducts", () => {
    it("devuelve relacionados excluyendo el producto actual", async () => {
      const related = await getRelatedProducts(p1Slug, 10);
      const slugs = related.map((p) => p.slug);
      // El propio p1 nunca está en sus relacionados.
      expect(slugs).not.toContain(p1Slug);
    });

    it("prioriza productos de la misma sub-categoría (capa 2) y misma cat padre (capa 3)", async () => {
      // p1 está en subA. p2 también en subA (misma sub-cat, +2). p3 en subB pero
      // misma cat padre raíz (+1). p4 en otro árbol → no debería entrar al pool.
      const related = await getRelatedProducts(p1Slug, 10);
      const slugs = related.map((p) => p.slug);
      expect(slugs).toContain(p2Slug); // misma sub-cat
      expect(slugs).toContain(p3Slug); // misma cat padre
      expect(slugs).not.toContain(p4Slug); // otro árbol
      // p2 (misma sub-cat, score 2) debe ir antes que p3 (misma cat padre, score 1).
      expect(slugs.indexOf(p2Slug)).toBeLessThan(slugs.indexOf(p3Slug));
    });

    it("excluye inactivos y borrados del pool de relacionados", async () => {
      const related = await getRelatedProducts(p1Slug, 10);
      const slugs = related.map((p) => p.slug);
      expect(slugs).not.toContain(pInactiveSlug);
      expect(slugs).not.toContain(pDeletedSlug);
    });

    it("respeta el límite de resultados", async () => {
      const related = await getRelatedProducts(p1Slug, 1);
      expect(related.length).toBeLessThanOrEqual(1);
    });

    it("producto inexistente devuelve []", async () => {
      expect(await getRelatedProducts(`${RUN}-no-product`, 4)).toEqual([]);
    });
  });
});
