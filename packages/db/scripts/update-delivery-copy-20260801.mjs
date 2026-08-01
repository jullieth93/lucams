#!/usr/bin/env node
/*
 * update-delivery-copy-20260801.mjs — corrige la narrativa de tiempos/pago en
 * 4 campos CMS publicados (certificación pre-producción 2026-08-01).
 *
 * Por qué existe: la auditoría encontró que los textos PUBLICADOS en DB (no
 * solo los fallbacks de código) (a) prometían "entregamos en máx. 3 días
 * hábiles" — una fecha de entrega total que incluye la pierna del courier,
 * prohibida por la regla de certificación (solo se promete el DESPACHO, el
 * tránsito es estimado de la transportadora) — y (b) decían "Pagas en línea
 * de forma segura" en la home estando el sitio en modo catálogo (sin pagos
 * en línea). El código ya quedó corregido; este script alinea el CONTENIDO.
 *
 * Campos que actualiza (si existen y si el cuerpo publicado difiere):
 *   - home.howitworks.step3.description  (pago WhatsApp en modo catálogo)
 *   - home.hero.chip-eta                 (chip de tiempos del hero)
 *   - faq.02-cuanto-demora               (FAQ "¿Cuánto demora mi pedido?")
 *   - checkout.shipping.note             (nota de tiempos del checkout full)
 *
 * Mecánica CMS v2: crea una NUEVA CmsFieldVersion publicada y apunta el
 * campo a ella (el historial queda — revertible desde /admin/contenido).
 *
 * Uso:
 *   node scripts/update-delivery-copy-20260801.mjs           # dry-run (default)
 *   node scripts/update-delivery-copy-20260801.mjs --apply   # aplica
 * Con dotenv según ambiente (desde packages/db):
 *   npx dotenv -e ../../.env.local -- node scripts/update-delivery-copy-20260801.mjs --apply
 *   npx dotenv -e ../../.env.stg   -- node scripts/update-delivery-copy-20260801.mjs --apply
 *
 * OJO: tras aplicar, invalidar el caché CMS desde /admin/contenido
 * ("Actualizar caché de contenido") o esperar la revalidación (1 h).
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");

// Textos NUEVOS — deben coincidir con los fallbacks del código (apps/web).
// Tokens {{fab}}/{{entrega}} los resuelve <CmsText>/<CmsMarkdown> al render.
const NEW_BODIES = {
  // Modo catálogo: el cierre es por WhatsApp; sin "Pagas en línea".
  "home.howitworks.step3.description":
    "Lo producimos a mano y despachamos en máximo {{fab}} días hábiles; desde ahí, la transportadora tarda ~{{entrega}} días más según tu ciudad (te lo confirmamos por WhatsApp). Cierras la compra por WhatsApp — contraentrega disponible.",
  "home.hero.chip-eta":
    "Despacho en máx. {{fab}} días hábiles · la transportadora tarda ~{{entrega}} días según tu ciudad",
  "faq.02-cuanto-demora":
    "Lo producimos a mano y lo **despachamos en máximo {{fab}} días hábiles** desde que confirmas. El envío lo coordinamos por WhatsApp con nuestras transportadoras aliadas (tránsito estimado: ~{{entrega}} días según tu ciudad) y te pasamos el número de guía para que sigas tu pedido.",
  // El checkout NO resuelve tokens (literal) — mismo texto que DEFAULT_CHECKOUT_TEXTS.
  "checkout.shipping.note":
    "Son tiempos **estimados por la transportadora**, no una fecha garantizada. Antes fabricamos tu pedido a mano: lo **despachamos en máximo 2 días hábiles** y de ahí corre el tránsito.",
};

const prisma = new PrismaClient();

// Ref del proyecto para mostrar a qué ambiente se está escribiendo (sin credenciales).
function targetRef() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  if (/127\.0\.0\.1|localhost/.test(url)) return "LOCAL (127.0.0.1)";
  const m = url.match(/db\.([a-z0-9]+)\.supabase\.co|postgres\.([a-z0-9]+)@/);
  return m ? `Supabase ref ${m[1] ?? m[2]}` : "host desconocido";
}

console.log(`=== update-delivery-copy-20260801 — ${APPLY ? "APLICANDO" : "DRY-RUN"} ===`);
console.log(`Destino: ${targetRef()}\n`);

let updated = 0;
let skipped = 0;

for (const [key, newBody] of Object.entries(NEW_BODIES)) {
  const field = await prisma.cmsField.findUnique({
    where: { key },
    include: { publishedVersion: true },
  });
  if (!field || field.deletedAt) {
    console.log(`- ${key}: no existe en esta DB — skip (lo cubre el fallback del código)`);
    skipped++;
    continue;
  }
  const current = field.publishedVersion?.body ?? "";
  if (current === newBody) {
    console.log(`= ${key}: ya tiene el texto nuevo — skip`);
    skipped++;
    continue;
  }
  console.log(`→ ${key}:`);
  console.log(`    ANTES: ${current.slice(0, 110)}…`);
  console.log(`    DESPUÉS: ${newBody.slice(0, 110)}…`);
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
        createdBy: "script:update-delivery-copy-20260801",
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

console.log(`\nResumen: ${updated} por actualizar${APPLY ? " (aplicados)" : ""}, ${skipped} skip.`);
if (!APPLY && updated > 0) console.log("Re-corre con --apply para aplicar.");
if (APPLY && updated > 0)
  console.log("Recuerda invalidar el caché CMS desde /admin/contenido (o espera 1 h).");

await prisma.$disconnect();
