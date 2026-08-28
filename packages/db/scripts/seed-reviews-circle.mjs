/*
 * Reseñas en BORRADOR del círculo de Lucy (2026-07-22).
 *
 * Contexto: Lucy pidió reseñas de personas reales de su círculo; nos autorizó a
 * redactar los textos y ella los revisa/edita/aprueba después en /admin/resenas.
 * Por eso TODAS nacen con isApproved:false (pendientes de moderación) y featured:false.
 * El storefront solo muestra isApproved:true, así que nada se publica sin su visto bueno.
 *
 * Patrón tomado de scripts/seed-reviews-demo.mjs: customerId:null + authorName/authorCity
 * libres (el modelo Review no exige customer). createdBy queda marcado para trazabilidad.
 * SIN etiquetas [DEMO]: estos textos son los que Lucy aprobará como definitivos.
 *
 * Idempotente: si ya existe CUALQUIER reseña (viva o archivada) con ese
 * autor+producto, no duplica ni resucita — la deja como está.
 *
 * Uso:
 *   node scripts/seed-reviews-circle.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const REVIEWS = [
  {
    slug: "set-fotoimanes-cuadrados",
    rating: 5,
    author: "Jesus Hurtado",
    city: "Bogotá",
    comment:
      "Pedí el set de 9 en 5×5 con fotos de un viaje a San Andrés y quedaron brutales. El acabado mate se ve súper profesional y el imán aguanta bien en la nevera, no se resbalan. Venían con un sticker kawaii de regalo, detalle bonito.",
  },
  {
    slug: "set-fotoimanes-cuadrados",
    rating: 5,
    author: "Adriana Medina",
    city: "Medellín",
    comment:
      "Quedaron divinos, los encargué para el cumple de mi mamá y todos preguntaron dónde los mandé a hacer.",
  },
  {
    slug: "set-fotoimanes-polaroid",
    rating: 4,
    author: "Jeisson Camargo",
    city: "Cali",
    comment:
      "La impresión quedó muy fiel a las fotos y se sienten gruesitos, de buen material. Le doy 4 estrellas porque en un par de imanes del set de 12 el borde blanco quedó un poquito más ancho de un lado, apenas se nota pero soy detallista. Volvería a encargar.",
  },
  {
    slug: "calendario-mes-a-mes-fotos",
    rating: 5,
    author: "Edilma Leguizamon",
    city: "Neiva",
    comment:
      "Lo hice con las fotos de mis nietos para regalárselo a mi hija y le encantó. Cada mes tiene su foto y los paneles se cambian facilito porque son magnéticos. El empaque para regalo viene muy bien presentado.",
  },
  {
    slug: "separadores-libros",
    rating: 5,
    author: "Cristian Garzon",
    city: "Pereira",
    comment:
      "Le regalé 3 separadores rectangulares a mi novia que es relectora y quedó feliz. El cierre magnético aguanta bien la página, no se cae como los de papel. Las fotos se ven nítidas a pesar del tamaño.",
  },
  {
    slug: "pack-vocales",
    rating: 5,
    author: "Rosmery Tamayo",
    city: "Villavicencio",
    comment:
      "Compré el pack de vocales tema animales para mi hijo de 4 años y ha sido un éxito. Las fichas son gruesas y él las pega en la nevera mientras yo cocino. Ya se aprendió la A y la E, excelente para preescolar.",
  },
  {
    slug: "abecedario-completo",
    rating: 5,
    author: "Geraldine Vega",
    city: "Barranquilla",
    comment:
      "El abecedario es una belleza, cada letra con su animalito kawaii y sí incluye la Ñ, que en otros juegos no viene. Mi hija de 5 años ya forma su nombre solita en la nevera. El laminado aguanta las manitas mojadas.",
  },
];

async function main() {
  console.log("=== seed-reviews-circle (borradores isApproved:false) ===\n");
  let created = 0;
  for (const r of REVIEWS) {
    const product = await prisma.product.findFirst({
      where: { slug: r.slug, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!product) {
      console.log(`  ⚠ Skip: producto ${r.slug} no encontrado/inactivo`);
      continue;
    }
    // Idempotencia estricta: cualquier reseña previa del mismo autor+producto
    // (viva o archivada) bloquea el insert — no duplicar ni resucitar.
    const dup = await prisma.review.findFirst({
      where: { productId: product.id, authorName: r.author },
      select: { id: true, isApproved: true, deletedAt: true },
    });
    if (dup) {
      console.log(
        `  - Skip (ya existe ${dup.deletedAt ? "archivada" : dup.isApproved ? "aprobada" : "pendiente"}): ${r.slug} · ${r.author}`,
      );
      continue;
    }
    await prisma.review.create({
      data: {
        productId: product.id,
        rating: r.rating,
        comment: r.comment,
        images: [],
        authorName: r.author,
        authorCity: r.city,
        isApproved: false, // borrador — Lucy revisa/aprueba en /admin/resenas
        featured: false,
        createdBy: "seed-reviews-circle.mjs",
      },
    });
    created++;
    console.log(`  ✓ ${r.slug.padEnd(28)} | ${r.rating}⭐ | ${r.author.padEnd(20)} | ${r.city}`);
  }
  const pending = await prisma.review.count({ where: { isApproved: false, deletedAt: null } });
  console.log(
    `\n✓ ${created} reseñas creadas en borrador. Pendientes de moderación totales: ${pending}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
