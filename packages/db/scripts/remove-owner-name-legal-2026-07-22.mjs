/*
 * Nombre de la titular FUERA de las páginas de información (Lucy 2026-07-22).
 *
 * Reemplaza "Lucy Jullieth Hurtado Rodríguez" por "Lucams_shop (persona natural),
 * Bogotá D.C., Colombia" en TODOS los CmsBlockVersion de los bloques legal.* que la
 * contienen (vigentes e históricos — no había drafts) + el espejo CmsBlock.body +
 * las SiteSettings BUSINESS_LEGAL_NAME / LEGAL_ENTITY_LINE (footer y correos).
 *
 * Reemplazos por FRASE (no string pelado) para que el texto quede gramatical y no
 * se duplique "persona natural" / "Bogotá D.C.". Donde el documento no tenía ya una
 * frase de identificación-a-solicitud (cookies, security) se deja UNA:
 *   "Los datos de identificación de la titular están disponibles a requerimiento
 *    del consumidor a través de nuestros canales de contacto."
 * (Ley 1480 art. 23: identificación del proveedor disponible al consumidor.)
 *
 * NOTA: CmsBlockVersion es append-only por diseño (auditoría legal). Lucy pidió
 * explícitamente que su nombre no quede en NINGUNA versión publicada; por eso se
 * editan también las históricas. Queda registrado en este script + reporte.
 *
 * Fuente de seeds ya ajustada en packages/db/legal-content/*.md y seed-cms.mjs
 * (mismos textos) → futuros seeds no la reintroducen.
 *
 * Transaccional (todo o nada) + red de seguridad: si alguna fila conserva
 * "Hurtado" tras las reglas, la transacción REVIERTE y se reporta la fila.
 * Idempotente: solo toca filas que contienen "Hurtado"; re-run = 0 cambios.
 * Uso: pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/remove-owner-name-legal-2026-07-22.mjs
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
const ACTOR = "system:remove-owner-name-2026-07-22";
const NAME = "Hurtado";
const ID_LINE =
  "Los datos de identificación de la titular están disponibles a requerimiento del consumidor a través de nuestros canales de contacto.";
const NEW_SETTING =
  "Lucams_shop (persona natural) · Bogotá D.C., Colombia · Identificación de la titular disponible a requerimiento del consumidor";

/** [source, replacement] — literales, aplicados en orden a cada body con "Hurtado". */
const RULES = [
  // legal.privacidad v2 (2026-05-13, redacción vieja)
  [
    "**Lucy Jullieth Hurtado Rodríguez**, quien actúa como **persona natural** titular de la marca **Lucams_shop** (comercio electrónico de productos magnéticos personalizados), con domicilio en **Bogotá D.C., Colombia**, es la responsable del tratamiento. Su documento de identificación y dirección física de notificación están disponibles a solicitud.",
    `**Lucams_shop (persona natural), Bogotá D.C., Colombia**, titular de la marca **Lucams_shop** (comercio electrónico de productos magnéticos personalizados), es la responsable del tratamiento. ${ID_LINE}`,
  ],
  // legal.terminos v2 (2026-05-13, redacción vieja)
  [
    "operada por **Lucy Jullieth Hurtado Rodríguez** como **persona natural**, con domicilio en **Bogotá D.C.** Sus datos de identificación y dirección física de notificación están disponibles a solicitud escrita a **hola@lucamsshop.com**.",
    `operada por **Lucams_shop (persona natural), Bogotá D.C., Colombia**. ${ID_LINE}`,
  ],
  // legal.terminos v3+ (vigente v5)
  [
    "operada por **Lucy Jullieth Hurtado Rodríguez** como **persona natural**, con domicilio en **Bogotá D.C., Colombia**.",
    "operada por **Lucams_shop (persona natural), Bogotá D.C., Colombia**.",
  ],
  // legal.privacidad v3+ (vigente v5)
  [
    "**Lucy Jullieth Hurtado Rodríguez** (persona natural), titular de la marca **Lucams_shop**, con domicilio en **Bogotá D.C., Colombia**, es la responsable del tratamiento de tus datos personales.",
    "**Lucams_shop (persona natural), Bogotá D.C., Colombia**, titular de la marca **Lucams_shop**, es la responsable del tratamiento de tus datos personales.",
  ],
  // legal.habeas-data v1 (2026-05-13, redacción vieja)
  [
    "**Lucy Jullieth Hurtado Rodríguez**, quien actúa como **persona natural** titular de la marca **Lucams_shop**, con domicilio en **Bogotá D.C., Colombia**.",
    "**Lucams_shop (persona natural), Bogotá D.C., Colombia**, titular de la marca **Lucams_shop**.",
  ],
  // legal.habeas-data v2+ (vigente v4)
  [
    "- **Responsable:** Lucy Jullieth Hurtado Rodríguez, quien actúa como **persona natural** titular de la marca **Lucams_shop**.",
    "- **Responsable:** **Lucams_shop (persona natural), Bogotá D.C., Colombia**, titular de la marca **Lucams_shop**.",
  ],
  // legal.cookies v2+ (vigente v4)
  [
    "Responsable del tratamiento: **Lucy Jullieth Hurtado Rodríguez** (persona natural), titular de la marca **Lucams_shop**, con domicilio en **Bogotá D.C., Colombia**. Tratamos",
    "Responsable del tratamiento: **Lucams_shop (persona natural), Bogotá D.C., Colombia**, titular de la marca **Lucams_shop**. Tratamos",
  ],
  // legal.cookies — el documento no tenía frase de identificación-a-solicitud: se agrega
  // UNA al cierre del mismo párrafo (Ley 1480 art. 23).
  [
    "(encuentras el detalle en el **Aviso de Privacidad** y en **Hábeas Data**).",
    `(encuentras el detalle en el **Aviso de Privacidad** y en **Hábeas Data**). ${ID_LINE}`,
  ],
  // legal.garantias v2+ (vigente v4)
  [
    "Lucams_shop es la marca de **Lucy Jullieth Hurtado Rodríguez** (persona natural), con domicilio en **Bogotá D.C., Colombia**.",
    "Lucams_shop es una marca operada por **Lucams_shop (persona natural), Bogotá D.C., Colombia**.",
  ],
  // legal.subprocesadores v2+ (vigente v4)
  [
    "El **responsable del tratamiento** de tus datos es **Lucy Jullieth Hurtado Rodríguez** (persona natural), con domicilio en **Bogotá D.C., Colombia**.",
    "El **responsable del tratamiento** de tus datos es **Lucams_shop (persona natural), Bogotá D.C., Colombia**.",
  ],
  [
    "La cédula y la dirección exacta las entregamos directamente a quien lo solicite por estos mismos canales.",
    ID_LINE,
  ],
  // legal.security v2+ (vigente v4) — tampoco tenía frase de identificación: queda incluida.
  [
    "Lucams_shop es operado por **Lucy Jullieth Hurtado Rodríguez** (persona natural), con domicilio en **Bogotá D.C., Colombia**.",
    `Lucams_shop es operado por **Lucams_shop (persona natural), Bogotá D.C., Colombia**. ${ID_LINE}`,
  ],
];

