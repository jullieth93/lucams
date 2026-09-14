/*
 * ONE-SHOT (5.1, 2026-09-13) — Archiva el cupón `LUCAMS_10`.
 *
 * Contexto: la auditoría 360° marcó `LUCAMS_10` como cupón sin uso y sin
 * campaña asociada. El usuario confirmó (2026-09-13) que TODO cupón existente
 * es de pruebas — no hubo lanzamiento — así que se archiva (soft-delete), no
 * se borra: el historial queda para auditoría y el archivado es reversible
 * desde /admin/cupones si alguna vez se reactiva la campaña.
 *
 * Alcance (quirúrgico): el cupón con code EXACTO 'LUCAMS_10' y nada más.
 *
 * Guardarraíles (patrón purge-test-coupons.mjs):
 *   - DRY-RUN por defecto; `--apply` ejecuta.
 *   - env-guard fail-closed (../lib/env-guard.mjs — OJO: ruta relativa desde
 *     one-shot/, un nivel más abajo que el resto de scripts).
 *   - REFERENCIAS: si el cupón tiene ≥1 pedido (Order.couponId) o ≥1
 *     CouponUsage, el script ABORTA sin tocar nada (la auditoría verificó 0/0;
 *     si cambió, hay que re-triar — un cupón con historial NO se archiva así).
 *   - Idempotente: si ya está archivado (deletedAt sellado), lo dice y sale 0.
 *   - Imprime el estado ANTES y DESPUÉS del archivado.
 *
 * Uso:
 *   node scripts/one-shot/archive-lucams10-20260913.mjs           # DRY-RUN
 *   node scripts/one-shot/archive-lucams10-20260913.mjs --apply   # ejecuta
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: archivado de un cupón — bloquea PRD/remotos no STG (PRD
// solo con el bypass deliberado documentado en lib/env-guard.mjs).
assertDestructiveAllowed("archive-lucams10-20260913.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const COUPON_CODE = "LUCAMS_10";
const ARCHIVE_ACTOR = "system:archive-lucams10-20260913";

function printState(label, coupon, orders, usages) {
  console.log(
    `${label}: code=${coupon.code} · type=${coupon.type} · value=${coupon.value} · ` +
      `isActive=${coupon.isActive} · usedCount=${coupon.usedCount} · ` +
      `deletedAt=${coupon.deletedAt ? coupon.deletedAt.toISOString() : "null"} · ` +
      `deletedBy=${coupon.deletedBy ?? "null"} · pedidos=${orders} · couponUsages=${usages}`,
  );
}

async function main() {
  console.log(`=== archive-lucams10-20260913 (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  // Selección EXACTA por code (único en el schema) — nada de señales/regex.
  const coupon = await prisma.coupon.findUnique({ where: { code: COUPON_CODE } });
  if (!coupon) {
    console.log(`No existe ningún cupón con code='${COUPON_CODE}' — nada que archivar.`);
    return;
  }

  // Guardarrail de referencias: 0 pedidos Y 0 usos, si no ABORTA.
  const orders = await prisma.order.count({ where: { couponId: coupon.id } });
  const usages = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
  printState("ANTES ", coupon, orders, usages);

  if (orders > 0 || usages > 0) {
    console.error(
      `\n✗ ABORTO: '${COUPON_CODE}' tiene ${orders} pedido(s) y ${usages} uso(s) — ` +
        `fuera del alcance verificado (5.1 exige 0/0). Re-triar antes de archivar.`,
    );
    process.exit(1);
  }

  // Idempotencia: ya archivado → se reporta y se sale 0 (seguro re-correr).
  if (coupon.deletedAt) {
    console.log(`\nYa está archivado (deletedAt sellado el ${coupon.deletedAt.toISOString()}).`);
    console.log("Nada que hacer (idempotente ✓).");
    return;
  }

  if (!APPLY) {
    console.log(
      `\nDRY-RUN (sin cambios). Para ejecutar: node scripts/one-shot/archive-lucams10-20260913.mjs --apply`,
    );
    return;
  }

  // Soft-delete (archivado): deletedAt sellado + isActive=false + marca del actor.
  const updated = await prisma.coupon.update({
    where: { id: coupon.id },
    data: { deletedAt: new Date(), isActive: false, deletedBy: ARCHIVE_ACTOR },
  });
  printState("DESPUÉS", updated, orders, usages);
  console.log(
    `\n✓ Cupón '${COUPON_CODE}' archivado (soft-delete, reversible desde /admin/cupones).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
