/*
 * Tests de integración del SERVICE de CATEGORIES — CRUD + jerarquía + orden +
 * slug único + soft-delete (admin /admin/categorias).
 *
 * El módulo @/features/categories/service.ts es DB-coupled (importa `prisma` de
 * @/lib/db). Expone:
 *   - listCategories(opts): listado admin (todo por default: activas +
 *     inactivas + archivadas), búsqueda name/slug case-insensitive, filtro
 *     status (active/inactive/archived/all), sort (order/name/recent) + derivados
 *     (parent.name, _count.products, _count.children).
 *   - listParentCategoryOptions(excludeId): primer nivel (parentId null), no
 *     archivadas, para el <select> "categoría madre"; excluye `excludeId`.
 *   - createCategory(input, createdBy): valida slug único (findUnique → incluye
 *     soft-deleted), valida parent (1 nivel), auto-asigna order = último+1 del
 *     grupo de hermanas.
 *   - updateCategory(id, input, updatedBy): valida slug único (solo vs no
 *     archivadas), re-valida parent y reubica order al cambiar de madre.
 *   - moveCategory(id, direction, actorId): intercambia con la vecina y
 *     re-secuencia el grupo a 0..n (robusto ante order duplicados).
 *   - softDeleteCategory(id, deletedBy): bloquea si hay productos activos;
 *     setea deletedAt + isActive=false + deletedBy.
 *   - restoreCategory(id, restoredBy): limpia deletedAt/deletedBy, isActive=false.
 *   - toggleCategoryActive(id, isActive, actorAdminId): toggle isActive.
 *
 * Estrategia: integración DB pura. Requiere DATABASE_URL (corre vía
 * `dotenv -e .env.local -- vitest`); sin ella se salta (skipIf) para no romper
 * CI sin DB.
 *
 * `next/cache.updateTag` se mockea a no-op: fuera de un Server Action real lanza
 * ("can only be called from within a Server Action"). El service lo invoca tras
 * cada mutación; aquí no nos interesa la revalidación sino el efecto en DB.
 *
 * AISLAMIENTO ESTRICTO (nunca tocar datos reales — seed, productos de Lucy):
 *   - Todo registro de esta corrida lleva el prefijo único `RUN` en su slug
 *     (Category) / sku+slug (Product). La limpieza en afterAll borra EXACTAMENTE
 *     lo creado, SCOPED al prefijo (slug/sku startsWith RUN). JAMÁS un deleteMany
 *     sin filtro.
 *   - Orden de borrado respeta FKs (onDelete: Restrict): primero products, luego
 *     hijas, luego madres. Se desarchivan (deletedAt=null) las categorías antes
 *     de borrar para evitar dejar datos colgando si un test falla a mitad.
 *
 * El comportamiento esperado se verificó contra la DB real antes de fijar las
 * aserciones (probes descartados):
 *   - order/isActive default = 0 / true; deletedAt default null.
 *   - createCategory usa findUnique(slug) → detecta conflicto INCLUSO contra una
 *     categoría soft-deleted (el índice unique no filtra deletedAt).
 *   - updateCategory usa findFirst(slug, deletedAt:null) → NO detecta conflicto
 *     contra soft-deleted, y el UPDATE luego lanza P2002 crudo (ver bugsFound).
 *   - update con id inexistente → PrismaClientKnownRequestError P2025.
 *   - Category.parent onDelete:Restrict → hard-delete de madre con hija → P2003.
 */

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import { Prisma, prisma } from "@/lib/db";
import {
  CategoryValidationError,
  createCategory,
  listCategories,
  listParentCategoryOptions,
  moveCategory,
  restoreCategory,
  softDeleteCategory,
  toggleCategoryActive,
  updateCategory,
} from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Va en TODOS los slugs (lowercase, regex válido) y
// skus → la limpieza borra exactamente lo que creamos sin tocar datos reales.
const RUN = `itestcat${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

// Contador monotónico para unicidad de slug/sku dentro de la corrida.
let seq = 0;
function nextSlug(label = "c") {
  seq += 1;
  return `${RUN}-${label}-${seq}`;
}

type CatOverrides = Partial<{
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  order: number;
  isActive: boolean;
  deletedAt: Date | null;
}>;

/** Crea una categoría directo con prisma (bypass de validaciones del service),
 *  útil para sembrar estado previo. Slug siempre RUN-scoped. */
async function seedCat(over: CatOverrides = {}) {
  return prisma.category.create({
    data: {
      slug: over.slug ?? nextSlug(),
      name: over.name ?? `${RUN} Cat ${seq}`,
      description: over.description ?? null,
      parentId: over.parentId ?? null,
      ...(over.order !== undefined ? { order: over.order } : {}),
      isActive: over.isActive ?? true,
      deletedAt: over.deletedAt ?? null,
    },
  });
}

/** Producto mínimo asociado a una categoría (para test de bloqueo de borrado).
 *  slug+sku RUN-scoped → limpieza SCOPED. */
async function seedProduct(categoryId: string, over: Partial<{ deletedAt: Date | null }> = {}) {
  seq += 1;
  return prisma.product.create({
    data: {
      slug: `${RUN}-prod-${seq}`,
      name: `${RUN} Product ${seq}`,
      description: "fixture categories test",
      basePrice: 10_000,
      sku: `${RUN}-sku-${seq}`,
      categoryId,
      deletedAt: over.deletedAt ?? null,
    },
  });
}

describe.skipIf(!hasDb)(
  "categories/service — integración DB (CRUD + jerarquía + soft-delete)",
  () => {
    afterAll(async () => {
      // Limpieza SCOPED al prefijo RUN, respetando FKs Restrict:
      // products → categorías hijas → categorías madre. Desarchivamos primero por
      // si algún test dejó deletedAt seteado (no afecta el borrado pero es prolijo).
      await prisma.product.deleteMany({ where: { sku: { startsWith: RUN } } });
      // Hijas (parentId != null) antes que madres (Restrict en parent).
      await prisma.category.deleteMany({
        where: { slug: { startsWith: RUN }, parentId: { not: null } },
      });
      await prisma.category.deleteMany({ where: { slug: { startsWith: RUN } } });
    });

    // ───────────────────────── createCategory ─────────────────────────

    describe("createCategory", () => {
      it("crea una categoría de primer nivel con order auto = 0 cuando es la primera de su grupo", async () => {
        // Aislamos el grupo: la primera categoría con un parent propio recién creado
        // para no depender de cuántas root reales existan.
        const parent = await seedCat();
        const created = await createCategory(
          { name: "Hija A", slug: nextSlug("hija"), isActive: true, parentId: parent.id },
          "admin-1",
        );
        expect(created.parentId).toBe(parent.id);
        expect(created.order).toBe(0); // primera del grupo → nextOrderInGroup = -1+1
        expect(created.isActive).toBe(true);
        expect(created.createdBy).toBe("admin-1");
        expect(created.deletedAt).toBeNull();
      });

      it("auto-asigna order incremental dentro del mismo grupo de hermanas", async () => {
        const parent = await seedCat();
        const a = await createCategory(
          { name: "A", slug: nextSlug(), isActive: true, parentId: parent.id },
          null,
        );
        const b = await createCategory(
          { name: "B", slug: nextSlug(), isActive: true, parentId: parent.id },
          null,
        );
        const c = await createCategory(
          { name: "C", slug: nextSlug(), isActive: true, parentId: parent.id },
          null,
        );
        expect([a.order, b.order, c.order]).toEqual([0, 1, 2]);
      }, 30000);

      it("respeta un order explícito si viene en el input (compat seed/migración)", async () => {
        const parent = await seedCat();
        const created = await createCategory(
          { name: "Explicit", slug: nextSlug(), isActive: true, parentId: parent.id, order: 42 },
          null,
        );
        expect(created.order).toBe(42);
      });

      it("createdBy null → no setea createdBy (queda en su default null)", async () => {
        const created = await createCategory(
          { name: "NoAuthor", slug: nextSlug(), isActive: true },
          null,
        );
        expect(created.createdBy).toBeNull();
      });

      it("persiste description e isActive=false tal cual", async () => {
        const created = await createCategory(
          { name: "Inactiva", slug: nextSlug(), isActive: false, description: "una descripción" },
          null,
        );
        expect(created.isActive).toBe(false);
        expect(created.description).toBe("una descripción");
      });

      it("rechaza slug duplicado contra una categoría VIVA (CategoryValidationError field=slug)", async () => {
        const slug = nextSlug("dup");
        await seedCat({ slug });
        await expect(
          createCategory({ name: "Dup", slug, isActive: true }, null),
        ).rejects.toMatchObject({
          name: "CategoryValidationError",
          field: "slug",
        });
      });

      it("rechaza slug duplicado AUNQUE el dueño esté soft-deleted (findUnique ignora deletedAt)", async () => {
        const slug = nextSlug("dupdel");
        await seedCat({ slug, deletedAt: new Date() });
        // El índice unique de slug no distingue soft-deleted → el guard lo detecta.
        await expect(
          createCategory({ name: "DupDeleted", slug, isActive: true }, null),
        ).rejects.toBeInstanceOf(CategoryValidationError);
      });

      it("rechaza parentId inexistente con CategoryValidationError field=general", async () => {
        await expect(
          createCategory(
            { name: "Huérfana", slug: nextSlug(), isActive: true, parentId: `c${RUN}ghostparent` },
            null,
          ),
        ).rejects.toMatchObject({ name: "CategoryValidationError", field: "general" });
      });

      it("rechaza colgar de una madre que YA es sub-categoría (límite de 1 nivel)", async () => {
        const grandparent = await seedCat();
        const parent = await seedCat({ parentId: grandparent.id }); // ya es subcategoría
        await expect(
          createCategory(
            { name: "Nieta", slug: nextSlug(), isActive: true, parentId: parent.id },
            null,
          ),
        ).rejects.toMatchObject({ name: "CategoryValidationError", field: "general" });
      });

      it("rechaza colgar de una madre soft-deleted (assertValidParent filtra deletedAt:null)", async () => {
        const deletedParent = await seedCat({ deletedAt: new Date() });
        await expect(
          createCategory(
            { name: "DeMadreMuerta", slug: nextSlug(), isActive: true, parentId: deletedParent.id },
            null,
          ),
        ).rejects.toMatchObject({ name: "CategoryValidationError", field: "general" });
      });
    });

    // ───────────────────────── updateCategory ─────────────────────────

    describe("updateCategory", () => {
      it("actualiza name/description y setea updatedBy", async () => {
        const cat = await seedCat({ name: "Antes", description: "vieja" });
        const updated = await updateCategory(
          cat.id,
          { name: "Después", description: "nueva" },
          "admin-9",
        );
        expect(updated.name).toBe("Después");
        expect(updated.description).toBe("nueva");
        expect(updated.updatedBy).toBe("admin-9");
      });

      it("permite renombrar el slug a uno libre", async () => {
        const cat = await seedCat();
        const newSlug = nextSlug("renamed");
        const updated = await updateCategory(cat.id, { slug: newSlug }, null);
        expect(updated.slug).toBe(newSlug);
      });

      it("permite 're-guardar' el mismo slug del propio registro (excluye self con id:not)", async () => {
        const slug = nextSlug("selfsame");
        const cat = await seedCat({ slug });
        const updated = await updateCategory(cat.id, { slug, name: "Tocada" }, null);
        expect(updated.slug).toBe(slug);
        expect(updated.name).toBe("Tocada");
      });

      it("rechaza renombrar a un slug de OTRA categoría viva (CategoryValidationError field=slug)", async () => {
        const taken = nextSlug("taken");
        await seedCat({ slug: taken });
        const other = await seedCat();
        await expect(updateCategory(other.id, { slug: taken }, null)).rejects.toMatchObject({
          name: "CategoryValidationError",
          field: "slug",
        });
      });

      it("rechaza renombrar a un slug de una categoría ARCHIVADA con error amigable (no P2002)", async () => {
        // El UNIQUE de la DB ocupa el slug aunque esté soft-deleted. Antes esto
        // lanzaba un P2002 crudo; ahora findUnique lo detecta → CategoryValidationError.
        const archivedSlug = nextSlug("archived");
        await seedCat({ slug: archivedSlug, deletedAt: new Date() });
        const other = await seedCat();
        await expect(updateCategory(other.id, { slug: archivedSlug }, null)).rejects.toMatchObject({
          name: "CategoryValidationError",
          field: "slug",
        });
      });

      it("update sobre un id inexistente lanza P2025 (no CategoryValidationError)", async () => {
        await expect(updateCategory(`c${RUN}ghostid`, { name: "x" }, null)).rejects.toMatchObject({
          code: "P2025",
        });
      });

      it("al cambiar de madre reubica order al final del nuevo grupo de hermanas", async () => {
        const parentA = await seedCat();
        const parentB = await seedCat();
        // parentB ya tiene 2 hijas (order 0,1) → la movida cae en order 2.
        await seedCat({ parentId: parentB.id, order: 0 });
        await seedCat({ parentId: parentB.id, order: 1 });
        const moving = await seedCat({ parentId: parentA.id, order: 0 });

        const updated = await updateCategory(moving.id, { parentId: parentB.id }, null);
        expect(updated.parentId).toBe(parentB.id);
        expect(updated.order).toBe(2);
      }, 30000);

      it("al promover una sub-categoría a primer nivel (parentId null) revalida y reubica order", async () => {
        const parent = await seedCat();
        const child = await seedCat({ parentId: parent.id, order: 0 });
        const updated = await updateCategory(child.id, { parentId: null }, null);
        expect(updated.parentId).toBeNull();
        // order se recalcula contra el grupo root (>=0); no asumimos valor absoluto
        // porque depende de las root reales, pero debe ser un entero no-negativo.
        expect(updated.order).toBeGreaterThanOrEqual(0);
      });

      it("NO reubica order si parentId no cambia (mismo padre)", async () => {
        const parent = await seedCat();
        await seedCat({ parentId: parent.id, order: 0 });
        const target = await seedCat({ parentId: parent.id, order: 1 });
        // Pasa el MISMO parentId → current.parentId === newParentId → sin override.
        const updated = await updateCategory(
          target.id,
          { parentId: parent.id, name: "Igual" },
          null,
        );
        expect(updated.order).toBe(1); // intacto
        expect(updated.name).toBe("Igual");
      });

      it("rechaza convertirse en su propia madre (parentId === id)", async () => {
        const cat = await seedCat();
        await expect(updateCategory(cat.id, { parentId: cat.id }, null)).rejects.toMatchObject({
          name: "CategoryValidationError",
          field: "general",
        });
      });

      it("rechaza que una madre CON hijas se vuelva sub-categoría de otra", async () => {
        const motherWithChild = await seedCat();
        await seedCat({ parentId: motherWithChild.id });
        const otherRoot = await seedCat();
        await expect(
          updateCategory(motherWithChild.id, { parentId: otherRoot.id }, null),
        ).rejects.toMatchObject({ name: "CategoryValidationError", field: "general" });
      });

      it("rechaza colgar de una madre que ya es sub-categoría (1 nivel) en edición", async () => {
        const grandparent = await seedCat();
        const parentSub = await seedCat({ parentId: grandparent.id });
        const loose = await seedCat();
        await expect(
          updateCategory(loose.id, { parentId: parentSub.id }, null),
        ).rejects.toMatchObject({ name: "CategoryValidationError", field: "general" });
      });
    });

    // ───────────────────────── listCategories ─────────────────────────

    describe("listCategories — búsqueda y filtros", () => {
      it("busca por name case-insensitive", async () => {
        const token = nextSlug("findname").toUpperCase();
        const cat = await seedCat({ name: `Zona${token}` });
        const res = await listCategories({ q: `zona${token}`.toLowerCase() });
        expect(res.map((c) => c.id)).toContain(cat.id);
      });

      it("busca por slug case-insensitive", async () => {
        const slug = nextSlug("findslug");
        const cat = await seedCat({ slug });
        const res = await listCategories({ q: slug.toUpperCase() });
        expect(res.map((c) => c.id)).toContain(cat.id);
      });

      it("trimea q (espacios alrededor no afectan el match)", async () => {
        const token = nextSlug("trim");
        const cat = await seedCat({ name: `Trim${token}` });
        const res = await listCategories({ q: `   Trim${token}   ` });
        expect(res.map((c) => c.id)).toContain(cat.id);
      });

      it("status 'active' → solo isActive=true y deletedAt=null", async () => {
        const token = nextSlug("statusactive");
        const active = await seedCat({ name: `S${token}`, isActive: true });
        const inactive = await seedCat({ name: `S${token}`, isActive: false });
        const archived = await seedCat({
          name: `S${token}`,
          isActive: true,
          deletedAt: new Date(),
        });

        const res = await listCategories({ q: `S${token}`, status: "active" });
        const ids = res.map((c) => c.id);
        expect(ids).toContain(active.id);
        expect(ids).not.toContain(inactive.id);
        expect(ids).not.toContain(archived.id);
      });

      it("status 'inactive' → solo isActive=false y deletedAt=null", async () => {
        const token = nextSlug("statusinactive");
        const active = await seedCat({ name: `I${token}`, isActive: true });
        const inactive = await seedCat({ name: `I${token}`, isActive: false });
        const archived = await seedCat({
          name: `I${token}`,
          isActive: false,
          deletedAt: new Date(),
        });

        const res = await listCategories({ q: `I${token}`, status: "inactive" });
        const ids = res.map((c) => c.id);
        expect(ids).toContain(inactive.id);
        expect(ids).not.toContain(active.id);
        expect(ids).not.toContain(archived.id);
      });

      it("status 'archived' → solo deletedAt != null", async () => {
        const token = nextSlug("statusarchived");
        const active = await seedCat({ name: `A${token}`, isActive: true });
        const archived = await seedCat({ name: `A${token}`, deletedAt: new Date() });

        const res = await listCategories({ q: `A${token}`, status: "archived" });
        const ids = res.map((c) => c.id);
        expect(ids).toContain(archived.id);
        expect(ids).not.toContain(active.id);
      });

      it("status 'all' (default) incluye activas + inactivas + archivadas", async () => {
        const token = nextSlug("statusall");
        const active = await seedCat({ name: `All${token}`, isActive: true });
        const inactive = await seedCat({ name: `All${token}`, isActive: false });
        const archived = await seedCat({ name: `All${token}`, deletedAt: new Date() });

        const res = await listCategories({ q: `All${token}` });
        const ids = res.map((c) => c.id);
        expect(ids).toEqual(expect.arrayContaining([active.id, inactive.id, archived.id]));
      }, 30000);

      it("expone parent.name y _count (products, children) por item", async () => {
        const token = nextSlug("counts");
        const parent = await seedCat({ name: `Parent${token}` });
        const child = await seedCat({ name: `Child${token}`, parentId: parent.id });
        await seedProduct(child.id); // 1 producto activo en la hija
        await seedProduct(child.id, { deletedAt: new Date() }); // soft-deleted

        const res = await listCategories({ q: token });
        const childItem = res.find((c) => c.id === child.id);
        const parentItem = res.find((c) => c.id === parent.id);

        expect(childItem?.parent?.name).toBe(`Parent${token}`);
        // _count.products NO filtra deletedAt → cuenta ambos productos.
        expect(childItem?._count.products).toBe(2);
        expect(childItem?._count.children).toBe(0);
        // La madre tiene 1 hija y 0 productos.
        expect(parentItem?._count.children).toBe(1);
        expect(parentItem?._count.products).toBe(0);
        expect(parentItem?.parent).toBeNull();
      }, 30000);
    });

    describe("listCategories — sort", () => {
      it("sort 'name' ordena alfabético ascendente", async () => {
        const token = nextSlug("sortname");
        await seedCat({ name: `${token}-Carlos`, order: 5 });
        await seedCat({ name: `${token}-Ana`, order: 1 });
        await seedCat({ name: `${token}-Beto`, order: 3 });

        const res = await listCategories({ q: token, sort: "name" });
        const names = res.filter((c) => c.name.startsWith(token)).map((c) => c.name);
        expect(names).toEqual([`${token}-Ana`, `${token}-Beto`, `${token}-Carlos`]);
      }, 30000);

      it("sort 'order' (default) ordena por order asc y desempata por name asc", async () => {
        const token = nextSlug("sortorder");
        // Mismo order para forzar el desempate por name.
        await seedCat({ name: `${token}-B`, order: 7 });
        await seedCat({ name: `${token}-A`, order: 7 });
        await seedCat({ name: `${token}-C`, order: 3 });

        const res = await listCategories({ q: token, sort: "order" });
        const names = res.filter((c) => c.name.startsWith(token)).map((c) => c.name);
        // order 3 primero (C), luego order 7 desempatado por name (A antes que B).
        expect(names).toEqual([`${token}-C`, `${token}-A`, `${token}-B`]);
      }, 30000);

      it("sort 'recent' ordena por createdAt desc (el más nuevo primero)", async () => {
        const token = nextSlug("sortrecent");
        const older = await seedCat({ name: `${token}-old` });
        await prisma.category.update({
          where: { id: older.id },
          data: { createdAt: new Date(Date.now() - 120_000) },
        });
        const newer = await seedCat({ name: `${token}-new` });

        const res = await listCategories({ q: token, sort: "recent" });
        const ids = res.filter((c) => c.name.startsWith(token)).map((c) => c.id);
        expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
      }, 30000);
    });

    // ───────────────────────── listParentCategoryOptions ─────────────────────────

    describe("listParentCategoryOptions", () => {
      it("incluye solo categorías de primer nivel no archivadas", async () => {
        const token = nextSlug("parentopt");
        const root = await seedCat({ name: `Root${token}` });
        const sub = await seedCat({ name: `Sub${token}`, parentId: root.id });
        const archivedRoot = await seedCat({ name: `Arch${token}`, deletedAt: new Date() });

        const opts = await listParentCategoryOptions();
        const ids = opts.map((o) => o.id);
        expect(ids).toContain(root.id);
        expect(ids).not.toContain(sub.id); // tiene parentId
        expect(ids).not.toContain(archivedRoot.id); // soft-deleted
      }, 30000);

      it("incluye categorías inactivas de primer nivel (solo filtra parentId/deletedAt, no isActive)", async () => {
        const inactiveRoot = await seedCat({ name: `${RUN} InactiveRoot`, isActive: false });
        const opts = await listParentCategoryOptions();
        expect(opts.map((o) => o.id)).toContain(inactiveRoot.id);
      });

      it("excluye excludeId (la propia categoría en edición)", async () => {
        const a = await seedCat();
        const b = await seedCat();
        const opts = await listParentCategoryOptions(a.id);
        const ids = opts.map((o) => o.id);
        expect(ids).not.toContain(a.id);
        expect(ids).toContain(b.id);
      });

      it("proyecta solo id y name", async () => {
        const root = await seedCat();
        const opts = await listParentCategoryOptions();
        const item = opts.find((o) => o.id === root.id);
        expect(item).toBeDefined();
        expect(Object.keys(item!).sort()).toEqual(["id", "name"]);
      });
    });

    // ───────────────────────── moveCategory ─────────────────────────

    describe("moveCategory", () => {
      it("'up' intercambia con la hermana anterior y re-secuencia el grupo a 0..n", async () => {
        const parent = await seedCat();
        const a = await seedCat({ parentId: parent.id, order: 0, name: "A" });
        const b = await seedCat({ parentId: parent.id, order: 1, name: "B" });
        const c = await seedCat({ parentId: parent.id, order: 2, name: "C" });

        await moveCategory(b.id, "up", "admin-mover");

        const after = await prisma.category.findMany({
          where: { parentId: parent.id, deletedAt: null },
          orderBy: { order: "asc" },
          select: { id: true, order: true, updatedBy: true },
        });
        // Orden esperado: B, A, C con order 0,1,2.
        expect(after.map((x) => x.id)).toEqual([b.id, a.id, c.id]);
        expect(after.map((x) => x.order)).toEqual([0, 1, 2]);
        // updatedBy solo se setea en la categoría movida (b).
        expect(after.find((x) => x.id === b.id)?.updatedBy).toBe("admin-mover");
        expect(after.find((x) => x.id === a.id)?.updatedBy).toBeNull();
      }, 30000);

      it("'down' intercambia con la hermana siguiente", async () => {
        const parent = await seedCat();
        const a = await seedCat({ parentId: parent.id, order: 0 });
        const b = await seedCat({ parentId: parent.id, order: 1 });
        const c = await seedCat({ parentId: parent.id, order: 2 });

        await moveCategory(a.id, "down", null);

        const after = await prisma.category.findMany({
          where: { parentId: parent.id, deletedAt: null },
          orderBy: { order: "asc" },
          select: { id: true },
        });
        expect(after.map((x) => x.id)).toEqual([b.id, a.id, c.id]);
      }, 30000);

      it("'up' en el primer elemento es no-op (ya en el borde)", async () => {
        const parent = await seedCat();
        const a = await seedCat({ parentId: parent.id, order: 0 });
        const b = await seedCat({ parentId: parent.id, order: 1 });

        await moveCategory(a.id, "up", null);

        const after = await prisma.category.findMany({
          where: { parentId: parent.id, deletedAt: null },
          orderBy: { order: "asc" },
          select: { id: true },
        });
        expect(after.map((x) => x.id)).toEqual([a.id, b.id]); // sin cambios
      }, 30000);

      it("'down' en el último elemento es no-op", async () => {
        const parent = await seedCat();
        const a = await seedCat({ parentId: parent.id, order: 0 });
        const b = await seedCat({ parentId: parent.id, order: 1 });

        await moveCategory(b.id, "down", null);

        const after = await prisma.category.findMany({
          where: { parentId: parent.id, deletedAt: null },
          orderBy: { order: "asc" },
          select: { id: true },
        });
        expect(after.map((x) => x.id)).toEqual([a.id, b.id]);
      }, 30000);

      it("re-secuencia un grupo con orders DUPLICADOS (datos legacy en 0) de forma robusta", async () => {
        const parent = await seedCat();
        // Todas con order 0 → desempate por name asc: Alpha, Beta, Gamma.
        const alpha = await seedCat({ parentId: parent.id, order: 0, name: "Alpha" });
        const beta = await seedCat({ parentId: parent.id, order: 0, name: "Beta" });
        const gamma = await seedCat({ parentId: parent.id, order: 0, name: "Gamma" });

        // mover Gamma 'up' → intercambia con Beta (su vecina previa en el orden estable).
        await moveCategory(gamma.id, "up", null);

        const after = await prisma.category.findMany({
          where: { parentId: parent.id, deletedAt: null },
          orderBy: { order: "asc" },
          select: { id: true, order: true },
        });
        // Resultado: Alpha(0), Gamma(1), Beta(2) — todos con order único 0..2.
        expect(after.map((x) => x.id)).toEqual([alpha.id, gamma.id, beta.id]);
        expect(after.map((x) => x.order)).toEqual([0, 1, 2]);
      }, 30000);

      it("ignora hermanas soft-deleted al construir el grupo (no las cuenta como vecinas)", async () => {
        const parent = await seedCat();
        const a = await seedCat({ parentId: parent.id, order: 0, name: "A" });
        await seedCat({ parentId: parent.id, order: 1, name: "Dead", deletedAt: new Date() });
        const c = await seedCat({ parentId: parent.id, order: 2, name: "C" });

        // El grupo "vivo" es [A, C]. Mover C 'up' debe intercambiar con A (no con la muerta).
        await moveCategory(c.id, "up", null);

        const after = await prisma.category.findMany({
          where: { parentId: parent.id, deletedAt: null },
          orderBy: { order: "asc" },
          select: { id: true },
        });
        expect(after.map((x) => x.id)).toEqual([c.id, a.id]);
      }, 30000);

      it("id inexistente es no-op silencioso (cat null → return)", async () => {
        await expect(moveCategory(`c${RUN}ghostmove`, "up", null)).resolves.toBeUndefined();
      });
    });

    // ───────────────────────── softDeleteCategory ─────────────────────────

    describe("softDeleteCategory", () => {
      it("archiva: setea deletedAt, isActive=false y deletedBy", async () => {
        const cat = await seedCat({ isActive: true });
        const before = Date.now();
        const deleted = await softDeleteCategory(cat.id, "admin-del");
        expect(deleted.deletedAt).toBeInstanceOf(Date);
        expect(deleted.deletedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
        expect(deleted.isActive).toBe(false);
        expect(deleted.deletedBy).toBe("admin-del");
      });

      it("bloquea el archivado si tiene >=1 producto ACTIVO (CategoryValidationError field=general)", async () => {
        const cat = await seedCat();
        await seedProduct(cat.id); // producto activo
        await expect(softDeleteCategory(cat.id, null)).rejects.toMatchObject({
          name: "CategoryValidationError",
          field: "general",
        });

        // Y no debe haberla archivado (sigue viva).
        const still = await prisma.category.findUnique({ where: { id: cat.id } });
        expect(still?.deletedAt).toBeNull();
      });

      it("PERMITE archivar si los productos asociados están soft-deleted (no cuentan)", async () => {
        const cat = await seedCat();
        await seedProduct(cat.id, { deletedAt: new Date() }); // solo productos archivados
        const deleted = await softDeleteCategory(cat.id, null);
        expect(deleted.deletedAt).toBeInstanceOf(Date);
      });

      it("el mensaje de bloqueo incluye el conteo de productos activos", async () => {
        const cat = await seedCat();
        await seedProduct(cat.id);
        await seedProduct(cat.id);
        await expect(softDeleteCategory(cat.id, null)).rejects.toThrow(/2 producto/);
      });
    });

    // ───────────────────────── restoreCategory ─────────────────────────

    describe("restoreCategory", () => {
      it("restaura: limpia deletedAt/deletedBy, deja isActive=false y setea updatedBy", async () => {
        const cat = await seedCat({ deletedAt: new Date(), isActive: false });
        // Sembramos deletedBy para verificar que se limpia.
        await prisma.category.update({ where: { id: cat.id }, data: { deletedBy: "someone" } });

        const restored = await restoreCategory(cat.id, "admin-restore");
        expect(restored.deletedAt).toBeNull();
        expect(restored.deletedBy).toBeNull();
        // Política: queda inactiva para no reaparecer en storefront sin querer.
        expect(restored.isActive).toBe(false);
        expect(restored.updatedBy).toBe("admin-restore");
      });

      it("restoredBy null → no setea updatedBy (queda como estaba)", async () => {
        const cat = await seedCat({ deletedAt: new Date() });
        const restored = await restoreCategory(cat.id, null);
        expect(restored.deletedAt).toBeNull();
        expect(restored.updatedBy).toBeNull();
      });
    });

    // ───────────────────────── toggleCategoryActive ─────────────────────────

    describe("toggleCategoryActive", () => {
      it("activa una categoría inactiva (isActive=true) y setea updatedBy", async () => {
        const cat = await seedCat({ isActive: false });
        const toggled = await toggleCategoryActive(cat.id, true, "admin-toggle");
        expect(toggled.isActive).toBe(true);
        expect(toggled.updatedBy).toBe("admin-toggle");
      });

      it("desactiva una categoría activa (isActive=false) sin tocar deletedAt", async () => {
        const cat = await seedCat({ isActive: true });
        const toggled = await toggleCategoryActive(cat.id, false, null);
        expect(toggled.isActive).toBe(false);
        expect(toggled.deletedAt).toBeNull(); // no archiva
      });
    });

    // ───────────────────────── integridad / seguridad ─────────────────────────

    describe("integridad de constraints DB", () => {
      it("el slug es único a nivel DB: insertar duplicado directo lanza P2002 (target slug)", async () => {
        const slug = nextSlug("dbunique");
        await seedCat({ slug });
        await expect(
          prisma.category.create({ data: { slug, name: "Colisión" } }),
        ).rejects.toMatchObject({ code: "P2002", meta: { target: ["slug"] } });
      });

      it("Category.parent es onDelete:Restrict — hard-delete de una madre con hija viva → P2003", async () => {
        const parent = await seedCat();
        await seedCat({ parentId: parent.id });
        await expect(prisma.category.delete({ where: { id: parent.id } })).rejects.toMatchObject({
          code: "P2003",
        });
      });

      it("el slug-conflict de createCategory NO afecta a otros campos: dos categorías con MISMO name pero slug distinto coexisten", async () => {
        const name = `${RUN} NombreRepetido`;
        const a = await createCategory({ name, slug: nextSlug(), isActive: true }, null);
        const b = await createCategory({ name, slug: nextSlug(), isActive: true }, null);
        expect(a.id).not.toBe(b.id);
        expect(a.name).toBe(b.name); // name NO es unique
      }, 30000);

      it("Prisma namespace expone PrismaClientKnownRequestError (sanity del import usado en aserciones)", () => {
        expect(typeof Prisma.PrismaClientKnownRequestError).toBe("function");
      });
    });
  },
);
