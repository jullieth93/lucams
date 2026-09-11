#!/usr/bin/env node
/*
 * update-public-content-20260911.mjs — saneamiento del contenido PÚBLICO en DB
 * (auditoría integral de información pública, contenido legal y centro de
 * ayuda, 2026-09-11; consolidada en STATE.md / COMPLIANCE.md / OPERATIONS.md).
 *
 * Por qué existe: la auditoría encontró que los textos PUBLICADOS en DB (no
 * solo los fallbacks de código) contradecían la operación real de la tienda.
 *
 * CONTEXTO DE MODO (importante): PRD opera en modo FULL desde el 2026-09-03
 * (decisión de Lucy — docs/ROADMAP.md E2; firma verificada: /checkout/pago →
 * 307 /carrito). Las FAQs de pago/envío con texto Wompi son por tanto las
 * CORRECTAS para PRD. Los textos sensibles al modo (faq.01-04 y
 * home.howitworks.step3.description) quedan GATEADOS EN CÓDIGO: en modo
 * catálogo el render fuerza la variante catálogo del fallback
 * (apps/web/app/ayuda/page.tsx y apps/web/components/home/how-it-works.tsx),
 * así que la DB homologa SIEMPRE la variante FULL en los 3 ambientes.
 *
 * Qué corrige este script (si el campo existe y el cuerpo publicado difiere):
 *   (a) faq.01-04 → variantes FULL canónicas (homologación; el modo catálogo
 *       las sobrescribe en render). faq.02 además quedó con encuadre catálogo
 *       del 2026-08-01 que en PRD-full ya no era veraz.
 *   (b) home.howitworks.step3.description → variante FULL (la de catálogo se
 *       seguía sirviendo en PRD después del flip).
 *   (c) faq.08-borrar-mis-datos → flujo self-serve INMEDIATO en
 *       /mi-cuenta/eliminar (antes mandaba solo al email con 10 días hábiles).
 *   (d) Tiempos: PRODUCTION_DAYS_DEFAULT → "2" (despacho real confirmado por
 *       Lucy 2026-09-11; ver también update-production-days-20260911.mjs),
 *       DELIVERY_DAYS_ESTIMATE → "2 a 5" (era "1" — rompía la gramática y
 *       contradecía el rango 2–5 del catálogo), checkout.shipping.note
 *       literal coherente.
 *   (e) legal.cookies → v4 2026-09-11 (sin "[pendiente verificación]" en
 *       __cf_bm — verificado: Cloudflare la expira a los ~30 minutos; y sin
 *       "antes del lanzamiento", la tienda ya está en producción).
 *       legal.security → misma coletilla corregida (v2).
 *   (f) support.help.cta.subtext → "24h hábiles" (unidad, como /contacto).
 *
 * NO toca los 6 documentos v5 (terminos, privacidad, devoluciones, garantias,
 * habeas-data, subprocesadores): su publicación espera el visto bueno del
 * abogado (la premisa "tienda en línea activa" SÍ es cierta en PRD-full).
 *
 * Mecánica CMS v2: crea una NUEVA CmsFieldVersion publicada y apunta el
 * campo a ella (el historial queda — revertible desde /admin/contenido).
 *
 * Uso:
 *   node scripts/update-public-content-20260911.mjs           # dry-run (default)
 *   node scripts/update-public-content-20260911.mjs --apply   # aplica
 * Con dotenv según ambiente (desde packages/db):
 *   npx dotenv -e ../../.env.local -- node scripts/update-public-content-20260911.mjs --apply
 *   npx dotenv -e ../../.env.stg   -- node scripts/update-public-content-20260911.mjs --apply
 *   npx dotenv -e ../../.env.local.nube-backup -- node scripts/update-public-content-20260911.mjs --apply
 *
 * OJO: tras aplicar, invalidar el caché CMS desde /admin/contenido
 * ("Actualizar caché de contenido") o esperar la revalidación (1 h).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const HERE = dirname(fileURLToPath(import.meta.url));

// Los cuerpos legales se leen de la fuente canónica en git para no duplicar
// texto (misma regla que el test legal-content-sync: una sola copia).
const legalBody = (name) =>
  readFileSync(join(HERE, "..", "legal-content", `legal.${name}.md`), "utf-8").trim();

// Textos NUEVOS — variantes FULL canónicas (homologación de ambientes; el modo
// catálogo las sobrescribe en render vía código). Deben coincidir con los
// fallbacks FULL de apps/web. Tokens {{fab}}/{{entrega}}/{{cobertura}} los
// resuelve <CmsText>/<CmsMarkdown> al render.
const NEW_BODIES = {
  // (a) FAQs de pago/envío — variantes FULL (PRD opera en full desde 2026-09-03).
  "faq.01-como-personalizo":
    "Elige el producto, haz clic en **Personalizar** y lo diseñas en vivo en nuestro Estudio: subes tus fotos, agregas texto y plantillas, y lo ves con vista previa 3D. Al terminar, lo agregas al carrito.",
  "faq.02-cuanto-demora":
    "Lo producimos a mano y lo **despachamos en máximo {{fab}} días hábiles** desde que confirmas. Desde ahí, la transportadora tarda ~{{entrega}} días según tu ciudad; al despachar te enviamos el número de guía para que sigas tu pedido.",
  "faq.03-metodos-pago":
    "Tarjetas de crédito y débito, PSE (cuentas bancarias), Nequi, Bancolombia transferencia y Daviplata. Todos los pagos los procesa Wompi de forma segura (pasarela certificada). También aceptamos **pago contraentrega**: pagas en efectivo al recibir tu pedido.",
  "faq.04-envios-cobertura":
    "Llegamos a **{{cobertura}} destinos** en Colombia a través de nuestras transportadoras aliadas. Al hacer el pedido calculamos automáticamente el costo, el tiempo estimado y qué transportadora llega a tu ciudad.",
  // (b) Paso 3 de "Así de fácil" — variante FULL (la de catálogo quedó sirviéndose en PRD).
  "home.howitworks.step3.description":
    "Lo producimos a mano y despachamos en máximo {{fab}} días hábiles; desde ahí, la transportadora tarda ~{{entrega}} días más según tu ciudad. Pagas en línea de forma segura — contraentrega disponible.",
  // (c) Borrado self-serve inmediato (mismo texto que el fallback de /ayuda).
  "faq.08-borrar-mis-datos":
    "Puedes hacerlo tú misma de inmediato desde **[Mi cuenta → Eliminar cuenta](/mi-cuenta/eliminar)**: tus datos se anonimizan al momento. Si prefieres que lo tramitemos por ti, escríbenos a **hola@lucamsshop.com** desde el email registrado y procesamos la supresión dentro de **10 días hábiles**. Más info en [Hábeas Data](/legal/habeas-data).",
  // (d) Tiempos — despacho real 2 días (Lucy 2026-09-11); tránsito = rango del catálogo.
  PRODUCTION_DAYS_DEFAULT: "2",
  DELIVERY_DAYS_ESTIMATE: "2 a 5",
  "checkout.shipping.note":
    "Son tiempos **estimados por la transportadora**, no una fecha garantizada. Antes fabricamos tu pedido a mano: lo **despachamos en máximo 2 días hábiles** y de ahí corre el tránsito.",
  // (e) Legales con verificación resuelta y coletilla corregida.
  "legal.cookies": legalBody("cookies"),
  "legal.security": legalBody("security"),
  // (f) SLA con unidad, igual que /contacto.
  "support.help.cta.subtext":
    "Escríbenos por WhatsApp o email y te respondemos en menos de 24h hábiles.",
};

const prisma = new PrismaClient();

// Ref del proyecto para mostrar a qué ambiente se está escribiendo (sin credenciales).
function targetRef() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  if (/127\.0\.0\.1|localhost/.test(url)) return "LOCAL (127.0.0.1)";
  const m = url.match(/db\.([a-z0-9]+)\.supabase\.co|postgres\.([a-z0-9]+)@/);
  return m ? `Supabase ref ${m[1] ?? m[2]}` : "host desconocido";
}

console.log(`=== update-public-content-20260911 — ${APPLY ? "APLICANDO" : "DRY-RUN"} ===`);
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
        createdBy: "script:update-public-content-20260911",
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