function applyRules(body) {
  let out = body;
  const matched = [];
  for (const [src, dst] of RULES) {
    if (out.includes(src)) {
      out = out.split(src).join(dst);
      matched.push(src.slice(0, 60).replaceAll("\n", " ") + "…");
    }
  }
  return { out, matched };
}

async function main() {
  const report = await prisma.$transaction(
    async (tx) => {
      const rows = [];
      const leftover = [];

      // 1) CmsBlockVersion (todas las que contienen el nombre: vigentes e históricas).
      const versions = await tx.cmsBlockVersion.findMany({
        where: { body: { contains: NAME } },
        select: {
          id: true,
          version: true,
          body: true,
          block: { select: { key: true, publishedVersionId: true } },
        },
        orderBy: [{ blockId: "asc" }, { version: "asc" }],
      });
      for (const v of versions) {
        const { out, matched } = applyRules(v.body);
        if (out.includes(NAME)) {
          leftover.push(`${v.block.key} v${v.version}`);
          continue;
        }
        await tx.cmsBlockVersion.update({ where: { id: v.id }, data: { body: out } });
        rows.push({
          fila: `CmsBlockVersion ${v.block.key} v${v.version}${v.block.publishedVersionId === v.id ? " (VIGENTE)" : ""}`,
          reglas: matched.length,
        });
      }

      // 2) Espejo CmsBlock.body (lo que edita/ve el admin).
      const blocks = await tx.cmsBlock.findMany({
        where: { body: { contains: NAME } },
        select: { id: true, key: true, body: true },
      });
      for (const b of blocks) {
        const { out, matched } = applyRules(b.body);
        if (out.includes(NAME)) {
          leftover.push(`CmsBlock ${b.key}`);
          continue;
        }
        await tx.cmsBlock.update({
          where: { id: b.id },
          data: { body: out, updatedBy: ACTOR },
        });
        rows.push({ fila: `CmsBlock ${b.key} (body espejo)`, reglas: matched.length });
      }

      // 3) SiteSettings de identidad (footer + correos transaccionales).
      for (const key of ["BUSINESS_LEGAL_NAME", "LEGAL_ENTITY_LINE"]) {
        const s = await tx.siteSetting.findUnique({ where: { key } });
        if (!s) {
          rows.push({ fila: `SiteSetting ${key}`, reglas: 0, nota: "no existe, skip" });
          continue;
        }
        if (!s.value.includes(NAME)) {
          rows.push({ fila: `SiteSetting ${key}`, reglas: 0, nota: "sin el nombre, skip" });
          continue;
        }
        await tx.siteSetting.update({ where: { key }, data: { value: NEW_SETTING } });
        rows.push({ fila: `SiteSetting ${key}`, reglas: 1 });
      }

      // Red de seguridad: ninguna fila puede conservar el nombre. Si queda alguna,
      // lanzar error → la transacción revierte TODO.
      if (leftover.length > 0) {
        throw new Error(
          `Filas que conservan "${NAME}" tras las reglas (rollback): ${leftover.join(", ")}`,
        );
      }
      return rows;
    },
    { timeout: 60000, maxWait: 15000 },
  );

  console.log("Filas actualizadas (transacción única, aplicada):");
  for (const r of report) {
    console.log(`  ✓ ${r.fila} — ${r.reglas} regla(s)${r.nota ? ` — ${r.nota}` : ""}`);
  }

  // Verificación post-commit: cero ocurrencias en versiones, bloques y settings.
  const [vLeft, bLeft, sLeft] = await Promise.all([
    prisma.cmsBlockVersion.count({ where: { body: { contains: NAME } } }),
    prisma.cmsBlock.count({ where: { body: { contains: NAME } } }),
    prisma.siteSetting.count({ where: { value: { contains: NAME } } }),
  ]);
  console.log(`\nVerificación post-commit: versions=${vLeft} blocks=${bLeft} settings=${sLeft}`);
  if (vLeft + bLeft + sLeft !== 0) {
    // PICKUP_CONTACT_NAME ("Lucy Hurtado", contacto operativo de recogida) se deja
    // a propósito: no es una página de información pública. Se reporta aparte.
    const remaining = await prisma.siteSetting.findMany({
      where: { value: { contains: NAME } },
      select: { key: true },
    });
    console.log(`  (restantes intencionales: ${remaining.map((s) => s.key).join(", ") || "ninguna"})`);
  }
  console.log("\n✓ DONE.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
