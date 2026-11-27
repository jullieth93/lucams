import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
}));

import { prisma } from "@/lib/db";
import { createProduct, createVariant, updateProduct, updateVariant } from "./service";
import { setVariantStockAdmin, VariantStockError } from "./stock-admin";
import type { ProductCreateInput } from "./schemas";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `itest-fulfillment-${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
let categoryId = "";

function uniq() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function productInput(over: Partial<ProductCreateInput> = {}): ProductCreateInput {
  const id = uniq();
  return {
    name: `Producto ${RUN} ${id}`,
    slug: `${RUN}-${id}`,
    description: "Producto de integración con descripción válida",
    basePrice: 20_000,
    compareAtPrice: null,
    cost: null,
    sku: `${RUN}-${id}`.toUpperCase(),
    categoryId,
    isPersonalizable: false,
    isActive: true,
    isFeatured: false,
    ...over,
  };
}

describe.skipIf(!hasDb)("catálogo omnicanal — PostgreSQL real", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    categoryId = (
      await prisma.category.create({
        data: { slug: `${RUN}-cat`, name: `Categoría ${RUN}` },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.urlRedirect.deleteMany({
      where: { fromPath: { startsWith: `/producto/${RUN}` } },
    });
    await prisma.productVariant.deleteMany({ where: { product: { slug: { startsWith: RUN } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: RUN } } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it("el estándar permite PHYSICAL_STOCK y conserva el toggle de publicación", async () => {
    const product = await createProduct(
      productInput({ fulfillmentMode: "PHYSICAL_STOCK", publishedOnStorefront: false }),
      "admin-test",
    );
    expect(product.fulfillmentMode).toBe("PHYSICAL_STOCK");
    expect(product.publishedOnStorefront).toBe(false);

    const updated = await updateProduct(
      { id: product.id, fulfillmentMode: "PHYSICAL_STOCK", publishedOnStorefront: true },
      "admin-test",
    );
    expect(updated.fulfillmentMode).toBe("PHYSICAL_STOCK");
    expect(updated.publishedOnStorefront).toBe(true);
  });

  it("createProduct fuerza MADE_TO_ORDER para kind, flag legacy y letterSet", async () => {
    const cases: Array<Partial<ProductCreateInput>> = [
      { personalizationKind: "PHOTO_PACK" },
      { isPersonalizable: true },
      { personalizationKind: "NONE", letterSet: "full" },
      { personalizationKind: "NONE", letterSet: "vowels" },
    ];
    for (const over of cases) {
      const product = await createProduct(
        productInput({ ...over, fulfillmentMode: "PHYSICAL_STOCK" }),
        null,
      );
      expect(product.fulfillmentMode).toBe("MADE_TO_ORDER");
    }
  });

  it("una variante name fuerza el modo incluso al editar después el producto", async () => {
    const product = await createProduct(productInput(), null);
    const variant = await createVariant(
      {
        productId: product.id,
        name: "Nombre",
        sku: `${product.sku}-NAME`,
        stock: 7,
        safetyStock: 2,
        isActive: true,
        attributes: { variant: "name" },
      },
      null,
    );
    expect(variant.safetyStock).toBe(2);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.fulfillmentMode).toBe(
      "MADE_TO_ORDER",
    );

    await prisma.product.update({
      where: { id: product.id },
      data: { fulfillmentMode: "PHYSICAL_STOCK" },
    });
    const updated = await updateProduct(
      { id: product.id, fulfillmentMode: "PHYSICAL_STOCK" },
      null,
    );
    expect(updated.fulfillmentMode).toBe("MADE_TO_ORDER");

    const variantUpdated = await updateVariant({ id: variant.id, safetyStock: 4 }, null);
    expect(variantUpdated.safetyStock).toBe(4);
  });

  it("setVariantStockAdmin rechaza ajustes manuales sobre variantes MADE_TO_ORDER sin escribir InventoryLog", async () => {
    const product = await createProduct(productInput({ personalizationKind: "PHOTO_PACK" }), null);
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { productId: product.id },
      select: { id: true, stock: true },
    });
    expect(variant.stock).toBe(0);

    await expect(
      setVariantStockAdmin({ variantId: variant.id, newStock: 25, adminId: "admin-test" }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof VariantStockError && err.code === "made_to_order",
    );

    const after = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
      select: { stock: true },
    });
    expect(after.stock).toBe(0);
    const logs = await prisma.inventoryLog.count({ where: { variantId: variant.id } });
    expect(logs).toBe(0);
  });
});
