/*
 * Seed 10 reseñas demo (verificadas + variadas) sobre los 9 productos activos.
 *
 * Lucy puede:
 *   - Borrarlas todas con: DELETE FROM "Review" WHERE comment LIKE '%[DEMO]%'
 *   - O dejarlas y editarlas desde /admin/resenas
 *   - O reemplazarlas con reseñas reales cuando lleguen
 *
 * Marcadas con [DEMO] al final del comentario para facilitar identificación.
 * `authorName` y `authorCity` son ficticios; usar nombres cortos comunes
 * para que se vean realistas.
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
      "Encantada! Los imanes llegaron en 2 días, súper bien empacados. La calidad de impresión es brutal, los colores brillan. Mi nevera ya parece un álbum de fotos 💜 [DEMO]",
    featured: true,
  },
  {
    slug: "set-fotoimanes-circulares",
    rating: 5,
    author: "Diana R.",
    city: "Medellín",
    comment:
      "Hice 12 imanes para regalarle a mi mamá por su cumpleaños y lloró cuando los vio. La forma circular les da un toque distinto. 100% recomendados. [DEMO]",
    featured: true,
  },
  {
    slug: "set-fotoimanes-polaroid",
    rating: 5,
    author: "Camilo P.",
    city: "Cali",
    comment:
      "El estilo polaroid me ganó. Pedí los grandes 7x9 y se ven hermosos. Atención por WhatsApp es muy ágil. [DEMO]",
    featured: false,
  },
  {
    slug: "set-fotoimanes-corazon",
    rating: 4,
    author: "Mariana T.",
    city: "Bucaramanga",
    comment:
      "Los corazones son hermosos, regalo de aniversario perfecto. Le quito una estrellita porque tardó un día más de lo previsto en llegar pero por lo demás impecable. [DEMO]",
    featured: false,
  },
  {
    slug: "abecedario-magnetico-espanol",
    rating: 5,
    author: "Laura G.",
    city: "Barranquilla",
    comment:
      "Mi hija de 4 años está fascinada. Aprende las letras señalando los animalitos. Súper resistentes, las pega y despega 100 veces al día y siguen como nuevas. [DEMO]",
    featured: true,
  },
  {
    slug: "abecedario-magnetico-espanol",
    rating: 5,
    author: "Andrea S.",
    city: "Pereira",
    comment:
      "Pedí el nombre personalizado para mi sobrino, llegó en 3 días y los diseños son demasiado tiernos. Lo recomendé a todas mis amigas. [DEMO]",
    featured: false,
  },
  {
    slug: "separadores-personalizables",
    rating: 5,
    author: "Sofía L.",
    city: "Bogotá",
    comment:
      "Soy bookstagrammer y estos separadores se volvieron mis favoritos. Subí una foto de mi gato y quedó precioso. Calidad pro. [DEMO]",
    featured: true,
  },
  {
    slug: "separadores-predisenados",
    rating: 4,
    author: "Juan D.",
    city: "Manizales",
    comment:
      "Lindísimos los diseños. El pack de 5 me llegó completo y vienen bien protegidos. Solo le falta más variedad de paisajes naturales. [DEMO]",
    featured: false,
  },
  {
    slug: "calendario-mes-a-mes-fotos",
    rating: 5,
    author: "Patricia V.",
    city: "Cartagena",
    comment:
      "Hice el calendario con fotos de mi familia y quedó precioso. Regalo perfecto para la abuela. Los feriados de Colombia ya marcados, ¡detalle perfecto! [DEMO]",
    featured: true,
  },
  {
    slug: "set-fotoimanes-cuadrados",
    rating: 5,
    author: "Felipe O.",
    city: "Bogotá",
    comment:
      "Compré 2 sets: uno para mí y otro para mi novia. El empaque viene con sticker kawaii adentro, muy cool. Volvería a comprar. [DEMO]",
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
    // Evitar duplicados: si ya existe una reseña [DEMO] del mismo author + producto, skip
    const dup = await prisma.review.findFirst({
      where: { productId: product.id, authorName: r.author, comment: { contains: "[DEMO]" } },
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
      },
    });
    created++;
    console.log(`  ✓ ${r.slug.padEnd(40)} | ${r.rating}⭐ | ${r.author.padEnd(15)} | ${r.featured ? "FEAT" : "normal"}`);
  }
  console.log(`\n✓ ${created} reseñas creadas. Total reseñas en DB:`);
  const total = await prisma.review.count({ where: { deletedAt: null } });
  console.log(`  Total: ${total} reseñas`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
