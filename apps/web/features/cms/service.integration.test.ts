/*
 * Tests de integración del SERVICE de CMS v2 — CmsPage / CmsSection / CmsField
 * / CmsFieldVersion.
 *
 * El módulo @/features/cms/service.ts es DB-coupled (importa `prisma` de @/lib/db).
 * Cubre la lógica de dominio del CMS de admin sobre el modelo v2:
 *   - listCmsPages / getCmsPageBySlug / getCmsFieldById / searchCmsFields:
 *     navegación por páginas, estructura ordenada, exclusión de soft-deleted.
 *   - cmsFieldHasDraft: hay versión más nueva que la publicada.
 *   - createCmsField(input, createdBy): BLOCK nace borrador (isPublished:false,
 *     v1 sin publicar); SETTING nace publicado; conflicto de key →
 *     CmsValidationError("key").
 *   - saveCmsFieldDraft(input, updatedBy): BLOCK append versión borrador SIN
 *     publicar (publishedVersionId intacto); SETTING append + PUBLICA de
 *     inmediato. Campo inexistente/soft-deleted → throw.
 *   - publishCmsFieldVersion(fieldId, versionId, by): marca versión publishedAt
 *     + campo isPublished:true + publishedVersionId; versión fantasma o de otro
 *     campo → throw.
 *   - unpublishCmsField: BLOCK ok (isPublished:false, publishedVersionId:null);
 *     SETTING → throw (los ajustes no se despublican).
 *   - softDeleteCmsField: deletedAt + despublica; desaparece de queries.
 *   - updateCmsPage / updateCmsSection: metadatos de estructura.
 *   - Campos LISTA (roadmap B4, CmsListItem): getCmsFieldItems (vacío,
 *     derivado del body JSON, persistidos ordenados); saveCmsFieldItems
 *     (BLOCK → versión borrador + items reemplazados en transacción, SETTING
 *     → publica al guardar, validación contra listSchema, tope MAX_LIST_ITEMS,
 *     normalización de subcampos); round-trip con getCmsList de lib/cms.
 *   - Campos IMAGE (roadmap B5, CmsMedia): round-trip con getCmsImage de
 *     lib/cms (SETTING publicado resuelve url/alt/dimensiones; BLOCK sin
 *     publicar → null; asset fantasma → null).
 *   - Banners de portada (roadmap B6): round-trip con getCmsBanners de
 *     lib/cms (lista con subcampos IMAGE/BOOLEAN; activos resueltos con su
 *     asset, inactivos filtrados, assets fantasma descartados, sin publicar
 *     o JSON inválido → []).
 *
 * Estrategia: integración DB pura. Requiere DATABASE_URL (corre vía
 * `dotenv -e .env.local -- vitest`); sin ella se salta (skipIf) para no romper
 * CI sin DB.
 *
 * AISLAMIENTO ESTRICTO (nunca tocar datos reales — seed, cuenta de Lucy):
 *   - Toda key/slug de esta corrida lleva el prefijo único RUN. CmsField.key y
 *     CmsPage.slug son @unique → el prefijo garantiza no colisión.
 *   - La limpieza en afterAll borra EXACTAMENTE lo creado, SCOPED al prefijo:
 *     rompe el FK self-referente (publishedVersionId → null), borra fields del
 *     RUN (versiones en cascade), luego la sección y la página del RUN.
 *     JAMÁS un deleteMany sin filtro.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getCmsBanners, getCmsImage, getCmsList } from "@/lib/cms";
import { deleteCmsMedia, getCmsMediaUsage } from "@/lib/cms-media";
import {
  MAX_LIST_ITEMS,
  cmsFieldHasDraft,
  createCmsField,
  getCmsFieldById,
  getCmsFieldByKey,
  getCmsFieldItems,
  getCmsPageBySlug,
  listCmsPages,
  publishCmsFieldVersion,
  saveCmsFieldDraft,
  saveCmsFieldItems,
  searchCmsFields,
  softDeleteCmsField,
  unpublishCmsField,
  updateCmsPage,
  updateCmsSection,
} from "./service";
import type { CmsFieldCreateInput } from "./schemas";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida (ver nota de aislamiento arriba).
const STAMP = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const RUN = `itestcmsv2${STAMP}`;
const RUN_PAGE_SLUG = `${RUN}-page`;

let seq = 0;
function nextSuffix() {
  seq += 1;
  return seq;
}
function fieldKey(label = "fld") {
  return `${RUN}.${label}.${nextSuffix()}`;
}

// Sección de prueba creada en beforeAll-implícito (lazy en el primer uso).
let testSectionId: string | null = null;
async function ensureSection(): Promise<string> {
  if (testSectionId) return testSectionId;
  const page = await prisma.cmsPage.create({
    data: {
      slug: RUN_PAGE_SLUG,
      title: "Página de prueba",
      sortOrder: 9999,
      sections: {
        create: { key: "general", title: "Sección de prueba", sortOrder: 1 },
      },
    },
    include: { sections: true },
  });
  testSectionId = page.sections[0].id;
  return testSectionId;
}

type FieldOverrides = Partial<Omit<CmsFieldCreateInput, "key" | "sectionId">> & { key?: string };

async function makeField(over: FieldOverrides = {}, createdBy: string | null = null) {
  const input: CmsFieldCreateInput = {
    sectionId: await ensureSection(),
    key: over.key ?? fieldKey(),
    kind: over.kind ?? "BLOCK",
    label: over.label ?? "Campo de prueba",
    helpText: over.helpText === undefined ? "ayuda inicial" : over.helpText,
    type: over.type ?? "MARKDOWN",
    category: over.category ?? "HOME",
    body: over.body ?? "Cuerpo inicial v1",
  };
  return createCmsField(input, createdBy);
}

// testTimeout amplio a nivel de suite: cada caso encadena 2-6 round-trips
// transaccionales contra el pooler de Supabase (pgbouncer :6543). El default de
// vitest (5000ms) es insuficiente bajo la latencia/concurrencia del pooler.
describe.skipIf(!hasDb)(
  "cms/service v2 — integración DB (CmsPage/Section/Field/Version)",
  { timeout: 30000 },
  () => {
    afterAll(async () => {
      // 1) Romper el FK self-referente field.publishedVersionId → null.
      await prisma.cmsField.updateMany({
        where: { key: { startsWith: RUN } },
        data: { publishedVersionId: null },
      });
      // 2) Borrar fields del RUN (versiones caen en cascade por fieldId).
      await prisma.cmsField.deleteMany({ where: { key: { startsWith: RUN } } });
      // 3) Borrar la página del RUN (secciones en cascade).
      await prisma.cmsPage.deleteMany({ where: { slug: RUN_PAGE_SLUG } });
    });

    // ───────────────────────── createCmsField ─────────────────────────

    describe("createCmsField", () => {
      it("BLOCK nace como borrador: isPublished:false, v1 sin publicar", async () => {
        const field = await makeField();
        expect(field.isPublished).toBe(false);
        expect(field.publishedVersionId).toBeNull();

        const detail = await getCmsFieldById(field.id);
        expect(detail).not.toBeNull();
        expect(detail!.kind).toBe("BLOCK");
        expect(detail!.versions).toHaveLength(1);
        expect(detail!.versions[0].version).toBe(1);
        expect(detail!.versions[0].publishedAt).toBeNull();
        expect(detail!.publishedVersion).toBeNull();
        expect(detail!.section.page.slug).toBe(RUN_PAGE_SLUG);
      });

      it("SETTING nace publicado con v1 viva", async () => {
        const field = await makeField({ kind: "SETTING", type: "TEXT", category: "CONTACT" });
        expect(field.isPublished).toBe(true);
        expect(field.publishedVersionId).not.toBeNull();

        const detail = await getCmsFieldById(field.id);
        expect(detail!.publishedVersion!.version).toBe(1);
        expect(detail!.publishedVersion!.publishedAt).not.toBeNull();
      });

      it("registra createdBy cuando se pasa", async () => {
        const field = await makeField({}, "admin-1");
        expect(field.createdBy).toBe("admin-1");
      });

      it("key duplicada → CmsValidationError('key') y no crea nada", async () => {
        const key = fieldKey("dupe");
        await makeField({ key });
        await expect(makeField({ key })).rejects.toMatchObject({
          name: "CmsValidationError",
          field: "key",
        });
      });
    });

    // ───────────────────────── saveCmsFieldDraft ─────────────────────────

    describe("saveCmsFieldDraft", () => {
      it("BLOCK: append versión borrador y actualiza body SIN publicar", async () => {
        const field = await makeField();
        const v2 = await saveCmsFieldDraft({ id: field.id, body: "nuevo body" }, null);
        expect(v2.version).toBe(2);
        expect(v2.publishedAt).toBeNull();

        const detail = await getCmsFieldById(field.id);
        expect(detail!.body).toBe("nuevo body");
        expect(detail!.isPublished).toBe(false);
        expect(detail!.publishedVersionId).toBeNull();
      });

      it("BLOCK publicado: el borrador nuevo NO cambia la versión viva", async () => {
        const field = await makeField();
        const detail0 = await getCmsFieldById(field.id);
        await publishCmsFieldVersion(field.id, detail0!.versions[0].id, null);

        await saveCmsFieldDraft({ id: field.id, body: "borrador v2" }, null);
        const detail = await getCmsFieldById(field.id);
        expect(detail!.body).toBe("borrador v2"); // último borrador
        expect(detail!.publishedVersion!.body).toBe("Cuerpo inicial v1"); // sitio sigue en v1
        expect(cmsFieldHasDraft(detail!)).toBe(true);
      });

      it("SETTING: guardar publica de inmediato", async () => {
        const field = await makeField({ kind: "SETTING", type: "EMAIL", category: "CONTACT" });
        const v2 = await saveCmsFieldDraft(
          { id: field.id, body: "nuevo@lucamsshop.com" },
          "editor",
        );
        expect(v2.publishedAt).not.toBeNull();

        const detail = await getCmsFieldById(field.id);
        expect(detail!.publishedVersionId).toBe(v2.id);
        expect(detail!.publishedVersion!.body).toBe("nuevo@lucamsshop.com");
        expect(detail!.updatedBy).toBe("editor");
        expect(cmsFieldHasDraft(detail!)).toBe(false);
      });

      it("versiones son monotónicas por campo", async () => {
        const field = await makeField();
        const v2 = await saveCmsFieldDraft({ id: field.id, body: "b2" }, null);
        const v3 = await saveCmsFieldDraft({ id: field.id, body: "b3" }, null);
        expect([v2.version, v3.version]).toEqual([2, 3]);
      });

      it("lanza para campo inexistente", async () => {
        await expect(
          saveCmsFieldDraft({ id: `${RUN}-ghost-id000000`, body: "x" }, null),
        ).rejects.toMatchObject({ name: "CmsValidationError" });
      });

      it("lanza para campo soft-deleted", async () => {
        const field = await makeField();
        await softDeleteCmsField(field.id, null);
        await expect(
          saveCmsFieldDraft({ id: field.id, body: "post-delete" }, null),
        ).rejects.toMatchObject({ name: "CmsValidationError" });
      });
    });

    // ───────────────────────── publishCmsFieldVersion ─────────────────────────

    describe("publishCmsFieldVersion", () => {
      it("publica la versión indicada y marca el campo", async () => {
        const field = await makeField();
        const v2 = await saveCmsFieldDraft({ id: field.id, body: "v2" }, null);
        const published = await publishCmsFieldVersion(field.id, v2.id, "publisher");

        expect(published.isPublished).toBe(true);
        expect(published.publishedVersionId).toBe(v2.id);
        expect(published.updatedBy).toBe("publisher");

        const detail = await getCmsFieldById(field.id);
        expect(detail!.publishedVersion!.version).toBe(2);
        expect(detail!.publishedVersion!.publishedAt).not.toBeNull();
      });

      it("revert: publicar v1 después de v2 deja v1 viva", async () => {
        const field = await makeField();
        const detail = await getCmsFieldById(field.id);
        const v1Id = detail!.versions[0].id;
        const v2 = await saveCmsFieldDraft({ id: field.id, body: "v2" }, null);

        await publishCmsFieldVersion(field.id, v1Id, null);
        const afterV1 = await getCmsFieldById(field.id);
        expect(afterV1!.publishedVersionId).toBe(v1Id);

        await publishCmsFieldVersion(field.id, v2.id, null);
        const afterV2 = await getCmsFieldById(field.id);
        expect(afterV2!.publishedVersionId).toBe(v2.id);
      });

      it("versión fantasma → CmsValidationError", async () => {
        const field = await makeField();
        await expect(
          publishCmsFieldVersion(field.id, `${RUN}-ghost-version00`, null),
        ).rejects.toMatchObject({ name: "CmsValidationError" });
      });

      it("versión de OTRO campo → CmsValidationError", async () => {
        const fieldA = await makeField();
        const fieldB = await makeField();
        const detailA = await getCmsFieldById(fieldA.id);
        const versionOfA = detailA!.versions[0].id;
        await expect(publishCmsFieldVersion(fieldB.id, versionOfA, null)).rejects.toMatchObject({
          name: "CmsValidationError",
        });
      });
    });

    // ───────────────────────── unpublishCmsField ─────────────────────────

    describe("unpublishCmsField", () => {
      it("BLOCK: isPublished:false + publishedVersionId:null", async () => {
        const field = await makeField();
        const v2 = await saveCmsFieldDraft({ id: field.id, body: "v2" }, null);
        await publishCmsFieldVersion(field.id, v2.id, null);

        const unp = await unpublishCmsField(field.id, "unpublisher");
        expect(unp.isPublished).toBe(false);
        expect(unp.publishedVersionId).toBeNull();
        expect(unp.updatedBy).toBe("unpublisher");

        const byKey = await getCmsFieldByKey(field.key);
        expect(byKey!.isPublished).toBe(false);
        expect(byKey!.publishedVersion).toBeNull();
      });

      it("SETTING → CmsValidationError (los ajustes no se despublican)", async () => {
        const field = await makeField({ kind: "SETTING", category: "CONTACT" });
        await expect(unpublishCmsField(field.id, null)).rejects.toMatchObject({
          name: "CmsValidationError",
        });
      });
    });

    // ───────────────────────── softDeleteCmsField ─────────────────────────

    describe("softDeleteCmsField", () => {
      it("marca deletedAt, despublica y desaparece de las queries", async () => {
        const field = await makeField();
        const v2 = await saveCmsFieldDraft({ id: field.id, body: "v2" }, null);
        await publishCmsFieldVersion(field.id, v2.id, null);

        const deleted = await softDeleteCmsField(field.id, "deleter");
        expect(deleted.deletedAt).not.toBeNull();
        expect(deleted.isPublished).toBe(false);
        expect(deleted.publishedVersionId).toBeNull();
        expect(deleted.deletedBy).toBe("deleter");

        expect(await getCmsFieldById(field.id)).toBeNull();
        expect(await getCmsFieldByKey(field.key)).toBeNull();
        const found = await searchCmsFields(field.key);
        expect(found.find((f) => f.id === field.id)).toBeUndefined();
      });
    });

    // ───────────────────────── Campos LISTA (CmsListItem) ─────────────────────────

    describe("campos LISTA (getCmsFieldItems / saveCmsFieldItems)", () => {
      const LIST_SCHEMA = [
        { name: "label", type: "TEXT", label: "Texto del enlace" },
        { name: "href", type: "URL", label: "Ruta o URL" },
      ];
      const BODY_V1 = '[{"label":"A","href":"/a"},{"label":"B","href":"/b"}]';

      // Campo lista: se crea por el flujo normal y luego se le inyecta el
      // listSchema en metadata (createCmsField no recibe metadata — la pone
      // el site map vía migrador).
      async function makeListField(over: FieldOverrides = {}) {
        const field = await makeField({ type: "JSON", body: BODY_V1, ...over });
        await prisma.cmsField.update({
          where: { id: field.id },
          data: { metadata: { listSchema: LIST_SCHEMA } },
        });
        return field;
      }

      describe("getCmsFieldItems", () => {
        it("deriva los items del body cuando el campo aún no tiene filas", async () => {
          const field = await makeListField();
          const items = await getCmsFieldItems(field.id);
          expect(items).toHaveLength(2);
          expect(items[0]).toMatchObject({
            id: null,
            position: 0,
            values: { label: "A", href: "/a" },
          });
          expect(items[1].position).toBe(1);
        });

        it("devuelve [] si el body no es un array JSON válido", async () => {
          const field = await makeListField({ body: "texto plano, no JSON" });
          expect(await getCmsFieldItems(field.id)).toEqual([]);
        });

        it("lee los items persistidos ordenados por position", async () => {
          const field = await makeListField();
          await saveCmsFieldItems(
            field.id,
            [
              { label: "Uno", href: "/uno" },
              { label: "Dos", href: "/dos" },
            ],
            null,
          );
          const items = await getCmsFieldItems(field.id);
          expect(items[0].id).not.toBeNull();
          expect(items.map((i) => [i.position, i.values])).toEqual([
            [0, { label: "Uno", href: "/uno" }],
            [1, { label: "Dos", href: "/dos" }],
          ]);
        });

        it("lanza para campo inexistente", async () => {
          await expect(getCmsFieldItems(`${RUN}-ghost-id000000`)).rejects.toMatchObject({
            name: "CmsValidationError",
          });
        });
      });

      describe("saveCmsFieldItems", () => {
        it("BLOCK: crea items y versión BORRADOR; el body queda como JSON serializado", async () => {
          const field = await makeListField();
          // Publicar v1 para probar que el borrador nuevo NO cambia lo vivo.
          const detail0 = await getCmsFieldById(field.id);
          await publishCmsFieldVersion(field.id, detail0!.versions[0].id, null);

          const v = await saveCmsFieldItems(
            field.id,
            [{ label: "Nuevo", href: "/nuevo" }],
            "editor",
          );
          expect(v.publishedAt).toBeNull();

          const detail = await getCmsFieldById(field.id);
          expect(JSON.parse(detail!.body)).toEqual([{ label: "Nuevo", href: "/nuevo" }]);
          expect(detail!.publishedVersion!.body).toBe(BODY_V1); // sitio sigue en v1
          expect(detail!.items).toHaveLength(1);
          expect(detail!.items[0]).toMatchObject({
            position: 0,
            values: { label: "Nuevo", href: "/nuevo" },
          });
          expect(detail!.updatedBy).toBe("editor");
        });

        it("SETTING: guardar publica de inmediato", async () => {
          const field = await makeListField({ kind: "SETTING", category: "CONTACT" });
          const v = await saveCmsFieldItems(field.id, [{ label: "S", href: "/s" }], null);
          expect(v.publishedAt).not.toBeNull();

          const detail = await getCmsFieldById(field.id);
          expect(detail!.publishedVersionId).toBe(v.id);
          expect(JSON.parse(detail!.publishedVersion!.body)).toEqual([{ label: "S", href: "/s" }]);
        });

        it("normaliza: solo subcampos del schema, strings recortados", async () => {
          const field = await makeListField();
          await saveCmsFieldItems(
            field.id,
            [{ label: "  X  ", href: "/x", intruso: "fuera" }],
            null,
          );
          const items = await getCmsFieldItems(field.id);
          expect(items[0].values).toEqual({ label: "X", href: "/x" });
          const detail = await getCmsFieldById(field.id);
          expect(JSON.parse(detail!.body)).toEqual([{ label: "X", href: "/x" }]);
        });

        it("reemplaza los items anteriores (delete + insert, sin duplicar)", async () => {
          const field = await makeListField();
          await saveCmsFieldItems(
            field.id,
            [
              { label: "A", href: "/a" },
              { label: "B", href: "/b" },
            ],
            null,
          );
          await saveCmsFieldItems(field.id, [{ label: "C", href: "/c" }], null);
          const items = await getCmsFieldItems(field.id);
          expect(items).toHaveLength(1);
          expect(items[0].values).toEqual({ label: "C", href: "/c" });
        });

        it("rechaza fila con subcampo requerido vacío y NO toca los items", async () => {
          const field = await makeListField();
          await saveCmsFieldItems(field.id, [{ label: "OK", href: "/ok" }], null);
          await expect(
            saveCmsFieldItems(field.id, [{ label: "", href: "/x" }], null),
          ).rejects.toMatchObject({ name: "CmsValidationError" });
          // La validación corre antes de la transacción → items intactos.
          const items = await getCmsFieldItems(field.id);
          expect(items.map((i) => i.values)).toEqual([{ label: "OK", href: "/ok" }]);
        });

        it("rechaza subcampos que no son string", async () => {
          const field = await makeListField();
          await expect(
            saveCmsFieldItems(field.id, [{ label: 123, href: "/x" }], null),
          ).rejects.toMatchObject({ name: "CmsValidationError" });
        });

        it("rechaza más de MAX_LIST_ITEMS filas", async () => {
          const field = await makeListField();
          const many = Array.from({ length: MAX_LIST_ITEMS + 1 }, (_, i) => ({
            label: `L${i}`,
            href: `/${i}`,
          }));
          await expect(saveCmsFieldItems(field.id, many, null)).rejects.toMatchObject({
            name: "CmsValidationError",
          });
        });

        it("rechaza un campo SIN listSchema en metadata", async () => {
          const field = await makeField();
          await expect(
            saveCmsFieldItems(field.id, [{ label: "A", href: "/a" }], null),
          ).rejects.toMatchObject({ name: "CmsValidationError" });
        });
      });

      describe("round-trip con getCmsList (lectura pública)", () => {
        type Link = { label: string; href: string };
        const FALLBACK: Link[] = [{ label: "Fallback", href: "/fallback" }];
        const validateLink = (v: unknown): Link | null => {
          if (typeof v !== "object" || v === null) return null;
          const l = v as Link;
          return typeof l.label === "string" && typeof l.href === "string" ? l : null;
        };

        it("guardar items + publicar → getCmsList devuelve los items tipados", async () => {
          const field = await makeListField();
          // Sin publicar todavía: el sitio cae al fallback.
          expect(await getCmsList(field.key, validateLink, FALLBACK)).toEqual(FALLBACK);

          const v = await saveCmsFieldItems(
            field.id,
            [
              { label: "Privacidad", href: "/legal/privacidad" },
              { label: "Términos", href: "/legal/terminos" },
            ],
            null,
          );
          await publishCmsFieldVersion(field.id, v.id, null);

          const links = await getCmsList(field.key, validateLink, FALLBACK);
          expect(links).toEqual([
            { label: "Privacidad", href: "/legal/privacidad" },
            { label: "Términos", href: "/legal/terminos" },
          ]);
        });
      });
    });

    // ───────────────────────── Navegación por páginas ─────────────────────────

    describe("listCmsPages / getCmsPageBySlug", () => {
      it("la página del RUN aparece en el índice con su sección y campos", async () => {
        await ensureSection();
        await makeField();
        const pages = await listCmsPages();
        const runPage = pages.find((p) => p.slug === RUN_PAGE_SLUG);
        expect(runPage).toBeDefined();
        expect(runPage!.sections).toHaveLength(1);
        expect(runPage!.sections[0].fields.length).toBeGreaterThan(0);
      });

      it("getCmsPageBySlug trae campos ordenados con publishedVersion y última versión", async () => {
        await ensureSection();
        const field = await makeField();
        const detail = await getCmsFieldById(field.id);
        await publishCmsFieldVersion(field.id, detail!.versions[0].id, null);
        await saveCmsFieldDraft({ id: field.id, body: "borrador nuevo" }, null);

        const page = await getCmsPageBySlug(RUN_PAGE_SLUG);
        const found = page!.sections[0].fields.find((f) => f.id === field.id);
        expect(found).toBeDefined();
        expect(found!.publishedVersion!.body).toBe("Cuerpo inicial v1");
        expect(found!.versions[0].body).toBe("borrador nuevo");
        expect(cmsFieldHasDraft(found!)).toBe(true);
      });

      it("getCmsPageBySlug devuelve null para slug inexistente", async () => {
        expect(await getCmsPageBySlug(`${RUN}-no-such-page`)).toBeNull();
      });
    });

    describe("searchCmsFields", () => {
      it("encuentra por key, label y body (case-insensitive)", async () => {
        const token = `Tokencito${nextSuffix()}`;
        await makeField({ label: `Etiqueta ${token}`, body: `contenido ${token}` });
        const byLabel = await searchCmsFields(token.toUpperCase());
        expect(byLabel.length).toBeGreaterThan(0);
        expect(byLabel[0].section.page.slug).toBe(RUN_PAGE_SLUG);
      });

      it("query vacío devuelve []", async () => {
        expect(await searchCmsFields("   ")).toEqual([]);
      });
    });

    // ───────────────────────── Metadatos de estructura ─────────────────────────

    describe("updateCmsPage / updateCmsSection", () => {
      it("actualiza título y orden de la página", async () => {
        await ensureSection();
        const page = await prisma.cmsPage.findUnique({ where: { slug: RUN_PAGE_SLUG } });
        const updated = await updateCmsPage({
          id: page!.id,
          title: "Título nuevo",
          sortOrder: 500,
        });
        expect(updated.title).toBe("Título nuevo");
        expect(updated.sortOrder).toBe(500);
      });

      it("actualiza título de la sección", async () => {
        const sectionId = await ensureSection();
        const updated = await updateCmsSection({ id: sectionId, title: "Sección renombrada" });
        expect(updated.title).toBe("Sección renombrada");
      });
    });

    // ───────────────────────── Campos IMAGE + getCmsImage (roadmap B5) ─────────────────────────

    describe("getCmsImage (B5: campos IMAGE + mediateca)", () => {
      const mediaIds: string[] = [];

      // CI corre vitest con NEXT_PUBLIC_SUPABASE_URL="" (stack Supabase real
      // salta). getCmsImage deriva la URL pública del bucket desde ese env —
      // con placeholder basta (la aserción es sobre el path, no el host).
      process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co";

      afterAll(async () => {
        // Los assets del RUN se borran por id (no hay FK con CmsField; el
        // orden con el afterAll externo —fields del RUN— es indiferente).
        await prisma.cmsMedia.deleteMany({ where: { id: { in: mediaIds } } });
      });

      async function makeMedia() {
        const media = await prisma.cmsMedia.create({
          data: {
            bucket: "cms-media",
            path: `media/itest-${RUN}-${nextSuffix()}.png`,
            alt: "Asset de prueba B5",
            width: 40,
            height: 30,
            bytes: 1234,
            mime: "image/png",
          },
        });
        mediaIds.push(media.id);
        return media;
      }

      it("SETTING IMAGE publicado → resuelve { url, alt, width, height }", async () => {
        const media = await makeMedia();
        const field = await makeField({ type: "IMAGE", kind: "SETTING", body: media.id });
        const img = await getCmsImage(field.key);
        expect(img).not.toBeNull();
        expect(img!.url).toContain(`/storage/v1/object/public/cms-media/${media.path}`);
        expect(img!.alt).toBe("Asset de prueba B5");
        expect(img!.width).toBe(40);
        expect(img!.height).toBe(30);
      });

      it("BLOCK sin publicar → null (fallback); al publicar → resuelve", async () => {
        const media = await makeMedia();
        const field = await makeField({ type: "IMAGE", kind: "BLOCK", body: media.id });
        expect(await getCmsImage(field.key)).toBeNull();
        const detail = await getCmsFieldById(field.id);
        await publishCmsFieldVersion(field.id, detail!.versions[0].id, null);
        const img = await getCmsImage(field.key);
        expect(img).not.toBeNull();
        expect(img!.width).toBe(40);
      });

      it("key inexistente / campo sin asset / asset borrado → null", async () => {
        expect(await getCmsImage(`${RUN}.no-such-image`)).toBeNull();
        // Campo IMAGE cuyo body apunta a un asset que no existe.
        const ghost = await makeField({
          type: "IMAGE",
          kind: "SETTING",
          body: "cuidque no existe00000000",
        });
        expect(await getCmsImage(ghost.key)).toBeNull();
      });
    });

    // ───────────────────────── Banners de portada (roadmap B6) ─────────────────────────

    describe("getCmsBanners (B6: lista home.banners con imagen + activo)", () => {
      const BANNER_SCHEMA = [
        { name: "imagen", type: "IMAGE", label: "Imagen (de la mediateca)" },
        { name: "titulo", type: "TEXT", label: "Título" },
        { name: "enlace", type: "URL", label: "Enlace (ruta o URL)" },
        { name: "activo", type: "BOOLEAN", label: "Activo (Sí/No)" },
      ];
      const mediaIds: string[] = [];

      // Mismo motivo que en getCmsImage: la URL pública se deriva de este env.
      process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co";

      afterAll(async () => {
        await prisma.cmsMedia.deleteMany({ where: { id: { in: mediaIds } } });
      });

      async function makeBannerMedia() {
        const media = await prisma.cmsMedia.create({
          data: {
            bucket: "cms-media",
            path: `media/itest-b6-${RUN}-${nextSuffix()}.png`,
            alt: "Banner de prueba B6",
            width: 1200,
            height: 400,
            bytes: 4321,
            mime: "image/png",
          },
        });
        mediaIds.push(media.id);
        return media;
      }

      async function makeBannerField(body = "[]") {
        const field = await makeField({ type: "JSON", body });
        await prisma.cmsField.update({
          where: { id: field.id },
          data: { metadata: { listSchema: BANNER_SCHEMA } },
        });
        return field;
      }

      async function publishLatest(fieldId: string) {
        const detail = await getCmsFieldById(fieldId);
        await publishCmsFieldVersion(fieldId, detail!.versions[0].id, null);
      }

      it("publicada: resuelve assets, filtra inactivos y descarta assets fantasmas", async () => {
        const media = await makeBannerMedia();
        const other = await makeBannerMedia();
        const field = await makeBannerField();
        await saveCmsFieldItems(
          field.id,
          [
            { imagen: media.id, titulo: "Promo activa", enlace: "/productos", activo: "true" },
            { imagen: other.id, titulo: "Promo apagada", enlace: "/productos", activo: "false" },
            { imagen: "cuidfantasma000000000", titulo: "Sin asset", enlace: "/x", activo: "true" },
          ],
          null,
        );
        await publishLatest(field.id);

        const banners = await getCmsBanners(field.key);
        expect(banners).toHaveLength(1);
        expect(banners[0]).toMatchObject({
          alt: "Banner de prueba B6",
          width: 1200,
          height: 400,
          titulo: "Promo activa",
          enlace: "/productos",
        });
        expect(banners[0].url).toContain(`/storage/v1/object/public/cms-media/${media.path}`);
      });

      it("BLOCK sin publicar → []; al publicar → resuelve", async () => {
        const media = await makeBannerMedia();
        const field = await makeBannerField();
        await saveCmsFieldItems(
          field.id,
          [{ imagen: media.id, titulo: "B", enlace: "/b", activo: "true" }],
          null,
        );
        expect(await getCmsBanners(field.key)).toEqual([]);
        await publishLatest(field.id);
        const banners = await getCmsBanners(field.key);
        expect(banners).toHaveLength(1);
      });

      it("key inexistente, body vacío o JSON inválido → []", async () => {
        expect(await getCmsBanners(`${RUN}.no-such-banners`)).toEqual([]);
        const empty = await makeBannerField();
        await publishLatest(empty.id);
        expect(await getCmsBanners(empty.key)).toEqual([]);
        const invalid = await makeBannerField("esto no es JSON");
        await publishLatest(invalid.id);
        expect(await getCmsBanners(invalid.key)).toEqual([]);
      });

      it("la guarda de borrado de la mediateca detecta el id embebido en una lista", async () => {
        // B6 introdujo ids de CmsMedia DENTRO del body JSON de campos lista;
        // la guarda de deleteCmsMedia usa `contains` para cubrir ese caso
        // (borrar el asset dejaría un banner roto en el sitio).
        const media = await makeBannerMedia();
        const field = await makeBannerField();
        await saveCmsFieldItems(
          field.id,
          [{ imagen: media.id, titulo: "B", enlace: "/b", activo: "true" }],
          null,
        );
        await expect(deleteCmsMedia(media.id)).rejects.toThrow(/no se puede borrar/i);
        expect(await prisma.cmsMedia.findUnique({ where: { id: media.id } })).not.toBeNull();
        // El mapa de uso de la mediateca también lo ve (contador «en uso»).
        const usage = await getCmsMediaUsage([media.id]);
        expect(usage.get(media.id)).toContain(field.key);
      });
    });
  },
);
