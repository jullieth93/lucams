/*
 * Purga de CUPONES DE TEST (N-05, 2026-09-12) — para el saneamiento LOCAL →
 * STG → PRD posterior a la auditoría 360° (los 42 cupones fixture verificados
 * con 0 pedidos y 0 usos en los 3 ambientes).
 *
 * Alcance (quirúrgico): SOLO cupones cuyo `code` matchea la señal objetiva de
 * suite (lib/test-coupon-signal.mjs — regex documentado ahí):
 *   ^(?:CAT[0-9]{13,}-|SAGA[0-9]{13,}-|ord[0-9]{13,}-)   (i)
 * Cualquier código sin esa señal queda EXPLÍCITAMENTE fuera (LUCAMS_10,
 * LUC*** y campañas reales nunca se tocan — se deciden aparte).
 *
 * Guardarraíles:
 *   - DRY-RUN por defecto; `--apply` ejecuta. Env-guard fail-closed.
 *   - REFERENCIAS: si algún cupón seleccionado tiene ≥1 pedido (Order.couponId)
 *     o ≥1 CouponUsage, el script ABORTA sin tocar nada (la auditoría verificó
 *     0/0; si cambió, hay que re-triar).
 *   - BACKUP: en --apply vuelca las filas completas a
 *     tmp/backups/coupons-<env>-<ts>.json ANTES de borrar.
 *   - Transacción única (all-or-nothing), conteos antes/después.
 *
 * Corrección de drift (CF-05): tras borrar, verifica que ningún cupón
 * sobreviviente tenga `usedCount` distinto de sus usos REALES (filas de
 * CouponUsage — una por pedido que lo aplicó). Los corrige en --apply y los
 * reporta siempre (el drift nace de purgas viejas que no lo decrementaban).
 *
 * Uso:
 *   node scripts/purge-test-coupons.mjs            # DRY-RUN: lista + conteos
 *   node scripts/purge-test-coupons.mjs --apply    # ejecuta (backup + transacción)
 *   node scripts/purge-test-coupons.mjs --apply --skip-referenced
 *     # idem pero CONSERVA los cupones de test que tengan pedidos/usos (opt-in;
 *     # sin el flag la guarda aborta all-or-nothing si alguno tiene referencias)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed, classifyUrl } from "./lib/env-guard.mjs";
import { isTestCouponCode } from "./lib/test-coupon-signal.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: purga de cupones — bloquea PRD/remotos no STG (PRD solo
// con el bypass deliberado documentado en lib/env-guard.mjs).
assertDestructiveAllowed("purge-test-coupons.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
// Opt-in explícito para ambientes donde un cupón de test SÍ tiene referencias
// legítimas (p.ej. el pedido smoke documentado LCM-2026-0002 en STG): con este
// flag los referenciados se CONSERVAN (reportados) en vez de abortar la corrida.
// Por defecto la guarda sigue siendo all-or-nothing (aborta).
const SKIP_REFERENCED = process.argv.includes("--skip-referenced");
const HERE = dirname(fileURLToPath(import.meta.url));
// tmp/ del repo (gitignored) — packages/db/scripts → raíz.
const BACKUP_DIR = join(HERE, "..", "..", "..", "tmp", "backups");

async function main() {
  console.log(`=== purge-test-coupons (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  const allCoupons = await prisma.coupon.findMany({
    orderBy: { code: "asc" },
  });
  let targets = allCoupons.filter((c) => isTestCouponCode(c.code));
  console.log(`Cupones totales: ${allCoupons.length} · con señal de test: ${targets.length}`);
  console.log(
    `Excluidos (sin señal — NUNCA se tocan): ${allCoupons.length - targets.length}` +
      (allCoupons.length - targets.length > 0
        ? ` [${allCoupons
            .filter((c) => !isTestCouponCode(c.code))
            .map((c) => c.code)
            .join(", ")}]`
        : ""),
  );

  if (targets.length === 0) {
    console.log("\nNada que purgar (idempotente ✓).");
  } else {
    // Guardarrail de referencias: 0 pedidos Y 0 usos por cupón, si no ABORTA.
    const refs = [];
    for (const c of targets) {
      const orders = await prisma.order.count({ where: { couponId: c.id } });
      const usages = await prisma.couponUsage.count({ where: { couponId: c.id } });
      refs.push({ c, orders, usages });
    }
    const withRefs = refs.filter((r) => r.orders > 0 || r.usages > 0);
    console.log("\nCupones en alcance:");
    for (const { c, orders, usages } of refs) {
      console.log(
        `  ⊘ ${c.code} (type=${c.type}, usos=${c.usedCount}, pedidos=${orders}, couponUsages=${usages}${c.deletedAt ? ", ya archivado" : ""})`,
      );
    }
    if (withRefs.length > 0 && !SKIP_REFERENCED) {
      console.error(
        `\n✗ ABORTO: ${withRefs.length} cupón(es) de test tienen pedidos o usos — fuera del alcance verificado (N-05 exige 0/0):`,
      );
      for (const r of withRefs)
        console.error(`  ${r.c.code} · pedidos=${r.orders} · usos=${r.usages}`);
      console.error(
        `  Si la referencia es legítima y documentada, re-corre con --skip-referenced.`,
      );
      process.exit(1);
    }
    if (withRefs.length > 0 && SKIP_REFERENCED) {
      // Referenciados fuera del alcance del borrado (regla: jamás borrar un cupón
      // con pedidos o usos, aunque tenga señal de test).
      const keep = new Set(withRefs.map((r) => r.c.id));
      console.warn(
        `\n⚠ --skip-referenced: se CONSERVAN ${withRefs.length} cupón(es) con referencias:`,
      );
      for (const r of withRefs)
        console.warn(`  ${r.c.code} · pedidos=${r.orders} · usos=${r.usages}`);
      targets = targets.filter((c) => !keep.has(c.id));
    }

    if (APPLY && targets.length > 0) {
      // Backup ANTES de borrar (filas completas, rollback manual).
      mkdirSync(BACKUP_DIR, { recursive: true });
      const envLabel = classifyUrl(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
      const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
      const backupFile = join(BACKUP_DIR, `coupons-${envLabel}-${ts}.json`);
      writeFileSync(backupFile, JSON.stringify(targets, null, 2));
      console.log(`\nBackup: ${backupFile} (${targets.length} filas)`);
    }
  }

  if (APPLY) {
    // Transacción ÚNICA: borrado de los cupones de test + corrección del drift
    // usedCount de los sobrevivientes (all-or-nothing). Con 0 targets el
    // deleteMany es no-op y solo corre la corrección de drift.
    const before = await prisma.coupon.count();
    const result = await prisma.$transaction(async (tx) => {
      // CouponUsage cae por Cascade y Order.couponId es SetNull (ambos 0 por
      // el guardarrail) — deleteMany directo del cupón.
      const deleted = await tx.coupon.deleteMany({
        where: { id: { in: targets.map((t) => t.id) } },
      });
      const survivors = await tx.coupon.findMany({
        select: { id: true, code: true, usedCount: true },
      });
      const drifted = [];
      for (const c of survivors) {
        const real = await tx.couponUsage.count({ where: { couponId: c.id } });
        if (c.usedCount !== real) {
          await tx.coupon.update({ where: { id: c.id }, data: { usedCount: real } });
          drifted.push({ ...c, real });
        }
      }
      return { deleted: deleted.count, drifted };
    });
    const after = await prisma.coupon.count();
    console.log(
      `\n✓ Borrados ${result.deleted} cupones de test (Coupon ${before} → ${after}, transacción única).`,
    );
    if (result.drifted.length === 0) {
      console.log("Drift usedCount: 0 cupones (consistente ✓).");
    } else {
      for (const d of result.drifted) {
        console.log(
          `  ~ drift corregido ${d.code}: usedCount=${d.usedCount} → usos reales=${d.real}`,
        );
      }
    }
  } else {
    // ── Drift usedCount vs usos reales (CF-05) — reporte dry-run ──
    const survivors = await prisma.coupon.findMany({
      select: { id: true, code: true, usedCount: true },
    });
    const drifted = [];
    for (const c of survivors) {
      const real = await prisma.couponUsage.count({ where: { couponId: c.id } });
      if (c.usedCount !== real) drifted.push({ ...c, real });
    }
    if (drifted.length === 0) {
      console.log("\nDrift usedCount: 0 cupones (todo consistente ✓).");
    } else {
      console.log(`\nDrift usedCount vs usos reales: ${drifted.length} cupón(es) a corregir:`);
      for (const d of drifted) {
        console.log(`  ~ ${d.code}: usedCount=${d.usedCount} → usos reales=${d.real}`);
      }
      console.log("(dry-run: sin corregir)");
    }
    console.log(
      "\nDRY-RUN (sin cambios). Para ejecutar: node scripts/purge-test-coupons.mjs --apply",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
