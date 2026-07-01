/*
 * Tests de integración del SERVICE de CMS — CmsBlock + CmsBlockVersion + SiteSetting.
 *
 * El módulo @/features/cms/service.ts es DB-coupled (importa `prisma` de @/lib/db).
 * Cubre la lógica de dominio del CMS de admin:
 *   - listCmsBlocks(opts): listado filtrable (category / search insensitive sobre
 *     key|title|description), excluye soft-deleted, incluye publishedVersion select.
 *   - getCmsBlockById(id): detail con publishedVersion + versions (desc, take 50),
 *     excluye soft-deleted.
 *   - getCmsBlockByKey(key): lookup por key natural (inline editor), excluye
 *     soft-deleted, incluye publishedVersion.
 *   - createCmsBlock(input, createdBy): crea bloque (isPublished:false) + versión 1
 *     borrador en transacción; conflicto de key → CmsValidationError("key").
 *   - saveCmsBlockDraft(input, updatedBy): append nueva versión (borrador) + sincroniza
 *     body/title del bloque SIN publicar; bloque inexistente/soft-deleted → throw.
 *   - publishCmsBlockVersion(blockId, versionId, by): marca versión publishedAt + bloque
 *     isPublished:true + publishedVersionId; versión inexistente → throw.
 *   - unpublishCmsBlock(blockId, by): isPublished:false + publishedVersionId:null.
 *   - softDeleteCmsBlock(id, by): deletedAt + despublica.
 *   - SiteSetting: list / getById / getByKey / create (conflict) / update.
 *
 * Estrategia: integración DB pura. Requiere DATABASE_URL (corre vía
 * `dotenv -e .env.local -- vitest`); sin ella se salta (skipIf) para no romper
 * CI sin DB.
 *
 * AISLAMIENTO ESTRICTO (nunca tocar datos reales — seed, cuenta de Lucy):
 *   - Toda key natural de esta corrida lleva el prefijo único `RUN`. CmsBlock.key y
 *     SiteSetting.key son @unique → el prefijo garantiza no colisión con datos reales.
 *   - La limpieza en afterAll borra EXACTAMENTE lo creado, SCOPED al prefijo:
 *     primero se rompe el FK self-referente (publishedVersionId → null), luego se
 *     borran versions (Cascade desde block, pero explícito por claridad), luego los
 *     blocks por key startsWith RUN, y los settings por key startsWith RUN. JAMÁS un
 *     deleteMany sin filtro.
 *
 * El comportamiento esperado se verificó contra la DB real antes de fijar las
 * aserciones (probes descartados):
 *   - block recién creado: isPublished=false, publishedVersionId=null, metadata={}.
 *   - publishedVersion en el include es null mientras no se publique.
 *   - update sobre id inexistente → P2025; versión duplicada (blockId,version) → P2002
 *     target ["blockId","version"]; key duplicada en findUnique → conflicto detectado
 *     por el service como CmsValidationError("key").
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  CmsValidationError,
  createCmsBlock,
  createSiteSetting,
  getCmsBlockById,
  getCmsBlockByKey,
  getSiteSettingById,
  getSiteSettingByKey,
  listCmsBlocks,
  listSiteSettings,
  publishCmsBlockVersion,
  saveCmsBlockDraft,
  softDeleteCmsBlock,
  unpublishCmsBlock,
  updateSiteSetting,
} from "./service";
import type { CmsBlockCreateInput, SiteSettingCreateInput } from "./schemas";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Todas las keys naturales lo llevan → la limpieza
// borra exactamente lo que creamos sin tocar datos reales. RUN se usa minúscula
// para CmsBlock.key (regex permite mayúsc/minúsc con flag i) y mayúscula para
// SiteSetting.key (regex exige MAYÚSCULAS). Derivamos ambas formas de un único id.
const STAMP = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const RUN_LOWER = `itestcms${STAMP}`; // prefijo para CmsBlock.key (kebab-ish)
const RUN_UPPER = `ITESTCMS${STAMP}`; // prefijo para SiteSetting.key (UPPER_SNAKE)

// Contador monotónico para unicidad de keys dentro de la corrida sin azar.
let seq = 0;
function nextSuffix() {
  seq += 1;
  return seq;
}
function blockKey(label = "blk") {
  return `${RUN_LOWER}.${label}.${nextSuffix()}`;
}
function settingKey(label = "SET") {
  return `${RUN_UPPER}_${label}_${nextSuffix()}`;
}

type BlockOverrides = Partial<Omit<CmsBlockCreateInput, "key">> & { key?: string };

async function makeBlock(over: BlockOverrides = {}, createdBy: string | null = null) {
  const input: CmsBlockCreateInput = {
    key: over.key ?? blockKey(),
    title: over.title === undefined ? "Bloque de prueba" : over.title,
    body: over.body ?? "Cuerpo inicial v1",
    format: over.format ?? "MARKDOWN",
    category: over.category ?? "HOME",
    description: over.description === undefined ? "desc inicial" : over.description,
  };
  return createCmsBlock(input, createdBy);
}

type SettingOverrides = Partial<Omit<SiteSettingCreateInput, "key">> & { key?: string };

async function makeSetting(over: SettingOverrides = {}, createdBy: string | null = null) {
  const input: SiteSettingCreateInput = {
    key: over.key ?? settingKey(),
    value: over.value ?? "valor-inicial",
    valueType: over.valueType ?? "TEXT",
    label: over.label ?? "Etiqueta de prueba",
    description: over.description === undefined ? "descripción setting" : over.description,
    category: over.category ?? "CONTACT",
  };
  return createSiteSetting(input, createdBy);
}

// testTimeout amplio a nivel de suite: cada caso encadena 2-6 round-trips
// transaccionales contra el pooler de Supabase (pgbouncer :6543). El default de
// vitest (5000ms) es insuficiente bajo la latencia/concurrencia del pooler — no
// es un problema de lógica sino de I/O (mismo motivo del retry:2 en la config).
// 30s deja margen holgado; un bug real igual fallaría las aserciones, no el reloj.
describe.skipIf(!hasDb)("cms/service — integración DB (CmsBlock + Version + SiteSetting)", { timeout: 30000 }, () => {
  afterAll(async () => {
    // 1) Romper el FK self-referente block.publishedVersionId → null para poder
    //    borrar las versiones sin violar la relación PublishedVersion (onDelete:
    //    SetNull la cubre, pero lo hacemos explícito para no depender de ello).
    await prisma.cmsBlock.updateMany({
      where: { key: { startsWith: RUN_LOWER } },
      data: { publishedVersionId: null },
    });
    // 2) Borrar versiones de los bloques del RUN (Cascade desde block ya lo haría,
    //    pero explícito y SCOPED por blockId de bloques con key del RUN).
    const runBlocks = await prisma.cmsBlock.findMany({
      where: { key: { startsWith: RUN_LOWER } },
      select: { id: true },
    });
    if (runBlocks.length > 0) {
      await prisma.cmsBlockVersion.deleteMany({
        where: { blockId: { in: runBlocks.map((b) => b.id) } },
      });
    }
    // 3) Borrar los bloques del RUN.
    await prisma.cmsBlock.deleteMany({ where: { key: { startsWith: RUN_LOWER } } });
    // 4) Borrar los settings del RUN.
    await prisma.siteSetting.deleteMany({ where: { key: { startsWith: RUN_UPPER } } });
  });

  // ───────────────────────── createCmsBlock ─────────────────────────

  describe("createCmsBlock", () => {
    it("crea el bloque como BORRADOR (isPublished:false, publishedVersionId:null) + versión 1", async () => {
      const key = blockKey("create");
      const block = await makeBlock({ key, body: "Body uno", title: "Título" }, "admin-create");

      // Estado del bloque recién creado.
      expect(block.key).toBe(key);
      expect(block.isPublished).toBe(false);
      expect(block.publishedVersionId).toBeNull();
      expect(block.body).toBe("Body uno");
      expect(block.title).toBe("Título");
      expect(block.createdBy).toBe("admin-create");

      // La primera versión existe, es la 1, es borrador (publishedAt null) y
      // refleja el body/title del input.
      const detail = await getCmsBlockById(block.id);
      expect(detail).not.toBeNull();
      expect(detail!.versions).toHaveLength(1);
      const v1 = detail!.versions[0];
      expect(v1.version).toBe(1);
      expect(v1.publishedAt).toBeNull();
      expect(v1.body).toBe("Body uno");
      expect(v1.title).toBe("Título");
      expect(v1.createdBy).toBe("admin-create");
    });

    it("title/description ausentes (undefined) se persisten como null", async () => {
      const block = await makeBlock({ title: null, description: null });
      expect(block.title).toBeNull();
      expect(block.description).toBeNull();

      const detail = await getCmsBlockById(block.id);
      // La versión 1 también copia title null.
      expect(detail!.versions[0].title).toBeNull();
    });

    it("respeta el format provisto (HTML) tanto en bloque como en versión 1", async () => {
      const block = await makeBlock({ format: "HTML", body: "<p>hola</p>" });
      expect(block.format).toBe("HTML");
      const detail = await getCmsBlockById(block.id);
      expect(detail!.versions[0].format).toBe("HTML");
    });

    it("createdBy null NO setea el campo (queda null en bloque y versión)", async () => {
      const block = await makeBlock({}, null);
      expect(block.createdBy).toBeNull();
      const detail = await getCmsBlockById(block.id);
      expect(detail!.versions[0].createdBy).toBeNull();
    });

    it("key duplicada lanza CmsValidationError con field 'key' (no toca DB dos veces)", async () => {
      const key = blockKey("dup");
      await makeBlock({ key });

      await expect(makeBlock({ key })).rejects.toBeInstanceOf(CmsValidationError);
      try {
        await makeBlock({ key });
        throw new Error("debió lanzar");
      } catch (e) {
        expect(e).toBeInstanceOf(CmsValidationError);
        expect((e as CmsValidationError).field).toBe("key");
        expect((e as CmsValidationError).name).toBe("CmsValidationError");
        expect((e as CmsValidationError).message).toContain(key);
      }

      // Sólo existe UN bloque con esa key (la transacción de conflicto no creó otro).
      const count = await prisma.cmsBlock.count({ where: { key } });
      expect(count).toBe(1);
    });
  });

  // ───────────────────────── saveCmsBlockDraft ─────────────────────────

  describe("saveCmsBlockDraft", () => {
    it("appendea versión 2 (borrador) y sincroniza body/title del bloque SIN publicar", async () => {
      const block = await makeBlock({ body: "v1 body", title: "v1 title" }, "creator");
      const v2 = await saveCmsBlockDraft(
        { id: block.id, body: "v2 body", title: "v2 title" },
        "editor",
      );

      // La nueva versión es la 2, borrador, con createdBy = updatedBy.
      expect(v2.version).toBe(2);
      expect(v2.publishedAt).toBeNull();
      expect(v2.body).toBe("v2 body");
      expect(v2.title).toBe("v2 title");
      expect(v2.createdBy).toBe("editor");

      // El bloque refleja el último borrador en body/title PERO sigue sin publicar.
      const detail = await getCmsBlockById(block.id);
      expect(detail!.body).toBe("v2 body");
      expect(detail!.title).toBe("v2 title");
      expect(detail!.isPublished).toBe(false);
      expect(detail!.publishedVersionId).toBeNull();
      expect(detail!.updatedBy).toBe("editor");
      // Historial: 2 versiones, ordenadas desc (v2 primero).
      expect(detail!.versions.map((v) => v.version)).toEqual([2, 1]);
    });

    it("title undefined conserva el title previo del bloque (no lo borra)", async () => {
      const block = await makeBlock({ title: "Conservar" });
      // CmsBlockUpdateInput.title undefined → service usa existing.title.
      const v2 = await saveCmsBlockDraft({ id: block.id, body: "nuevo body" }, null);
      expect(v2.title).toBe("Conservar");
      const detail = await getCmsBlockById(block.id);
      expect(detail!.title).toBe("Conservar");
    });

    it("format undefined hereda el format actual del bloque", async () => {
      const block = await makeBlock({ format: "TEXT", body: "txt" });
      const v2 = await saveCmsBlockDraft({ id: block.id, body: "más txt" }, null);
      expect(v2.format).toBe("TEXT");
    });

    it("incrementa version monotónicamente en saves sucesivos (1→2→3)", async () => {
      const block = await makeBlock();
      const v2 = await saveCmsBlockDraft({ id: block.id, body: "b2" }, null);
      const v3 = await saveCmsBlockDraft({ id: block.id, body: "b3" }, null);
      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);
      const detail = await getCmsBlockById(block.id);
      expect(detail!.versions.map((v) => v.version)).toEqual([3, 2, 1]);
    });

    it("bloque inexistente lanza CmsValidationError('general')", async () => {
      await expect(
        saveCmsBlockDraft({ id: `${RUN_LOWER}-ghost-id`, body: "x" }, null),
      ).rejects.toMatchObject({ field: "general", name: "CmsValidationError" });
    });

    it("bloque soft-deleted lanza CmsValidationError('general') (no appendea versión)", async () => {
      const block = await makeBlock();
      await softDeleteCmsBlock(block.id, null);

      await expect(
        saveCmsBlockDraft({ id: block.id, body: "post-delete" }, null),
      ).rejects.toMatchObject({ field: "general" });

      // No se creó una versión 2 tras el borrado lógico.
      const versions = await prisma.cmsBlockVersion.count({ where: { blockId: block.id } });
      expect(versions).toBe(1);
    });
  });

  // ───────────────────────── publishCmsBlockVersion ─────────────────────────

  describe("publishCmsBlockVersion", () => {
    it("publica la versión: bloque isPublished:true + publishedVersionId apunta a ella + publishedAt set", async () => {
      const block = await makeBlock({ body: "v1" });
      const v2 = await saveCmsBlockDraft({ id: block.id, body: "v2" }, null);

      const published = await publishCmsBlockVersion(block.id, v2.id, "publisher");
      expect(published.isPublished).toBe(true);
      expect(published.publishedVersionId).toBe(v2.id);
      expect(published.updatedBy).toBe("publisher");

      // La versión quedó con publishedAt no nulo.
      const detail = await getCmsBlockById(block.id);
      expect(detail!.publishedVersion).not.toBeNull();
      expect(detail!.publishedVersion!.id).toBe(v2.id);
      expect(detail!.publishedVersion!.publishedAt).not.toBeNull();
    });

    it("puede re-publicar otra versión: publishedVersionId migra a la nueva", async () => {
      const block = await makeBlock();
      const detailV1 = await getCmsBlockById(block.id);
      const v1Id = detailV1!.versions[0].id;
      const v2 = await saveCmsBlockDraft({ id: block.id, body: "v2" }, null);

      // Publica v1, luego v2 → el puntero debe migrar.
      const afterV1 = await publishCmsBlockVersion(block.id, v1Id, null);
      expect(afterV1.publishedVersionId).toBe(v1Id);
      const afterV2 = await publishCmsBlockVersion(block.id, v2.id, null);
      expect(afterV2.publishedVersionId).toBe(v2.id);
      expect(afterV2.isPublished).toBe(true);
    });

    it("versión inexistente lanza CmsValidationError('general')", async () => {
      const block = await makeBlock();
      await expect(
        publishCmsBlockVersion(block.id, `${RUN_LOWER}-ghost-version`, null),
      ).rejects.toMatchObject({ field: "general", name: "CmsValidationError" });
    });

    it("versión que pertenece a OTRO bloque no se publica (scoping por blockId)", async () => {
      const blockA = await makeBlock();
      const blockB = await makeBlock();
      const detailA = await getCmsBlockById(blockA.id);
      const versionOfA = detailA!.versions[0].id;

      // Intentar publicar la versión de A pero declarando blockId de B → findFirst
      // con {id: versionOfA, blockId: B.id} no matchea → throw.
      await expect(
        publishCmsBlockVersion(blockB.id, versionOfA, null),
      ).rejects.toMatchObject({ field: "general" });

      // B sigue sin publicar.
      const fresh = await prisma.cmsBlock.findUnique({ where: { id: blockB.id } });
      expect(fresh!.isPublished).toBe(false);
      expect(fresh!.publishedVersionId).toBeNull();
    });
  });

  // ───────────────────────── unpublishCmsBlock ─────────────────────────

  describe("unpublishCmsBlock", () => {
    it("despublica: isPublished:false + publishedVersionId:null (versión sigue existiendo)", async () => {
      const block = await makeBlock();
      const v2 = await saveCmsBlockDraft({ id: block.id, body: "v2" }, null);
      await publishCmsBlockVersion(block.id, v2.id, null);

      const unp = await unpublishCmsBlock(block.id, "unpublisher");
      expect(unp.isPublished).toBe(false);
      expect(unp.publishedVersionId).toBeNull();
      expect(unp.updatedBy).toBe("unpublisher");

      // La versión publicada NO se borra; solo se suelta el puntero.
      const stillThere = await prisma.cmsBlockVersion.findUnique({ where: { id: v2.id } });
      expect(stillThere).not.toBeNull();
      // publishedAt de la versión permanece (despublicar no lo resetea — comportamiento real).
      expect(stillThere!.publishedAt).not.toBeNull();
    });

    it("getCmsBlockByKey deja de exponer publishedVersion tras despublicar", async () => {
      const key = blockKey("unp-bykey");
      const block = await makeBlock({ key });
      const detail = await getCmsBlockById(block.id);
      await publishCmsBlockVersion(block.id, detail!.versions[0].id, null);

      const beforeUnp = await getCmsBlockByKey(key);
      expect(beforeUnp!.publishedVersion).not.toBeNull();

      await unpublishCmsBlock(block.id, null);
      const afterUnp = await getCmsBlockByKey(key);
      expect(afterUnp!.publishedVersion).toBeNull();
      expect(afterUnp!.isPublished).toBe(false);
    });
  });

  // ───────────────────────── softDeleteCmsBlock ─────────────────────────

  describe("softDeleteCmsBlock", () => {
    it("marca deletedAt, despublica y setea deletedBy", async () => {
      const block = await makeBlock();
      const v2 = await saveCmsBlockDraft({ id: block.id, body: "v2" }, null);
      await publishCmsBlockVersion(block.id, v2.id, null);

      const deleted = await softDeleteCmsBlock(block.id, "deleter");
      expect(deleted.deletedAt).not.toBeNull();
      expect(deleted.isPublished).toBe(false);
      expect(deleted.publishedVersionId).toBeNull();
      expect(deleted.deletedBy).toBe("deleter");
    });

    it("un bloque soft-deleted desaparece de getCmsBlockById, getCmsBlockByKey y listCmsBlocks", async () => {
      const key = blockKey("softdel-vis");
      const block = await makeBlock({ key });
      await softDeleteCmsBlock(block.id, null);

      expect(await getCmsBlockById(block.id)).toBeNull();
      expect(await getCmsBlockByKey(key)).toBeNull();
      const listed = await listCmsBlocks({ search: key });
      expect(listed.map((b) => b.id)).not.toContain(block.id);
    });
  });

  // ───────────────────────── listCmsBlocks ─────────────────────────

  describe("listCmsBlocks", () => {
    it("search matchea por key, title y description (case-insensitive)", async () => {
      const token = `tok${nextSuffix()}`;
      const byKey = await makeBlock({ key: `${RUN_LOWER}.${token}.k`, title: null, description: null });
      const byTitle = await makeBlock({ title: `Zeta-${token}-Title`, description: null });
      const byDesc = await makeBlock({ title: "Sin token", description: `desc-${token}-aquí` });

      // Búsqueda en MAYÚSCULAS de un token sembrado en minúsculas → mode insensitive.
      const res = await listCmsBlocks({ search: token.toUpperCase() });
      const ids = res.map((b) => b.id);
      expect(ids).toContain(byKey.id);
      expect(ids).toContain(byTitle.id);
      expect(ids).toContain(byDesc.id);
    });

    it("filtra por category exacta (no devuelve otra categoría con el mismo search)", async () => {
      const token = `cat${nextSuffix()}`;
      const home = await makeBlock({ title: `${token}-home`, category: "HOME" });
      const legal = await makeBlock({ title: `${token}-legal`, category: "LEGAL" });

      const res = await listCmsBlocks({ search: token, category: "LEGAL" });
      const ids = res.map((b) => b.id);
      expect(ids).toContain(legal.id);
      expect(ids).not.toContain(home.id);
    });

    it("incluye publishedVersion (version + publishedAt) sólo cuando hay versión publicada", async () => {
      const token = `pub${nextSuffix()}`;
      const unpublished = await makeBlock({ title: `${token}-draft` });
      const published = await makeBlock({ title: `${token}-live` });
      const detail = await getCmsBlockById(published.id);
      await publishCmsBlockVersion(published.id, detail!.versions[0].id, null);

      const res = await listCmsBlocks({ search: token });
      const unpRow = res.find((b) => b.id === unpublished.id);
      const pubRow = res.find((b) => b.id === published.id);

      // El sin publicar trae publishedVersion null; el publicado trae { version, publishedAt }.
      expect(unpRow!.publishedVersion).toBeNull();
      expect(pubRow!.publishedVersion).not.toBeNull();
      expect(pubRow!.publishedVersion!.version).toBe(1);
      expect(pubRow!.publishedVersion!.publishedAt).not.toBeNull();
    });

    it("ordena por category asc (orden del ENUM, no alfabético) y luego key asc", async () => {
      const token = `ord${nextSuffix()}`;
      // Tres bloques del RUN: dos LEGAL con keys que ordenan, uno HOME.
      // OJO: category es un enum Postgres → ordena por orden de DECLARACIÓN en el
      // schema, NO alfabético. En BlockCategory, LEGAL se declara ANTES que HOME
      // (LEGAL=1, HOME=2) → LEGAL precede a HOME en el orderBy category asc.
      const home = await makeBlock({ key: `${RUN_LOWER}.${token}.ahome`, category: "HOME" });
      const legalB = await makeBlock({ key: `${RUN_LOWER}.${token}.legalb`, category: "LEGAL" });
      const legalA = await makeBlock({ key: `${RUN_LOWER}.${token}.legala`, category: "LEGAL" });

      const res = await listCmsBlocks({ search: token });
      const ours = res.filter((b) => [home.id, legalB.id, legalA.id].includes(b.id));
      // Enum order: LEGAL(1) antes que HOME(2). Dentro de LEGAL: legala < legalb (key asc).
      expect(ours.map((b) => b.id)).toEqual([legalA.id, legalB.id, home.id]);
    });

    it("sin opciones devuelve sólo bloques no soft-deleted (invariante del filtro)", async () => {
      const alive = await makeBlock();
      const dead = await makeBlock();
      await softDeleteCmsBlock(dead.id, null);

      const res = await listCmsBlocks({});
      const ids = res.map((b) => b.id);
      expect(ids).toContain(alive.id);
      expect(ids).not.toContain(dead.id);

      // Ningún item del listado completo viene soft-deleted (chequeo contra DB).
      const returnedIds = res.map((b) => b.id);
      const anyDeleted = await prisma.cmsBlock.count({
        where: { id: { in: returnedIds }, deletedAt: { not: null } },
      });
      expect(anyDeleted).toBe(0);
    });

    it("search sin coincidencias devuelve arreglo vacío", async () => {
      const res = await listCmsBlocks({ search: `${RUN_LOWER}-NO-MATCH-ZZZ-${nextSuffix()}` });
      expect(res).toEqual([]);
    });
  });

  // ───────────────────────── getCmsBlockById / getCmsBlockByKey ─────────────────────────

  describe("getCmsBlockById / getCmsBlockByKey", () => {
    it("getCmsBlockById retorna null para id inexistente", async () => {
      expect(await getCmsBlockById(`${RUN_LOWER}-no-such-id`)).toBeNull();
    });

    it("getCmsBlockById trae versions desc y respeta take:50", async () => {
      // Un save por el service crea la versión 1; el resto se siembra en bloque con
      // createMany (mismo modelo, mismas columnas) para no pegar 51 transacciones
      // al pooler. El objetivo del test es el take:50 + orderBy desc del lookup, no
      // la lógica de saveCmsBlockDraft (cubierta arriba).
      const block = await makeBlock();
      // Versiones 2..52 → 52 en total.
      await prisma.cmsBlockVersion.createMany({
        data: Array.from({ length: 51 }, (_, i) => ({
          blockId: block.id,
          version: i + 2,
          body: `body-${i + 2}`,
          format: "MARKDOWN" as const,
          publishedAt: null,
        })),
      });

      const detail = await getCmsBlockById(block.id);
      // take:50 recorta a 50 aunque existan 52.
      expect(detail!.versions).toHaveLength(50);
      // orderBy version desc → la primera es la 52, la última de la ventana es la 3.
      expect(detail!.versions[0].version).toBe(52);
      expect(detail!.versions[detail!.versions.length - 1].version).toBe(3);
      // Orden estrictamente descendente en toda la ventana.
      for (let i = 1; i < detail!.versions.length; i++) {
        expect(detail!.versions[i - 1].version).toBeGreaterThan(detail!.versions[i].version);
      }
      // Persistencia real de las 52 (más allá del take).
      const total = await prisma.cmsBlockVersion.count({ where: { blockId: block.id } });
      expect(total).toBe(52);
    }, 30000);

    it("getCmsBlockByKey retorna null para key inexistente", async () => {
      expect(await getCmsBlockByKey(`${RUN_LOWER}.no.such.key`)).toBeNull();
    });

    it("getCmsBlockByKey encuentra por key exacta e incluye publishedVersion completa", async () => {
      const key = blockKey("bykey-hit");
      const block = await makeBlock({ key });
      const detail = await getCmsBlockById(block.id);
      await publishCmsBlockVersion(block.id, detail!.versions[0].id, null);

      const found = await getCmsBlockByKey(key);
      expect(found!.id).toBe(block.id);
      // include publishedVersion (objeto completo, no sólo select) → tiene body.
      expect(found!.publishedVersion).not.toBeNull();
      expect(found!.publishedVersion!.body).toBe("Cuerpo inicial v1");
    });
  });

  // ───────────────────────── SiteSetting ─────────────────────────

  describe("createSiteSetting", () => {
    it("crea el setting con todos los campos y createdBy", async () => {
      const key = settingKey("CREATE");
      const s = await makeSetting(
        { key, value: "hola@correo.co", valueType: "EMAIL", label: "Correo", description: "una desc" },
        "admin-x",
      );
      expect(s.key).toBe(key);
      expect(s.value).toBe("hola@correo.co");
      expect(s.valueType).toBe("EMAIL");
      expect(s.label).toBe("Correo");
      expect(s.description).toBe("una desc");
      expect(s.category).toBe("CONTACT");
      expect(s.createdBy).toBe("admin-x");
    });

    it("description undefined se persiste como null; createdBy null no setea campo", async () => {
      const s = await makeSetting({ description: null }, null);
      expect(s.description).toBeNull();
      expect(s.createdBy).toBeNull();
    });

    it("key duplicada lanza CmsValidationError('key')", async () => {
      const key = settingKey("DUP");
      await makeSetting({ key });
      await expect(makeSetting({ key })).rejects.toMatchObject({
        field: "key",
        name: "CmsValidationError",
      });
      // Sólo un setting con esa key.
      expect(await prisma.siteSetting.count({ where: { key } })).toBe(1);
    });
  });

  describe("updateSiteSetting", () => {
    it("actualiza value y updatedBy; label/description omitidos se conservan", async () => {
      const s = await makeSetting({ value: "v1", label: "Etiqueta original", description: "desc original" });
      const upd = await updateSiteSetting({ id: s.id, value: "v2" }, "editor-y");
      expect(upd.value).toBe("v2");
      expect(upd.updatedBy).toBe("editor-y");
      // label y description NO cambian (no se pasaron en el input).
      expect(upd.label).toBe("Etiqueta original");
      expect(upd.description).toBe("desc original");
    });

    it("label provisto se actualiza; description provista (incluso null) se aplica", async () => {
      const s = await makeSetting({ label: "Vieja", description: "vieja desc" });
      const upd = await updateSiteSetting(
        { id: s.id, value: "nv", label: "Nueva", description: null },
        null,
      );
      expect(upd.label).toBe("Nueva");
      // description: null se pasa explícito (input.description !== undefined) → se borra.
      expect(upd.description).toBeNull();
    });

    it("description undefined NO se toca (conserva la previa)", async () => {
      const s = await makeSetting({ description: "intacta" });
      const upd = await updateSiteSetting({ id: s.id, value: "x" }, null);
      expect(upd.description).toBe("intacta");
    });

    it("id inexistente rechaza con P2025 (Prisma update no encuentra el registro)", async () => {
      await expect(
        updateSiteSetting({ id: `${RUN_UPPER}-ghost-id`, value: "x" }, null),
      ).rejects.toMatchObject({ code: "P2025" });
    });
  });

  describe("getSiteSettingById / getSiteSettingByKey", () => {
    it("getSiteSettingById retorna el setting por id y null si no existe", async () => {
      const s = await makeSetting();
      expect((await getSiteSettingById(s.id))!.id).toBe(s.id);
      expect(await getSiteSettingById(`${RUN_UPPER}-ghost`)).toBeNull();
    });

    it("getSiteSettingByKey retorna el setting por key y null si no existe", async () => {
      const key = settingKey("BYKEY");
      const s = await makeSetting({ key, value: "buscado" });
      const found = await getSiteSettingByKey(key);
      expect(found!.id).toBe(s.id);
      expect(found!.value).toBe("buscado");
      expect(await getSiteSettingByKey(`${RUN_UPPER}_NOPE_${nextSuffix()}`)).toBeNull();
    });
  });

  describe("listSiteSettings", () => {
    // Orden de declaración del enum SettingCategory en el schema Prisma. El
    // orderBy category asc usa este orden (enum Postgres), NO el alfabético.
    const SETTING_CATEGORY_ORDER = [
      "CONTACT",
      "BUSINESS",
      "LEGAL",
      "COMMERCE",
      "SOCIAL",
      "EXTERNAL",
      "WHATSAPP",
      "COPYRIGHT",
      "SEO",
    ];

    it("ordena por category asc (orden del ENUM) y luego key asc; incluye los settings del RUN", async () => {
      // Dos settings: uno SEO (último en el enum) y uno BUSINESS (segundo en el enum).
      const seo = await makeSetting({ key: settingKey("SEO_TITLE"), category: "SEO" });
      const business = await makeSetting({ key: settingKey("BUSINESS_HOURS"), category: "BUSINESS" });

      const res = await listSiteSettings();
      const ids = res.map((s) => s.id);
      expect(ids).toContain(seo.id);
      expect(ids).toContain(business.id);

      // BUSINESS aparece antes que SEO en el orden global (BUSINESS=2 < SEO=9 en el enum).
      const idxBusiness = res.findIndex((s) => s.id === business.id);
      const idxSeo = res.findIndex((s) => s.id === seo.id);
      expect(idxBusiness).toBeLessThan(idxSeo);

      // Invariante de orden: la lista entera está ordenada por (rank(category), key).
      // rank = posición en el enum (no comparación de strings, que daría falso por
      // ej. COMMERCE(4) vs LEGAL(3): alfabéticamente C<L pero enum-wise L<C).
      const rank = (c: string) => SETTING_CATEGORY_ORDER.indexOf(c);
      for (let i = 1; i < res.length; i++) {
        const prev = res[i - 1];
        const cur = res[i];
        const ordered =
          rank(prev.category) < rank(cur.category) ||
          (prev.category === cur.category && prev.key <= cur.key);
        expect(ordered).toBe(true);
      }
    });
  });
});
