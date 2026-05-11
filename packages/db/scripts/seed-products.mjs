/*
 * Script de seed para catálogo demo (categorías + productos).
 *
 * Crea 4 categorías base + 8 productos demo basados en docs/CATALOG_SEED.md.
 * Útil para tener catálogo visible inmediatamente sin tener que crearlo
 * manualmente desde el panel admin.
 *
 * Idempotente: usa upsert por slug, así re-ejecutar no duplica.
 *
 * Uso (vía Makefile):
 *   make seed-products
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== seed-products ===");
console.log("");

// ─────────── Categorías ───────────

const categoriesData = [
  {
    slug: "fotoimanes",
    name: "Fotoimanes",
    description: "Imanes con tus fotos favoritas. Distintos formatos y tamaños.",
    order: 1,
  },
  {
    slug: "recorditos-eventos",
    name: "Recorditos para eventos",
    description: "Detalles personalizados para bodas, baby showers, cumpleaños.",
    order: 2,
  },
  {
    slug: "organizate-bonito",
    name: "Organízate bonito",
    description: "Planners, notas y separadores magnéticos para tu día a día.",
    order: 3,
  },
  {
    slug: "calendarios",
    name: "Calendarios",
    description: "Calendarios magnéticos personalizables con tus fotos del año.",
    order: 4,
  },
];

console.log("Creando/actualizando categorías...");
const categoryIds = {};
for (const c of categoriesData) {
  const cat = await prisma.category.upsert({
    where: { slug: c.slug },
    update: { name: c.name, description: c.description, order: c.order, isActive: true, deletedAt: null },
    create: { ...c, isActive: true },
  });
  categoryIds[c.slug] = cat.id;
  console.log(`  ✓ ${c.name} (${cat.id})`);
}
console.log("");

// ─────────── Productos ───────────

const productsData = [
  {
    slug: "set-6-fotoimanes-polaroid-grande",
    sku: "FI-POL-G-6",
    name: "Set de 6 fotoimanes polaroid grande",
    description:
      "Set de 6 imanes con tus fotos en formato polaroid grande (7×9 cm). Impresión alta resolución, acabado mate, base magnética premium. Personalizables — subes tus fotos en el estudio en vivo.",
    basePrice: 4500000, // $45.000 COP
    compareAtPrice: 5500000,
    categorySlug: "fotoimanes",
    isPersonalizable: true,
    isFeatured: true,
  },
  {
    slug: "set-9-fotoimanes-polaroid-color",
    sku: "FI-POL-C-9",
    name: "Set de 9 fotoimanes polaroid color",
    description:
      "Set de 9 imanes con tus fotos en formato polaroid color (6×8 cm). Bordes blancos clásicos, ideal para cubrir la nevera con recuerdos. Personalizables.",
    basePrice: 5500000,
    categorySlug: "fotoimanes",
    isPersonalizable: true,
  },
  {
    slug: "fotoimanes-cuadrados-x12",
    sku: "FI-CUAD-12",
    name: "Fotoimanes cuadrados x12",
    description:
      "Doce imanes cuadrados 5×5 cm con tus fotos. Formato minimalista, sin bordes, ideal para galerías de recuerdos extensas.",
    basePrice: 5200000,
    categorySlug: "fotoimanes",
    isPersonalizable: true,
  },
  {
    slug: "kit-baby-shower-imanes-recuerdo",
    sku: "EVT-BS-KIT",
    name: "Kit baby shower imanes recuerdo",
    description:
      "Kit de 20 imanes personalizados para baby shower. Diseño con nombre, fecha y motivo del bebé. Incluye empaque individual para entregar como recordatorio a los invitados.",
    basePrice: 8500000,
    categorySlug: "recorditos-eventos",
    isPersonalizable: true,
    isFeatured: true,
  },
  {
    slug: "imanes-matrimonio-personalizados-x30",
    sku: "EVT-MAT-30",
    name: "Imanes matrimonio personalizados x30",
    description:
      "Set de 30 imanes para invitados de matrimonio. Diseño elegante con tus nombres, fecha y un motivo floral. Empaque incluido para cada uno.",
    basePrice: 12000000,
    categorySlug: "recorditos-eventos",
    isPersonalizable: true,
  },
  {
    slug: "planner-mensual-con-foto",
    sku: "ORG-PLAN-MES",
    name: "Planner mensual con foto",
    description:
      "Planner mensual magnético tamaño A3 con tu foto personalizada en el header. Borrable y reutilizable mes a mes. Marcador incluido.",
    basePrice: 6500000,
    categorySlug: "organizate-bonito",
    isPersonalizable: true,
  },
  {
    slug: "set-4-notas-magneticas",
    sku: "ORG-NOT-4",
    name: "Set de 4 notas magnéticas borrables",
    description:
      "Cuatro notas magnéticas (10×15 cm) borrables. Diseños kawaii Lucams. Incluyen marcador. Ideales para recordatorios de nevera.",
    basePrice: 2800000,
    categorySlug: "organizate-bonito",
    isPersonalizable: false,
  },
  {
    slug: "calendario-mes-a-mes-fotos",
    sku: "CAL-MES-FOT",
    name: "Calendario mes a mes con fotos",
    description:
      "Calendario magnético anual con una foto distinta por mes. 12 imanes intercambiables, tamaño A4. Personalizable: subes las 12 fotos en el estudio.",
    basePrice: 9500000,
    compareAtPrice: 11500000,
    categorySlug: "calendarios",
    isPersonalizable: true,
    isFeatured: true,
  },
];

console.log("Creando/actualizando productos...");
for (const p of productsData) {
  const categoryId = categoryIds[p.categorySlug];
  if (!categoryId) {
    console.error(`  ✗ Categoría no encontrada: ${p.categorySlug}`);
    continue;
  }
  const { categorySlug, ...rest } = p;
  await prisma.product.upsert({
    where: { slug: p.slug },
    update: {
      ...rest,
      categoryId,
      isActive: true,
      deletedAt: null,
    },
    create: {
      ...rest,
      categoryId,
      isActive: true,
      images: [],
    },
  });
  console.log(`  ✓ ${p.name}  (${p.sku})`);
}

const totalCategories = await prisma.category.count({ where: { deletedAt: null } });
const totalProducts = await prisma.product.count({ where: { deletedAt: null } });

console.log("");
console.log(`Total en DB: ${totalCategories} categorías, ${totalProducts} productos.`);
console.log("");
console.log("Listo. Ve a /admin/productos para verlos o a /admin/categorias.");

await prisma.$disconnect();
process.exit(0);
