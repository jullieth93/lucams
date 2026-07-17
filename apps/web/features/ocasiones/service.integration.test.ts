/*
 * Tests de integración del SERVICE de OCASIONES (OcasionTag) contra la DB real.
 *
 * Módulo DB-coupled (importa `prisma` de @/lib/db). Foco PLAN_CATALOG_V2 1.5 +
 * 2.10 + 3.4 — CRUD de tags por ocasión + asociación Product ↔ Ocasión:
 *   - listOcasionTags: filtro deletedAt:null (siempre), status all/active/inactive,
 *     búsqueda q por name OR slug (case-insensitive), sort order/name/recent,
 *     _count.products derivado.
 *   - getOcasionTag(id): detail con productos asociados embebidos (incluye
 *     soft-deleted — el include NO filtra), null para id inexistente.
 *   - createOcasionTag: unicidad de slug (OcasionValidationError), createdBy,
 *     manejo de suggestedQuantityRange (Json | JsonNull), monthHint opcional.
 *   - updateOcasionTag: updatedBy, suggestedQuantityRange undefined (no toca) vs
 *     null (JsonNull), P2025 en id inexistente.
 *   - softDeleteOcasionTag: setea deletedAt/deletedBy/isActive=false → desaparece
 *     del listado.
 *   - linkProductToOcasion (upsert): create + update de rationale sin duplicar el
 *     par; rationale null permitido.
 *   - unlinkProductFromOcasion: borra el par; P2025 si el par no existe.
 *   - getProductsForOcasion: lista los pares con product embebido (id/slug/name/
 *     isActive); NO filtra soft-deleted.
 *
 * Requiere DATABASE_URL (corre vía `dotenv -e .env.local -- vitest`). Sin ella se
 * salta (skipIf) para no romper CI sin DB.
 *
 * Aislamiento ESTRICTO: todo identificador natural creado en esta corrida lleva el
 * prefijo único `RUN` en minúsculas (OcasionTag.slug, Category.slug, Product.slug+
 * sku). La limpieza en afterAll borra EXACTAMENTE lo creado, SCOPED al prefijo —
 * JAMÁS un deleteMany sin filtro, nunca toca datos reales (seed, cuenta de Lucy).
 * Orden de borrado respeta FKs: ProductOcasionTag (pivot, Cascade) → OcasionTag /
 * Product → Category.
 *
 * `next/cache.updateTag` se mockea a no-op: fuera de un Server Action real lanza
 * ("can only be called from within a Server Action"). El service lo invoca tras
 * cada mutación; aquí no nos interesa la revalidación sino el efecto en DB.
 *
 * Todo valor esperado se verificó contra la DB real (probe descartado) antes de
 * fijar las aserciones: slug duplicado → OcasionValidationError(field:slug);
 * update/delete de id inexistente → PrismaClientKnownRequestError P2025; el upsert
 * del link no duplica el par (mismo PK compuesto); getProductsForOcasion y
 * getOcasionTag incluyen productos soft-deleted (el include no lleva where).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/db";
import {
  OcasionValidationError,
  createOcasionTag,
  getOcasionTag,
  getProductsForOcasion,
  linkProductToOcasion,
  listOcasionTags,
  softDeleteOcasionTag,
  unlinkProductFromOcasion,
  updateOcasionTag,
} from "./service";
import type { OcasionCreateInput } from "./schemas";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida (minúsculas: slugs son kebab-case). Todo identificador
// natural lo lleva → la limpieza borra exactamente lo creado sin tocar datos reales.
const RUN = `itestoca${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const ACTOR = `actor-${RUN}`;

// Contador monotónico para slugs únicos dentro de la corrida sin depender del azar.
let seq = 0;
function nextSlug(label: string): string {
  seq += 1;
  return `${RUN}-${label}-${seq}`;
}

// Descripción válida según OcasionCreateSchema (min 20 chars). El service NO valida
// (la validación Zod corre upstream en la Server Action); pasamos inputs ya válidos
// para reflejar el contrato real del service.
const DESC = "Descripción semántica de la ocasión para alimentar al bot AI Fase 5.";

// Input base válido; cada test sobrescribe lo que necesita.
function baseInput(over: Partial<OcasionCreateInput> = {}): OcasionCreateInput {
  return {
    slug: nextSlug("oc"),
    name: "Ocasión Base",
    description: DESC,
    monthHint: null,
    suggestedQuantityRange: null,
    order: 0,
    isActive: true,
    ...over,
  };
}

// Fixtures compartidos (RUN-scoped) para asociación Product ↔ Ocasión.
let sharedCategoryId = "";
let sharedProductId = "";
let sharedProductSlug = "";

// Crea un OcasionTag vía service y devuelve la fila. Garantiza createdBy=ACTOR.
async function makeTag(over: Partial<OcasionCreateInput> = {}) {
  return createOcasionTag(baseInput(over), ACTOR);
}

// Timeout generoso: el pooler de Supabase (pgbouncer :6543) es lento bajo
// concurrencia; el default de 5s no alcanza. Espeja los otros .integration.test.ts.
const T = 30_000;

describe.skipIf(!hasDb)(
  "ocasiones/service — integración DB (OcasionTag, PLAN_CATALOG_V2 1.5/2.10/3.4)",
  { timeout: T },
  () => {
    beforeAll(async () => {
      const category = await prisma.category.create({
        data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
      });
      sharedCategoryId = category.id;
      const product = await prisma.product.create({
        data: {
          slug: `${RUN}-prod`,
          name: `Prod ${RUN}`,
          description: "fixture producto para asociación ocasión",
          basePrice: 50_000,
          sku: `${RUN}-SKU`.toUpperCase(),
          categoryId: category.id,
        },
      });
      sharedProductId = product.id;
      sharedProductSlug = product.slug;
    });

    afterAll(async () => {
      // Orden de borrado respeta FKs. Todo SCOPED al prefijo RUN.
      // ProductOcasionTag (pivot) referencia tag (Cascade) y product (Cascade); lo
      // borramos explícito por claridad y para no dejar huérfanos si algo cambia.
      await prisma.productOcasionTag.deleteMany({
        where: { ocasionTag: { slug: { startsWith: RUN } } },
      });
      if (sharedProductId) {
        await prisma.productOcasionTag.deleteMany({ where: { productId: sharedProductId } });
      }
      await prisma.ocasionTag.deleteMany({ where: { slug: { startsWith: RUN } } });
      if (sharedProductId) {
        await prisma.product.deleteMany({ where: { id: sharedProductId } });
      }
      if (sharedCategoryId) {
        await prisma.category.deleteMany({ where: { id: sharedCategoryId } });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // createOcasionTag
    // ════════════════════════════════════════════════════════════════════════

    describe("createOcasionTag", () => {
      it("crea el tag con createdBy = actor y persiste los campos base", async () => {
        const slug = nextSlug("create");
        const tag = await createOcasionTag(
          baseInput({ slug, name: "Día de la Madre", monthHint: 5, order: 7 }),
          ACTOR,
        );
        expect(tag.id).toBeTruthy();
        expect(tag.slug).toBe(slug);
        expect(tag.name).toBe("Día de la Madre");
        expect(tag.description).toBe(DESC);
        expect(tag.monthHint).toBe(5);
        expect(tag.order).toBe(7);
        expect(tag.isActive).toBe(true);
        expect(tag.createdBy).toBe(ACTOR);
        expect(tag.updatedBy).toBeNull();
        expect(tag.deletedAt).toBeNull();

        // Persistencia real (no solo el valor retornado).
        const row = await prisma.ocasionTag.findUnique({ where: { id: tag.id } });
        expect(row?.createdBy).toBe(ACTOR);
        expect(row?.slug).toBe(slug);
      });

      it("guarda suggestedQuantityRange como objeto JSON cuando se provee", async () => {
        const tag = await makeTag({ suggestedQuantityRange: { min: 1, ideal: 5, max: 10 } });
        expect(tag.suggestedQuantityRange).toEqual({ min: 1, ideal: 5, max: 10 });

        const row = await prisma.ocasionTag.findUnique({
          where: { id: tag.id },
          select: { suggestedQuantityRange: true },
        });
        expect(row?.suggestedQuantityRange).toEqual({ min: 1, ideal: 5, max: 10 });
      });

      it("guarda suggestedQuantityRange como NULL (JsonNull) cuando es null", async () => {
        const tag = await makeTag({ suggestedQuantityRange: null });
        // Prisma.JsonNull se materializa como SQL NULL → la fila lo devuelve como null.
        expect(tag.suggestedQuantityRange).toBeNull();
      });

      it("monthHint null se persiste como null (ocasión sin mes, ej. Cumpleaños)", async () => {
        const tag = await makeTag({ monthHint: null });
        expect(tag.monthHint).toBeNull();
      });

      it("rechaza slug duplicado con OcasionValidationError(field=slug) y NO crea fila", async () => {
        const slug = nextSlug("dup");
        await createOcasionTag(baseInput({ slug }), ACTOR);

        const before = await prisma.ocasionTag.count({ where: { slug } });
        expect(before).toBe(1);

        await expect(
          createOcasionTag(baseInput({ slug, name: "Otra" }), ACTOR),
        ).rejects.toThrowError(OcasionValidationError);

        // Verificación fina del shape del error + que no se duplicó la fila.
        const err = await createOcasionTag(baseInput({ slug }), ACTOR).catch((e) => e);
        expect(err).toBeInstanceOf(OcasionValidationError);
        expect(err.field).toBe("slug");
        expect(err.name).toBe("OcasionValidationError");
        expect(err.message).toMatch(/slug/i);
        expect(await prisma.ocasionTag.count({ where: { slug } })).toBe(1);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // updateOcasionTag
    // ════════════════════════════════════════════════════════════════════════

    describe("updateOcasionTag", () => {
      it("actualiza campos parciales y setea updatedBy", async () => {
        const tag = await makeTag({ name: "Original", order: 1 });
        const updated = await updateOcasionTag(
          { id: tag.id, name: "Renombrada", order: 99, isActive: false },
          `${ACTOR}-editor`,
        );
        expect(updated.name).toBe("Renombrada");
        expect(updated.order).toBe(99);
        expect(updated.isActive).toBe(false);
        expect(updated.updatedBy).toBe(`${ACTOR}-editor`);
        // createdBy NO se toca en update.
        expect(updated.createdBy).toBe(ACTOR);
      });

      it("suggestedQuantityRange OMITIDO (undefined) NO modifica el valor existente", async () => {
        const tag = await makeTag({ suggestedQuantityRange: { min: 2, ideal: 8, max: 20 } });
        // Update sin la key suggestedQuantityRange → debe preservarse el objeto previo.
        const updated = await updateOcasionTag({ id: tag.id, name: "Solo nombre" }, ACTOR);
        expect(updated.name).toBe("Solo nombre");
        expect(updated.suggestedQuantityRange).toEqual({ min: 2, ideal: 8, max: 20 });
      });

      it("suggestedQuantityRange = null lo borra (JsonNull)", async () => {
        const tag = await makeTag({ suggestedQuantityRange: { min: 1, ideal: 3, max: 5 } });
        const updated = await updateOcasionTag({ id: tag.id, suggestedQuantityRange: null }, ACTOR);
        expect(updated.suggestedQuantityRange).toBeNull();
      });

      it("suggestedQuantityRange con nuevo objeto reemplaza el anterior", async () => {
        const tag = await makeTag({ suggestedQuantityRange: { min: 1, ideal: 1, max: 1 } });
        const updated = await updateOcasionTag(
          { id: tag.id, suggestedQuantityRange: { min: 10, ideal: 30, max: 50 } },
          ACTOR,
        );
        expect(updated.suggestedQuantityRange).toEqual({ min: 10, ideal: 30, max: 50 });
      });

      it("id inexistente lanza PrismaClientKnownRequestError P2025", async () => {
        await expect(
          updateOcasionTag({ id: `${RUN}-no-such-id`, name: "x" }, ACTOR),
        ).rejects.toMatchObject({ code: "P2025" });
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // softDeleteOcasionTag
    // ════════════════════════════════════════════════════════════════════════

    describe("softDeleteOcasionTag", () => {
      it("setea deletedAt + deletedBy y fuerza isActive=false", async () => {
        const tag = await makeTag({ isActive: true });
        await softDeleteOcasionTag(tag.id, `${ACTOR}-deleter`);

        const row = await prisma.ocasionTag.findUnique({
          where: { id: tag.id },
          select: { deletedAt: true, deletedBy: true, isActive: true },
        });
        expect(row?.deletedAt).toBeInstanceOf(Date);
        expect(row?.deletedBy).toBe(`${ACTOR}-deleter`);
        expect(row?.isActive).toBe(false);
      });

      it("un tag soft-deleted desaparece de listOcasionTags (filtro deletedAt:null)", async () => {
        const tag = await makeTag({ name: "AEliminar" });
        // Sanity: aparece antes de borrar.
        const before = await listOcasionTags({ q: tag.slug });
        expect(before.map((o) => o.id)).toContain(tag.id);

        await softDeleteOcasionTag(tag.id, ACTOR);

        const after = await listOcasionTags({ q: tag.slug });
        expect(after.map((o) => o.id)).not.toContain(tag.id);
      });

      it("id inexistente lanza P2025 (update bajo el capó)", async () => {
        await expect(softDeleteOcasionTag(`${RUN}-ghost`, ACTOR)).rejects.toMatchObject({
          code: "P2025",
        });
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // getOcasionTag
    // ════════════════════════════════════════════════════════════════════════

    describe("getOcasionTag", () => {
      it("retorna null para un id inexistente", async () => {
        expect(await getOcasionTag(`${RUN}-no-such`)).toBeNull();
      });

      it("retorna el tag con products[] embebidos (product id/slug/name/isActive/deletedAt)", async () => {
        const tag = await makeTag({ name: "ConProductos" });
        await linkProductToOcasion(sharedProductId, tag.id, "porque es ideal");

        const detail = await getOcasionTag(tag.id);
        expect(detail).not.toBeNull();
        expect(detail!.id).toBe(tag.id);
        expect(detail!.products).toHaveLength(1);

        const pivot = detail!.products[0];
        expect(pivot.productId).toBe(sharedProductId);
        expect(pivot.ocasionTagId).toBe(tag.id);
        expect(pivot.rationale).toBe("porque es ideal");
        // El producto embebido trae EXACTAMENTE el select del service.
        expect(pivot.product.id).toBe(sharedProductId);
        expect(pivot.product.slug).toBe(sharedProductSlug);
        expect(pivot.product.name).toBe(`Prod ${RUN}`);
        expect(pivot.product.isActive).toBe(true);
        expect(pivot.product.deletedAt).toBeNull();

        // Cleanup del link de este test (no contaminar otros).
        await unlinkProductFromOcasion(sharedProductId, tag.id);
      });

      it("retorna el tag (NO null) aunque esté soft-deleted — getOcasionTag NO filtra deletedAt", async () => {
        // getOcasionTag usa findUnique({where:{id}}) sin deletedAt:null → un tag
        // borrado lógicamente SIGUE siendo recuperable por id (a diferencia del list).
        const tag = await makeTag();
        await softDeleteOcasionTag(tag.id, ACTOR);

        const detail = await getOcasionTag(tag.id);
        expect(detail).not.toBeNull();
        expect(detail!.id).toBe(tag.id);
        expect(detail!.deletedAt).toBeInstanceOf(Date);
      });

      it("tag sin productos asociados retorna products: []", async () => {
        const tag = await makeTag();
        const detail = await getOcasionTag(tag.id);
        expect(detail!.products).toEqual([]);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // listOcasionTags — filtro de soft-delete (siempre) + _count
    // ════════════════════════════════════════════════════════════════════════

    describe("listOcasionTags — base, soft-delete y _count", () => {
      it("excluye SIEMPRE los soft-deleted, incluso con status 'all'", async () => {
        const alive = await makeTag({ name: "Vivo" });
        const dead = await makeTag({ name: "Muerto" });
        await softDeleteOcasionTag(dead.id, ACTOR);

        const res = await listOcasionTags({ q: RUN, status: "all" });
        const ids = res.map((o) => o.id);
        expect(ids).toContain(alive.id);
        expect(ids).not.toContain(dead.id);

        // Invariante sobre TODO el conjunto retornado (no solo nuestros seeds).
        expect(res.every((o) => o.deletedAt === null)).toBe(true);
      });

      it("_count.products refleja el número de asociaciones del tag", async () => {
        const tag = await makeTag({ name: "Contado" });

        const zero = (await listOcasionTags({ q: tag.slug }))[0];
        expect(zero._count.products).toBe(0);

        await linkProductToOcasion(sharedProductId, tag.id, null);
        const one = (await listOcasionTags({ q: tag.slug }))[0];
        expect(one._count.products).toBe(1);

        await unlinkProductFromOcasion(sharedProductId, tag.id);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // listOcasionTags — status filter
    // ════════════════════════════════════════════════════════════════════════

    describe("listOcasionTags — filtro status", () => {
      it("status 'active' devuelve solo isActive=true", async () => {
        const token = nextSlug("st-active");
        const active = await makeTag({
          slug: `${token}-a`,
          name: `${token}-Activo`,
          isActive: true,
        });
        const inactive = await makeTag({
          slug: `${token}-i`,
          name: `${token}-Inactivo`,
          isActive: false,
        });

        const res = await listOcasionTags({ q: token, status: "active" });
        const ids = res.map((o) => o.id);
        expect(ids).toContain(active.id);
        expect(ids).not.toContain(inactive.id);
        expect(res.every((o) => o.isActive === true)).toBe(true);
      });

      it("status 'inactive' devuelve solo isActive=false", async () => {
        const token = nextSlug("st-inactive");
        const active = await makeTag({
          slug: `${token}-a`,
          name: `${token}-Activo`,
          isActive: true,
        });
        const inactive = await makeTag({
          slug: `${token}-i`,
          name: `${token}-Inactivo`,
          isActive: false,
        });

        const res = await listOcasionTags({ q: token, status: "inactive" });
        const ids = res.map((o) => o.id);
        expect(ids).toContain(inactive.id);
        expect(ids).not.toContain(active.id);
        expect(res.every((o) => o.isActive === false)).toBe(true);
      });

      it("status 'all' (y default) NO filtra por isActive", async () => {
        const token = nextSlug("st-all");
        const active = await makeTag({
          slug: `${token}-a`,
          name: `${token}-Activo`,
          isActive: true,
        });
        const inactive = await makeTag({
          slug: `${token}-i`,
          name: `${token}-Inactivo`,
          isActive: false,
        });

        const explicitAll = await listOcasionTags({ q: token, status: "all" });
        expect(explicitAll.map((o) => o.id)).toEqual(
          expect.arrayContaining([active.id, inactive.id]),
        );

        // Sin status → mismo comportamiento que 'all'.
        const defaulted = await listOcasionTags({ q: token });
        expect(defaulted.map((o) => o.id)).toEqual(
          expect.arrayContaining([active.id, inactive.id]),
        );
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // listOcasionTags — búsqueda q (name OR slug, case-insensitive)
    // ════════════════════════════════════════════════════════════════════════

    describe("listOcasionTags — búsqueda q", () => {
      it("encuentra por fragmento de NAME case-insensitive", async () => {
        const token = nextSlug("byname");
        const tag = await makeTag({ slug: token, name: `Aniversario${token}` });
        // Buscamos en MAYÚSCULAS un name con casing mixto → mode insensitive.
        const res = await listOcasionTags({ q: `Aniversario${token}`.toUpperCase() });
        expect(res.map((o) => o.id)).toContain(tag.id);
      });

      it("encuentra por fragmento de SLUG case-insensitive", async () => {
        const token = nextSlug("byslug");
        const tag = await makeTag({ slug: token, name: "Sin Token En Nombre" });
        // El token vive solo en el slug; buscarlo en MAYÚSCULAS igual matchea.
        const res = await listOcasionTags({ q: token.toUpperCase() });
        expect(res.map((o) => o.id)).toContain(tag.id);
      });

      it("trimea q: espacios alrededor no afectan el match", async () => {
        const token = nextSlug("trim");
        const tag = await makeTag({ slug: token, name: `Trimmed${token}` });
        const res = await listOcasionTags({ q: `   ${token}   ` });
        expect(res.map((o) => o.id)).toContain(tag.id);
      });

      it("q que no matchea ningún registro devuelve lista vacía", async () => {
        const res = await listOcasionTags({ q: `${RUN}-zzz-no-existe-jamas` });
        expect(res).toEqual([]);
      });

      it("q vacío/whitespace se trata como sin filtro (no rompe el where)", async () => {
        const token = nextSlug("emptyq");
        const tag = await makeTag({ slug: token, name: `Empty${token}` });
        // q="   " → tras trim queda "" (falsy) → no se agrega OR de búsqueda.
        const res = await listOcasionTags({ q: "   " });
        // El listado global (sin filtro de q) incluye nuestro tag vivo.
        expect(res.map((o) => o.id)).toContain(tag.id);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // listOcasionTags — sort
    // ════════════════════════════════════════════════════════════════════════

    describe("listOcasionTags — sort", () => {
      it("sort 'order' (default) ordena por order asc", async () => {
        const token = nextSlug("sort-order");
        const high = await makeTag({ slug: `${token}-h`, name: `${token} H`, order: 300 });
        const low = await makeTag({ slug: `${token}-l`, name: `${token} L`, order: 100 });
        const mid = await makeTag({ slug: `${token}-m`, name: `${token} M`, order: 200 });

        const res = await listOcasionTags({ q: token, sort: "order" });
        const idx = (id: string) => res.findIndex((o) => o.id === id);
        expect(idx(low.id)).toBeLessThan(idx(mid.id));
        expect(idx(mid.id)).toBeLessThan(idx(high.id));

        // Sin sort → mismo orden (default = order).
        const defaulted = await listOcasionTags({ q: token });
        const idxD = (id: string) => defaulted.findIndex((o) => o.id === id);
        expect(idxD(low.id)).toBeLessThan(idxD(mid.id));
        expect(idxD(mid.id)).toBeLessThan(idxD(high.id));
      });

      it("sort 'name' ordena alfabéticamente por name asc", async () => {
        const token = nextSlug("sort-name");
        // Orders fuera de fase con el nombre → probamos que NO ordena por order.
        const c = await makeTag({ slug: `${token}-c`, name: `${token}-Carlos`, order: 1 });
        const a = await makeTag({ slug: `${token}-a`, name: `${token}-Ana`, order: 3 });
        const b = await makeTag({ slug: `${token}-b`, name: `${token}-Beto`, order: 2 });

        const res = await listOcasionTags({ q: token, sort: "name" });
        const ordered = res.filter((o) => [a.id, b.id, c.id].includes(o.id)).map((o) => o.id);
        expect(ordered).toEqual([a.id, b.id, c.id]); // Ana < Beto < Carlos
      });

      it("sort 'recent' ordena por createdAt desc (el más nuevo primero)", async () => {
        const token = nextSlug("sort-recent");
        const older = await makeTag({ slug: `${token}-o`, name: `${token} O` });
        // Forzamos createdAt distinto para evitar empates por timestamp idéntico.
        await prisma.ocasionTag.update({
          where: { id: older.id },
          data: { createdAt: new Date(Date.now() - 120_000) },
        });
        const newer = await makeTag({ slug: `${token}-n`, name: `${token} N` });

        const res = await listOcasionTags({ q: token, sort: "recent" });
        const idx = (id: string) => res.findIndex((o) => o.id === id);
        expect(idx(newer.id)).toBeGreaterThanOrEqual(0);
        expect(idx(older.id)).toBeGreaterThanOrEqual(0);
        expect(idx(newer.id)).toBeLessThan(idx(older.id));
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // linkProductToOcasion (upsert) / unlinkProductFromOcasion
    // ════════════════════════════════════════════════════════════════════════

    describe("linkProductToOcasion / unlinkProductFromOcasion", () => {
      it("link crea el par con rationale", async () => {
        const tag = await makeTag();
        await linkProductToOcasion(sharedProductId, tag.id, "regalo perfecto");

        const links = await getProductsForOcasion(tag.id);
        expect(links).toHaveLength(1);
        expect(links[0].productId).toBe(sharedProductId);
        expect(links[0].rationale).toBe("regalo perfecto");

        await unlinkProductFromOcasion(sharedProductId, tag.id);
      });

      it("link con rationale=null se permite", async () => {
        const tag = await makeTag();
        await linkProductToOcasion(sharedProductId, tag.id, null);
        const links = await getProductsForOcasion(tag.id);
        expect(links[0].rationale).toBeNull();
        await unlinkProductFromOcasion(sharedProductId, tag.id);
      });

      it("re-link del MISMO par NO duplica: upsert actualiza el rationale", async () => {
        const tag = await makeTag();
        await linkProductToOcasion(sharedProductId, tag.id, "v1");
        await linkProductToOcasion(sharedProductId, tag.id, "v2");

        const links = await getProductsForOcasion(tag.id);
        // PK compuesto (productId, ocasionTagId) → un solo par, rationale actualizado.
        expect(links).toHaveLength(1);
        expect(links[0].rationale).toBe("v2");

        // El _count del tag también ve un solo par.
        const listed = (await listOcasionTags({ q: tag.slug }))[0];
        expect(listed._count.products).toBe(1);

        await unlinkProductFromOcasion(sharedProductId, tag.id);
      });

      it("re-link puede cambiar rationale de un valor a null (update con null)", async () => {
        const tag = await makeTag();
        await linkProductToOcasion(sharedProductId, tag.id, "tiene razón");
        await linkProductToOcasion(sharedProductId, tag.id, null);
        const links = await getProductsForOcasion(tag.id);
        expect(links).toHaveLength(1);
        expect(links[0].rationale).toBeNull();
        await unlinkProductFromOcasion(sharedProductId, tag.id);
      });

      it("unlink borra el par; getProductsForOcasion queda vacío", async () => {
        const tag = await makeTag();
        await linkProductToOcasion(sharedProductId, tag.id, "x");
        expect(await getProductsForOcasion(tag.id)).toHaveLength(1);

        await unlinkProductFromOcasion(sharedProductId, tag.id);
        expect(await getProductsForOcasion(tag.id)).toHaveLength(0);

        // La fila pivot ya no existe en DB.
        const row = await prisma.productOcasionTag.findUnique({
          where: { productId_ocasionTagId: { productId: sharedProductId, ocasionTagId: tag.id } },
        });
        expect(row).toBeNull();
      });

      it("unlink de un par inexistente lanza P2025 (delete sin match)", async () => {
        const tag = await makeTag();
        await expect(unlinkProductFromOcasion(sharedProductId, tag.id)).rejects.toMatchObject({
          code: "P2025",
        });
      });

      it("borrar el OcasionTag (hard delete) CASCADEA el pivot (onDelete: Cascade)", async () => {
        // Verifica la integridad referencial declarada en el schema: al hard-deletear
        // el tag, sus pares ProductOcasionTag se borran solos. (El service hace soft
        // delete, pero la FK Cascade es parte del contrato de datos.)
        const tag = await makeTag();
        await linkProductToOcasion(sharedProductId, tag.id, "se irá con el tag");
        expect(await getProductsForOcasion(tag.id)).toHaveLength(1);

        await prisma.ocasionTag.delete({ where: { id: tag.id } });

        const orphans = await prisma.productOcasionTag.count({ where: { ocasionTagId: tag.id } });
        expect(orphans).toBe(0);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // getProductsForOcasion — shape y soft-delete
    // ════════════════════════════════════════════════════════════════════════

    describe("getProductsForOcasion", () => {
      it("tag sin asociaciones devuelve []", async () => {
        const tag = await makeTag();
        expect(await getProductsForOcasion(tag.id)).toEqual([]);
      });

      it("ocasionTagId inexistente devuelve [] (no lanza)", async () => {
        expect(await getProductsForOcasion(`${RUN}-ghost-tag`)).toEqual([]);
      });

      it("el product embebido trae EXACTAMENTE id/slug/name/isActive (sin deletedAt en este select)", async () => {
        const tag = await makeTag();
        await linkProductToOcasion(sharedProductId, tag.id, "ok");
        const links = await getProductsForOcasion(tag.id);
        expect(links).toHaveLength(1);
        const p = links[0].product;
        expect(p.id).toBe(sharedProductId);
        expect(p.slug).toBe(sharedProductSlug);
        expect(p.name).toBe(`Prod ${RUN}`);
        expect(p.isActive).toBe(true);
        // El select de getProductsForOcasion NO pide deletedAt → no debe venir.
        expect("deletedAt" in p).toBe(false);
        await unlinkProductFromOcasion(sharedProductId, tag.id);
      });

      it("INCLUYE asociaciones cuyo producto fue soft-deleted (el include NO filtra deletedAt)", async () => {
        // Producto temporal RUN-scoped que soft-deleteamos mid-test.
        const tmp = await prisma.product.create({
          data: {
            slug: `${RUN}-soft-${++seq}`,
            name: `SoftDeleted ${RUN}`,
            description: "se archiva tras asociar",
            basePrice: 9_000,
            sku: `${RUN}-SOFT-${seq}`.toUpperCase(),
            categoryId: sharedCategoryId,
          },
          select: { id: true },
        });

        const tag = await makeTag();
        await linkProductToOcasion(tmp.id, tag.id, "vigente al asociar");

        // Soft-delete del producto DESPUÉS de asociar.
        await prisma.product.update({
          where: { id: tmp.id },
          data: { deletedAt: new Date(), isActive: false },
        });

        // El pivot sigue ahí y getProductsForOcasion lo trae (no filtra soft-deleted).
        const links = await getProductsForOcasion(tag.id);
        expect(links).toHaveLength(1);
        expect(links[0].product.id).toBe(tmp.id);
        expect(links[0].product.isActive).toBe(false);

        // getOcasionTag tampoco filtra → el product embebido expone deletedAt != null.
        const detail = await getOcasionTag(tag.id);
        expect(detail!.products).toHaveLength(1);
        expect(detail!.products[0].product.deletedAt).toBeInstanceOf(Date);

        // Cleanup del producto temporal (borrar pivot primero por la FK).
        await prisma.productOcasionTag.deleteMany({ where: { productId: tmp.id } });
        await prisma.product.delete({ where: { id: tmp.id } });
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // OcasionValidationError — forma del error
    // ════════════════════════════════════════════════════════════════════════

    describe("OcasionValidationError", () => {
      it("es una Error con name=OcasionValidationError y expone field + message", () => {
        const e = new OcasionValidationError("slug", "Ya existe una ocasión con ese slug.");
        expect(e).toBeInstanceOf(Error);
        expect(e.name).toBe("OcasionValidationError");
        expect(e.field).toBe("slug");
        expect(e.message).toBe("Ya existe una ocasión con ese slug.");
      });
    });
  },
);
