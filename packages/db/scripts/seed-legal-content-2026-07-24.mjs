/*
 * Publica el contenido legal de la ETAPA 1 (catálogo + cotización por WhatsApp) — 2026-07-24.
 *
 * Es una copia del script del 19-jul con las constantes de versión subidas. NO se re-corre aquel:
 * publicaría los cuerpos nuevos estampando "Versión 2" en el bloque compartido `legal.last-updated`
 * (contradiciendo el pie "Versión 3" de cada documento) y, peor, forzaría `PRIVACY_POLICY_VERSION`
 * de vuelta a "v2 · 2026-07-19" — con lo que toda cotización nueva guardaría en
 * `Quote.dataConsentVersion` y en `Consent.version` una versión cuyo texto ya no es el que el
 * titular vio. Eso rompe la trazabilidad que exige la Ley 1581 justo en el flujo que la necesita.
 *
 * Uso:  pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/seed-legal-content-2026-07-24.mjs
 * Después: /admin/contenido → "Actualizar caché de contenido".
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

const VERSION_LINE = "Última actualización: 2026-07-24 · Versión 3";
const PRIVACY_VERSION = "v3 · 2026-07-24";
const ACTOR = "system:etapa1-catalogo-2026-07-24";

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
