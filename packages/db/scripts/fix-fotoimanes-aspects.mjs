/*
 * ADR-057 Fase C — Fix de aspecto de los fotoimanes para que el editor rutee a la plantilla
 * correcta (el filtro por aspecto es |a - target| <= 0.05).
 *
 *   - Polaroid: su plantilla product-specific es 400×580 (0.69), pero el schema decía 6:8 (0.75)
 *     → el filtro la EXCLUÍA y el editor quedaba SIN plantilla ("no hay plantillas") = roto.
 *     Fix: aspectRatio = "400:580" (matchea la plantilla; el tamaño físico sigue en sizeCm).
 *   - Corazón: sin aspectRatio (null) → filtro no determinista. Es 6×6 → aspectRatio "1:1".
 *
 * Idempotente. Uso: DATABASE_URL=$DIRECT_URL node scripts/fix-fotoimanes-aspects.mjs
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function setAspect(slug, aspectRatio) {
  const prod = await prisma.product.findFirst({ where: { slug, deletedAt: null }, select: { id: true, personalizationSchema: true } });
  if (!prod) {
    console.log(`  ! ${slug} no encontrado`);
    return;
  }
  const sc = { ...((prod.personalizationSchema && typeof prod.personalizationSchema === "object" ? prod.personalizationSchema : {})), aspectRatio };
  await prisma.product.update({ where: { id: prod.id }, data: { personalizationSchema: sc } });
  console.log(`  ~ ${slug} aspectRatio → ${aspectRatio}`);
}

async function main() {
  console.log("Fix aspectos fotoimanes:");
  // Alinear Polaroid a su plantilla (400×580).
  const tpl = await prisma.personalizationTemplate.findFirst({ where: { slug: "photo-pack-polaroid-instagram" }, select: { canvasData: true } });
  const st = tpl?.canvasData?.stage;
  if (st?.width && st?.height) await setAspect("set-fotoimanes-polaroid", `${st.width}:${st.height}`);
  await setAspect("set-fotoimanes-corazon", "1:1");

  // Corregir VOSEO en el texto de la plantilla global (memoria: es-CO tuteo, no voseo).
  const libre = await prisma.personalizationTemplate.findFirst({ where: { slug: "libre-photo-pack" }, select: { id: true, canvasData: true } });
  if (libre) {
    const cd = libre.canvasData;
    let changed = false;
    for (const l of cd.layers || []) {
      if (l.type === "text" && typeof l.text === "string" && /Escribí/.test(l.text)) {
        l.text = l.text.replace(/Escribí/g, "Escribe");
        changed = true;
      }
    }
    if (changed) {
      await prisma.personalizationTemplate.update({ where: { id: libre.id }, data: { canvasData: cd } });
      console.log("  ~ libre-photo-pack: voseo corregido (Escribí → Escribe)");
    }
  }

  // Cuadrado (rectangle, allowText:false) usa libre-photo-pack (con texto) → mostraría texto no
  // deseado. Plantilla dedicada SIN texto (product-specific → gana el filtro para ese producto).
  const cuad = await prisma.product.findFirst({ where: { slug: "set-fotoimanes-cuadrados", deletedAt: null }, select: { id: true } });
  if (cuad) {
    const canvasData = {
      version: 1,
      stage: { width: 600, height: 600, dpiPreview: 90, dpiProduction: 300 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        { id: "photo", type: "image-placeholder", x: 0, y: 0, width: 600, height: 600, cornerRadius: 0 },
      ],
    };
    const found = await prisma.personalizationTemplate.findFirst({ where: { slug: "foto-cuadrado-simple" } });
    const tdata = { productId: cuad.id, kind: "PHOTO_PACK", name: "Cuadrado simple", description: "Fotoimán cuadrado — tu foto a todo el imán.", previewUrl: "/brand/lucams-logo.png", canvasData, isActive: true, order: -10, deletedAt: null };
    if (found) {
      await prisma.personalizationTemplate.update({ where: { id: found.id }, data: tdata });
      console.log("  ~ plantilla foto-cuadrado-simple");
    } else {
      await prisma.personalizationTemplate.create({ data: { slug: "foto-cuadrado-simple", ...tdata } });
      console.log("  + plantilla foto-cuadrado-simple (sin texto)");
    }
  }
  console.log("✓ DONE.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
