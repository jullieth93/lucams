/*
 * Data factory E2E — entidades efímeras con RUN obligatorio
 * (PROMPT_E2E_HOMOLOGACION §5.1). NUNCA toca el catálogo sembrado.
 *
 * Todo lo creado acá cumple los patrones que la limpieza global reconoce
 * (timestamp 13+ dígitos en slug, emails en dominio .test) y además se borra
 * explícitamente con cleanupFactory() en el afterAll del spec.
 *
 * No hay faker en las deps del repo: los generadores de datos de cliente son
 * deterministas y locales (no se agregan dependencias para esto).
 */
import { db } from "./db";

export type EphemeralProduct = {
  productId: string;
  categoryId: string;
  variantId: string;
  slug: string;
  name: string;
  price: number;
};

/**
 * Categoría + producto NO personalizable efímeros (la PDP muestra "Añadir al
 * carrito"; el catálogo real es 100% personalizable y va al Estudio).
 * Mismo patrón que compra.spec.ts / catalog-mode.spec.ts.
 *
 * `opts.withShippingDims` (suite full-mode §7.5): agrega `physicalSpecs`
 * (100 g, 10×2×10 cm) — sin dims la cotización Aveonline falla por diseño
 * (SHIPPING_QUOTE_FAILED). `opts.stock` fija el stock de la variante
 * (default 100; la matriz oversold usa 1).
 */
export async function createEphemeralProduct(
  run: string,
  opts: { withShippingDims?: boolean; stock?: number } = {},
): Promise<EphemeralProduct> {
  const category = await db().category.create({
    data: { slug: `${run}-cat`, name: `Cat ${run}` },
    select: { id: true },
  });
  const product = await db().product.create({
    data: {
      slug: `${run}-simple`,
      name: `E2E ${run}`,
      description: "Producto efímero de la suite E2E (se borra en teardown).",
      basePrice: 19_900,
      sku: `${run}-SIMPLE`.toUpperCase(),
      categoryId: category.id,
      ...(opts.withShippingDims
        ? { physicalSpecs: { weightGrams: 100, widthCm: 10, heightCm: 2, depthCm: 10 } }
        : {}),
      variants: {
        create: [
          {
            name: "Default",
            sku: `${run}-SIMPLE-DEFAULT`.toUpperCase(),
            price: 19_900,
            stock: opts.stock ?? 100,
            attributes: {},
          },
        ],
      },
    },
    select: { id: true, slug: true, name: true, variants: { select: { id: true } } },
  });
  return {
    productId: product.id,
    categoryId: category.id,
    variantId: product.variants[0]!.id,
    slug: product.slug,
    name: product.name,
    price: 19_900,
  };
}

/** Borra el producto efímero (hijas primero, igual que cleanup-test-junk). */
export async function deleteEphemeralProduct(p: EphemeralProduct): Promise<void> {
  await db()
    .cartItem.deleteMany({ where: { variantId: p.variantId } })
    .catch(() => {});
  // InventoryLog referencia la variante (Restrict): los re-stocks por la UI del
  // admin la escriben → sin borrarla, la variante no se puede eliminar (y el
  // catch lo tragaba dejando residuo vivo — detectado 2026-08-06).
  await db()
    .inventoryLog.deleteMany({ where: { variantId: p.variantId } })
    .catch(() => {});
  await db()
    .productVariant.deleteMany({ where: { productId: p.productId } })
    .catch(() => {});
  await db()
    .product.deleteMany({ where: { id: p.productId } })
    .catch(() => {});
  await db()
    .category.deleteMany({ where: { id: p.categoryId } })
    .catch(() => {});
}

/** Datos de cliente/cotización de prueba. Email en .test → red de limpieza. */
export function fakeCustomer(run: string) {
  // El nombre NO admite dígitos (QuoteFormSchema: "El nombre solo puede tener
  // letras") → el timestamp del run se codifica en letras (0→a … 9→j) y el
  // marcador es "Prueba" (sin dígitos): único, trazable y válido.
  const runLetters = run.replace(/\D/g, "").replace(/\d/g, (d) => "abcdefghij"[Number(d)]!);
  return {
    name: `Cliente Prueba ${runLetters}`,
    email: `${run}@e2e.test`,
    // Celular colombiano sintético (300 + 7 dígitos del run): nunca real.
    whatsapp: `300${run.replace(/\D/g, "").slice(-7)}`,
  };
}
