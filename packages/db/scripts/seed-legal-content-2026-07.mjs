/*
 * Script de barrido legal (2026-07-19) — publica la versión COMPLIANT de los 8
 * bloques legal.* + la línea de versión compartida + la versión de consentimiento.
 *
 * Contexto: auditoría legal-Colombia (workflow multi-agente, 25 agentes) sobre TODO
 * el texto legal contra Ley 1581/2012, Ley 1480/2011 (+ Ley 2439/2024) y régimen
 * tributario. Reescribe cada documento como PERSONA NATURAL (no S.A.S.), con:
 *   - identidad del proveedor (sin exponer cédula ni dirección exacta — se dan a solicitud),
 *   - IVA régimen-agnóstico (persona natural probablemente NO responsable de IVA),
 *   - retracto 5 días hábiles + reembolso 15 días calendario desde el ejercicio (Ley 2439/2024),
 *   - excepción de personalizados (art. 47), reversión del pago (art. 51),
 *   - garantía 1 año con elección del consumidor (arts. 7-8/11), PQR (10/15 días hábiles),
 *   - subprocesadores reales (Aveonline, Google/Gemini — no Venndelo/Anthropic), en Markdown,
 *   - SIC como autoridad, jurisdicción colombiana, versión + fecha.
 *
 * El contenido canónico vive en packages/db/legal-content/legal.<key>.md (committed) →
 * este script lo publica como nueva versión del CmsBlock. Reproducible: se corre igual
 * contra la BD de PROD al lanzar (responde la ACCIÓN HUMANA "replicar CMS legal a prod").
 *
 * IMPORTANTE: los drafts son una BASE compliant, NO reemplazan la revisión de un abogado
 * colombiano antes del lanzamiento (ADR-020 / ADR-072).
 *
 * Uso:  (desde la raíz, con .env.local sourced)  node packages/db/scripts/seed-legal-content-2026-07.mjs
 *
 * ⚠️ CACHÉ CMS (2026-07-23): este script edita contenido CMS DIRECTO en DB → el sitio
 * público sigue sirviendo la versión cacheada (unstable_cache tag "cms", TTL 1h) hasta
 * que alguien la invalide. Después de correrlo: /admin/contenido (Bloques o
 * Configuración) → botón "Actualizar caché de contenido".
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, "..", "legal-content");

const VERSION_LINE = "Última actualización: 2026-07-19 · Versión 2";
const PRIVACY_VERSION = "v2 · 2026-07-19";
const ACTOR = "system:barrido-legal-2026-07-19";

const KEYS = [
  "legal.terminos",
  "legal.privacidad",
  "legal.habeas-data",
  "legal.cookies",
  "legal.devoluciones",
  "legal.garantias",
  "legal.subprocesadores",
  "legal.security",
];

const prisma = new PrismaClient();

console.log("=== seed-legal-content-2026-07 (barrido legal-Colombia) ===\n");

/** Publica una versión nueva de un CmsBlock con `body`, sincronizando block.body. */
async function publishBlock(key, body, format = "MARKDOWN") {
  const block = await prisma.cmsBlock.findUnique({
    where: { key },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!block) {
    console.log(`  ⚠ ${key} — no existe en DB, skip`);
    return "notfound";
  }
  const nextVersion = (block.versions[0]?.version ?? 0) + 1;
  await prisma.$transaction(async (tx) => {
    const v = await tx.cmsBlockVersion.create({
      data: {
        blockId: block.id,
        version: nextVersion,
        title: block.title,
        body,
        format,
        metadata: block.metadata ?? {},
        publishedAt: new Date(),
        createdBy: ACTOR,
      },
    });
    await tx.cmsBlock.update({
      where: { id: block.id },
      // Sincroniza body + publishedVersion (el bug de ley-2439 dejó block.body stale).
      data: { body, format, isPublished: true, publishedVersionId: v.id, updatedBy: ACTOR },
    });
  });
  console.log(`  ✓ ${key} — versión ${nextVersion} publicada (${body.length} chars)`);
  return "updated";
}

let updated = 0;
let notfound = 0;

for (const key of KEYS) {
  const body = readFileSync(join(CONTENT_DIR, `${key}.md`), "utf8").trimEnd() + "\n";
  const r = await publishBlock(key, body);
  if (r === "updated") updated++;
  else notfound++;
}

// Línea de versión compartida por las 8 páginas (formato PLAIN — CmsText).
console.log("");
const verBlock = await prisma.cmsBlock.findUnique({ where: { key: "legal.last-updated" } });
if (verBlock) {
  await publishBlock("legal.last-updated", VERSION_LINE, verBlock.format ?? "PLAIN");
} else {
  console.log("  ⚠ legal.last-updated — no existe (el fallback del componente muestra la versión)");
}

// Versión de consentimiento (features/consent/service.ts la estampa en cada Consent nuevo).
console.log("");
const pv = await prisma.siteSetting.findUnique({ where: { key: "PRIVACY_POLICY_VERSION" } });
if (pv) {
  await prisma.siteSetting.update({
    where: { key: "PRIVACY_POLICY_VERSION" },
    data: { value: PRIVACY_VERSION, updatedBy: ACTOR },
  });
  console.log(`  ✓ PRIVACY_POLICY_VERSION → "${PRIVACY_VERSION}" (era "${pv.value}")`);
} else {
  console.log("  ⚠ PRIVACY_POLICY_VERSION — no existe como SiteSetting");
}

console.log(`\nResumen: ${updated} bloques legales publicados, ${notfound} no encontrados.`);
console.log("\n⚠️ El caché de Next (unstable_cache tag 'cms') puede servir el body viejo hasta");
console.log(
  "   revalidateTag('cms') (admin CMS) o purge/redeploy. En dev: make down + rm -rf apps/web/.next + make start-web.",
);
console.log(
  "⚠️ Los drafts son base compliant — requieren visto bueno de abogado antes del lanzamiento (ADR-020/072).\n",
);

await prisma.$disconnect();
process.exit(0);
