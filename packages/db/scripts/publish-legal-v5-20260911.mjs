#!/usr/bin/env node
/*
 * publish-legal-v5-20260911.mjs — publica en DB el paquete legal v5 (2026-09-04)
 * y sube PRIVACY_POLICY_VERSION a «v5 · 2026-09-04» (re-consent deliberado).
 *
 * Decisión de Lucy, 2026-09-11: "Sí, lanzar textos legales".
 *
 * Premisa de veracidad verificada antes de publicar (Ley 1480 arts. 23/29 —
 * los textos v5 describen la tienda en línea YA activa):
 *   - PRD opera en modo FULL desde 2026-09-03 (/checkout/pago → 307 /carrito,
 *     checkout con "Pago seguro Wompi" — RUNBOOK_GO_LIVE FASE 11.c).
 *   - Wompi producción: llaves reales en Vercel Production (2026-08-02).
 *   - Aveonline producción: cuenta real + facturación armada (2026-08-04).
 *   - Asistente IA del Estudio: visible y funcional en modo full (gate solo
 *     por isCatalogMode en studio-editor.tsx y en la server action).
 *
 * Campos que publica (cuerpo = fuente canónica packages/db/legal-content/*.md):
 *   legal.terminos · legal.privacidad · legal.devoluciones · legal.garantias
 *   legal.habeas-data · legal.subprocesadores
 * Setting que actualiza:
 *   PRIVACY_POLICY_VERSION → "v5 · 2026-09-04" — INVALIDA los consentimientos
 *   previos (re-banner para visitantes recurrentes). Decisión deliberada
 *   registrada en STATE.md 2026-09-05: el aviso cambió de fondo.
 *
 * OJO: cookies (v4 · 2026-09-11) y security (v2 · 2026-07-25) NO hacen parte
 * del paquete v5 — quedaron publicadas por update-public-content-20260911.mjs.
 * Los textos conservan la coletilla "en revisión por asesoría legal": retirarla
 * cuando el abogado opine (republicar los 6 cuerpos desde /admin/contenido).
 *
 * Mecánica CMS v2: crea una NUEVA CmsFieldVersion publicada y apunta el campo
 * a ella (el historial queda — revertible desde /admin/contenido).
 *
 * Uso:
 *   node scripts/publish-legal-v5-20260911.mjs           # dry-run (default)
 *   node scripts/publish-legal-v5-20260911.mjs --apply   # aplica
 * Con dotenv según ambiente (desde packages/db):
 *   npx dotenv -e ../../.env.local -- node scripts/publish-legal-v5-20260911.mjs --apply
 *   npx dotenv -e ../../.env.stg   -- node scripts/publish-legal-v5-20260911.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/publish-legal-v5-20260911.mjs --apply
 *
 * Tras aplicar: invalidar el caché CMS desde /admin/contenido (o esperar 1 h).
 *
 * N-06 (2026-09-12): EXENCIÓN deliberada del env-guard. Su caso de uso ES la
 * publicación legal en PRD (decisión de Lucy 2026-09-11; el re-consent que
 * invalida consentimientos previos es irreversible en la práctica), así que
 * bloquearlo lo volvería inútil; protege con dry-run por defecto + `--apply`
 * explícito. Está allowlistado en lib/check-script-guards.mjs como
 * PRD-deliberado.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const HERE = dirname(fileURLToPath(import.meta.url));

const legalBody = (name) =>
  readFileSync(join(HERE, "..", "legal-content", `legal.${name}.md`), "utf-8").trim();

const NEW_BODIES = {
  "legal.terminos": legalBody("terminos"),
  "legal.privacidad": legalBody("privacidad"),
  "legal.devoluciones": legalBody("devoluciones"),
  "legal.garantias": legalBody("garantias"),
  "legal.habeas-data": legalBody("habeas-data"),
  "legal.subprocesadores": legalBody("subprocesadores"),
  // Re-consent deliberado: cambiar este valor invalida los consents previos.
  PRIVACY_POLICY_VERSION: "v5 · 2026-09-04",
};

const prisma = new PrismaClient();

function targetRef() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  if (/127\.0\.0\.1|localhost/.test(url)) return "LOCAL (127.0.0.1)";
  const m = url.match(/db\.([a-z0-9]+)\.supabase\.co|postgres\.([a-z0-9]+)@/);
  return m ? `Supabase ref ${m[1] ?? m[2]}` : "host desconocido";
}

console.log(`=== publish-legal-v5-20260911 — ${APPLY ? "APLICANDO" : "DRY-RUN"} ===`);
console.log(`Destino: ${targetRef()}\n`);

let updated = 0;
let skipped = 0;

for (const [key, newBody] of Object.entries(NEW_BODIES)) {
  const field = await prisma.cmsField.findUnique({
    where: { key },
    include: { publishedVersion: true },
  });
  if (!field || field.deletedAt) {
    console.log(`- ${key}: NO EXISTE en esta DB — skip (lo cubre el fallback del código)`);
    skipped++;
    continue;
  }
  const current = field.publishedVersion?.body ?? "";
  if (current === newBody) {
    console.log(`= ${key}: ya tiene el texto v5 — skip`);
    skipped++;
    continue;
  }
  console.log(`→ ${key}:`);
  console.log(`    ANTES: ${current.slice(0, 100)}…`);
  console.log(`    DESPUÉS: ${newBody.slice(0, 100)}…`);
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
        body: newBody,
        metadata: field.publishedVersion?.metadata ?? {},
        publishedAt: new Date(),
        createdBy: "script:publish-legal-v5-20260911",
      },
    });
    await prisma.cmsField.update({
      where: { id: field.id },
      data: { body: newBody, publishedVersionId: version.id, isPublished: true },
    });
    console.log(`    ✓ publicada como versión ${version.version}`);
  }
  updated++;
}

console.log(`\nResumen: ${updated} por publicar${APPLY ? " (aplicados)" : ""}, ${skipped} skip.`);
if (!APPLY && updated > 0) console.log("Re-corre con --apply para aplicar.");
if (APPLY && updated > 0)
  console.log("Recuerda invalidar el caché CMS desde /admin/contenido (o espera 1 h).");

await prisma.$disconnect();
