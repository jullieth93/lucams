/*
 * audit-schema-drift.mjs — Drift check Prisma ↔ migraciones SQL de Supabase (A9-08,
 * remediación R3 2026-09-26).
 *
 * El schema vive en DOS fuentes: las migraciones Prisma (packages/db/prisma/migrations,
 * tablas/columnas del dominio) y las migraciones SQL de Supabase (supabase/migrations,
 * RLS/funciones/storage/pgcron… y HISTÓRICAMENTE también alguna tabla). Nada impedía
 * que divergieran en silencio. Este script es SOLO LECTURA y corre en CI (job
 * unit-tests de ci.yml) sobre el Postgres efímero donde ya se aplicaron ambas fuentes
 * en orden (prisma migrate deploy → supabase/migrations/*.sql).
 *
 * Modos:
 *   snapshot [--out FILE]   vuelca el schema public (tabla.columna) a JSON.
 *   check [--baseline FILE] compara la DB actual contra:
 *       1. schema.prisma (vía el DMMF del client generado — fuente Prisma);
 *       2. el baseline opcional (snapshot tomado tras `prisma migrate deploy`,
 *          ANTES de aplicar las SQL de Supabase) → aisla exactamente lo que las
 *          SQL de Supabase agregan o quitan.
 *
 * Falla (exit 1) si:
 *   - algo declarado en schema.prisma NO existe en la DB final (falta migración);
 *   - la DB final tiene tablas/columnas de public que Prisma no declara y no están
 *     allowlisteadas (SQL creando estructura nueva sin control);
 *   - con baseline: las SQL de Supabase QUITARON algo que Prisma creó, o AGREGARON
 *     una tabla/columna no allowlisteada.
 *
 * Tolerancias conocidas (allowlist, cada una con su historia — quitar la entrada
 * solo cuando se resuelva la doble fuente):
 *   - rate_limit_buckets: tabla SQL-only (supabase/migrations/00000000000003), el
 *     rate limiter la usa vía SQL crudo. Documentada como "drift tolerado" en los
 *     headers de varias migraciones Prisma (ej. 20260513_add_personalization).
 *   - AdminRecoveryCode: A5-01 RESUELTO (R6, 2026-09-27) — la migración Prisma
 *     20260926120000_admin_recovery_code la crea y la SQL 008 quedó idempotente;
 *     salió de la allowlist de dobles fuentes (hoy vacía).
 *   - _prisma_migrations: tabla interna del propio Prisma.
 *
 * Limitaciones declaradas: compara TABLAS y COLUMNAS del schema public. No compara
 * índices (varios trgm son SQL-only a propósito), constraints, RLS, funciones ni
 * datos — eso lo cubren rls-coverage/rls-matrix y las migraciones mismas.
 *
 * Uso local: pnpm --filter @lucams/db exec node scripts/audit-schema-drift.mjs check
 */

import { writeFileSync, readFileSync } from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Tablas SQL-only toleradas en `public` (con su razón). Cualquier OTRA tabla o
// columna que la DB tenga y Prisma no declare es drift y falla el check.
const KNOWN_SQL_ONLY_TABLES = new Map([
  [
    "rate_limit_buckets",
    "SQL-only (supabase/migrations/003); drift tolerado documentado en headers de migraciones Prisma",
  ],
  ["_prisma_migrations", "tabla interna de Prisma (historial de migraciones)"],
]);

// Tablas declaradas en schema.prisma cuyo CREATE TABLE vive SOLO en las SQL de
// Supabase (doble fuente conocida). Warning, no error.
// (Vacía desde R6 2026-09-27: A5-01 resuelto — la migración Prisma
//  20260926120000_admin_recovery_code ya crea AdminRecoveryCode y la SQL 008
//  quedó idempotente; no quedan dobles fuentes conocidas.)
const KNOWN_SQL_CREATED_PRISMA_TABLES = new Map([]);

const args = process.argv.slice(2);
const mode = args[0];
const optValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

if (mode !== "snapshot" && mode !== "check") {
  console.error("Uso: audit-schema-drift.mjs snapshot [--out FILE] | check [--baseline FILE]");
  process.exit(2);
}

const prisma = new PrismaClient();

/** Schema public de la DB: { "Tabla": Set<columna> }. */
async function readDbSchema() {
  const rows = await prisma.$queryRaw`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name
  `;
  const tables = new Map();
  for (const r of rows) {
    if (!tables.has(r.table_name)) tables.set(r.table_name, new Set());
    tables.get(r.table_name).add(r.column_name);
  }
  return tables;
}

/** Schema declarado por Prisma (DMMF del client generado), mismo shape. */
function readPrismaSchema() {
  const tables = new Map();
  for (const m of Prisma.dmmf.datamodel.models) {
    const table = m.dbName ?? m.name;
    const cols = new Set(
      m.fields.filter((f) => f.kind !== "object").map((f) => f.dbName ?? f.name),
    );
    tables.set(table, cols);
  }
  return tables;
}

const serialize = (tables) =>
  JSON.stringify(
    Object.fromEntries([...tables.entries()].sort().map(([t, cols]) => [t, [...cols].sort()])),
    null,
    2,
  );

