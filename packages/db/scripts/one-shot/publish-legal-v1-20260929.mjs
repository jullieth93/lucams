#!/usr/bin/env node
/*
 * publish-legal-v1-20260929.mjs — publica en DB el paquete legal v1
 * (vigente desde 2026-09-29) y sube PRIVACY_POLICY_VERSION a «v1 · 2026-09-29»
 * (re-consent deliberado).
 *
 * Por qué v1: el producto NUNCA ha sido público (lanzamiento próximo), así que
 * el versionado arranca de cero — los 8 documentos legales comparten ahora
 * «Versión 1 · vigente desde 2026-09-29» (antes: paquete v5 + cookies v4 +
 * security v2) y se RETIRA la coletilla «en revisión por asesoría legal»
 * (los textos ya fueron aprobados por el abogado). Decisión de Lucy 2026-09-29.
 *
 * Cambio de fondo incluido: GARANTÍA de 1 año → 3 MESES. Fundamento: Ley 1480
 * de 2011, art. 8 — a falta de disposición de la autoridad competente, el término
 * es el ANUNCIADO por el productor (si no se anuncia, un año); por la naturaleza
 * de los productos (papelería magnética personalizada, de alta manipulación) se
 * fijan 3 meses y se INFORMAN expresamente. Blindaje 2026-09-29 sobre el texto
 * oficial de la ley: el cuerpo de garantías cubre además la suspensión del plazo
 * durante la reparación y su reinicio tras reposición total (art. 9), la escalera
 * de remedios (art. 11), la responsabilidad solidaria y la carga de la prueba
 * (art. 10), las exoneraciones mapeadas a las causales (art. 16) y las
 * instrucciones de uso y conservación (art. 11.4, base de la exoneración 16.4)
 * (legal.garantias.md + legal.terminos.md + FAQs de ayuda). El piso de código
 * (Product.warrantyMonths) ya bajó a 3 en apps/web; este script homologa la
 * DATA existente: todos los productos con warrantyMonths ≠ 3 quedan en 3 (la
 * tienda nunca fue pública — nadie vio el valor anterior, no hay promesa previa
 * que honrar).
 *
 * Qué publica (cuerpo = fuente canónica packages/db/legal-content/*.md):
 *   legal.terminos · legal.privacidad · legal.devoluciones · legal.garantias
 *   legal.habeas-data · legal.subprocesadores · legal.cookies · legal.security
 * Settings/campos que actualiza:
 *   PRIVACY_POLICY_VERSION → "v1 · 2026-09-29" — INVALIDA los consentimientos
 *     previos (re-banner para visitantes recurrentes). Deliberado: el aviso
 *     cambió de versión (mismo mecanismo que v5, STATE.md 2026-09-05).
 *   legal.last-updated → "Última actualización: 2026-09-29 · Versión 1"
 *     (línea de header COMÚN de las 8 páginas /legal/*).
 * FAQs:
 *   faq.05-cambios-devoluciones → garantía 3 meses + suspensión del plazo en
 *     reparación (skip si la key no existe).
 *   faq.11-envio-mismo-dia → FAQ NUEVA (Envío Lucam's, Bogotá). Se crea si no
 *     existe clonando la sección de otra faq.* — OJO: la FAQ está GATEADA EN
 *     CÓDIGO (apps/web/app/ayuda/page.tsx) por la setting
 *     SAME_DAY_DELIVERY_ENABLED (fail-closed): publicarla es seguro, no se
 *     muestra hasta que la feature de envío mismo día se active. Este script
 *     NO crea esa setting — la activación es decisión operativa aparte.
 *   faq.12-cuidado-imanes → FAQ NUEVA (instrucciones de uso y conservación,
 *     art. 11.4 Ley 1480 — habilitan la exoneración del art. 16). Sin gate:
 *     es visible desde que se publica.
 * Data:
 *   Product.warrantyMonths → 3 en todos los productos (homologación con la
 *   política publicada).
 *
 * Mecánica CMS v2: crea una NUEVA CmsFieldVersion publicada y apunta el campo
 * a ella (el historial queda — revertible desde /admin/contenido).
 *
 * Uso:
 *   node scripts/one-shot/publish-legal-v1-20260929.mjs           # dry-run (default)
 *   node scripts/one-shot/publish-legal-v1-20260929.mjs --apply   # aplica
 * Con dotenv según ambiente (desde packages/db):
 *   npx dotenv -e ../../.env.local -- node scripts/one-shot/publish-legal-v1-20260929.mjs --apply
 *   npx dotenv -e ../../.env.stg   -- node scripts/one-shot/publish-legal-v1-20260929.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/one-shot/publish-legal-v1-20260929.mjs --apply
 *
 * Tras aplicar: invalidar el caché CMS desde /admin/contenido (o esperar 1 h).
 *
 * EXENCIÓN deliberada del env-guard (patrón N-06): su caso de uso ES la
 * publicación legal en STG/PRD como paso humano (el re-consent que invalida
 * consentimientos previos es irreversible en la práctica), así que bloquearlo
 * lo volvería inútil; protege con dry-run por defecto + `--apply` explícito.
 * Está allowlistado en lib/check-script-guards.mjs como PRD-deliberado.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const HERE = dirname(fileURLToPath(import.meta.url));

const legalBody = (name) =>
  readFileSync(join(HERE, "..", "..", "legal-content", `legal.${name}.md`), "utf-8").trim();

const NEW_BODIES = {
  "legal.terminos": legalBody("terminos"),
  "legal.privacidad": legalBody("privacidad"),
  "legal.devoluciones": legalBody("devoluciones"),
  "legal.garantias": legalBody("garantias"),
  "legal.habeas-data": legalBody("habeas-data"),
  "legal.subprocesadores": legalBody("subprocesadores"),
  "legal.cookies": legalBody("cookies"),
  "legal.security": legalBody("security"),
  // Re-consent deliberado: cambiar este valor invalida los consents previos.
  PRIVACY_POLICY_VERSION: "v1 · 2026-09-29",
  // Línea de header común de las 8 páginas legales.
  "legal.last-updated": "Última actualización: 2026-09-29 · Versión 1",
  // FAQ de garantía/devoluciones — 3 meses + suspensión del plazo en reparación
  // (misma redacción que el fallback de /ayuda).
  "faq.05-cambios-devoluciones":
    "Tienes **5 días hábiles** desde la entrega para retractarte (Ley 1480 art. 47), excepto en productos personalizados. Para garantía: **3 meses** desde la entrega, y el plazo **se suspende** mientras tu producto esté en reparación. [Más detalles](/legal/devoluciones) y [Garantías](/legal/garantias).",
};

// FAQs nuevas — se CREAN si no existen (misma redacción que el fallback de /ayuda).
const NEW_FAQS = [
  {
    key: "faq.11-envio-mismo-dia",
    title: "¿Tienen envío el mismo día en Bogotá?",
    body: "Sí: **Envío Lucam's**, nuestro servicio propio de entrega local. Está disponible en **localidades seleccionadas de Bogotá** y la entrega es **el mismo día del despacho**, con **tarifa fija** que ves antes de pagar. Si el producto está **listo (sin fabricación pendiente)** y tu pedido queda confirmado **antes de las 12:00 m.**, te llega **ese mismo día**; si hay que fabricarlo a mano, primero lo producimos y te llega el día que lo despachemos. Si la opción no aparece en tu checkout, tu localidad aún no está cubierta — siempre puedes elegir el envío por transportadora aliada.",
    helpText:
      "FAQ Envío Lucam's (mismo día, Bogotá). Gateada en código por la setting SAME_DAY_DELIVERY_ENABLED: no se muestra hasta activarla.",
    gated: true,
  },
  {
    key: "faq.12-cuidado-imanes",
    title: "¿Cómo cuido mis imanes?",
    body: "Para que duren: **nada de agua ni humedad**; lejos del **calor extremo y del sol prolongado**; límpialos con **paño suave y seco** (sin químicos ni abrasivos); úsalos sobre superficies limpias, lisas y ferromagnéticas; y **no los dobles** ni los golpees. Las piezas pequeñas, lejos de niños **menores de 3 años**. Estas son las instrucciones de uso y conservación que rigen la [garantía](/legal/garantias).",
    helpText:
      "FAQ de cuidado/conservación de imanes (instrucciones del art. 11.4 Ley 1480 — base de la exoneración del art. 16). Visible desde que se publica.",
    gated: false,
  },
];

const prisma = new PrismaClient();

function targetRef() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  if (/127\.0\.0\.1|localhost/.test(url)) return "LOCAL (127.0.0.1)";
  const m = url.match(/db\.([a-z0-9]+)\.supabase\.co|postgres\.([a-z0-9]+)@/);
  return m ? `Supabase ref ${m[1] ?? m[2]}` : "host desconocido";
}

/** Publica un cuerpo nuevo en un CmsField existente (nueva versión + apuntar). */
async function publishBody(key, newBody) {
  const field = await prisma.cmsField.findUnique({
    where: { key },
    include: { publishedVersion: true },
  });
  if (!field || field.deletedAt) {
    console.log(`- ${key}: NO EXISTE en esta DB — skip (lo cubre el fallback del código)`);
    return "skipped";
  }
  const current = field.publishedVersion?.body ?? "";
  if (current === newBody) {
    console.log(`= ${key}: ya tiene el texto v1 — skip`);
    return "skipped";
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
        createdBy: "script:publish-legal-v1-20260929",
      },
    });
    await prisma.cmsField.update({
      where: { id: field.id },
      data: { body: newBody, publishedVersionId: version.id, isPublished: true },
    });
    console.log(`    ✓ publicada como versión ${version.version}`);
  }
  return "updated";
}

