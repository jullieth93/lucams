/*
 * backfill-contacts.mjs — Backfill progresivo e idempotente hacia `Contact`
 * (S16 · Fase 7 · ADR-193).
 *
 * Garantías:
 *   1. Sin `--apply` ejecuta en modo `--dry-run` dentro de una transacción PostgreSQL
 *      con `transaction_read_only = on` verificado en runtime (cero escrituras).
 *   2. Con `--apply` exige `assertDestructiveAllowed` (`env-guard.mjs`) y procesa
 *      las 8 entidades por cursor (`id > cursor`, `batchSize = 200` por defecto),
 *      evitando locks largos sobre checkout en vivo.
 *   3. Cero PII en stdout / JSON: solo emite conteos agregados y reconciliación final.
 *
 * Uso:
 *   cd packages/db && npx dotenv -e ../../.env.local -- node scripts/backfill-contacts.mjs
 *   cd packages/db && npx dotenv -e ../../.env.local -- node scripts/backfill-contacts.mjs --apply
 *   cd packages/db && npx dotenv -e ../../.env.local -- node scripts/backfill-contacts.mjs --apply --batch-size=200 --json
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";
import {
  formatContactsBackfillReport,
  runContactsBackfill,
} from "./lib/backfill-contacts.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const apply = process.argv.includes("--apply");
const asJson = process.argv.includes("--json");

const batchArg = process.argv.find((a) => a.startsWith("--batch-size="));
const parsedBatchSize = batchArg ? Number.parseInt(batchArg.split("=")[1] ?? "200", 10) : 200;
const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 200;

if (apply) {
  assertDestructiveAllowed("backfill-contacts.mjs --apply");
}

const prisma = new PrismaClient();

try {
  const report = await runContactsBackfill(prisma, { apply, batchSize });
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n${formatContactsBackfillReport(report)}\n`);
  }
  if (apply && report.reconciliationAfter.unlinkedEligibleTotal > 0) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
