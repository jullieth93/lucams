/*
 * Script de seed para catálogo demo (categorías + productos + reseñas).
 *
 * Crea 8 categorías base + 37 productos demo basados en docs/CATALOG_SEED.md.
 * Cada producto tiene 1-2 URLs Unsplash hot-linked como imágenes demo
 * (next.config.ts whitelistea images.unsplash.com). Cuando Lucy suba fotos
 * reales desde admin UI, reemplazan las URLs Unsplash en `Product.images`.
 *
 * Variante "Default" por producto (CartItem/OrderItem requieren variantId
 * y no hay UI de variantes admin todavía).
 *
 * Reseñas demo: ~24 distribuidas en productos featured (3-5 c/u) y otros
 * (1-2). Algunos productos quedan sin reseñas (para mostrar empty state).
 *
 * Idempotente: usa upsert por slug. Re-ejecutar no duplica.
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
    slug: "foto-imanes",
    name: "Foto-imanes",
    description: "Imanes con tus fotos favoritas. Distintos formatos, tamaños y acabados.",
    order: 1,
    isActive: true,
  },
  {
    slug: "recuerdos-eventos",
    name: "Recuerdos para Eventos",
    description: "Detalles personalizados para bodas, baby showers, cumpleaños y graduaciones.",
    order: 2,
    isActive: true,
  },
  {
    slug: "organizate",
    name: "Organízate Bonito",
    description: "Planners, notas y separadores magnéticos para tu día a día.",
    order: 3,
    isActive: true,
  },
  {
    slug: "calendarios",
    name: "Calendarios",
    description: "Calendarios magnéticos personalizables con tus fotos del año.",
    order: 4,
    isActive: true,
  },
  {
    slug: "pequenes",
    name: "Para los Peques",
    description: "Juegos, abecedarios y rutinas magnéticas para los niños de la casa.",
    order: 5,
    isActive: true,
  },
  {
    slug: "decora-espacio",
    name: "Decora tu Espacio",
    description: "Cuadros, marcos y arte magnético para personalizar la nevera y más.",
    order: 6,
    isActive: true,
  },
  {
    slug: "regalos-corazon",
    name: "Regalos con Corazón",
    description: "Cajas y kits temáticos pensados para regalar con cariño.",
    order: 7,
    isActive: true,
  },
  {
    slug: "mayorista",
    name: "Para tu Negocio",
    description: "Imanes publicitarios para marcas, eventos y campañas (B2B).",
    order: 8,
    isActive: false, // oculto del storefront público — accesible vía /mayorista
  },
];

console.log("Creando/actualizando categorías...");
const categoryIds = {};
for (const c of categoriesData) {
  const cat = await prisma.category.upsert({
    where: { slug: c.slug },
    update: {
      name: c.name,
      description: c.description,
      order: c.order,
      isActive: c.isActive,
      deletedAt: null,
    },
    create: { ...c },
  });
  categoryIds[c.slug] = cat.id;
  console.log(`  ✓ ${c.name} (${cat.isActive ? "activa" : "oculta"})`);
}
console.log("");

// ─────────── Productos ───────────
//
// Imágenes: URLs Unsplash hot-linked. Temáticas por categoría. Cuando
// Lucy sube foto real, reemplaza el array `images` en DB.
// next.config.ts ya whitelistea images.unsplash.com.

const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80&fit=crop`;

const productsData = [
  // ─── Foto-imanes (8) ───
  {
    slug: "set-6-fotoimanes-polaroid-grande",
    sku: "FI-POL-G-6",
    name: "Set 6 Foto-imanes Polaroid Grande",
    description:
      "Set de 6 imanes con tus fotos en formato polaroid grande (7×9 cm). Impresión alta resolución, acabado mate, base magnética premium. Personalizables — subes tus fotos en el estudio en vivo.",
    basePrice: 3500000,
    compareAtPrice: 4500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    isFeatured: true,
    images: [UNSPLASH("1606498679340-0aec3185edbd"), UNSPLASH("1502920917128-1aa500764cbd")],
  },
  {
    slug: "set-9-fotoimanes-polaroid-color",
    sku: "FI-POL-C-9",
    name: "Set 9 Foto-imanes Polaroid Color",
    description:
      "Set de 9 imanes con tus fotos en formato polaroid color (6×8 cm). Bordes blancos clásicos, ideal para cubrir la nevera con recuerdos. Personalizables.",
    basePrice: 4500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    images: [UNSPLASH("1502920917128-1aa500764cbd")],
  },
  {
    slug: "set-12-fotoimanes-polaroid",
    sku: "FI-POL-12",
    name: "Set 12 Foto-imanes Polaroid",
    description:
      "12 imanes polaroid 6×8 cm con tus fotos. El pack ideal para llenar la nevera con un año entero de recuerdos. Personalizables.",
    basePrice: 4500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    images: [UNSPLASH("1530541930197-ff16ac917b0e")],
  },
  {
    slug: "set-12-fotoimanes-cuadrados",
    sku: "FI-CUAD-12",
    name: "Set 12 Foto-imanes Cuadrados",
    description:
      "Doce imanes cuadrados 5×5 cm con tus fotos. Formato minimalista, sin bordes, ideal para galerías de recuerdos extensas. Personalizables.",
    basePrice: 4500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    images: [UNSPLASH("1554080353-a576cf803bda")],
  },
  {
    slug: "set-20-mini-polaroids",
    sku: "FI-MINI-20",
    name: "Set 20 Mini Polaroids",
    description:
      "20 imanes mini polaroid 4×5 cm. Para mostrar TODOS tus momentos sin saturar. Personalizables.",
    basePrice: 5800000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    images: [UNSPLASH("1502920917128-1aa500764cbd")],
  },
  {
    slug: "set-fotoimanes-circulares",
    sku: "FI-CIRC-6",
    name: "Set Foto-imanes Circulares",
    description:
      "Set de 6 imanes circulares 6 cm con tus fotos. Forma distinta para destacar. Personalizables.",
    basePrice: 3500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    images: [UNSPLASH("1551836022-d5d88e9218df")],
  },
  {
    slug: "set-fotoimanes-corazon",
    sku: "FI-COR-6",
    name: "Set Foto-imanes Corazón",
    description:
      "Set de 6 imanes en forma de corazón con tus fotos. Súper kawaii para regalo de aniversario. Personalizables.",
    basePrice: 3500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    isFeatured: true,
    images: [UNSPLASH("1518621736915-f3b1c41bfd00")],
  },
  {
    slug: "set-glass-magnets-personalizados",
    sku: "FI-GLASS-6",
    name: "Set Glass-Magnets Personalizados",
    description:
      "6 imanes con frente de vidrio premium 3 cm. Lupa natural que magnifica tu foto. Personalizables — el detalle gourmet.",
    basePrice: 2500000,
    categorySlug: "foto-imanes",
    isPersonalizable: true,
    images: [UNSPLASH("1604782206219-3b9576575203")],
  },

  // ─── Recuerdos para Eventos (6) ───
  {
    slug: "recuerdos-cumpleanos-x20",
    sku: "EVT-CUMP-20",
    name: "Recuerdos de Cumpleaños x20",
    description:
      "Kit de 20 imanes personalizados para cumpleaños. Diseño con nombre, edad y motivo de la fiesta. Incluye empaque individual.",
    basePrice: 11500000,
    categorySlug: "recuerdos-eventos",
    isPersonalizable: true,
    images: [UNSPLASH("1530103862676-de8c9debad1d")],
  },
  {
    slug: "recuerdos-bautizo-x12",
    sku: "EVT-BAUT-12",
    name: "Recuerdos de Bautizo x12",
    description:
      "12 imanes personalizados para bautizo. Diseño tierno con nombre del bebé y fecha. Empaque incluido.",
    basePrice: 9000000,
    categorySlug: "recuerdos-eventos",
    isPersonalizable: true,
    images: [UNSPLASH("1525258946800-98cfd641d0de")],
  },
  {
    slug: "recuerdos-graduacion-x20",
    sku: "EVT-GRAD-20",
    name: "Recuerdos de Graduación x20",
    description:
      "20 imanes personalizados con birrete, diploma y fecha de graduación. El recordatorio perfecto para invitados.",
    basePrice: 9000000,
    categorySlug: "recuerdos-eventos",
    isPersonalizable: true,
    images: [UNSPLASH("1523580494863-6f3031224c94")],
  },
  {
    slug: "recuerdos-matrimonio",
    sku: "EVT-MAT-VAR",
    name: "Recuerdos de Matrimonio",
    description:
      "Imanes para invitados de matrimonio. Diseño elegante con tus nombres, fecha y motivo floral. Empaque incluido. Cotización por cantidad.",
    basePrice: 3000000,
    categorySlug: "recuerdos-eventos",
    isPersonalizable: true,
    isFeatured: true,
    images: [UNSPLASH("1519741497674-611481863552")],
  },
  {
    slug: "mi-primer-anito",
    sku: "EVT-ANITO",
    name: "Mi Primer Añito",
    description:
      "Recuerdos personalizados para el primer cumpleaños. Diseño dulce con la foto del bebé, nombre y fecha.",
    basePrice: 4500000,
    categorySlug: "recuerdos-eventos",
    isPersonalizable: true,
    images: [UNSPLASH("1525258946800-98cfd641d0de")],
  },
  {
    slug: "recuerdos-quinceanera",
    sku: "EVT-QUINCE-20",
    name: "Recuerdos de Quinceañera",
    description:
      "20 imanes personalizados con la foto de los XV. Marco floral, fecha y nombre. Recordatorio único para el día especial.",
    basePrice: 11500000,
    categorySlug: "recuerdos-eventos",
    isPersonalizable: true,
    images: [UNSPLASH("1525258946800-98cfd641d0de")],
  },

  // ─── Organízate Bonito (6) ───
  {
    slug: "planner-semanal-magnetico",
    sku: "ORG-SEM",
    name: "Planner Semanal Magnético",
    description:
      "Planner semanal A4 magnético borrable. Diseño kawaii con espacios para cada día, prioridades y notas. Marcador incluido.",
    basePrice: 3200000,
    categorySlug: "organizate",
    isPersonalizable: false,
    images: [UNSPLASH("1506784983877-45594efa4cbe")],
  },
  {
    slug: "planner-mensual-magnetico",
    sku: "ORG-MES",
    name: "Planner Mensual Magnético",
    description:
      "Planner mensual A3 magnético borrable. Vista completa del mes, espacios para metas y eventos. Marcador incluido.",
    basePrice: 3600000,
    categorySlug: "organizate",
    isPersonalizable: false,
    images: [UNSPLASH("1483546363825-7ebf25fb7513")],
  },
  {
    slug: "mini-planner-magnetico",
    sku: "ORG-MINI",
    name: "Mini Planner Magnético",
    description:
      "Mini planner 15×20 cm para puerta de nevera. Lista de tareas del día con casillas magnéticas borrables.",
    basePrice: 3000000,
    categorySlug: "organizate",
    isPersonalizable: false,
    images: [UNSPLASH("1499678329028-101435549a4e")],
  },
  {
    slug: "planner-mensual-con-foto",
    sku: "ORG-PLAN-FOT",
    name: "Planner Mensual con Foto",
    description:
      "Planner mensual A3 magnético con tu foto personalizada en el header. Borrable y reutilizable. Marcador incluido.",
    basePrice: 4200000,
    categorySlug: "organizate",
    isPersonalizable: true,
    images: [UNSPLASH("1577563908411-5077b6dc7624")],
  },
  {
    slug: "set-4-notas-magneticas",
    sku: "ORG-NOT-4",
    name: "Set 4 Notas Magnéticas",
    description:
      "4 notas magnéticas (10×15 cm) borrables. Diseños kawaii Lucams: lista, recordatorios, mood, mini-meta. Marcador incluido.",
    basePrice: 3000000,
    categorySlug: "organizate",
    isPersonalizable: false,
    images: [UNSPLASH("1517842645767-c639042777db")],
  },
  {
    slug: "pack-separadores-libros",
    sku: "ORG-SEP-6",
    name: "Pack Separadores de Libros Magnéticos",
    description:
      "6 separadores magnéticos para libros. Diseños mapache + frases kawaii. No se caen, no rompen páginas.",
    basePrice: 1800000,
    categorySlug: "organizate",
    isPersonalizable: false,
    images: [UNSPLASH("1544716278-ca5e3f4abd8c")],
  },

  // ─── Calendarios (3) ───
  {
    slug: "calendario-mes-a-mes-fotos",
    sku: "CAL-FOT-12",
    name: "Calendario Mes a Mes con 12 Fotos",
    description:
      "Calendario magnético anual con una foto distinta por mes. 12 imanes intercambiables, A4. Personalizable — subes las 12 fotos en el estudio.",
    basePrice: 4500000,
    compareAtPrice: 5500000,
    categorySlug: "calendarios",
    isPersonalizable: true,
    isFeatured: true,
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },
  {
    slug: "calendario-floral-mes-a-mes",
    sku: "CAL-FLOR",
    name: "Calendario Floral Mes a Mes",
    description:
      "Calendario A4 magnético con ilustración floral original por mes. Sin personalización pero precioso para regalo.",
    basePrice: 4800000,
    categorySlug: "calendarios",
    isPersonalizable: false,
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },
  {
    slug: "mini-calendarios-x10",
    sku: "CAL-MINI-10",
    name: "Mini Calendarios para Regalar x10",
    description:
      "10 mini calendarios magnéticos 5×7 cm. Perfectos como detalle para clientes o invitados. Diseño kawaii.",
    basePrice: 700000,
    categorySlug: "calendarios",
    isPersonalizable: false,
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },

  // ─── Para los Peques (5) ───
  {
    slug: "abecedario-magnetico",
    sku: "KID-ABC",
    name: "Abecedario Magnético",
    description:
      "37 fichas magnéticas con las letras del alfabeto (incluye Ñ). Diseño colorido kawaii. Aprende jugando sobre la nevera.",
    basePrice: 5800000,
    categorySlug: "pequenes",
    isPersonalizable: false,
    images: [UNSPLASH("1471107340929-a87cd0f5b5f3")],
  },
  {
    slug: "set-fichas-numeros",
    sku: "KID-NUM",
    name: "Set Fichas Magnéticas — Los Números",
    description:
      "Set de fichas con números 0-9 + signos matemáticos (+, −, ×, ÷, =). Para sumar, restar y aprender.",
    basePrice: 7200000,
    categorySlug: "pequenes",
    isPersonalizable: false,
    images: [UNSPLASH("1503676260728-1c00da094a0b")],
  },
  {
    slug: "rutina-infantil-7-actividades",
    sku: "KID-RUT-7",
    name: "Crea tu Rutina Infantil (7 actividades)",
    description:
      "7 fichas magnéticas con actividades del día (cepillarse, comer, jugar, leer...). Para que los peques sigan su rutina con autonomía.",
    basePrice: 2700000,
    categorySlug: "pequenes",
    isPersonalizable: false,
    images: [UNSPLASH("1503454537195-1dcabb73ffb9")],
  },
  {
    slug: "rutina-infantil-xl-9",
    sku: "KID-RUT-9",
    name: "Crea tu Rutina Infantil XL (9 actividades)",
    description:
      "Versión XL con 9 actividades más completas. Mañana, tarde y noche cubiertas. Magnético borrable.",
    basePrice: 3600000,
    categorySlug: "pequenes",
    isPersonalizable: false,
    images: [UNSPLASH("1471107340929-a87cd0f5b5f3")],
  },
  {
    slug: "planner-emociones-kids",
    sku: "KID-EMO",
    name: "Planner de Emociones Kids",
    description:
      "Planner magnético para que los peques aprendan a identificar y expresar sus emociones. 8 caritas magnéticas + espacios diarios.",
    basePrice: 2700000,
    categorySlug: "pequenes",
    isPersonalizable: false,
    images: [UNSPLASH("1503454537195-1dcabb73ffb9")],
  },

  // ─── Decora tu Espacio (3) ───
  {
    slug: "cuadro-15x15-con-foto",
    sku: "DEC-CUAD-15",
    name: "Cuadro 15×15 cm con Foto",
    description:
      "Cuadro magnético 15×15 cm con tu foto. Marco fino brand-purple. Personalizable.",
    basePrice: 2700000,
    categorySlug: "decora-espacio",
    isPersonalizable: true,
    images: [UNSPLASH("1513519245088-0e12902e5a38")],
  },
  {
    slug: "cuadro-3-fotos",
    sku: "DEC-CUAD-3F",
    name: "Cuadro para 3 Fotos",
    description:
      "Cuadro magnético con 3 espacios para fotos. Tu trío favorito en una sola pieza. Personalizable.",
    basePrice: 4000000,
    categorySlug: "decora-espacio",
    isPersonalizable: true,
    images: [UNSPLASH("1547119957-637f8679db1e")],
  },
  {
    slug: "marcos-magneticos-cuadrados",
    sku: "DEC-MARC-2",
    name: "Marcos Magnéticos Cuadrados (pack 2)",
    description:
      "2 marcos magnéticos cuadrados 8×8 cm. Cambias la foto cuando quieras. Sin personalización inicial.",
    basePrice: 1400000,
    categorySlug: "decora-espacio",
    isPersonalizable: false,
    images: [UNSPLASH("1493663284031-b7e3aefcae8e")],
  },

  // ─── Regalos con Corazón (3) ───
  {
    slug: "big-box-dia-mama",
    sku: "REG-BB-MAMA",
    name: "Big Box Día de la Madre",
    description:
      "Caja temática con set de fotoimanes + planner + nota personalizada + empaque premium. El regalo del año.",
    basePrice: 6800000,
    categorySlug: "regalos-corazon",
    isPersonalizable: true,
    isFeatured: true,
    images: [UNSPLASH("1549465220-1a8b9238cd48")],
  },
  {
    slug: "mini-box-dia-mama",
    sku: "REG-MB-MAMA",
    name: "Mini Box Día de la Madre",
    description:
      "Versión mini del Big Box. Set de fotoimanes + nota personalizada en caja kraft. Detalle dulce.",
    basePrice: 4500000,
    categorySlug: "regalos-corazon",
    isPersonalizable: true,
    images: [UNSPLASH("1513201099705-a9746e1e201f")],
  },
  {
    slug: "caja-lucams-sorpresa",
    sku: "REG-MYST",
    name: "Caja Lucams Sorpresa",
    description:
      "Mystery box: te enviamos un set de imanes Lucams sorpresa por COP 25.000. Curaduría a mano. No personalizable.",
    basePrice: 2500000,
    categorySlug: "regalos-corazon",
    isPersonalizable: false,
    images: [UNSPLASH("1607344645866-009c320b63e0")],
  },

  // ─── Para tu Negocio — B2B (3, en categoría oculta) ───
  {
    slug: "imanes-publicitarios-rectos-7x5",
    sku: "B2B-REC-7x5",
    name: "Imanes Publicitarios Rectos 7×5 cm",
    description:
      "Imanes publicitarios rectangulares 7×5 cm. Mínimo 50 unidades. Tu logo + datos de contacto. Cotización al instante.",
    basePrice: 180000,
    categorySlug: "mayorista",
    isPersonalizable: true,
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },
  {
    slug: "imanes-publicitarios-circulares-6cm",
    sku: "B2B-CIRC-6",
    name: "Imanes Publicitarios Circulares 6 cm",
    description:
      "Imanes publicitarios circulares 6 cm. Mínimo 50 unidades. Tu marca + frase.",
    basePrice: 200000,
    categorySlug: "mayorista",
    isPersonalizable: true,
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },
  {
    slug: "imanes-publicitarios-troquelados",
    sku: "B2B-TROQ",
    name: "Imanes Publicitarios Troquelados (forma libre)",
    description:
      "Imanes publicitarios con forma personalizada (logo, silueta, etc.). Mínimo 50 unidades. Cotización personalizada.",
    basePrice: 250000,
    categorySlug: "mayorista",
    isPersonalizable: true,
    images: [UNSPLASH("1606166187734-a4cb74079037")],
  },
];

// Pre-cleanup: si hay productos viejos cuyos SKU NO están en el seed
// nuevo, renombramos slug/sku con suffix "--legacy-XXX" y soft-deletamos.
// Libera las unique constraints sin destruir data. Si Lucy quiere
// recuperar uno, su row sigue en DB, solo invisible.
const targetSkus = new Set(productsData.map((p) => p.sku));
const legacyProducts = await prisma.product.findMany({
  where: { deletedAt: null, sku: { notIn: Array.from(targetSkus) } },
  select: { id: true, slug: true, sku: true, name: true },
});
if (legacyProducts.length > 0) {
  console.log(`Archivando ${legacyProducts.length} producto(s) legacy...`);
  for (const lp of legacyProducts) {
    const suffix = `--legacy-${lp.id.slice(-6)}`;
    await prisma.product.update({
      where: { id: lp.id },
      data: {
        slug: lp.slug.endsWith(suffix) ? lp.slug : `${lp.slug}${suffix}`,
        sku: lp.sku.endsWith(suffix.toUpperCase().replace(/-/g, ""))
          ? lp.sku
          : `${lp.sku}--LEG-${lp.id.slice(-6).toUpperCase()}`,
        isActive: false,
        deletedAt: new Date(),
      },
    });
    console.log(`  ↳ ${lp.name} archivado`);
  }
  console.log("");
}

// Similar para categorías: si una categoría existente NO está en el seed
// nuevo, archivarla. Pero antes verificar que no tenga productos activos.
const targetCatSlugs = new Set(categoriesData.map((c) => c.slug));
const legacyCats = await prisma.category.findMany({
  where: { deletedAt: null, slug: { notIn: Array.from(targetCatSlugs) } },
  select: { id: true, slug: true, name: true, _count: { select: { products: { where: { deletedAt: null } } } } },
});
if (legacyCats.length > 0) {
  console.log(`Categorías legacy encontradas: ${legacyCats.length}`);
  for (const lc of legacyCats) {
    if (lc._count.products > 0) {
      console.log(`  ⚠ ${lc.name} tiene ${lc._count.products} productos activos — NO archivando`);
      continue;
    }
    const suffix = `--legacy-${lc.id.slice(-6)}`;
    await prisma.category.update({
      where: { id: lc.id },
      data: {
        slug: lc.slug.endsWith(suffix) ? lc.slug : `${lc.slug}${suffix}`,
        isActive: false,
        deletedAt: new Date(),
      },
    });
    console.log(`  ↳ ${lc.name} archivada`);
  }
  console.log("");
}

console.log("Creando/actualizando productos...");
const productIdsBySlug = {};
for (const p of productsData) {
  const categoryId = categoryIds[p.categorySlug];
  if (!categoryId) {
    console.error(`  ✗ Categoría no encontrada: ${p.categorySlug}`);
    continue;
  }
  const { categorySlug, ...rest } = p;
  // Upsert por SKU (no por slug) — los SKUs son la clave estable del
  // catálogo. Si Lucy cambia el slug pero mantiene el SKU, lo
  // actualizamos. Si introduce SKU nuevo, creamos producto nuevo.
  const product = await prisma.product.upsert({
    where: { sku: p.sku },
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
    },
  });
  productIdsBySlug[p.slug] = product.id;

  // Variante default — CartItem/OrderItem requieren variantId.
  const variantSku = `${p.sku}-DEFAULT`;
  await prisma.productVariant.upsert({
    where: { sku: variantSku },
    update: { deletedAt: null, name: "Default" },
    create: {
      productId: product.id,
      name: "Default",
      sku: variantSku,
      price: null,
      stock: 0,
      attributes: {},
    },
  });

  console.log(`  ✓ ${p.name}  (${p.sku})`);
}
console.log("");

// ─────────── Reseñas demo ───────────
//
// 24 reseñas distribuidas: 3-5 en productos featured, 1-2 en otros,
// algunas sin reseñas (mostrar empty state). Snapshot de authorName +
// authorCity para mostrar en UI sin tener Customer real.

const reviewsData = [
  // featured: set-6-fotoimanes-polaroid-grande (5 reseñas)
  { productSlug: "set-6-fotoimanes-polaroid-grande", rating: 5, comment: "¡Llegaron preciosos! La calidad de impresión es brutal y los imanes agarran fuerte. Mi nevera está ahora llena de recuerdos del viaje a Cartagena.", authorName: "María C.", authorCity: "Bogotá", featured: true, isApproved: true },
  { productSlug: "set-6-fotoimanes-polaroid-grande", rating: 5, comment: "Personalización súper fácil, llegó en 4 días. Vino con un empaque kawaii precioso, parece regalo de marca grande.", authorName: "Ana S.", authorCity: "Medellín", featured: true, isApproved: true },
  { productSlug: "set-6-fotoimanes-polaroid-grande", rating: 5, comment: "Lo regalé a mi mamá y lloró de la emoción. Las fotos de la familia perfectas, los colores vibrantes. 10/10.", authorName: "Daniela R.", authorCity: "Cali", isApproved: true },
  { productSlug: "set-6-fotoimanes-polaroid-grande", rating: 4, comment: "Calidad excelente. El único detalle es que el empaque exterior llegó un poco golpeado pero los imanes intactos. Recomendados.", authorName: "Carolina P.", authorCity: "Barranquilla", isApproved: true },
  { productSlug: "set-6-fotoimanes-polaroid-grande", rating: 5, comment: "Compré 3 sets para regalar a mis hermanas. Todas felices. Volveré por más.", authorName: "Luisa M.", authorCity: "Bucaramanga", isApproved: true },

  // featured: set-fotoimanes-corazon
  { productSlug: "set-fotoimanes-corazon", rating: 5, comment: "Regalo de aniversario perfecto. Mi novio quedó enamorado.", authorName: "Sofía V.", authorCity: "Pereira", featured: true, isApproved: true },
  { productSlug: "set-fotoimanes-corazon", rating: 5, comment: "Adorables. Los corazones tienen un acabado mate súper bonito.", authorName: "Valentina G.", authorCity: "Manizales", isApproved: true },

  // featured: recuerdos-matrimonio
  { productSlug: "recuerdos-matrimonio", rating: 5, comment: "Los entregamos en nuestra boda y los invitados los aman. Calidad insuperable.", authorName: "Andrés & Laura", authorCity: "Cartagena", featured: true, isApproved: true },
  { productSlug: "recuerdos-matrimonio", rating: 5, comment: "Lucy nos asesoró por WhatsApp con el diseño, súper paciente. Llegaron antes de lo prometido.", authorName: "Pablo H.", authorCity: "Bogotá", isApproved: true },
  { productSlug: "recuerdos-matrimonio", rating: 4, comment: "Hermosos. Sugerencia: tener opción de varios diseños base para elegir.", authorName: "Camila T.", authorCity: "Medellín", isApproved: true },

  // featured: calendario-mes-a-mes-fotos
  { productSlug: "calendario-mes-a-mes-fotos", rating: 5, comment: "Lo mejor para el escritorio. Cambio el imán cada mes y siempre veo una foto distinta. Lo amo.", authorName: "Juan D.", authorCity: "Bogotá", featured: true, isApproved: true },
  { productSlug: "calendario-mes-a-mes-fotos", rating: 5, comment: "Regalo de Navidad para mi familia, todos lo aman. Volveré el próximo año.", authorName: "Patricia M.", authorCity: "Ibagué", isApproved: true },
  { productSlug: "calendario-mes-a-mes-fotos", rating: 5, comment: "La idea de cambiar foto cada mes es genial. Súper original.", authorName: "Rocío F.", authorCity: "Cali", isApproved: true },

  // featured: big-box-dia-mama
  { productSlug: "big-box-dia-mama", rating: 5, comment: "Mi mamá lloró. Vale cada peso. El empaque ya es regalo en sí mismo.", authorName: "Laura B.", authorCity: "Bogotá", featured: true, isApproved: true },
  { productSlug: "big-box-dia-mama", rating: 5, comment: "Detalle súper completo, mi suegra encantada. Llegó perfecto.", authorName: "Manuela O.", authorCity: "Medellín", isApproved: true },
  { productSlug: "big-box-dia-mama", rating: 5, comment: "Coordinaron entrega para el día exacto del día de la madre. Excelente servicio.", authorName: "Lucas H.", authorCity: "Bogotá", isApproved: true },

  // otros con 1-2 reseñas
  { productSlug: "set-9-fotoimanes-polaroid-color", rating: 5, comment: "Súper coloridos, la nevera quedó hermosa.", authorName: "Karen P.", authorCity: "Cúcuta", isApproved: true },
  { productSlug: "set-12-fotoimanes-cuadrados", rating: 5, comment: "Minimalista, justo lo que buscaba. Calidad top.", authorName: "Felipe R.", authorCity: "Bogotá", isApproved: true },
  { productSlug: "set-20-mini-polaroids", rating: 4, comment: "20 mini polaroids = mucho amor. Solo recomiendo subir fotos de buena resolución.", authorName: "Sara N.", authorCity: "Medellín", isApproved: true },
  { productSlug: "planner-semanal-magnetico", rating: 5, comment: "El borrado funciona perfecto, marcador incluido genial.", authorName: "Catalina E.", authorCity: "Bogotá", isApproved: true },
  { productSlug: "planner-mensual-con-foto", rating: 5, comment: "La foto en el header le da personalidad propia. Lo amo.", authorName: "Daniel Q.", authorCity: "Cali", isApproved: true },
  { productSlug: "abecedario-magnetico", rating: 5, comment: "Mis peques juegan horas con esto. Aprenden y se entretienen.", authorName: "Mariana L.", authorCity: "Pereira", isApproved: true },
  { productSlug: "rutina-infantil-7-actividades", rating: 5, comment: "Mi hijo ya sigue su rutina solo en las mañanas. Cambio enorme.", authorName: "Andrea K.", authorCity: "Bogotá", isApproved: true },
  { productSlug: "cuadro-3-fotos", rating: 5, comment: "El detalle de los marcos es precioso. Tres recuerdos en una pieza.", authorName: "Esteban M.", authorCity: "Medellín", isApproved: true },
];

console.log("Creando/actualizando reseñas demo...");
let reviewsCreated = 0;
for (const r of reviewsData) {
  const productId = productIdsBySlug[r.productSlug];
  if (!productId) continue;
  // Sin unique constraint en (productId, authorName, createdAt) — re-run
  // duplicaría. Para idempotencia chequeamos manualmente por (productId,
  // authorName, comment) que es razonablemente único en demo.
  const existing = await prisma.review.findFirst({
    where: { productId, comment: r.comment, authorName: r.authorName },
    select: { id: true },
  });
  if (existing) {
    await prisma.review.update({
      where: { id: existing.id },
      data: {
        rating: r.rating,
        authorCity: r.authorCity ?? null,
        featured: r.featured ?? false,
        isApproved: r.isApproved,
        deletedAt: null,
      },
    });
  } else {
    await prisma.review.create({
      data: {
        productId,
        rating: r.rating,
        comment: r.comment,
        authorName: r.authorName,
        authorCity: r.authorCity ?? null,
        featured: r.featured ?? false,
        isApproved: r.isApproved,
        images: [],
      },
    });
    reviewsCreated++;
  }
}
console.log(`  ✓ ${reviewsCreated} reseñas nuevas (idempotente)`);
console.log("");

const totalCategories = await prisma.category.count({ where: { deletedAt: null } });
const totalProducts = await prisma.product.count({ where: { deletedAt: null } });
const totalReviews = await prisma.review.count({ where: { deletedAt: null } });

console.log(
  `Total en DB: ${totalCategories} categorías, ${totalProducts} productos, ${totalReviews} reseñas.`,
);
console.log("");
console.log("Listo. Ve a /admin/productos o /admin/categorias.");

await prisma.$disconnect();
process.exit(0);
