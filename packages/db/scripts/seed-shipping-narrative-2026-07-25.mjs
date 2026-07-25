/*
 * Corrige la narrativa de tiempos de entrega en el contenido VIVO (Lucy, 2026-07-25).
 *
 * El sitio prometía que la compra "llega en máx. 3 días". Con las transportadoras colombianas y las
 * zonas apartadas eso no se puede sostener, y prometer una fecha de entrega que no controlas es
 * exponerse por publicidad engañosa (Ley 1480 de 2011, arts. 29 y 30).
 *
 * El mensaje correcto separa lo propio de lo ajeno: el compromiso es el DESPACHO —máximo 2 días
 * hábiles, que sí depende de nosotros— y el tránsito es un ESTIMADO de la transportadora, variable
 * según la ciudad de destino.
 *
 * Por qué hace falta este script y no basta con cambiar el código: el `fallback` de `<CmsText>` solo
 * se usa cuando NO hay fila publicada en `CmsBlock`. `home.howitworks.step3.description` sí la tiene,
 * así que la fila gana y el cambio en el código no se vería.
 *
 * ACCIÓN HUMANA REQUERIDA al terminar: entrar al admin y pulsar «Actualizar caché de contenido».
 * Escribir en la base no invalida el caché de Next; hasta que se purgue, el sitio sigue sirviendo lo
 * anterior.
 */

import { PrismaClient } from "@prisma/client";

const ACTOR = "seed-shipping-narrative-2026-07-25";
const prisma = new PrismaClient();

/** Bloques de contenido cuyo texto promete un plazo de ENTREGA que no controlamos. */
const BLOQUES = [
  {
    key: "home.howitworks.step3.description",
    body:
      "Lo producimos a mano y lo despachamos en máximo 2 días hábiles. El tiempo de entrega depende " +
      "de la transportadora y de tu ciudad. El pago y el envío se acuerdan por WhatsApp — " +
      "contraentrega disponible.",
  },
];

/**
 * Ajustes cuyo valor alimenta copy de cara al cliente. `MANUFACTURING_DAYS_RANGE` decía "5-7 días
 * hábiles", que además no coincidía ni con el seed ("4-9") ni con lo que decía la home ("máx 3").
 */
const AJUSTES = [{ key: "MANUFACTURING_DAYS_RANGE", value: "2 días hábiles (hasta el despacho)" }];

console.log("=== narrativa de envíos: despacho ≤ 2 días hábiles + tránsito de la transportadora ===\n");

/** Publica una versión nueva de un CmsBlock con `body`, sincronizando block.body. */
async function publishBlock(key, body, format = "TEXT") {
  const block = await prisma.cmsBlock.findUnique({
    where: { key },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!block) {
    console.log(`  ⚠ ${key} — no existe en la base, se omite`);
    return "notfound";
  }
  if (block.body === body) {
    console.log(`  = ${key} — ya estaba al día`);
    return "unchanged";
  }
  const nextVersion = (block.versions[0]?.version ?? 0) + 1;
  await prisma.$transaction(async (tx) => {
    const v = await tx.cmsBlockVersion.create({
      data: {
        blockId: block.id,
        version: nextVersion,
        title: block.title,
        body,
        format: format ?? block.format,
        metadata: block.metadata ?? {},
        publishedAt: new Date(),
        createdBy: ACTOR,
      },
    });
    await tx.cmsBlock.update({
      where: { id: block.id },
      data: {
        body,
        format: format ?? block.format,
        isPublished: true,
        publishedVersionId: v.id,
        updatedBy: ACTOR,
      },
    });
  });
  console.log(`  ✓ ${key} — versión ${nextVersion} publicada`);
  return "updated";
}

let cambios = 0;

for (const b of BLOQUES) {
  // Conserva el formato que ya tenía el bloque; estos son textos planos, no markdown.
  const actual = await prisma.cmsBlock.findUnique({
    where: { key: b.key },
    select: { format: true },
  });
  if ((await publishBlock(b.key, b.body, actual?.format)) === "updated") cambios++;
}

for (const a of AJUSTES) {
  const s = await prisma.siteSetting.findUnique({ where: { key: a.key } });
  if (!s) {
    console.log(`  ⚠ ${a.key} — no existe, se omite`);
    continue;
  }
  if (s.value === a.value) {
    console.log(`  = ${a.key} — ya estaba al día`);
    continue;
  }
  await prisma.siteSetting.update({ where: { key: a.key }, data: { value: a.value } });
  console.log(`  ✓ ${a.key} — ${JSON.stringify(s.value)} → ${JSON.stringify(a.value)}`);
  cambios++;
}

console.log(`\n${cambios} cambio(s).`);
console.log("ACCIÓN HUMANA REQUERIDA: admin → «Actualizar caché de contenido», o no se verá.");

await prisma.$disconnect();
