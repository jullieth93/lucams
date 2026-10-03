/*
 * Helpers PUROS de sync-catalog-stg-to-prd.mjs (diff por clave natural,
 * normalización de URLs de Storage, mapeo de campos de contenido). Separados
 * acá para testearlos con `node --test` sin tocar DBs ni buckets — el script
 * one-shot solo orquesta (lee, resuelve FKs, aplica, loguea).
 *
 * Regla de contenido (decisión del owner, igual que el sync de galería): STG
 * es la fuente de verdad del CONTENIDO. Una fila presente en ambos ambientes
 * se considera DISTINTA si difiere en cualquiera de sus contentFields; las
 * filas solo-PRD nunca se tocan (solo se reportan).
 *
 * Campos que NUNCA se sincronizan (quedan en PRD tal cual):
 *   - ProductVariant.stock: el stock de PRD es OPERATIVO REAL (lo descuentan
 *     órdenes pagadas vía InventoryLog). Sobrescribirlo con el stock de
 *     pruebas de STG vendería inventario fantasma o dejaría sin stock
 *     productos que sí hay. Los INSERTS de variantes nuevas entran con
 *     stock=0 (default del schema) y Lucy carga el stock operativo a mano.
 *   - createdAt/updatedAt: en updates se preservan (updatedAt se actualiza
 *     solo vía @updatedAt); en inserts se copia el createdAt de STG.
 *   - ids de PRD en filas cruzadas por clave natural (hay FKs apuntando a
 *     ellos: OrderItem.variantId, Design.templateId, …).
 *   - CmsField.publishedVersionId como valor crudo: es un id de
 *     CmsFieldVersion local de cada ambiente; el script resuelve la versión
 *     publicada por CONTENIDO (ver publishedVersionChanged).
 */

import { canon, storageObjectFromUrl } from "./gallery-sync.mjs";

/**
 * Definición por entidad: clave natural (los ids cuid difieren entre ambientes
 * — lección del sync de galería), campos de contenido que mandan en el diff y
 * campos que guardan URLs de Storage (se normalizan para comparar y se
 * reescriben al host destino al escribir).
 *
 * Los campos `*Slug` / `sectionRef` son FKs APLANADAS a su clave natural (el
 * script las deriva con joins); en el diff comparan como strings y al escribir
 * se traducen al id cuid del ambiente destino.
 */
export const ENTITY_DEFS = {
  category: {
    label: "Category",
    keyOf: (r) => r.slug,
    contentFields: [
      "name", "description", "richDescription", "useCase", "image", "icon",
      "gradient", "visibleFilters", "defaultSort", "featuredProductSlug",
      "activeFrom", "activeUntil", "parentSlug", "order", "isActive", "deletedAt",
    ],
    imageFields: ["image"],
  },
  product: {
    label: "Product",
    keyOf: (r) => r.slug,
    contentFields: [
      "sku", "name", "description", "basePrice", "compareAtPrice", "cost",
      "isPersonalizable", "personalizationKind", "personalizationSchema",
      "richDescription", "whyChooseThis", "idealFor", "physicalSpecs",
      "warrantyMonths", "productionDays", "shippingDaysMin", "shippingDaysMax",
      "minimumQuantity", "maximumQuantity", "images", "categorySlug",
      "isActive", "isFeatured", "seoTitle", "seoDescription", "deletedAt",
    ],
    imageFields: ["images"],
  },
  variant: {
    label: "ProductVariant",
    keyOf: (r) => r.sku,
    // OJO: `stock` NO está — el stock de PRD es operativo real y NUNCA se
    // sincroniza (ver header). Testeado en catalog-sync.test.mjs.
    contentFields: [
      "productSlug", "name", "description", "price", "compareAtPrice",
      "images", "attributes", "isActive", "deletedAt",
    ],
    imageFields: ["images"],
  },
  cmsPage: {
    label: "CmsPage",
    keyOf: (r) => r.slug,
    contentFields: ["title", "description", "path", "icon", "sortOrder"],
    imageFields: [],
  },
  cmsSection: {
    label: "CmsSection",
    // key es única POR PÁGINA (@@unique([pageId, key])) → clave natural compuesta.
    keyOf: (r) => `${r.pageSlug}|${r.key}`,
    contentFields: ["title", "description", "sortOrder"],
    imageFields: [],
  },
  cmsField: {
    label: "CmsField",
    keyOf: (r) => r.key, // key es @unique global ("home.hero.title", "CONTACT_EMAIL")
    contentFields: [
      "sectionRef", "kind", "label", "helpText", "type", "body", "metadata",
      "category", "sortOrder", "isPublished", "deletedAt",
    ],
    imageFields: [],
  },
  template: {
    label: "PersonalizationTemplate",
    keyOf: (r) => r.slug,
    contentFields: [
      "productSlug", "kind", "mode", "name", "description", "previewUrl",
      "canvasData", "isActive", "order", "deletedAt",
    ],
    imageFields: ["previewUrl"],
  },
};

