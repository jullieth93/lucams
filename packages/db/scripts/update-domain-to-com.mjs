/*
 * Migración de dominio en BD: lucamsshop.co → lucamsshop.com (2026-07-20).
 *
 * El dominio adquirido es `lucamsshop.com` (antes el plan citaba `.co`). El contenido
 * PUBLICADO en BD gana sobre los fallbacks de código, así que además del repo hay que
 * reescribir aquí: SiteSetting (correos de contacto/seguridad), CmsBlockVersion.body
 * (las versiones de los textos legales, incluida la publicada) y CmsBlock.body (campo
 * legacy que algunos lectores aún consultan).
 *
 * IDEMPOTENTE: el lookahead `(?!m)` impide convertir `.com` en `.comm`, así que correrlo
 * dos veces no rompe nada.
 *
 * Uso:  pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/update-domain-to-com.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RX = /lucamsshop\.co(?!m)/g;
const hasOld = (s) => typeof s === "string" && /lucamsshop\.co(?!m)/.test(s);
const fix = (s) => (typeof s === "string" ? s.replace(RX, "lucamsshop.com") : s);

async function main() {
  let touched = { settings: 0, versions: 0, blocks: 0 };

  // 1. SiteSetting (CONTACT_EMAIL, SECURITY_EMAIL, …)
  const settings = await prisma.siteSetting.findMany({
    select: { id: true, key: true, value: true },
  });
  for (const s of settings) {
    if (!hasOld(s.value)) continue;
    const next = fix(s.value);
    await prisma.siteSetting.update({ where: { id: s.id }, data: { value: next } });
    console.log(`  setting  ${s.key}: ${s.value} → ${next}`);
    touched.settings++;
  }

  // 2. CmsBlockVersion (incluye la versión publicada, que es la que renderiza)
  const versions = await prisma.cmsBlockVersion.findMany({
    select: { id: true, title: true, body: true, version: true, block: { select: { key: true } } },
  });
  for (const v of versions) {
    if (!hasOld(v.body) && !hasOld(v.title)) continue;
    await prisma.cmsBlockVersion.update({
      where: { id: v.id },
      data: { body: fix(v.body), title: fix(v.title) },
    });
    console.log(`  version  ${v.block?.key ?? "?"} v${v.version}`);
    touched.versions++;
  }

  // 3. CmsBlock.body / title (campo legacy)
  const blocks = await prisma.cmsBlock.findMany({
    select: { id: true, key: true, title: true, body: true },
  });
  for (const b of blocks) {
    if (!hasOld(b.body) && !hasOld(b.title)) continue;
    await prisma.cmsBlock.update({
      where: { id: b.id },
      data: { body: fix(b.body), title: fix(b.title) },
    });
    console.log(`  block    ${b.key}`);
    touched.blocks++;
  }

  // 4. Sello de última actualización de legales (cambió el correo del responsable).
  //    NO se toca la versión de la política de privacidad: un cambio de dominio de
  //    contacto no es un cambio material del tratamiento → no fuerza re-consentimiento.
  const stamp = await prisma.siteSetting.findUnique({ where: { key: "legal.last-updated" } });
  if (stamp) {
    await prisma.siteSetting.update({
      where: { key: "legal.last-updated" },
      data: { value: "2026-07-20" },
    });
    console.log("  setting  legal.last-updated → 2026-07-20");
  }

  console.log(
    `\nListo: ${touched.settings} settings, ${touched.versions} versiones CMS, ${touched.blocks} bloques.`,
  );

  // Verificación final
  const left = [
    ...(await prisma.siteSetting.findMany({ select: { value: true } })).map((x) => x.value),
    ...(await prisma.cmsBlockVersion.findMany({ select: { body: true } })).map((x) => x.body),
    ...(await prisma.cmsBlock.findMany({ select: { body: true } })).map((x) => x.body),
  ].filter(hasOld).length;
  console.log(
    left === 0 ? "Verificado: 0 referencias a lucamsshop.co en BD." : `⚠️ Quedan ${left}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
