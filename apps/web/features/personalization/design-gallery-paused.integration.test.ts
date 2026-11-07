import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listGalleryTagOptions, listGalleryTagVariantAttributes } from "./design-gallery";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `paused-${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
let categoryId = "";
let productId = "";

describe.skipIf(!hasDb)("galería admin — productos pausados", () => {
  afterAll(async () => {
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it("permite preparar diseños y filtros de variante antes de publicar", async () => {
    const category = await prisma.category.create({
      data: { name: RUN, slug: RUN, isActive: true, order: 99 },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: RUN,
        slug: RUN,
        description: "Producto pausado para preparar su galería",
        basePrice: 1_000_000,
        sku: RUN.toUpperCase(),
        categoryId,
        isActive: false,
        isPersonalizable: true,
        personalizationKind: "CUSTOM_DECOR",
        personalizationSchema: { photoSlots: 1, galleryTag: RUN },
        physicalSpecs: { weightGrams: 20, widthCm: 10, heightCm: 8, depthCm: 2 },
        variants: {
          create: [
            {
              name: "Grande",
              sku: `${RUN.toUpperCase()}-V1`,
              price: 1_000_000,
              stock: 10,
              attributes: { sizeCm: "7.1×5", magnet: true },
            },
            {
              name: "Pequeño",
              sku: `${RUN.toUpperCase()}-V2`,
              price: 1_000_000,
              stock: 10,
              attributes: { sizeCm: "5×2.5", magnet: false },
            },
          ],
        },
      },
    });
    productId = product.id;

    const options = await listGalleryTagOptions();
    const option = options.find((candidate) => candidate.tag === RUN);
    expect(option).toBeDefined();
    expect(option?.isActive).toBe(false);
    expect(option?.label).toContain("pausado");
    expect(option?.variantFilterOptions.length).toBeGreaterThan(0);
    await expect(listGalleryTagVariantAttributes(RUN)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizeCm: "7.1×5", magnet: true }),
        expect.objectContaining({ sizeCm: "5×2.5", magnet: false }),
      ]),
    );
  });
});
