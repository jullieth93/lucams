/*
 * identity-dry-run.mjs — Perfilador READ ONLY de colisiones e identidad canónica
 * (Fase 5 · ADR-193).
 *
 * Garantías:
 *   1. Ejecuta el 100 % de las lecturas dentro de una transacción PostgreSQL con
 *      `transaction_read_only = on` verificado en runtime (cualquier escritura
 *      aborta con SQLSTATE 25006).
 *   2. Cero PII en stdout / JSON: solo emite conteos agregados para calibrar
 *      índices, lotes y revisión humana previa a Fase 6 (DDL).
 *   3. Cero archivos escritos en disco.
 *
 * Uso:
 *   cd packages/db && npx dotenv -e ../../.env.local -- node scripts/identity-dry-run.mjs
 *   cd packages/db && npx dotenv -e ../../.env.local -- node scripts/identity-dry-run.mjs --json
 */

import { PrismaClient } from "@prisma/client";
import {
  formatIdentityDryRunReport,
  runIdentityDryRun,
} from "./lib/identity-dry-run.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const asJson = process.argv.includes("--json");
const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);

try {
  const report = await runIdentityDryRun(prisma);
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n${formatIdentityDryRunReport(report)}\n`);
  }
} finally {
  await prisma.$disconnect();
}

