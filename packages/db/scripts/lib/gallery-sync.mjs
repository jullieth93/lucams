/*
 * Helpers PUROS de sync-gallery-stg-to-prd.mjs (diff por id con fallback
 * (tag, name) y mapeo de URLs de Storage). Separados acá para testearlos con
 * `node --test` sin tocar DBs ni buckets — el script one-shot solo orquesta
 * (lee, aplica, loguea).
 *
 * Regla de contenido (decisión del owner): STG es la fuente de verdad. Una fila
 * presente en ambos ambientes se considera DISTINTA si difiere en cualquiera de
 * CONTENT_FIELDS; las filas solo-PRD nunca se tocan (solo se reportan).
 */

/** Campos de contenido que mandan en el diff (id/timestamps/auditores no). */
export const CONTENT_FIELDS = [
  "tag",
  "name",
  "imageUrl",
  "imageUrlB",
  "variantFilter",
  "order",
  "isActive",
  "deletedAt",
];

/**
 * Canoniza un valor para comparar: null/undefined → null, Date → ISO,
 * Json (variantFilter) → JSON string estable. Así `{"a":1}` y un Json de Prisma
 * con el mismo contenido comparan igual aunque lleguen como objetos distintos.
 */
export function canon(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/**
 * Lista de campos de contenido en los que dos filas difieren ([] si son iguales).
 * @param {Record<string, unknown>} stgRow fila fuente (STG, verdad)
 * @param {Record<string, unknown>} prdRow fila destino (PRD)
 * @returns {string[]}
 */
export function changedFields(stgRow, prdRow) {
  return CONTENT_FIELDS.filter((f) => canon(stgRow[f]) !== canon(prdRow[f]));
}

/** Clave de contenido para cruzar filas cuya cuid NO se preservó entre ambientes. */
export const keyOf = (row) => `${row.tag}|${row.name}`;

/**
 * Diff entre las filas de STG (fuente) y PRD (destino). Cruce en dos niveles:
 *   1. por id (las cuid se preservan para las filas que YA se sincronizaron así
 *      — re-corridas idempotentes);
 *   2. si el id no existe en PRD, por (tag, name) — las 66 filas sembradas
 *      independientemente en cada ambiente (misma clave, cuid distinta) matchean
 *      acá y se UPDATEan en sitio conservando el id de PRD, en vez de
 *      duplicarse. Si la clave está duplicada en PRD no se usa (ambigüedad).
 * @param {Array<Record<string, unknown>>} stgRows
 * @param {Array<Record<string, unknown>>} prdRows
 * @returns {{
 *   inserts: Array<Record<string, unknown>>,          // sin id ni (tag,name) en PRD → INSERT con el id de STG
 *   updates: Array<{ row: Record<string, unknown>, prdRow: Record<string, unknown>, fields: string[], matchedBy: "id" | "tag+name" }>,
 *   prdOnly: Array<Record<string, unknown>>,          // solo en PRD → NO tocar (reportar)
 * }}
 */
export function diffGallery(stgRows, prdRows) {
  const prdById = new Map(prdRows.map((r) => [r.id, r]));
  const prdByKey = new Map();
  const dupKeys = new Set();
  for (const r of prdRows) {
    const k = keyOf(r);
    if (prdByKey.has(k)) dupKeys.add(k);
    prdByKey.set(k, r);
  }
  const matchedPrdIds = new Set();
  const inserts = [];
  const updates = [];
  for (const row of stgRows) {
    const byId = prdById.get(row.id);
    const k = keyOf(row);
    const prdRow = byId ?? (dupKeys.has(k) ? undefined : prdByKey.get(k));
    if (!prdRow) {
      inserts.push(row);
      continue;
    }
    matchedPrdIds.add(prdRow.id);
    const fields = changedFields(row, prdRow);
    if (fields.length > 0) updates.push({ row, prdRow, fields, matchedBy: byId ? "id" : "tag+name" });
  }
  const prdOnly = prdRows.filter((r) => !matchedPrdIds.has(r.id));
  return { inserts, updates, prdOnly };
}

/**
 * Extrae { bucket, path } de una URL pública de Supabase Storage
 * (<host>/storage/v1/object/public/<bucket>/<path>). Devuelve null para URLs
 * ajenas (Unsplash, relativas, malformadas) — esas no se copian.
 * @param {string | null | undefined} url
 * @returns {{ bucket: string, path: string } | null}
 */
export function storageObjectFromUrl(url) {
  if (!url) return null;
  try {
    const m = new URL(url).pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null;
  } catch {
    return null;
  }
}

/**
 * Objetos de Storage únicos ("<bucket>/<path>") referenciados por imageUrl /
 * imageUrlB de un set de filas (las que se van a insertar/actualizar).
 * @param {Array<Record<string, unknown>>} rows
 * @returns {Array<{ bucket: string, path: string }>}
 */
export function collectStorageObjects(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    for (const url of [row.imageUrl, row.imageUrlB]) {
      const obj = storageObjectFromUrl(url);
      if (!obj) continue;
      const key = `${obj.bucket}/${obj.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(obj);
    }
  }
  return out;
}
