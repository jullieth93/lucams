/*
 * fix-voseo-cms.mjs — Aplica reemplazos voseo → tuteo a todos los
 * CmsBlock (body + body de versiones) y SiteSetting cuyo value contenga
 * voseo. Idempotente: re-ejecutar no cambia nada si ya está limpio.
 *
 * Por qué este script existe: el voseo entró al catálogo durante
 * sesiones anteriores (era el tono argentino/uruguayo). 2026-05-18
 * decisión: tuteo de Colombia ES OBLIGATORIO. El código se limpió con
 * sed; este script limpia la DB.
 *
 * Uso: make fix-voseo-cms
 *
 * Reglas:
 *   - Aplica word-boundary regex (no toca palabras como "automáticamente").
 *   - Si la sustitución NO cambia el body, no escribe (idempotente).
 *   - Actualiza también CmsBlockVersion.body de la versión publicada,
 *     para que la próxima request reciba el texto limpio (vía caché o
 *     no, según unstable_cache + tag invalidation).
 *   - Recordá invalidar caché tras correr: `updateTag("cms")` ya lo
 *     hace cualquier acción admin, pero si quieres forzar, reinicia el
 *     dev server o publicá cualquier bloque para que dispare el tag.
 *
 * ⚠️ CACHÉ CMS (2026-07-23): este script edita contenido CMS DIRECTO en DB → el sitio
 * público sigue sirviendo la versión cacheada (unstable_cache tag "cms", TTL 1h) hasta
 * que alguien la invalide. Después de correrlo: /admin/contenido (Bloques o
 * Configuración) → botón "Actualizar caché de contenido".
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

// Reemplazos voseo → tuteo. Mismas reglas que el sed aplicado a código.
// CADA línea: [regex, replacement]. Word boundary `\b` evita que se
// toquen palabras como "automáticamente" o "comentario".
const REPLACEMENTS = [
  [/\bEmpezá\b/g, "Empieza"],
  [/\bempezá\b/g, "empieza"],
  [/\bElegí\b/g, "Elige"],
  [/\belegí\b/g, "elige"],
  [/\bEligí\b/g, "Elige"],
  [/\beligí\b/g, "elige"],
  [/\bProbá\b/g, "Prueba"],
  [/\bprobá\b/g, "prueba"],
  [/\bMandá\b/g, "Manda"],
  [/\bmandá\b/g, "manda"],
  [/\bDecidí\b/g, "Decide"],
  [/\bdecidí\b/g, "decide"],
  [/\bPersonalizá\b/g, "Personaliza"],
  [/\bpersonalizá\b/g, "personaliza"],
  [/\bHacé\b/g, "Haz"],
  [/\bhacé\b/g, "haz"],
  [/\btenés\b/g, "tienes"],
  [/\bTenés\b/g, "Tienes"],
  [/\bquerés\b/g, "quieres"],
  [/\bQuerés\b/g, "Quieres"],
  [/\bpodés\b/g, "puedes"],
  [/\bPodés\b/g, "Puedes"],
  [/\bsabés\b/g, "sabes"],
  [/\bSabés\b/g, "Sabes"],
  [/\bTomá\b/g, "Toma"],
  [/\btomá\b/g, "toma"],
  [/\bEscribí\b/g, "Escribe"],
  [/\bescribí\b/g, "escribe"],
  [/\bescribinos\b/g, "escríbenos"],
  [/\bEscribinos\b/g, "Escríbenos"],
  [/\bComentá\b/g, "Comenta"],
  [/\bcomentá\b/g, "comenta"],
  [/\bEscogé\b/g, "Escoge"],
  [/\bescogé\b/g, "escoge"],
  [/\bComprá\b/g, "Compra"],
  [/\bcomprá\b/g, "compra"],
  [/\bCompartí\b/g, "Comparte"],
  [/\bcompartí\b/g, "comparte"],
  [/\bSeguí\b/g, "Sigue"],
  [/\bseguí\b/g, "sigue"],
  [/\bOlvidá\b/g, "Olvida"],
  [/\bolvidá\b/g, "olvida"],
  [/\bFijate\b/g, "Fíjate"],
  [/\bfijate\b/g, "fíjate"],
  [/\bMirá\b/g, "Mira"],
  [/\bmirá\b/g, "mira"],
  [/\bLlevá\b/g, "Lleva"],
  [/\bllevá\b/g, "lleva"],
  [/\bUsá\b/g, "Usa"],
  [/\busá\b/g, "usa"],
  [/\bAyudá\b/g, "Ayuda"],
  [/\bayudá\b/g, "ayuda"],
  [/\bayudanos\b/g, "ayúdanos"],
  [/\bAyudanos\b/g, "Ayúdanos"],
  [/\bLlamá\b/g, "Llama"],
  [/\bllamá\b/g, "llama"],
  [/\bGuardá\b/g, "Guarda"],
  [/\bguardá\b/g, "guarda"],
  [/\bCargá\b/g, "Carga"],
  [/\bcargá\b/g, "carga"],
  [/\bSubí\b/g, "Sube"],
  [/\bsubí\b/g, "sube"],
  [/\bRecordá\b/g, "Recuerda"],
  [/\brecordá\b/g, "recuerda"],
  [/\bLeé\b/g, "Lee"],
  [/\bleé\b/g, "lee"],
  [/\bencontrás\b/g, "encuentras"],
  [/\bEncontrás\b/g, "Encuentras"],
  [/\bbuscás\b/g, "buscas"],
  [/\bBuscás\b/g, "Buscas"],
  [/\bIntentá\b/g, "Intenta"],
  [/\bintentá\b/g, "intenta"],
  [/\bRecargá\b/g, "Recarga"],
  [/\brecargá\b/g, "recarga"],
  [/\bCreá\b/g, "Crea"],
  [/\bcreá\b/g, "crea"],
  [/\bnecesitás\b/g, "necesitas"],
  [/\bNecesitás\b/g, "Necesitas"],
  [/\bTocá\b/g, "Toca"],
  [/\btocá\b/g, "toca"],
  [/\bSumá\b/g, "Suma"],
  [/\bsumá\b/g, "suma"],
  [/\bAtendé\b/g, "Atiende"],
  [/\batendé\b/g, "atiende"],
  [/\bVolvé\b/g, "Vuelve"],
  [/\bvolvé\b/g, "vuelve"],
  [/\bPedí\b/g, "Pide"],
  [/\bpedí\b/g, "pide"],
  [/\bcontá\b/g, "cuenta"],
  [/\bContá\b/g, "Cuenta"],
  [/\bEditá\b/g, "Edita"],
  [/\beditá\b/g, "edita"],
  [/\bRevisá\b/g, "Revisa"],
  [/\brevisá\b/g, "revisa"],
  [/\bAplicá\b/g, "Aplica"],
  [/\baplicá\b/g, "aplica"],
  [/\bConfirmá\b/g, "Confirma"],
  [/\bconfirmá\b/g, "confirma"],
  [/\bIngresá\b/g, "Ingresa"],
  [/\bingresá\b/g, "ingresa"],
  [/\bAgregá\b/g, "Agrega"],
  [/\bagregá\b/g, "agrega"],
  [/\bArrastrá\b/g, "Arrastra"],
  [/\barrastrá\b/g, "arrastra"],
  [/\bDejá\b/g, "Deja"],
  [/\bdejá\b/g, "deja"],
  [/\bAceptá\b/g, "Acepta"],
  [/\baceptá\b/g, "acepta"],
  [/\bAvisá\b/g, "Avisa"],
  [/\bavisá\b/g, "avisa"],
  [/\bCambiá\b/g, "Cambia"],
  [/\bcambiá\b/g, "cambia"],
  [/\bSeleccioná\b/g, "Selecciona"],
  [/\bseleccioná\b/g, "selecciona"],
  [/\bDescargá\b/g, "Descarga"],
  [/\bdescargá\b/g, "descarga"],
  [/\baceptás\b/g, "aceptas"],
  [/\bAceptás\b/g, "Aceptas"],
  [/\bDecí\b/g, "Di"],
  [/\bdecí\b/g, "di"],
];

function applyAll(text) {
  if (!text) return text;
  let result = text;
  for (const [regex, replacement] of REPLACEMENTS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

async function main() {
  console.log("=== fix-voseo-cms (2026-05-18) ===\n");

  // 1. CmsBlock.body
  const blocks = await prisma.cmsBlock.findMany({
    where: { deletedAt: null },
    select: { id: true, key: true, body: true },
  });
  let blocksUpdated = 0;
  for (const b of blocks) {
    const newBody = applyAll(b.body);
    if (newBody !== b.body) {
      await prisma.cmsBlock.update({ where: { id: b.id }, data: { body: newBody } });
      console.log(`  · cms_block ${b.key} actualizado`);
      blocksUpdated++;
    }
  }
  console.log(`CmsBlock: ${blocksUpdated} actualizados / ${blocks.length} revisados`);

  // 2. CmsBlockVersion.body (todas las versiones)
  const versions = await prisma.cmsBlockVersion.findMany({
    select: { id: true, blockId: true, body: true },
  });
  let versionsUpdated = 0;
  for (const v of versions) {
    const newBody = applyAll(v.body);
    if (newBody !== v.body) {
      await prisma.cmsBlockVersion.update({ where: { id: v.id }, data: { body: newBody } });
      versionsUpdated++;
    }
  }
  console.log(`CmsBlockVersion: ${versionsUpdated} actualizados / ${versions.length} revisados`);

  // 3. SiteSetting.value (templates WhatsApp, microcopy, etc.)
  const settings = await prisma.siteSetting.findMany({
    select: { id: true, key: true, value: true },
  });
  let settingsUpdated = 0;
  for (const s of settings) {
    const newValue = applyAll(s.value);
    if (newValue !== s.value) {
      await prisma.siteSetting.update({ where: { id: s.id }, data: { value: newValue } });
      console.log(`  · setting ${s.key} actualizado`);
      settingsUpdated++;
    }
  }
  console.log(`SiteSetting: ${settingsUpdated} actualizados / ${settings.length} revisados`);

  // 4. Product.description (catálogo)
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true, description: true },
  });
  let productsUpdated = 0;
  for (const p of products) {
    const newDesc = applyAll(p.description);
    if (newDesc !== p.description) {
      await prisma.product.update({ where: { id: p.id }, data: { description: newDesc } });
      console.log(`  · product ${p.slug} actualizado`);
      productsUpdated++;
    }
  }
  console.log(
    `Product.description: ${productsUpdated} actualizados / ${products.length} revisados`,
  );

  // 5. OcasionTag.description (descripciones semánticas para bot futuro)
  const ocasiones = await prisma.ocasionTag.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true, description: true },
  });
  let ocasionesUpdated = 0;
  for (const o of ocasiones) {
    if (!o.description) continue;
    const newDesc = applyAll(o.description);
    if (newDesc !== o.description) {
      await prisma.ocasionTag.update({ where: { id: o.id }, data: { description: newDesc } });
      console.log(`  · ocasion ${o.slug} actualizado`);
      ocasionesUpdated++;
    }
  }
  console.log(
    `OcasionTag.description: ${ocasionesUpdated} actualizados / ${ocasiones.length} revisados`,
  );

  console.log(
    "\n=== Done. Recordá reiniciar dev server o publicar un bloque para invalidar caché. ===",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