/** Campos aplanados que al escribir se traducen a FK cuid del destino. */
export const MAPPED_FK_FIELDS = new Set(["parentSlug", "categorySlug", "productSlug", "sectionRef", "pageSlug"]);

/**
 * Normaliza una URL (o array de URLs) para comparar contenido entre ambientes:
 * las URLs públicas de Storage se reducen a `storage://<bucket>/<path>` —
 * el HOST difiere por ambiente (decisión 2026-09-20: cada ambiente sirve sus
 * propias imágenes) y no es una diferencia de contenido. URLs ajenas
 * (Unsplash, relativas) quedan tal cual.
 */
export function normalizeImageValue(value) {
  if (Array.isArray(value)) return value.map(normalizeImageValue);
  if (typeof value !== "string") return value ?? null;
  const obj = storageObjectFromUrl(value);
  return obj ? `storage://${obj.bucket}/${obj.path}` : value;
}

/** Copia de la fila con sus imageFields normalizados (para el diff). */
export function normalizeRowImages(row, imageFields) {
  const out = { ...row };
  for (const f of imageFields) out[f] = normalizeImageValue(row[f]);
  return out;
}

/**
 * Reescribe el host de URLs de Storage (string o array) de un ambiente a otro.
 * Solo toca URLs que empiezan por `<fromBase>/`; el resto queda intacto.
 * Se usa al ESCRIBIR en PRD: el contenido manda de STG pero las URLs deben
 * apuntar al bucket del propio ambiente (sync-product-images-stg-20260920).
 */
export function rewriteImageHost(value, fromBase, toBase) {
  if (Array.isArray(value)) return value.map((v) => rewriteImageHost(v, fromBase, toBase));
  if (typeof value === "string" && fromBase && toBase && value.startsWith(`${fromBase}/`)) {
    return toBase + value.slice(fromBase.length);
  }
  return value;
}

/**
 * Campos de contenido en los que dos filas difieren ([] si son iguales).
 * Compara con las URLs de imagen ya normalizadas (ver normalizeRowImages).
 */
export function changedFields(stgRow, prdRow, contentFields) {
  return contentFields.filter((f) => canon(stgRow[f]) !== canon(prdRow[f]));
}

