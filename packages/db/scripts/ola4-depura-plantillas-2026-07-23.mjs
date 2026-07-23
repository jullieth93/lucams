/*
 * Ola 4 (Lucy 2026-07-23) — DEPURACIÓN de PersonalizationTemplate.
 *
 * Inventario completo (14 plantillas con deletedAt null) y decisión por slug.
 * REGLA: archivar (isActive=false), NUNCA borrar — los diseños existentes guardan
 * su propio snapshot de canvasData y su templateId sigue resolviendo.
 *
 * ── SE MANTIENEN ACTIVAS (5) ────────────────────────────────────────────────
 *   photo-pack-polaroid-clasica    EN USO (29 diseños) — Polaroid Clásica, aprobada.
 *   photo-pack-polaroid-instagram  EN USO (100 diseños) — Polaroid Instagram, aprobada.
 *   photo-strip-3-fotos            EN USO (24 diseños) — la tira photobooth.
 *   separador-cuadrado-cara        EN USO (41 diseños) — cara de las variantes 4×4.2.
 *   separador-rectangular-cara     USABLE (0 diseños) — ÚNICA cara de las variantes
 *                                  rectangulares 6×2; sin ella el estudio rectangular
 *                                  caería a un template por defecto erróneo.
 *
 * ── REASIGNADAS + RENOMBRADAS (2) ───────────────────────────────────────────
 *   libre-photo-pack (110 diseños) → producto set-fotoimanes-cuadrados, nombre
 *     "Foto simple". Era GLOBAL y su aspect 1:1 la colaba como 2ª plantilla en
 *     separadores-cuadrados (bug T6: "aparecen 2 plantillas") y en tiras. Es la
 *     plantilla de-facto de los Cuadrados 1:1 → pasa a ser PROPIA del producto.
 *   libre-calendar-photo-month (100 diseños) → producto calendario-mes-a-mes-fotos,
 *     nombre "Calendario mes a mes". Lucy: "Personalización Libre" no va en el
 *     calendario — el calendario solo tiene sus plantillas propias. Reasignarla
 *     conserva el linkage de sus 100 diseños.
 *
 * ── ARCHIVADAS (isActive=false) (7) ─────────────────────────────────────────
 *   foto-rectangular-simple  (33 diseños) — NO USABLE: su stage es 3:4 (600×800) y
 *     todas las variantes activas de Cuadrados son 1:1; el filtro de aspect ya la
 *     ocultaba del estudio (muerta). Las variantes 3:4 para las que servía están
 *     inactivas.
 *   libre-photo-grid         (0) — sin producto activo del kind PHOTO_GRID.
 *   libre-calendar-photo-hero (0) — sin producto activo del kind CALENDAR_PHOTO_HERO.
 *   libre-event-favor        (0) — sin producto activo del kind EVENT_FAVOR.
 *   libre-business-logo      (0) — sin producto activo del kind BUSINESS_LOGO.
 *   libre-custom-decor       (0) — sin producto activo del kind CUSTOM_DECOR.
 *   libre-text-only          (5 diseños) — INALCANZABLE: el producto TEXT_ONLY
 *     (nombre-personalizado) usa el NameEditor (superficie "name"), que no carga
 *     plantillas.
 *
 * Idempotente. Uso:
 *   pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/ola4-depura-plantillas-2026-07-23.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BY = "system:ola4-depura-2026-07-23";

const ARCHIVE = [
  "foto-rectangular-simple",
  "libre-photo-grid",
  "libre-calendar-photo-hero",
  "libre-event-favor",
  "libre-business-logo",
  "libre-custom-decor",
  "libre-text-only",
];

const REASSIGN = [
  {
    slug: "libre-photo-pack",
    productSlug: "set-fotoimanes-cuadrados",
    name: "Foto simple",
  },
  {
    slug: "libre-calendar-photo-month",
    productSlug: "calendario-mes-a-mes-fotos",
    name: "Calendario mes a mes",
  },
];

async function main() {
  let archived = 0;
  let reassigned = 0;

  for (const slug of ARCHIVE) {
    const tpl = await prisma.personalizationTemplate.findUnique({ where: { slug } });
    if (!tpl) {
      console.log(`  (skip) ${slug}: no existe`);
      continue;
    }
    if (!tpl.isActive) {
      console.log(`  (skip) ${slug}: ya estaba archivada`);
      continue;
    }
    await prisma.personalizationTemplate.update({
      where: { slug },
      data: { isActive: false, updatedBy: BY },
    });
    archived++;
    console.log(`  ⛔ archivada: ${slug}`);
  }

  for (const r of REASSIGN) {
    const product = await prisma.product.findUnique({
      where: { slug: r.productSlug },
      select: { id: true },
    });
    if (!product) throw new Error(`Producto no encontrado: ${r.productSlug}`);
    const tpl = await prisma.personalizationTemplate.findUnique({ where: { slug: r.slug } });
    if (!tpl) throw new Error(`Plantilla no encontrada: ${r.slug}`);
    const dirty = tpl.productId !== product.id || tpl.name !== r.name || tpl.order !== 1;
    if (!dirty) {
      console.log(`  (skip) ${r.slug}: ya reasignada`);
      continue;
    }
    await prisma.personalizationTemplate.update({
      where: { slug: r.slug },
      data: { productId: product.id, name: r.name, order: 1, updatedBy: BY },
    });
    reassigned++;
    console.log(`  → reasignada: ${r.slug} → ${r.productSlug}, nombre "${r.name}"`);
  }

  // Estado final (verificación)
  const final = await prisma.personalizationTemplate.findMany({
    where: { deletedAt: null },
    select: { slug: true, isActive: true, product: { select: { slug: true } } },
    orderBy: { slug: "asc" },
  });
  console.log("\nEstado final de plantillas (deletedAt null):");
  for (const t of final) {
    console.log(
      `  ${t.isActive ? "ACTIVA " : "archivada"}  ${t.slug.padEnd(36)} ${t.product?.slug ?? "GLOBAL"}`,
    );
  }
  console.log(`\nListo: ${archived} archivadas, ${reassigned} reasignadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