/** Crea una FAQ nueva (si no existe) clonando la sección de otra faq.*. */
async function createFaq(faq) {
  const existing = await prisma.cmsField.findUnique({
    where: { key: faq.key },
    include: { publishedVersion: true },
  });
  if (existing && !existing.deletedAt) {
    // Ya existe: solo homologar el cuerpo si difiere.
    return publishBody(faq.key, faq.body);
  }
  const donor = await prisma.cmsField.findFirst({
    where: { key: { startsWith: "faq." }, kind: "BLOCK", category: "FAQ", deletedAt: null },
    orderBy: { key: "asc" },
  });
  if (!donor) {
    console.log(`- ${faq.key}: no hay ninguna faq.* de la cual clonar la sección — skip`);
    return "skipped";
  }
  console.log(`+ ${faq.key}: CREAR (sección clonada de ${donor.key})`);
  console.log(`    CUERPO: ${faq.body.slice(0, 100)}…`);
  if (APPLY) {
    const field = await prisma.cmsField.create({
      data: {
        sectionId: donor.sectionId,
        key: faq.key,
        kind: "BLOCK",
        label: faq.title,
        helpText: faq.helpText,
        type: "MARKDOWN",
        body: faq.body,
        metadata: {},
        category: "FAQ",
        isPublished: true,
        createdBy: "script:publish-legal-v1-20260929",
      },
    });
    const version = await prisma.cmsFieldVersion.create({
      data: {
        fieldId: field.id,
        version: 1,
        title: faq.title,
        body: faq.body,
        metadata: {},
        publishedAt: new Date(),
        createdBy: "script:publish-legal-v1-20260929",
      },
    });
    await prisma.cmsField.update({
      where: { id: field.id },
      data: { publishedVersionId: version.id },
    });
    console.log(
      `    ✓ creada y publicada como versión 1${faq.gated ? " (gateada: no visible sin la setting)" : ""}`,
    );
  }
  return "updated";
}

