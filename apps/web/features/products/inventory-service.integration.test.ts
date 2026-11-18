import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getInventorySummary,
  listCategoriesForInventoryFilter,
  listVariantsAcrossProducts,
} from "./inventory-service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `itest-inventory-${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
let physicalCategoryId = "";
let madeCategoryId = "";
let physicalProductId = "";
let madeProductId = "";

describe.skipIf(!hasDb)("/admin/inventario — PostgreSQL real", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    physicalCategoryId = (
      await prisma.category.create({
        data: { slug: `${RUN}-physical-cat`, name: `Físicos ${RUN}`, isActive: true },
      })
    ).id;
    madeCategoryId = (
      await prisma.category.create({
        data: { slug: `${RUN}-made-cat`, name: `Bajo pedido ${RUN}`, isActive: true },
      })
    ).id;
    physicalProductId = (
      await prisma.product.create({
        data: {
          slug: `${RUN}-physical`,
          name: `Físico ${RUN}`,
          description: "Producto físico de prueba",
          basePrice: 10_000,
          sku: `${RUN}-PHYSICAL`.toUpperCase(),
          categoryId: physicalCategoryId,
          fulfillmentMode: "PHYSICAL_STOCK",
          variants: {
            create: [
              {
                name: "Disponible",
                sku: `${RUN}-AVAILABLE`.toUpperCase(),
                stock: 10,
                safetyStock: 2,
                attributes: {},
              },
              {
                name: "Reservada",
                sku: `${RUN}-RESERVED`.toUpperCase(),
                stock: 3,
                safetyStock: 3,
                attributes: {},
              },
            ],
          },
        },
      })
    ).id;
    madeProductId = (
      await prisma.product.create({
        data: {
          slug: `${RUN}-made`,
          name: `Bajo pedido ${RUN}`,
          description: "Producto bajo pedido de prueba",
          basePrice: 10_000,
          sku: `${RUN}-MADE`.toUpperCase(),
          categoryId: madeCategoryId,
          fulfillmentMode: "MADE_TO_ORDER",
          variants: {
            create: {
              name: "Legacy",
              sku: `${RUN}-MADE-LEGACY`.toUpperCase(),
              stock: 100_000,
              attributes: {},
            },
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    const productIds = [physicalProductId, madeProductId].filter(Boolean);
    if (productIds.length > 0) {
      await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    const categoryIds = [physicalCategoryId, madeCategoryId].filter(Boolean);
    if (categoryIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    }
  });

  it("lista solo PHYSICAL_STOCK y expone físico, reserva y disponible neto", async () => {
    const data = await listVariantsAcrossProducts({ q: RUN });
    expect(data.rows).toHaveLength(2);
    expect(data.rows.every((row) => !row.productName.includes("Bajo pedido"))).toBe(true);
    const available = data.rows.find((row) => row.variantSku.endsWith("AVAILABLE"));
    const reserved = data.rows.find((row) => row.variantSku.endsWith("RESERVED"));
    expect(available).toMatchObject({ stock: 10, safetyStock: 2, availableStock: 8, status: "ok" });
    expect(reserved).toMatchObject({ stock: 3, safetyStock: 3, availableStock: 0, status: "out" });

    const out = await listVariantsAcrossProducts({ q: RUN, status: "out" });
    expect(out.rows.map((row) => row.variantSku)).toEqual([reserved?.variantSku]);
  });

  it("el resumen y las categorías no incluyen el buffer MADE_TO_ORDER", async () => {
    const summary = await getInventorySummary();
    expect(summary.totalVariants).toBeGreaterThanOrEqual(2);
    expect(summary.outCount).toBeGreaterThanOrEqual(1);
    expect(summary.totalUnits).toBeGreaterThanOrEqual(13);

    const categories = await listCategoriesForInventoryFilter();
    expect(categories.map((category) => category.id)).toContain(physicalCategoryId);
    expect(categories.map((category) => category.id)).not.toContain(madeCategoryId);

    const madeRows = await listVariantsAcrossProducts({ categoryId: madeCategoryId });
    expect(madeRows.rows).toEqual([]);
    expect(madeRows.total).toBe(0);
  });
});
