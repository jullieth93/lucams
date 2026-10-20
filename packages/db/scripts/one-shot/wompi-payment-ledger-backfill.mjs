#!/usr/bin/env node
/*
 * Backfill expand del ledger Wompi. Solo copia la evidencia local actual; no
 * consulta Wompi ni infiere estados de transacciones. DRY-RUN por defecto.
 *
 *   pnpm exec dotenv -e ../../.env.stg -- node scripts/one-shot/wompi-payment-ledger-backfill.mjs
 *   pnpm exec dotenv -e ../../.env.stg -- node scripts/one-shot/wompi-payment-ledger-backfill.mjs --apply
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
for (const arg of process.argv.slice(2)) {
  if (arg !== "--apply") {
    console.error(`✗ argumento no reconocido: ${arg} (válidos: --apply)`);
    process.exit(1);
  }
}
if (APPLY) assertDestructiveAllowed("wompi-payment-ledger-backfill.mjs");

const prisma = new PrismaClient();
const orders = await prisma.order.findMany({
  where: {
    paymentMethod: "WOMPI",
    OR: [
      { wompiReference: { not: null } },
      { paymentAttempt: { gt: 0 } },
      { wompiTransactionId: { not: null } },
    ],
  },
  select: {
    id: true,
    number: true,
    status: true,
    total: true,
    currency: true,
    paymentAttempt: true,
    wompiReference: true,
    wompiReferenceAt: true,
    wompiTransactionId: true,
    wompiAttempts: { select: { reference: true } },
  },
  orderBy: { createdAt: "asc" },
});

const conflicts = [];
const byReference = new Map();
const byExternalId = new Map();
for (const order of orders) {
  const reference = order.wompiReference ?? order.number;
  if (byReference.has(reference) && byReference.get(reference) !== order.id) {
    conflicts.push({ type: "duplicate-reference", reference, orders: [byReference.get(reference), order.id] });
  }
  byReference.set(reference, order.id);
  if (order.wompiTransactionId) {
    if (byExternalId.has(order.wompiTransactionId) && byExternalId.get(order.wompiTransactionId) !== order.id) {
      conflicts.push({
        type: "duplicate-transaction",
        externalId: order.wompiTransactionId,
        orders: [byExternalId.get(order.wompiTransactionId), order.id],
      });
    }
    byExternalId.set(order.wompiTransactionId, order.id);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: APPLY ? "apply" : "dry-run",
  candidates: orders.length,
  conflicts,
  processed: [],
};
const finish = async (code) => {
  mkdirSync("tmp/backups", { recursive: true });
  const path = `tmp/backups/wompi-payment-ledger-backfill-${report.generatedAt.replaceAll(":", "-")}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  console.log(JSON.stringify({ ...report, manifest: path }, null, 2));
  process.exit(code);
};

if (conflicts.length > 0) await finish(1);
let migrated = 0;
for (const order of orders) {
  const reference = order.wompiReference ?? order.number;
  const existing = await prisma.wompiPaymentAttempt.findUnique({
    where: { reference },
    select: { id: true, orderId: true, transactions: { select: { externalId: true } } },
  });
  if (existing && existing.orderId !== order.id) {
    conflicts.push({ type: "reference-belongs-to-other-order", reference, orderId: order.id });
    continue;
  }
  const record = { reference, orderId: order.id, attempt: "existing", transaction: "not-needed" };
  if (APPLY) {
    const attempt = existing ?? (await prisma.wompiPaymentAttempt.create({
      data: {
        orderId: order.id,
        sequence: Math.max(1, order.paymentAttempt),
        reference,
        amountInCents: order.total,
        currency: order.currency,
        status: "OPEN",
        backfilled: true,
        presentedAt: order.wompiReferenceAt,
      },
      select: { id: true, orderId: true, transactions: { select: { externalId: true } } },
    }));
    record.attempt = existing ? "existing" : "created";
    if (order.wompiTransactionId && !attempt.transactions.some((tx) => tx.externalId === order.wompiTransactionId)) {
      await prisma.wompiPaymentTransaction.create({
        data: {
          attemptId: attempt.id,
          externalId: order.wompiTransactionId,
          amountInCents: order.total,
          currency: order.currency,
          status: null,
        },
      });
      record.transaction = "created";
    }
    migrated += 1;
  }
  report.processed.push(record);
}
if (conflicts.length > 0) await finish(1);
console.log(`${APPLY ? "✓" : "DRY-RUN"} ${migrated} órdenes procesadas; ${conflicts.length} conflictos`);
await finish(0);