console.log(`=== publish-legal-v1-20260929 — ${APPLY ? "APLICANDO" : "DRY-RUN"} ===`);
console.log(`Destino: ${targetRef()}\n`);

let updated = 0;
let skipped = 0;

for (const [key, newBody] of Object.entries(NEW_BODIES)) {
  const result = await publishBody(key, newBody);
  if (result === "updated") updated++;
  else skipped++;
}

for (const faq of NEW_FAQS) {
  const result = await createFaq(faq);
  if (result === "updated") updated++;
  else skipped++;
}

// Homologación de data: garantía 3 meses en TODOS los productos (la política
// publicada dice que aplica a todo el catálogo; la tienda nunca fue pública).
{
  const mismatched = await prisma.product.count({ where: { warrantyMonths: { not: 3 } } });
  if (mismatched === 0) {
    console.log(`= Product.warrantyMonths: todos en 3 — skip`);
    skipped++;
  } else {
    console.log(`→ Product.warrantyMonths: ${mismatched} producto(s) ≠ 3 → pasan a 3`);
    if (APPLY) {
      const res = await prisma.product.updateMany({
        where: { warrantyMonths: { not: 3 } },
        data: { warrantyMonths: 3 },
      });
      console.log(`    ✓ ${res.count} producto(s) actualizados`);
    }
    updated++;
  }
}

console.log(`\nResumen: ${updated} por publicar${APPLY ? " (aplicados)" : ""}, ${skipped} skip.`);
if (!APPLY && updated > 0) console.log("Re-corre con --apply para aplicar.");
if (APPLY && updated > 0)
  console.log("Recuerda invalidar el caché CMS desde /admin/contenido (o espera 1 h).");

await prisma.$disconnect();
