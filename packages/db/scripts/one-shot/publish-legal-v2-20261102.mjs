#!/usr/bin/env node
/*
 * publish-legal-v2-20261102.mjs — publica la garantía modular por producto.
 *
 * Decisión de la owner (2026-11-02): el catálogo parte de 1 mes de garantía y
 * el Admin puede configurar un término mayor (1..120) por producto. El plazo
 * se informa en la ficha y se sella en OrderItem al comprar; la migración
 * Prisma 20261102100000_warranty_snapshot debe estar aplicada ANTES de este
 * script para proteger los pedidos que ya tenían 3 meses ofrecidos.
 *
 * Publica los ocho documentos legales canónicos como paquete v2, el header
 * común, la FAQ y el aviso legal del checkout. Además ajusta todos los
 * Product.warrantyMonths existentes a 1, sin tocar OrderItem ni WarrantyClaim.
 * Las versiones CMS conservan el historial y el script es idempotente.
 *
 * Es una operación deliberada de STG/PRD. Por eso está allowlistada en
 * lib/check-script-guards.mjs: dry-run por defecto y --apply explícito.
 *
 * Uso desde packages/db:
 *   npx dotenv -e ../../.env.local -- node scripts/one-shot/publish-legal-v2-20261102.mjs
 *   npx dotenv -e ../../.env.stg -- node scripts/one-shot/publish-legal-v2-20261102.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/publish-legal-v2-20261102.mjs --apply
 *
 * Tras aplicar, invalidar el caché CMS desde /admin/contenido (o esperar 1 h).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = "Versión 2";
const ACTOR = "script:publish-legal-v2-20261102";
const prisma = new PrismaClient();

const legalBody = (name) =>
  readFileSync(join(HERE, "..", "..", "legal-content", `legal.${name}.md`), "utf-8").trim();

const BODIES = Object.fromEntries(
  [
    "terminos",
    "privacidad",
    "devoluciones",
    "garantias",
    "habeas-data",
    "subprocesadores",
    "cookies",
    "security",
  ].map((name) => [`legal.${name}`, legalBody(name)]),
);

Object.assign(BODIES, {
  "legal.last-updated": "Última actualización: 2026-11-02 · Versión 2",
  "faq.05-cambios-devoluciones":
    "Tienes **5 días hábiles** desde la entrega para retractarte (Ley 1480 art. 47), excepto en productos personalizados. Para garantía: aplica el plazo que ves en la ficha del producto y que confirmamos en tu pedido (el catálogo inicia con **1 mes**); el plazo **se suspende** mientras tu producto esté en reparación. [Más detalles](/legal/devoluciones) y [Garantías](/legal/garantias).",
  "checkout.pay.legal-warranty-body":
    "cada producto tiene garantía legal durante el plazo que se informa en su ficha y se confirma en tu pedido, contado desde la entrega; puedes pedir reparación, cambio o devolución del dinero por defectos de fabricación o impresión.",
});

function targetRef() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  if (/127\.0\.0\.1|localhost/.test(url)) return "LOCAL (127.0.0.1)";
  const match = url.match(/db\.([a-z0-9]+)\.supabase\.co|postgres\.([a-z0-9]+)@/);
  return match ? `Supabase ref ${match[1] ?? match[2]}` : "host desconocido";
}

/** Publica una nueva versión de un campo de contenido si su cuerpo cambió. */
async function publishBody(key, body) {
  const field = await prisma.cmsField.findUnique({
    where: { key },
    include: { publishedVersion: true },
  });
  if (!field || field.deletedAt) {
    console.log(`- ${key}: no existe — lo cubre el fallback en código`);
    return "skipped";
  }
  if (field.publishedVersion?.body === body) {
    console.log(`= ${key}: ya está en ${VERSION}`);
    return "skipped";
  }
  console.log(`→ ${key}: ${field.publishedVersion?.body.slice(0, 72) ?? "(sin publicar)"}…`);
  if (APPLY) {
    const last = await prisma.cmsFieldVersion.findFirst({
      where: { fieldId: field.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = await prisma.cmsFieldVersion.create({
      data: {
        fieldId: field.id,
        version: (last?.version ?? 0) + 1,
        title: field.publishedVersion?.title ?? null,
        body,
        metadata: field.publishedVersion?.metadata ?? {},
        publishedAt: new Date(),
        createdBy: ACTOR,
      },
    });
    await prisma.cmsField.update({
      where: { id: field.id },
      data: { body, publishedVersionId: version.id, isPublished: true },
    });
    console.log(`    ✓ publicada como versión ${version.version}`);
  }
  return "updated";
}

console.log(`=== publish-legal-v2-20261102 — ${APPLY ? "APLICANDO" : "DRY-RUN"} ===`);
console.log(`Destino: ${targetRef()}\n`);

let updated = 0;
let skipped = 0;
for (const [key, body] of Object.entries(BODIES)) {
  if ((await publishBody(key, body)) === "updated") updated++;
  else skipped++;
}

const productsToChange = await prisma.product.count({ where: { warrantyMonths: { not: 1 } } });
if (productsToChange === 0) {
  console.log("= Product.warrantyMonths: todos están en 1 mes");
  skipped++;
} else {
  console.log(`→ Product.warrantyMonths: ${productsToChange} producto(s) pasarán a 1 mes`);
  if (APPLY) {
    const result = await prisma.product.updateMany({
      where: { warrantyMonths: { not: 1 } },
      data: { warrantyMonths: 1 },
    });
    console.log(`    ✓ ${result.count} producto(s) actualizados`);
  }
  updated++;
}

console.log(`\nResumen: ${updated} cambio(s), ${skipped} sin cambio.`);
if (!APPLY && updated > 0) console.log("Repite con --apply para aplicar los cambios.");
if (APPLY && updated > 0)
  console.log("Recuerda invalidar el caché CMS desde /admin/contenido (o espera 1 h).");

await prisma.$disconnect();
