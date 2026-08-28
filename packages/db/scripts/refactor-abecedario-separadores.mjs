/*
 * Refactor abecedario (1 producto NONE → 2 productos × 3 variantes con
 * tipo TEXT_ONLY para "nombre personalizado") + separadores (refactor
 * a personalizables PHOTO_PACK + prediseñados NONE).
 *
 * Idempotente: si los slugs ya existen, solo actualiza precios + estado.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Buscar la categoría de cada producto (reuso del catálogo existente)
async function getCategoryIdForSlug(parentSlug) {
  // Para abecedario y separadores reuso categorías existentes razonables
  const candidates = [
    "juegos-aprendizaje",
    "abecedario-magnetico",
    "organiza-tu-espacio",
    "separadores",
    "imanes",
  ];
  for (const c of candidates) {
    const cat = await prisma.category.findFirst({ where: { slug: c, deletedAt: null } });
    if (cat) return cat.id;
  }
  // Fallback: primer categoría activa
  const any = await prisma.category.findFirst({ where: { deletedAt: null } });
  if (!any) throw new Error("No hay ninguna categoría activa para asignar");
  return any.id;
}

async function upsertProduct(input) {
  const existing = await prisma.product.findFirst({ where: { slug: input.slug } });
  const sku = input.sku ?? input.slug.toUpperCase().replace(/-/g, "_");
  if (existing) {
    return prisma.product.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        description: input.description,
        personalizationKind: input.personalizationKind,
        personalizationSchema: input.personalizationSchema,
        physicalSpecs: input.physicalSpecs,
        basePrice: input.basePrice,
        cost: input.cost,
        isActive: true,
        isFeatured: input.isFeatured ?? false,
        isPersonalizable: input.personalizationKind !== "NONE",
        deletedAt: null,
        categoryId: input.categoryId,
        images: input.images ?? [],
      },
    });
  }
  return prisma.product.create({
    data: {
      slug: input.slug,
      sku,
      name: input.name,
      description: input.description,
      personalizationKind: input.personalizationKind,
      personalizationSchema: input.personalizationSchema,
      physicalSpecs: input.physicalSpecs,
      basePrice: input.basePrice,
      cost: input.cost,
      isActive: true,
      isFeatured: input.isFeatured ?? false,
      isPersonalizable: input.personalizationKind !== "NONE",
      categoryId: input.categoryId,
      images: input.images ?? [],
    },
  });
}

async function upsertVariant(productId, sku, name, attributes, priceCop) {
  const existing = await prisma.productVariant.findFirst({
    where: { productId, sku },
  });
  if (existing) {
    return prisma.productVariant.update({
      where: { id: existing.id },
      data: {
        name,
        attributes,
        price: priceCop * 100,
        isActive: true,
        deletedAt: null,
        stock: 100,
      },
    });
  }
  return prisma.productVariant.create({
    data: { productId, sku, name, attributes, price: priceCop * 100, stock: 100, isActive: true },
  });
}

async function main() {
  const baseCatId = await getCategoryIdForSlug("abecedario");

  // ─────────── ABECEDARIO ESPAÑOL ───────────
  const physSpecsAbc = {
    widthCm: 7,
    heightCm: 10,
    depthCm: 1,
    weightGrams: 50, // 27 fichas × ~2g
    material: "PET laminado mate",
    magnetType: "FRIDGE",
    thicknessMm: 3,
    packaging: "STANDARD_BAG",
    countryOfOrigin: "CO",
    careInstructions: "Limpieza con paño seco. No exponer a calor extremo.",
    includes: ["Fichas según pack seleccionado", "Sticker Lucams kawaii"],
  };

  const abcEs = await upsertProduct({
    slug: "abecedario-magnetico-espanol",
    name: "Abecedario Magnético Español",
    description:
      "Abecedario magnético con diseños de animales kawaii (A de Ave, B de Burro, C de Cangrejo...). Pega en nevera, planificador, escritorio o pizarra magnética. 27 letras del abecedario español (incluye Ñ). Tamaño 7×10 cm cada ficha.",
    personalizationKind: "TEXT_ONLY",
    personalizationSchema: { nameMaxLength: 10 },
    physicalSpecs: physSpecsAbc,
    basePrice: 4500000,
    cost: 1500000,
    categoryId: baseCatId,
    isFeatured: true,
    images: [],
  });
  console.log(`✓ ${abcEs.slug}`);
  await upsertVariant(
    abcEs.id,
    "ABC-ES-FULL",
    "Abecedario completo · 27 letras",
    { variant: "full", letterCount: 27 },
    45000,
  );
  await upsertVariant(
    abcEs.id,
    "ABC-ES-VOWELS",
    "Pack vocales · 5 letras (AEIOU)",
    { variant: "vowels", letterCount: 5 },
    15000,
  );
  await upsertVariant(
    abcEs.id,
    "ABC-ES-NAME",
    "Nombre personalizado · 3-10 letras",
    { variant: "name", letterCountMin: 3, letterCountMax: 10 },
    25000,
  );
  console.log("  3 variantes seteadas");

  // ─────────── ABECEDARIO INGLÉS ───────────
  const abcEn = await upsertProduct({
    slug: "abecedario-magnetico-ingles",
    name: "Abecedario Magnético Inglés",
    description:
      "Magnetic alphabet with kawaii animal designs (A for Ant, B for Bear, C for Cat...). Sticks on fridge, planner, desk or magnetic board. 26 letters English alphabet. Size 7×10 cm each tile.",
    personalizationKind: "TEXT_ONLY",
    personalizationSchema: { nameMaxLength: 10 },
    physicalSpecs: physSpecsAbc,
    basePrice: 4500000,
    cost: 1500000,
    categoryId: baseCatId,
    isFeatured: false,
    images: [],
  });
  console.log(`✓ ${abcEn.slug}`);
  await upsertVariant(
    abcEn.id,
    "ABC-EN-FULL",
    "Full alphabet · 26 letters",
    { variant: "full", letterCount: 26 },
    45000,
  );
  await upsertVariant(
    abcEn.id,
    "ABC-EN-VOWELS",
    "Vowels pack · 5 letters (AEIOU)",
    { variant: "vowels", letterCount: 5 },
    15000,
  );
  await upsertVariant(
    abcEn.id,
    "ABC-EN-NAME",
    "Custom name · 3-10 letters",
    { variant: "name", letterCountMin: 3, letterCountMax: 10 },
    25000,
  );
  console.log("  3 variantes seteadas");

  // ─────────── SEPARADORES PERSONALIZABLES ───────────
  const physSpecsSep = {
    widthCm: 4,
    heightCm: 4,
    depthCm: 1, // 4×4.2 redondeo
    weightGrams: 10,
    material: "PET laminado mate",
    magnetType: "BOOK", // marca-libro
    thicknessMm: 1,
    packaging: "STANDARD_BAG",
    countryOfOrigin: "CO",
    careInstructions: "Limpieza con paño seco.",
    includes: ["Separadores según pack seleccionado"],
  };

  const sepPers = await upsertProduct({
    slug: "separadores-personalizables",
    name: "Separadores de Libros Personalizables",
    description:
      "Separadores magnéticos de libros con tu foto. Subí la foto que más te guste y nosotros la convertimos en marcador-libro magnético. Tamaño 4×4.2 cm. Resistente al uso diario.",
    personalizationKind: "PHOTO_PACK",
    personalizationSchema: { photoSlots: 1, aspectRatio: "1:1", allowText: false },
    physicalSpecs: physSpecsSep,
    basePrice: 500000,
    cost: 100000,
    categoryId: baseCatId,
    isFeatured: false,
    images: [],
  });
  console.log(`✓ ${sepPers.slug}`);
  await upsertVariant(
    sepPers.id,
    "SEP-PERS-1",
    "1 separador · 1 foto",
    { photoSlots: 1, qty: 1 },
    5000,
  );
  await upsertVariant(
    sepPers.id,
    "SEP-PERS-3",
    "Pack 3 separadores · 3 fotos",
    { photoSlots: 3, qty: 3 },
    10000,
  );
  await upsertVariant(
    sepPers.id,
    "SEP-PERS-5",
    "Pack 5 separadores · 5 fotos",
    { photoSlots: 5, qty: 5 },
    15000,
  );
  console.log("  3 variantes seteadas");

  // ─────────── SEPARADORES PREDISEÑADOS ───────────
  const sepPre = await upsertProduct({
    slug: "separadores-predisenados",
    name: "Separadores Magnéticos Prediseñados",
    description:
      "Separadores magnéticos con diseños listos: Van Gogh, paisajes, mandalas, florales, personajes kawaii y más. Tamaño 4×4.2 cm. Elige los diseños que más te gusten al momento de comprar.",
    personalizationKind: "NONE",
    personalizationSchema: null,
    physicalSpecs: physSpecsSep,
    basePrice: 500000,
    cost: 100000,
    categoryId: baseCatId,
    isFeatured: false,
    images: [],
  });
  console.log(`✓ ${sepPre.slug}`);
  await upsertVariant(
    sepPre.id,
    "SEP-PRE-1",
    "1 separador · diseño a elección",
    { qty: 1, design: "any" },
    5000,
  );
  await upsertVariant(
    sepPre.id,
    "SEP-PRE-3",
    "Pack 3 separadores · 3 diseños",
    { qty: 3, design: "any" },
    10000,
  );
  await upsertVariant(
    sepPre.id,
    "SEP-PRE-5",
    "Pack 5 separadores · 5 diseños",
    { qty: 5, design: "any" },
    15000,
  );
  await upsertVariant(
    sepPre.id,
    "SEP-PRE-10",
    "Pack 10 separadores · sorpresa",
    { qty: 10, design: "any" },
    28000,
  );
  console.log("  4 variantes seteadas");

  console.log("\n✓ DONE. Productos finales activos:");
  const finalActive = await prisma.product.findMany({
    where: { deletedAt: null, isActive: true },
    select: {
      slug: true,
      name: true,
      personalizationKind: true,
      _count: { select: { variants: true } },
    },
    orderBy: { slug: "asc" },
  });
  for (const p of finalActive) {
    console.log(
      `  ${p.slug.padEnd(40)} | ${p.personalizationKind.padEnd(12)} | ${p._count.variants} variantes`,
    );
  }
  console.log(`\nTotal: ${finalActive.length} productos activos`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