if (mode === "snapshot") {
  const tables = await readDbSchema();
  const json = serialize(tables);
  const out = optValue("--out");
  if (out) {
    writeFileSync(out, json);
    console.log(`snapshot: ${tables.size} tablas de public → ${out}`);
  } else {
    console.log(json);
  }
  await prisma.$disconnect();
  process.exit(0);
}

// ─── check ────────────────────────────────────────────────────────────────────

const current = await readDbSchema();
const declared = readPrismaSchema();
const baselinePath = optValue("--baseline");
const baseline = baselinePath
  ? new Map(
      Object.entries(JSON.parse(readFileSync(baselinePath, "utf-8"))).map(([t, cols]) => [
        t,
        new Set(cols),
      ]),
    )
  : null;

const errors = [];
const warnings = [];

const flat = (tables, fn) => {
  for (const [t, cols] of tables) for (const c of cols) fn(t, c);
};

// 1. Prisma declara → la DB final DEBE tenerlo (tabla y cada columna).
for (const [t, cols] of declared) {
  const actual = current.get(t);
  if (!actual) {
    errors.push(`tabla "${t}" declarada en schema.prisma pero AUSENTE en la DB final`);
    continue;
  }
  for (const c of cols) {
    if (!actual.has(c)) errors.push(`columna "${t}"."${c}" declarada en Prisma, ausente en la DB`);
  }
}

// 2. La DB final no debe tener nada en public fuera de Prisma + allowlist.
for (const [t, cols] of current) {
  const decl = declared.get(t);
  if (!decl) {
    if (KNOWN_SQL_ONLY_TABLES.has(t)) {
      warnings.push(`tabla SQL-only conocida: "${t}" (${KNOWN_SQL_ONLY_TABLES.get(t)})`);
    } else {
      errors.push(
        `tabla "${t}" existe en public pero NO la declara Prisma ni está allowlisteada — ` +
          `si es SQL-only deliberada, documentarla en KNOWN_SQL_ONLY_TABLES de este script`,
      );
    }
    continue;
  }
  for (const c of cols) {
    if (!decl.has(c)) {
      errors.push(
        `columna "${t}"."${c}" existe en la DB pero no en schema.prisma (¿ALTER TABLE en SQL?)`,
      );
    }
  }
}

// 3. Con baseline (post-Prisma): aislar qué tocaron las SQL de Supabase.
if (baseline) {
  // 3a. Quitado: algo que Prisma creó y las SQL eliminaron → siempre error.
  flat(baseline, (t, c) => {
    const actual = current.get(t);
    if (!actual) {
      errors.push(`las SQL de Supabase ELIMINARON la tabla "${t}" creada por Prisma`);
    } else if (!actual.has(c)) {
      errors.push(`las SQL de Supabase ELIMINARON la columna "${t}"."${c}" creada por Prisma`);
    }
  });
  // 3b. Agregado por las SQL: tabla nueva → allowlist; columna nueva en tabla
  //     existente → error salvo allowlist explícita (hoy ninguna).
  for (const [t, cols] of current) {
    const base = baseline.get(t);
    if (!base) {
      if (KNOWN_SQL_ONLY_TABLES.has(t)) {
        warnings.push(`las SQL crean la tabla conocida "${t}" (${KNOWN_SQL_ONLY_TABLES.get(t)})`);
      } else if (KNOWN_SQL_CREATED_PRISMA_TABLES.has(t)) {
        warnings.push(
          `las SQL crean "${t}", tabla declarada en Prisma sin migración propia (${KNOWN_SQL_CREATED_PRISMA_TABLES.get(t)})`,
        );
      } else if (!declared.has(t)) {
        errors.push(
          `las SQL de Supabase crean la tabla "${t}" no declarada en Prisma ni allowlisteada`,
        );
      } else {
        errors.push(
          `las SQL de Supabase crean la tabla "${t}" que schema.prisma declara — ` +
            `doble fuente de verdad nueva (como A5-01). Si es deliberada, allowlistearla en ` +
            `KNOWN_SQL_CREATED_PRISMA_TABLES con su justificación`,
        );
      }
      continue;
    }
    for (const c of cols) {
      if (!base.has(c)) {
        errors.push(
          `las SQL de Supabase AGREGAN la columna "${t}"."${c}" sobre una tabla de Prisma — ` +
            `la columna debe nacer de una migración Prisma (o allowlistearse con justificación)`,
        );
      }
    }
  }
}

console.log("──────────────────────────────────────────────────────────────");
console.log(` Drift check Prisma ↔ Supabase (schema public)`);
console.log(`   Tablas en DB: ${current.size} · declaradas en Prisma: ${declared.size}`);
if (baseline) console.log(`   Baseline post-Prisma: ${baseline.size} tablas (${baselinePath})`);
console.log("──────────────────────────────────────────────────────────────");
for (const w of warnings) console.warn(`  ⚠ ${w}`);
for (const e of errors) console.error(`  ✗ ${e}`);

await prisma.$disconnect();

if (errors.length > 0) {
  console.error(
    `\nDRIFT DETECTADO: ${errors.length} problema(s). Ver docs/TESTING.md § drift check.`,
  );
  process.exit(1);
}
console.log(`\nOK: sin drift inesperado (${warnings.length} tolerancia(s) conocida(s)).`);
