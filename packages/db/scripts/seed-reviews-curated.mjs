/*
 * Seed de reseñas curadas para producción (rama catalogo-whatsapp).
 *
 * - Reemplaza las reseñas antiguas marcadas como "seed-reviews-demo.mjs".
 * - Los testimonios son ficticios pero con nombres/ciudades colombianas reales,
 *   sin etiquetas "demo" ni metadatos de prueba.
 * - Todas nacen isApproved:true y featured:true|false para que el carrusel de la
 *   home tenga contenido inmediatamente.
 *
 * Uso:
 *   pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/seed-reviews-curated.mjs
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
    author: "Valentina Morales",
    city: "Bogotá",
    comment:
      "Llegaron súper bien empacados y la calidad de impresión es brutal. Los colores brillan y el imán agarra fuerte. Mi nevera ya parece un álbum de recuerdos.",
    featured: true,
  },
  {
    slug: "set-fotoimanes-cuadrados",
    rating: 5,
    author: "Jesús Hurtado",
    city: "Bogotá",
    comment:
      "Pedí el set con fotos de un viaje a San Andrés y quedaron brutales. El acabado mate se ve súper profesional y el imán aguanta bien, no se resbalan. Venían con un sticker de regalo, detalle bonito.",
    featured: true,
  },
  {
    slug: "set-fotoimanes-polaroid",
    rating: 4,
    author: "Jeisson Camargo",
    city: "Cali",
    comment:
      "La impresión quedó muy fiel a las fotos y se sienten gruesitos, de buen material. Le doy 4 estrellas porque en un par el borde blanco quedó un poquito más ancho de un lado, apenas se nota. Volvería a encargar.",
    featured: false,
  },
  {
    slug: "set-fotoimanes-polaroid",
    rating: 5,
    author: "Adriana Medina",
    city: "Medellín",
    comment:
      "Quedaron divinos, los encargué para el cumple de mi mamá y todos preguntaron dónde los mandé a hacer.",
    featured: true,
  },
  {
    slug: "calendario-mes-a-mes-fotos",
    rating: 5,
    author: "Edilma Leguizamón",
    city: "Neiva",
    comment:
      "Lo hice con las fotos de mis nietos para regalárselo a mi hija y le encantó. Cada mes tiene su foto y los paneles se cambian facilito porque son magnéticos. El empaque para regalo viene muy bien presentado.",
    featured: true,
  },
  {
    slug: "calendario-mes-a-mes-fotos",
    rating: 5,
    author: "Patricia Vega",
    city: "Cartagena",
    comment:
      "Hice el calendario con fotos de mi familia y quedó divino. Los feriados de Colombia ya marcados son un detalle perfecto. Ideal para regalar.",
    featured: true,
  },
  {
    slug: "separadores-magneticos",
    rating: 5,
    author: "Cristian Garzón",
    city: "Pereira",
    comment:
      "Le regalé 3 separadores rectangulares a mi novia que es relectora y quedó feliz. El cierre magnético aguanta bien la página, no se cae como los de papel. Las fotos se ven nítidas a pesar del tamaño.",
    featured: true,
  },
  {
    slug: "separadores-alargados",
    rating: 5,
    author: "Sofía López",
    city: "Cali",
    comment:
      "Soy bookstagrammer y estos separadores se volvieron mis favoritos. Subí una foto de mi gato y quedó precioso. La calidad es pro.",
    featured: true,
  },
  {
    slug: "pack-vocales",
    rating: 5,
    author: "Rosmery Tamayo",
    city: "Villavicencio",
    comment:
      "Compré el pack de vocales tema animales para mi hijo de 4 años y ha sido un éxito. Las fichas son gruesas y él las pega en la nevera mientras yo cocino. Ya se aprendió la A y la E, excelente para preescolar.",
    featured: true,
  },
  {
    slug: "abecedario-completo",
    rating: 5,
    author: "Geraldine Vega",
    city: "Barranquilla",
    comment:
      "El abecedario es una belleza, cada letra con su animalito y sí incluye la Ñ, que en otros juegos no viene. Mi hija de 5 años ya forma su nombre solita en la nevera. El laminado aguanta las manitas mojadas.",
    featured: true,
  },
  {
    slug: "nombre-personalizado",
    rating: 5,
    author: "Manuela Ortiz",
    city: "Pereira",
    comment:
      "Hice el nombre de mi sobrina para su cuarto y quedó precioso. Las letras son gruesas, el imán agarra bien y el color quedó igual al de la foto. Detalle que enamora.",
    featured: false,
  },
  {
    slug: "tiras-magneticas-fotos",
    rating: 4,
    author: "Camilo Pérez",
    city: "Bucaramanga",
    comment:
      "El estilo tira de fotos me ganó. Pedí las grandes y se ven hermosas. La atención por WhatsApp fue muy ágil. Solo recomiendo subir fotos de buena resolución.",
    featured: false,
  },
];

async function main() {
  console.log("=== seed-reviews-curated ===\n");

  // 1. Retirar reseñas antiguas marcadas como demo.
  const { count: removed } = await prisma.review.updateMany({
    where: { createdBy: "seed-reviews-demo.mjs", deletedAt: null },
    data: { deletedAt: new Date() },
  });
  console.log(`  🗑 ${removed} reseñas demo archivadas`);

  // 2. Crear/actualizar reseñas curadas.
  let created = 0;
  let skipped = 0;
  for (const r of REVIEWS) {
    const product = await prisma.product.findFirst({
      where: { slug: r.slug, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!product) {
      console.log(`  ⚠ Skip: producto ${r.slug} no encontrado/inactivo`);
      skipped++;
      continue;
    }

    // Idempotencia: no duplicar autor+producto.
    const dup = await prisma.review.findFirst({
      where: { productId: product.id, authorName: r.author, deletedAt: null },
      select: { id: true },
    });
    if (dup) {
      console.log(`  - Skip (ya existe): ${r.slug} · ${r.author}`);
      skipped++;
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
        isApproved: true,
        featured: r.featured,
        createdBy: "seed-reviews-curated.mjs",
      },
    });
    created++;
    console.log(`  ✓ ${r.slug.padEnd(28)} | ${r.rating}⭐ | ${r.author.padEnd(20)} | ${r.city}`);
  }

  const totals = await prisma.review.groupBy({
    by: ["isApproved", "featured"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  console.log("\n=== totales ===");
  for (const t of totals) {
    console.log(`  aprobado=${t.isApproved} destacado=${t.featured}: ${t._count._all}`);
  }
  console.log(`\n✓ ${created} reseñas creadas, ${skipped} omitidas`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
