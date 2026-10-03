/*
 * Test de los helpers puros de sync-gallery (lib/gallery-sync.mjs) — corre con
 * `node --test`. Cubre el diff por id (insert/update/solo-PRD) y el mapeo de
 * URLs públicas de Storage a { bucket, path }.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_FIELDS,
  canon,
  changedFields,
  diffGallery,
  storageObjectFromUrl,
  collectStorageObjects,
} from "./gallery-sync.mjs";

const row = (over = {}) => ({
  id: "clx1",
  tag: "separadores-magneticos",
  name: "Flores",
  imageUrl: "https://ref.supabase.co/storage/v1/object/public/product-images/gallery-separadores-magneticos/flores.webp",
  imageUrlB: null,
  variantFilter: null,
  order: 1,
  isActive: true,
  deletedAt: null,
  ...over,
});

describe("canon", () => {
  it("null/undefined → null; Date → ISO; Json → string estable", () => {
    assert.equal(canon(null), null);
    assert.equal(canon(undefined), null);
    assert.equal(canon(new Date("2026-10-02T00:00:00Z")), "2026-10-02T00:00:00.000Z");
    assert.equal(canon({ sizeCm: "2×6" }), '{"sizeCm":"2×6"}');
    assert.equal(canon("2×6"), "2×6");
  });
});

describe("changedFields", () => {
  it("vacío cuando el contenido es igual (aunque difieran timestamps/id de auditoría)", () => {
    const a = row({ createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") });
    const b = row({ createdAt: new Date("2026-02-02"), updatedAt: new Date("2026-02-02"), updatedBy: "otro" });
    assert.deepEqual(changedFields(a, b), []);
  });

  it("detecta diferencias en cada campo de contenido, incl. variantFilter e imageUrlB", () => {
    const base = row();
    assert.deepEqual(changedFields(row({ name: "Otro" }), base), ["name"]);
    assert.deepEqual(changedFields(row({ imageUrlB: "https://x/b.webp" }), base), ["imageUrlB"]);
    assert.deepEqual(changedFields(row({ variantFilter: { sizeCm: "2×6" } }), base), ["variantFilter"]);
    assert.deepEqual(changedFields(row({ order: 9, isActive: false }), base), ["order", "isActive"]);
    assert.deepEqual(changedFields(row({ deletedAt: new Date("2026-10-02") }), base), ["deletedAt"]);
    // variantFilter igual en contenido pero objeto distinto → NO es cambio
    assert.deepEqual(
      changedFields(row({ variantFilter: { sizeCm: "2×6" } }), row({ variantFilter: { sizeCm: "2×6" } })),
      [],
    );
  });

  it("CONTENT_FIELDS cubre exactamente los campos de contenido del modelo", () => {
    assert.deepEqual(CONTENT_FIELDS, [
      "tag",
      "name",
      "imageUrl",
      "imageUrlB",
      "variantFilter",
      "order",
      "isActive",
      "deletedAt",
    ]);
  });
});

describe("diffGallery", () => {
  it("inserta lo que falta en PRD, actualiza lo distinto, reporta solo-PRD sin tocarlo", () => {
    const stg = [row({ id: "a" }), row({ id: "b" }), row({ id: "c", name: "Nuevo nombre" })];
    const prd = [row({ id: "a" }), row({ id: "c", name: "Viejo nombre" }), row({ id: "z-prd" })];
    const { inserts, updates, prdOnly } = diffGallery(stg, prd);
    assert.deepEqual(inserts.map((r) => r.id), ["b"]);
    assert.deepEqual(
      updates.map((u) => [u.row.id, u.fields]),
      [["c", ["name"]]],
    );
    assert.deepEqual(prdOnly.map((r) => r.id), ["z-prd"]);
  });

  it("idempotente: con PRD ya igualado no hay inserts ni updates", () => {
    const stg = [row({ id: "a" }), row({ id: "b", variantFilter: { sizeCm: "2×6" } })];
    const prd = [row({ id: "a" }), row({ id: "b", variantFilter: { sizeCm: "2×6" } })];
    const { inserts, updates, prdOnly } = diffGallery(stg, prd);
    assert.equal(inserts.length, 0);
    assert.equal(updates.length, 0);
    assert.equal(prdOnly.length, 0);
  });

  it("cruza por (tag,name) cuando la cuid no se preservó — update en sitio, sin duplicar", () => {
    // Caso real 2026-10-02: 66 filas sembradas independientes en cada ambiente.
    const stg = [row({ id: "stg-cuid", name: "Flores", order: 5 }), row({ id: "nuevo", name: "Nuevo" })];
    const prd = [row({ id: "prd-cuid", name: "Flores", order: 1 })];
    const { inserts, updates, prdOnly } = diffGallery(stg, prd);
    assert.deepEqual(inserts.map((r) => r.id), ["nuevo"]);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].matchedBy, "tag+name");
    assert.equal(updates[0].prdRow.id, "prd-cuid"); // el UPDATE apunta al id de PRD
    assert.deepEqual(updates[0].fields, ["order"]);
    assert.equal(prdOnly.length, 0);
  });

  it("el cruce por id gana al de (tag,name) y se reporta matchedBy", () => {
    const stg = [row({ id: "a", order: 2 })];
    const prd = [row({ id: "a", order: 1 })];
    const { updates } = diffGallery(stg, prd);
    assert.equal(updates[0].matchedBy, "id");
  });

  it("clave (tag,name) duplicada en PRD → no cruza por clave (ambigüedad), va a insert", () => {
    const stg = [row({ id: "stg-1", name: "Flores" })];
    const prd = [row({ id: "p1", name: "Flores" }), row({ id: "p2", name: "Flores" })];
    const { inserts, updates, prdOnly } = diffGallery(stg, prd);
    assert.deepEqual(inserts.map((r) => r.id), ["stg-1"]);
    assert.equal(updates.length, 0);
    assert.deepEqual(prdOnly.map((r) => r.id).sort(), ["p1", "p2"]);
  });
});

describe("storageObjectFromUrl", () => {
  it("extrae bucket y path de URLs públicas de Storage", () => {
    assert.deepEqual(
      storageObjectFromUrl(
        "https://mjbdiqdkykhsixvqlrrp.supabase.co/storage/v1/object/public/product-images/gallery-separadores-magneticos/flores%20azul.webp",
      ),
      { bucket: "product-images", path: "gallery-separadores-magneticos/flores azul.webp" },
    );
  });

  it("null para URLs ajenas o vacías (Unsplash, relativas, malformadas)", () => {
    assert.equal(storageObjectFromUrl(null), null);
    assert.equal(storageObjectFromUrl(""), null);
    assert.equal(storageObjectFromUrl("https://images.unsplash.com/foto"), null);
    assert.equal(storageObjectFromUrl("/imagenes/flores.webp"), null);
    assert.equal(storageObjectFromUrl("no-es-url"), null);
  });
});

describe("collectStorageObjects", () => {
  it("junta imageUrl e imageUrlB, dedupando por bucket/path", () => {
    const url = "https://r.supabase.co/storage/v1/object/public/product-images/gallery-x/a.webp";
    const rows = [
      row({ id: "1", imageUrl: url, imageUrlB: "https://r.supabase.co/storage/v1/object/public/product-images/gallery-x/b.webp" }),
      row({ id: "2", imageUrl: url, imageUrlB: null }), // duplicada
      row({ id: "3", imageUrl: "https://images.unsplash.com/externa" }), // ajena, se ignora
    ];
    assert.deepEqual(collectStorageObjects(rows), [
      { bucket: "product-images", path: "gallery-x/a.webp" },
      { bucket: "product-images", path: "gallery-x/b.webp" },
    ]);
  });
});
