/*
 * Test de los helpers puros de sync-catalog (lib/catalog-sync.mjs) — corre con
 * `node --test`. Cubre el diff por clave natural (insert/update/cruce por
 * clave/solo-PRD), la normalización y reescritura de URLs de Storage, la
 * comparación de versiones publicadas del CMS y la exclusión de campos
 * operativos (stock).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ENTITY_DEFS,
  MAPPED_FK_FIELDS,
  normalizeImageValue,
  normalizeRowImages,
  rewriteImageHost,
  changedFields,
  diffEntity,
  publishedVersionChanged,
  listItemsChanged,
  collectUrlObjects,
  imageUrlsOf,
} from "./catalog-sync.mjs";

const STG = "https://mjbdiqdkykhsixvqlrrp.supabase.co";
const PRD = "https://zxkucphbsfygakgxcnik.supabase.co";

const product = (over = {}) => ({
  id: "stg-p1",
  slug: "separadores-magneticos-delgados",
  sku: "SEP-DEL",
  name: "Separadores magnéticos delgados",
  description: "desc",
  basePrice: 10000,
  compareAtPrice: null,
  cost: null,
  isPersonalizable: false,
  personalizationKind: "NONE",
  personalizationSchema: null,
  richDescription: null,
  whyChooseThis: null,
  idealFor: [],
  physicalSpecs: null,
  warrantyMonths: 12,
  productionDays: 1,
  shippingDaysMin: 2,
  shippingDaysMax: 5,
  minimumQuantity: 1,
  maximumQuantity: null,
  images: [`${STG}/storage/v1/object/public/product-images/separadores/a.webp`],
  categorySlug: "separadores",
  isActive: true,
  isFeatured: false,
  seoTitle: null,
  seoDescription: null,
  deletedAt: null,
  ...over,
});

describe("ENTITY_DEFS", () => {
  it("cada entidad tiene clave natural y campos de contenido", () => {
    assert.equal(ENTITY_DEFS.category.keyOf({ slug: "s" }), "s");
    assert.equal(ENTITY_DEFS.product.keyOf({ slug: "s" }), "s");
    assert.equal(ENTITY_DEFS.variant.keyOf({ sku: "K" }), "K");
    assert.equal(ENTITY_DEFS.cmsPage.keyOf({ slug: "inicio" }), "inicio");
    assert.equal(
      ENTITY_DEFS.cmsSection.keyOf({ pageSlug: "inicio", key: "hero" }),
      "inicio|hero",
    );
    assert.equal(ENTITY_DEFS.cmsField.keyOf({ key: "CONTACT_EMAIL" }), "CONTACT_EMAIL");
    assert.equal(ENTITY_DEFS.template.keyOf({ slug: "polaroid-clasico" }), "polaroid-clasico");
  });

  it("ProductVariant NUNCA sincroniza stock (operativo real de PRD) ni timestamps", () => {
    for (const banned of ["stock", "createdAt", "updatedAt", "id"]) {
      assert.ok(
        !ENTITY_DEFS.variant.contentFields.includes(banned),
        `variant.contentFields no debe incluir ${banned}`,
      );
    }
  });

  it("ninguna entidad sincroniza ids ni timestamps como contenido", () => {
    for (const [name, def] of Object.entries(ENTITY_DEFS)) {
      for (const banned of ["id", "createdAt", "updatedAt", "createdBy", "updatedBy"]) {
        assert.ok(
          !def.contentFields.includes(banned),
          `${name}.contentFields no debe incluir ${banned}`,
        );
      }
    }
  });

  it("CmsField no trata publishedVersionId como campo de contenido plano", () => {
    assert.ok(!ENTITY_DEFS.cmsField.contentFields.includes("publishedVersionId"));
  });
});

describe("normalizeImageValue", () => {
  it("reduce URLs de Storage a storage://bucket/path (host-agnóstico)", () => {
    assert.equal(
      normalizeImageValue(`${STG}/storage/v1/object/public/product-images/a%20b.webp`),
      "storage://product-images/a b.webp",
    );
  });

  it("arrays elemento a elemento; URLs ajenas y null intactos", () => {
    assert.deepEqual(
      normalizeImageValue([
        `${PRD}/storage/v1/object/public/product-images/x.webp`,
        "https://images.unsplash.com/foto",
      ]),
      ["storage://product-images/x.webp", "https://images.unsplash.com/foto"],
    );
    assert.equal(normalizeImageValue(null), null);
    assert.equal(normalizeImageValue(undefined), null);
  });
});

describe("rewriteImageHost", () => {
  it("reescribe solo URLs del host origen", () => {
    assert.equal(
      rewriteImageHost(`${STG}/storage/v1/object/public/product-images/a.webp`, STG, PRD),
      `${PRD}/storage/v1/object/public/product-images/a.webp`,
    );
    assert.equal(rewriteImageHost("https://images.unsplash.com/foto", STG, PRD), "https://images.unsplash.com/foto");
    assert.deepEqual(
      rewriteImageHost([`${STG}/x/a.webp`, `${PRD}/x/b.webp`], STG, PRD),
      [`${PRD}/x/a.webp`, `${PRD}/x/b.webp`],
    );
  });
});

describe("changedFields", () => {
  it("ignora diferencias de solo host en imágenes (tras normalizar)", () => {
    const def = ENTITY_DEFS.product;
    const stg = normalizeRowImages(product(), def.imageFields);
    const prd = normalizeRowImages(
      product({ id: "prd-p9", images: [`${PRD}/storage/v1/object/public/product-images/separadores/a.webp`] }),
      def.imageFields,
    );
    assert.deepEqual(changedFields(stg, prd, def.contentFields), []);
  });

  it("detecta cambios de contenido reales (precio, imágenes, soft-delete)", () => {
    const def = ENTITY_DEFS.product;
    const stg = normalizeRowImages(product({ basePrice: 12000 }), def.imageFields);
    const prd = normalizeRowImages(product(), def.imageFields);
    assert.deepEqual(changedFields(stg, prd, def.contentFields), ["basePrice"]);
    const arch = normalizeRowImages(product({ deletedAt: new Date("2026-10-02") }), def.imageFields);
    assert.deepEqual(changedFields(arch, prd, def.contentFields), ["deletedAt"]);
  });
});

describe("diffEntity", () => {
  const def = ENTITY_DEFS.product;

  it("inserta lo que falta, actualiza lo distinto, reporta solo-PRD sin tocarlo", () => {
    const stg = [product({ id: "a" }), product({ id: "b", slug: "nuevo", sku: "N" }), product({ id: "c", slug: "c", sku: "C", basePrice: 999 })];
    const prd = [product({ id: "a" }), product({ id: "c", slug: "c", sku: "C" }), product({ id: "z", slug: "solo-prd", sku: "Z" })];
    const { inserts, updates, matches, prdOnly } = diffEntity(stg, prd, def);
    assert.deepEqual(inserts.map((r) => r.id), ["b"]);
    assert.deepEqual(updates.map((u) => [u.row.id, u.fields]), [["c", ["basePrice"]]]);
    assert.deepEqual(prdOnly.map((r) => r.id), ["z"]);
    assert.equal(matches.length, 2);
  });

  it("cruza por clave natural (slug) cuando la cuid difiere — update en sitio conservando id PRD", () => {
    const stg = [product({ id: "stg-cuid", name: "Nombre nuevo" })];
    const prd = [product({ id: "prd-cuid" })];
    const { inserts, updates } = diffEntity(stg, prd, def);
    assert.equal(inserts.length, 0);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].matchedBy, "key");
    assert.equal(updates[0].prdRow.id, "prd-cuid");
    assert.deepEqual(updates[0].fields, ["name"]);
  });

  it("idempotente: PRD igualado (salvo host de imágenes) → sin inserts ni updates", () => {
    const stg = [product({ id: "a" })];
    const prd = [
      product({ id: "a", images: [`${PRD}/storage/v1/object/public/product-images/separadores/a.webp`] }),
    ];
    const { inserts, updates, prdOnly } = diffEntity(stg, prd, def);
    assert.equal(inserts.length, 0);
    assert.equal(updates.length, 0);
    assert.equal(prdOnly.length, 0);
  });

  it("clave natural duplicada en PRD → no cruza (ambigüedad), va a insert", () => {
    const stg = [product({ id: "stg-1" })];
    const prd = [product({ id: "p1" }), product({ id: "p2" })];
    const { inserts, updates, prdOnly } = diffEntity(stg, prd, def);
    assert.deepEqual(inserts.map((r) => r.id), ["stg-1"]);
    assert.equal(updates.length, 0);
    assert.equal(prdOnly.length, 2);
  });

  it("cmsSection cruza por clave compuesta pageSlug|key", () => {
    const sdef = ENTITY_DEFS.cmsSection;
    const stg = [{ id: "s1", pageSlug: "inicio", key: "hero", title: "Nuevo", description: null, sortOrder: 1 }];
    const prd = [{ id: "p1", pageSlug: "inicio", key: "hero", title: "Viejo", description: null, sortOrder: 1 }];
    const { updates } = diffEntity(stg, prd, sdef);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].matchedBy, "key");
    assert.deepEqual(updates[0].fields, ["title"]);
  });
});

describe("publishedVersionChanged", () => {
  const ver = (over = {}) => ({ title: "T", body: "cuerpo", metadata: {}, ...over });
  it("false si ambas null o mismo contenido", () => {
    assert.equal(publishedVersionChanged({ publishedVersion: null }, { publishedVersion: null }), false);
    assert.equal(
      publishedVersionChanged({ publishedVersion: ver() }, { publishedVersion: ver({ id: "otro", version: 9 }) }),
      false,
    );
  });
  it("true si una falta o difiere el body/metadata", () => {
    assert.equal(publishedVersionChanged({ publishedVersion: ver() }, { publishedVersion: null }), true);
    assert.equal(
      publishedVersionChanged({ publishedVersion: ver({ body: "nuevo" }) }, { publishedVersion: ver() }),
      true,
    );
    assert.equal(
      publishedVersionChanged({ publishedVersion: ver({ metadata: { a: 1 } }) }, { publishedVersion: ver() }),
      true,
    );
  });
});

describe("listItemsChanged", () => {
  it("compara (position, values) sin importar ids ni orden de llegada", () => {
    const a = [
      { id: "1", position: 0, values: { label: "A" } },
      { id: "2", position: 1, values: { label: "B" } },
    ];
    const b = [
      { id: "x", position: 1, values: { label: "B" } },
      { id: "y", position: 0, values: { label: "A" } },
    ];
    assert.equal(listItemsChanged(a, b), false);
    assert.equal(listItemsChanged(a, [{ id: "1", position: 0, values: { label: "A" } }]), true);
    assert.equal(listItemsChanged(a, null), true);
    assert.equal(listItemsChanged([], null), false);
  });
});

describe("collectUrlObjects / imageUrlsOf", () => {
  it("junta URLs de string y arrays, dedupando por bucket/path", () => {
    const row = {
      images: [`${STG}/storage/v1/object/public/product-images/a.webp`],
      image: `${STG}/storage/v1/object/public/cms-media/b.webp`,
      previewUrl: "https://images.unsplash.com/externa",
    };
    const urls = imageUrlsOf(row, ["images", "image", "previewUrl"]);
    assert.deepEqual(collectUrlObjects(urls), [
      { bucket: "product-images", path: "a.webp" },
      { bucket: "cms-media", path: "b.webp" },
    ]);
  });
});

describe("MAPPED_FK_FIELDS", () => {
  it("los campos FK aplanados usados en contentFields están declarados", () => {
    for (const f of ["parentSlug", "categorySlug", "productSlug", "sectionRef", "pageSlug"]) {
      assert.ok(MAPPED_FK_FIELDS.has(f), f);
    }
  });
});
