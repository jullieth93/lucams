/*
 * Seed de RESEÑAS DEMO (26, ficticias, pre-aprobadas) — SOLO ambientes de
 * desarrollo/pruebas. N-06 (2026-09-12): extraídas de seed-products.mjs,
 * que las sembraba en cada corrida y las RESUCITABA aprobadas aunque el admin
 * las hubiera desaprobado o borrado (CF-09).
 *
 * Reglas:
 *   - DRY-RUN por defecto; `--apply` ejecuta. Env-guard fail-closed: solo
 *     corre contra local/STG (PRD exigiría el bypass deliberado documentado
 *     en lib/env-guard.mjs — reseñas ficticias aprobadas en PRD serían
 *     publicidad engañosa, Ley 1480).
 *   - Marca `createdBy: "system:seed-demo-reviews"` en cada reseña creada:
 *     permite barrerlas selectivamente en el futuro (saneamiento N-27).
 *   - SIN resurrección: una reseña ya existente (misma tripleta
 *     producto+autor+comentario, incluidas las desaprobadas/borradas por el
 *     admin) NO se toca — la moderación es del admin.
 *
 * Uso:
 *   node scripts/seed-demo-reviews.mjs            # DRY-RUN
 *   node scripts/seed-demo-reviews.mjs --apply    # siembra las que falten
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: reseñas ficticias aprobadas — bloquea PRD/remotos no STG.
assertDestructiveAllowed("seed-demo-reviews.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const CREATED_BY = "system:seed-demo-reviews";

console.log(`=== seed-demo-reviews (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

// 26 reseñas distribuidas: 3-5 en productos featured, 1-2 en otros,
// algunos sin reseñas (mostrar empty state). Snapshot de authorName +
// authorCity para mostrar en UI sin tener Customer real.

const reviewsData = [
  // featured: set-6-fotoimanes-polaroid-grande (5 reseñas)
  {
    productSlug: "set-6-fotoimanes-polaroid-grande",
    rating: 5,
    comment:
      "¡Llegaron preciosos! La calidad de impresión es brutal y los imanes agarran fuerte. Mi nevera está ahora llena de recuerdos del viaje a Cartagena.",
    authorName: "María C.",
    authorCity: "Bogotá",
    featured: true,
    isApproved: true,
  },
  {
    productSlug: "set-6-fotoimanes-polaroid-grande",
    rating: 5,
    comment:
      "Personalización súper fácil y llegó muy bien empacado. Vino con un empaque kawaii precioso, parece regalo de marca grande.",
    authorName: "Ana S.",
    authorCity: "Medellín",
    featured: true,
    isApproved: true,
  },
  {
    productSlug: "set-6-fotoimanes-polaroid-grande",
    rating: 5,
    comment:
      "Lo regalé a mi mamá y lloró de la emoción. Las fotos de la familia perfectas, los colores vibrantes. 10/10.",
    authorName: "Daniela R.",
    authorCity: "Cali",
    isApproved: true,
  },
  {
    productSlug: "set-6-fotoimanes-polaroid-grande",
    rating: 4,
    comment:
      "Calidad excelente. El único detalle es que el empaque exterior llegó un poco golpeado pero los imanes intactos. Recomendados.",
    authorName: "Carolina P.",
    authorCity: "Barranquilla",
    isApproved: true,
  },
  {
    productSlug: "set-6-fotoimanes-polaroid-grande",
    rating: 5,
    comment: "Compré 3 sets para regalar a mis hermanas. Todas felices. Volveré por más.",
    authorName: "Luisa M.",
    authorCity: "Bucaramanga",
    isApproved: true,
  },

  // featured: set-fotoimanes-corazon
  {
    productSlug: "set-fotoimanes-corazon",
    rating: 5,
    comment: "Regalo de aniversario perfecto. Mi novio quedó enamorado.",
    authorName: "Sofía V.",
    authorCity: "Pereira",
    featured: true,
    isApproved: true,
  },
  {
    productSlug: "set-fotoimanes-corazon",
    rating: 5,
    comment: "Adorables. Los corazones tienen un acabado mate súper bonito.",
    authorName: "Valentina G.",
    authorCity: "Manizales",
    isApproved: true,
  },

  // featured: recuerdos-matrimonio
  {
    productSlug: "recuerdos-matrimonio",
    rating: 5,
    comment: "Los entregamos en nuestra boda y los invitados los aman. Calidad insuperable.",
    authorName: "Andrés & Laura",
    authorCity: "Cartagena",
    featured: true,
    isApproved: true,
  },
  {
    productSlug: "recuerdos-matrimonio",
    rating: 5,
    comment:
      "Lucy nos asesoró por WhatsApp con el diseño, súper paciente. Quedaron divinos y llegaron muy bien empacados.",
    authorName: "Pablo H.",
    authorCity: "Bogotá",
    isApproved: true,
  },
  {
    productSlug: "recuerdos-matrimonio",
    rating: 4,
    comment: "Hermosos. Sugerencia: tener opción de varios diseños base para elegir.",
    authorName: "Camila T.",
    authorCity: "Medellín",
    isApproved: true,
  },

  // featured: calendario-mes-a-mes-fotos
  {
    productSlug: "calendario-mes-a-mes-fotos",
    rating: 5,
    comment:
      "Lo mejor para el escritorio. Cambio el imán cada mes y siempre veo una foto distinta. Lo amo.",
    authorName: "Juan D.",
    authorCity: "Bogotá",
    featured: true,
    isApproved: true,
  },
  {
    productSlug: "calendario-mes-a-mes-fotos",
    rating: 5,
    comment: "Regalo de Navidad para mi familia, todos lo aman. Volveré el próximo año.",
    authorName: "Patricia M.",
    authorCity: "Ibagué",
    isApproved: true,
  },
  {
    productSlug: "calendario-mes-a-mes-fotos",
    rating: 5,
    comment: "La idea de cambiar foto cada mes es genial. Súper original.",
    authorName: "Rocío F.",
    authorCity: "Cali",
    isApproved: true,
  },

  // featured: big-box-dia-mama
  {
    productSlug: "big-box-dia-mama",
    rating: 5,
    comment: "Mi mamá lloró. Vale cada peso. El empaque ya es regalo en sí mismo.",
    authorName: "Laura B.",
    authorCity: "Bogotá",
    featured: true,
    isApproved: true,
  },
  {
    productSlug: "big-box-dia-mama",
    rating: 5,
    comment: "Detalle súper completo, mi suegra encantada. Llegó perfecto.",
    authorName: "Manuela O.",
    authorCity: "Medellín",
    isApproved: true,
  },
  {
    productSlug: "big-box-dia-mama",
    rating: 5,
    comment: "Coordinaron entrega para el día exacto del día de la madre. Excelente servicio.",
    authorName: "Lucas H.",
    authorCity: "Bogotá",
    isApproved: true,
  },

  // otros con 1-2 reseñas
  {
    productSlug: "set-9-fotoimanes-polaroid-color",
    rating: 5,
    comment: "Súper coloridos, la nevera quedó hermosa.",
    authorName: "Karen P.",
    authorCity: "Cúcuta",
    isApproved: true,
  },
  {
    productSlug: "set-12-fotoimanes-cuadrados",
    rating: 5,
    comment: "Minimalista, justo lo que buscaba. Calidad top.",
    authorName: "Felipe R.",
    authorCity: "Bogotá",
    isApproved: true,
  },
  {
    productSlug: "set-20-mini-polaroids",
    rating: 4,
    comment: "20 mini polaroids = mucho amor. Solo recomiendo subir fotos de buena resolución.",
    authorName: "Sara N.",
    authorCity: "Medellín",
    isApproved: true,
  },
  {
    productSlug: "planner-semanal-magnetico",
    rating: 5,
    comment: "El borrado funciona perfecto, marcador incluido genial.",
    authorName: "Catalina E.",
    authorCity: "Bogotá",
    isApproved: true,
  },
  {
    productSlug: "planner-mensual-con-foto",
    rating: 5,
    comment: "La foto en el header le da personalidad propia. Lo amo.",
    authorName: "Daniel Q.",
    authorCity: "Cali",
    isApproved: true,
  },
  {
    productSlug: "abecedario-magnetico",
    rating: 5,
    comment: "Mis peques juegan horas con esto. Aprenden y se entretienen.",
    authorName: "Mariana L.",
    authorCity: "Pereira",
    isApproved: true,
  },
  {
    productSlug: "rutina-infantil-7-actividades",
    rating: 5,
    comment: "Mi hijo ya sigue su rutina solo en las mañanas. Cambio enorme.",
    authorName: "Andrea K.",
    authorCity: "Bogotá",
    isApproved: true,
  },
  {
    productSlug: "cuadro-3-fotos",
    rating: 5,
    comment: "El detalle de los marcos es precioso. Tres recuerdos en una pieza.",
    authorName: "Esteban M.",
    authorCity: "Medellín",
    isApproved: true,
  },

  // coleccionables: dejamos sin reseña featured (catálogo nuevo, sin compras todavía)
  {
    productSlug: "pack-imanes-ciudades-colombia",
    rating: 5,
    comment: "Compré el de ciudades y me encantó. Bogotá quedó adorable.",
    authorName: "Tatiana W.",
    authorCity: "Bogotá",
    isApproved: true,
  },
  {
    productSlug: "pack-frases-motivacionales",
    rating: 5,
    comment: "Los pegué en mi escritorio. Cada mañana me motivan. Diseño hermoso.",
    authorName: "Camilo V.",
    authorCity: "Bogotá",
    isApproved: true,
  },
];


async function main() {
  const before = await prisma.review.count({ where: { deletedAt: null } });
  console.log(`Reseñas vivas antes: ${before}\n`);

  let created = 0;
  let skipped = 0;
  let missingProduct = 0;
  for (const r of reviewsData) {
    const product = await prisma.product.findUnique({
      where: { slug: r.productSlug },
      select: { id: true },
    });
    if (!product) {
      missingProduct++;
      console.log(`  ⚠ producto ${r.productSlug} no existe — reseña de ${r.authorName} omitida`);
      continue;
    }
    // Sin unique constraint en (productId, authorName, createdAt) — la tripleta
    // (productId, authorName, comment) es razonablemente única en demo. Se busca
    // INCLUYENDO borradas/desaprobadas: si existe, no se toca (sin resurrección).
    const existing = await prisma.review.findFirst({
      where: { productId: product.id, comment: r.comment, authorName: r.authorName },
      select: { id: true, deletedAt: true, isApproved: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    created++;
    console.log(`  + ${r.productSlug} — ${r.authorName} (${r.rating}★)`);
    if (APPLY) {
      await prisma.review.create({
        data: {
          productId: product.id,
          rating: r.rating,
          comment: r.comment,
          authorName: r.authorName,
          authorCity: r.authorCity ?? null,
          featured: r.featured ?? false,
          isApproved: r.isApproved,
          images: [],
          createdBy: CREATED_BY,
        },
      });
    }
  }

  console.log("\n────────────────────────────────────────");
  console.log(
    `${APPLY ? "APLICADO" : "DRY-RUN (sin cambios)"} · ${created} reseñas ${APPLY ? "creadas" : "a crear"} · ${skipped} ya existentes (intactas) · ${missingProduct} sin producto`,
  );
  if (APPLY) {
    const after = await prisma.review.count({ where: { deletedAt: null } });
    console.log(`Reseñas vivas después: ${after} (antes: ${before})`);
  } else {
    console.log("Para ejecutar: node scripts/seed-demo-reviews.mjs --apply");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