/**
 * Diff entre las filas de STG (fuente) y PRD (destino) por CLAVE NATURAL,
 * con cruce en dos niveles (mismo patrón que diffGallery):
 *   1. por id (las cuid se preservan en filas ya sincronizadas por este
 *      script — re-corridas idempotentes);
 *   2. si el id no existe en PRD, por clave natural (slug/sku/key…) — filas
 *      sembradas independientes en cada ambiente matchean acá y se UPDATEan
 *      en sitio conservando el id de PRD (hay FKs). Clave duplicada en PRD →
 *      no se usa (ambigüedad) y la fila va a INSERT.
 * Devuelve además `matches` (todos los pares cruzados, cambien o no) para que
 * el script construya los mapas de FK cuid-STG → cuid-PRD.
 * @returns {{
 *   inserts: Array<object>,   // sin id ni clave natural en PRD → INSERT con el id de STG
 *   updates: Array<{ row: object, prdRow: object, fields: string[], matchedBy: "id" | "key" }>,
 *   matches: Array<{ row: object, prdRow: object, matchedBy: "id" | "key" }>,
 *   prdOnly: Array<object>,   // solo en PRD → NO tocar (reportar)
 * }}
 */
export function diffEntity(stgRows, prdRows, def) {
  const norm = (r) => normalizeRowImages(r, def.imageFields);
  const prdById = new Map(prdRows.map((r) => [r.id, r]));
  const prdByKey = new Map();
  const dupKeys = new Set();
  for (const r of prdRows) {
    const k = def.keyOf(r);
    if (prdByKey.has(k)) dupKeys.add(k);
    prdByKey.set(k, r);
  }
  const matchedPrdIds = new Set();
  const inserts = [];
  const updates = [];
  const matches = [];
  for (const row of stgRows) {
    const byId = prdById.get(row.id);
    const k = def.keyOf(row);
    const prdRow = byId ?? (dupKeys.has(k) ? undefined : prdByKey.get(k));
    if (!prdRow) {
      inserts.push(row);
      continue;
    }
    matchedPrdIds.add(prdRow.id);
    const matchedBy = byId ? "id" : "key";
    matches.push({ row, prdRow, matchedBy });
    const fields = changedFields(norm(row), norm(prdRow), def.contentFields);
    if (fields.length > 0) updates.push({ row, prdRow, fields, matchedBy });
  }
  const prdOnly = prdRows.filter((r) => !matchedPrdIds.has(r.id));
  return { inserts, updates, matches, prdOnly };
}

/**
 * ¿La versión publicada difiere por CONTENIDO entre ambientes?
 * El storefront lee `publishedVersion.body` (apps/web/lib/cms.ts), no
 * `CmsField.body` — sincronizar el borrador sin la versión publicada dejaría
 * el sitio sirviendo el texto viejo. Compara title/body/metadata
 * canónicamente; null vs null = sin cambio.
 */
export function publishedVersionChanged(stgField, prdField) {
  const a = stgField.publishedVersion;
  const b = prdField.publishedVersion;
  if (!a && !b) return false;
  if (!a || !b) return true;
  return ["title", "body", "metadata"].some((f) => canon(a[f]) !== canon(b[f]));
}

/**
 * ¿Los CmsListItem (representación de EDICIÓN de campos LISTA) difieren?
 * Si quedan viejas en PRD, el próximo guardado admin reserializaría el JSON
 * viejo sobre el body sincronizado. Compara (position, values) en orden.
 */
export function listItemsChanged(stgItems, prdItems) {
  const norm = (items) =>
    (items ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => `${i.position}:${canon(i.values)}`);
  return JSON.stringify(norm(stgItems)) !== JSON.stringify(norm(prdItems));
}

/**
 * Objetos de Storage únicos referenciados por una lista de URLs plana
 * (los imageFields ya aplanados de las filas tocadas). Dedup por bucket/path.
 */
export function collectUrlObjects(urls) {
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    const obj = storageObjectFromUrl(url);
    if (!obj) continue;
    const key = `${obj.bucket}/${obj.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(obj);
  }
  return out;
}

/** Aplana los imageFields (string o string[]) de una fila a una lista de URLs. */
export function imageUrlsOf(row, imageFields) {
  const out = [];
  for (const f of imageFields) {
    const v = row[f];
    if (Array.isArray(v)) out.push(...v.filter(Boolean));
    else if (v) out.push(v);
  }
  return out;
}
