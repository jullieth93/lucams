/*
 * homologation-diff-20260915.mjs (SOLO LECTURA) — cruza dos snapshots de
 * homologation-dump y lista TODA divergencia: faltantes, sobrantes y campos
 * distintos (productos, variantes, plantillas, CMS, categorías).
 *
 * Uso: node scripts/one-shot/homologation-diff-20260915.mjs <labelA> <labelB>
 *   (lee tmp/homologation/<label>.json — correr primero el dump por ambiente)
 */

import { readFileSync } from "node:fs";

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error("uso: node homologation-diff-20260915.mjs <labelA> <labelB>");
  process.exit(1);
}
const A = JSON.parse(readFileSync(`../../tmp/homologation/${a}.json`, "utf8"));
const B = JSON.parse(readFileSync(`../../tmp/homologation/${b}.json`, "utf8"));

let diffs = 0;
let archivedDiffs = 0;
const say = (msg, live = true) => {
  console.log(`  ${live ? "⚠" : "· [archivo]"} ${msg}`);
  if (live) diffs++;
  else archivedDiffs++;
};

const index = (arr, key) => new Map(arr.map((x) => [x[key], x]));
const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
/** Una fila es "viva" si no está soft-eliminada y está activa (el drift en filas
 *  archivadas es ruido histórico — se reporta aparte, no bloquea la homologación). */
const alive = (x) => x.deleted !== true && x.isActive !== false;

function compare(kind, keyFn, arrA, arrB, fields) {
  const mA = index(arrA, keyFn);
  const mB = index(arrB, keyFn);
  for (const [k, x] of mA) {
    const y = mB.get(k);
    if (!y) {
      say(`${kind} ${k}: existe en ${a} y FALTA en ${b}`, alive(x));
      continue;
    }
    for (const f of fields) {
      if (!same(x[f], y[f])) {
        say(
          `${kind} ${k}.${f}: ${a}=${JSON.stringify(x[f] ?? null)} ≠ ${b}=${JSON.stringify(y[f] ?? null)}`,
          alive(x) || alive(y),
        );
      }
    }
  }
  for (const [k, y] of mB) {
    if (!mA.has(k)) say(`${kind} ${k}: FALTA en ${a} y existe en ${b}`, alive(y));
  }
}

console.log(`\n═══ DIFF ${a} ↔ ${b} ═══`);

compare("categoría", "slug", A.categories, B.categories, ["name", "isActive", "order"]);

for (const p of A.products) {
  const q = B.products.find((x) => x.slug === p.slug);
  if (!q) {
    say(`producto ${p.slug}: existe en ${a} y FALTA en ${b}`, alive(p));
    continue;
  }
  for (const f of [
    "sku", "name", "basePrice", "compareAtPrice", "isActive", "isFeatured",
    "isPersonalizable", "personalizationKind", "personalizationSchema", "deleted", "category",
  ]) {
    if (!same(p[f], q[f])) {
      say(`producto ${p.slug}.${f}: ${a}=${JSON.stringify(p[f] ?? null)} ≠ ${b}=${JSON.stringify(q[f] ?? null)}`);
    }
  }
  compare(
    `variante ${p.slug}›`,
    "sku",
    p.variants,
    q.variants,
    ["name", "price", "compareAtPrice", "stock", "isActive", "deleted", "attributes"],
  );
}
for (const q of B.products) {
  if (!A.products.find((x) => x.slug === q.slug)) {
    say(`producto ${q.slug}: FALTA en ${a} y existe en ${b}`, alive(q));
  }
}

compare("plantilla", "slug", A.templates, B.templates, [
  "name", "kind", "mode", "isActive", "deleted", "order", "previewUrl", "product", "stage", "layers",
]);

compare("cms", "key", A.cmsFields, B.cmsFields, ["body", "isPublished", "deleted"]);

console.log(
  diffs === 0
    ? `\n✓ HOMOLOGADOS en lo VIVO: 0 divergencias entre ${a} y ${b}` +
        (archivedDiffs > 0 ? ` (${archivedDiffs} drift(s) en filas archivadas — ruido histórico, sin impacto).` : ".")
    : `\n✗ ${diffs} divergencia(s) VIVA(S) entre ${a} y ${b} (+${archivedDiffs} drift(s) archivados).`,
);
process.exitCode = diffs === 0 ? 0 : 1;
