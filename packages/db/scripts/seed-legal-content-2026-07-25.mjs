/*
 * Publica el contenido legal corregido contra la NORMA VERIFICADA — 2026-07-25, Versión 4.
 *
 * Qué cambió respecto de la v3, y por qué (investigación jurídica del 2026-07-25):
 *   · Se quitó la promesa de "documento equivalente, cuenta de cobro o factura electrónica".
 *     Optar por expedir cualquiera de los dos primeros convertiría a la titular en obligada a
 *     facturar (Decreto 1625 de 2016, art. 1.6.1.4.3 par. 1), cosa que hoy no es (E.T. art. 437
 *     par. 3). Era la frase más peligrosa de todo el corpus.
 *   · Se quitó la frase —repetida en cinco páginas públicas— de que los datos de identificación se
 *     entregan "a solicitud" y "no los publicamos abiertamente por seguridad": es una confesión
 *     escrita de incumplir el art. 50 lit. a) de la Ley 1480.
 *   · Términos y Garantías se contradecían sobre la garantía. Manda el escalonamiento del art. 11:
 *     primero reparación gratis; el consumidor elige solo si no admite reparación o la falla se repite.
 *   · Los "21 días calendario" de la reversión no corresponden a ninguna norma: son 15 días HÁBILES
 *     y corren contra los participantes del proceso de pago, no contra la tienda (Decreto 1074 de
 *     2015, art. 2.2.2.51.8). Además la reversión exige pago con instrumento electrónico (art. 51).
 *   · "Transferencia internacional" era la figura equivocada: los proveedores son ENCARGADOS que
 *     tratan por cuenta de la responsable, o sea TRANSMISIÓN (Decreto 1074 de 2015, art. 2.2.2.25.1.3).
 *   · Las citas al Decreto 1377 de 2013 nombran ahora los artículos del Decreto 1074 de 2015 que lo
 *     compiló.
 *
 * PENDIENTE y NO resuelto acá: el bloque de identificación del art. 50 lit. a) (nombre real y
 * dirección de notificación judicial). Requiere una decisión de la titular, que trabaja desde su
 * casa y no debería publicar su domicilio sin evaluar las alternativas.
 *
 * NO se re-corre el script del 24-jul: publicaría los cuerpos nuevos estampando "Versión 3" en el
 * bloque compartido `legal.last-updated` (contradiciendo el pie "Versión 4" de cada documento) y,
 * peor, forzaría `PRIVACY_POLICY_VERSION` de vuelta a "v3" — con lo que toda cotización nueva
 * guardaría en `Quote.dataConsentVersion` y en `Consent.version` una versión cuyo texto ya no es el
 * que el titular vio. Eso rompe la trazabilidad que exige la Ley 1581 justo en el flujo que la
 * necesita.
 *
 * Uso:  node packages/db/scripts/seed-legal-content-2026-07-25.mjs
 * Después: ACCIÓN HUMANA — /admin/contenido → "Actualizar caché de contenido".
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

const VERSION_LINE = "Última actualización: 2026-07-25 · Versión 4";
const PRIVACY_VERSION = "v4 · 2026-07-25";
const ACTOR = "system:legal-verificado-2026-07-25";

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
