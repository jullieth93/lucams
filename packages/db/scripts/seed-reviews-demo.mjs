/*
 * Seed 5-8 reseñas de ejemplo para el carrusel de la home.
 *
 * Estas reseñas son meramente ilustrativas para ambientes de desarrollo/demos.
 * En producción el carrusel muestra las reseñas reales aprobadas por Lucams.
 *
 * Para borrarlas: DELETE FROM "Review" WHERE createdBy = 'seed-reviews-demo.mjs'.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REVIEWS = [
  {
    slug: "set-fotoimanes-cuadrados",
    rating: 5,
    author: "Valentina M.",
    city: "Bogotá",
    comment:
      "Llegaron súper bien empacados y la calidad de impresión es brutal. Los colores brillan y el imán agarra fuerte. Mi nevera ya parece un álbum de recuerdos 💜",
    featured: true,
  },
  {
    slug: "set-fotoimanes-corazon",
    rating: 5,
    author: "Diana R.",
    city: "Medellín",
    comment:
      "Hice un set para regalarle a mi mamá por su cumpleaños y lloró cuando los vio. El acabado mate les da un toque muy bonito. 100% recomendados.",
    featured: true,
  },
  {
    slug: "separadores-personalizables",
    rating: 5,
    author: "Sofía L.",
    city: "Cali",
    comment:
      "Soy bookstagrammer y estos separadores se volvieron mis favoritos. Subí una foto de mi gato y quedó precioso. La calidad es pro.",
    featured: true,
  },
  {
    slug: "calendario-mes-a-mes-fotos",
    rating: 5,
    author: "Patricia V.",
    city: "Cartagena",
    comment:
      "Hice el calendario con fotos de mi familia y quedó divino. Los feriados de Colombia ya marcados son un detalle perfecto. Ideal para regalar.",
    featured: true,
  },
  {
    slug: "set-fotoimanes-polaroid",
    rating: 4,
    author: "Camilo P.",
    city: "Bucaramanga",
    comment:
      "El estilo polaroid me ganó. Pedí los grandes y se ven hermosos. La atención por WhatsApp fue muy ágil. Solo recomiendo subir fotos de buena resolución.",
    featured: false,
  },
  {
    slug: "abecedario-magnetico-espanol",
    rating: 5,
    author: "Laura G.",
    city: "Barranquilla",
    comment:
      "Mi hija de 4 años está fascinada. Aprende las letras señalando los animalitos. Son resistentes: los pega y despega todo el día y siguen como nuevas.",
    featured: true,
  },
  {
    slug: "big-box-dia-mama",
    rating: 5,
    author: "Manuela O.",
    city: "Pereira",
    comment:
      "Detalle súper completo, mi suegra quedó encantada. El empaque ya es un regalo en sí mismo. Llegó perfecto y en 3 días.",
    featured: false,
  },
  {
    slug: "set-12-fotoimanes-cuadrados",
    rating: 4,
    author: "Juan D.",
    city: "Manizales",
    comment:
      "Minimalistas y con calidad top. El pack me llegó completo y bien protegido. Me hubiera gustado un poco más de variedad de diseños base.",
    featured: false,
  },
];

async function main() {
  let created = 0;
  for (const r of REVIEWS) {
    const product = await prisma.product.findFirst({
      where: { slug: r.slug, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      console.log(`  ⚠ Skip: producto ${r.slug} no encontrado/activo`);
      continue;
    }
    // Evitar duplicados: una sola reseña por autor + producto.
    const dup = await prisma.review.findFirst({
      where: { productId: product.id, authorName: r.author, createdBy: "seed-reviews-demo.mjs" },
    });
    if (dup) {
      console.log(`  - Skip (ya existe): ${r.slug} · ${r.author}`);
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
        createdBy: "seed-reviews-demo.mjs",
      },
    });
    created++;
    console.log(
      `  ✓ ${r.slug.padEnd(40)} | ${r.rating}⭐ | ${r.author.padEnd(15)} | ${r.featured ? "FEAT" : "normal"}`,
    );
  }
  console.log(`\n✓ ${created} reseñas creadas. Total reseñas en DB:`);
  const total = await prisma.review.count({ where: { deletedAt: null } });
  console.log(`  Total: ${total} reseñas`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
