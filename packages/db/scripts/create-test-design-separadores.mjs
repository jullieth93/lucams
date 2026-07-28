import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const product = await prisma.product.findFirst({
    where: { slug: "separadores-magneticos", deletedAt: null },
    select: { id: true },
  });
  if (!product) throw new Error("producto no encontrado");

  const template = await prisma.personalizationTemplate.findFirst({
    where: { productId: product.id, slug: "sep-mag-2x6" },
    select: { id: true, canvasData: true },
  });
  if (!template) throw new Error("plantilla no encontrada");

  const sessionId = "test-design-separadores";
  await prisma.designAsset.deleteMany({ where: { design: { sessionId } } });
  await prisma.design.deleteMany({ where: { sessionId } });

  // CanvasData V2 con 2 slots (cara A y B) llenos.
  const canvasData = {
    version: 2,
    unitTemplate: template.canvasData,
    slotCount: 2,
    slots: [
      { slotIndex: 0, assetId: "will-be-filled", assetUrl: "will-be-filled" },
      { slotIndex: 1, assetId: "will-be-filled", assetUrl: "will-be-filled" },
    ],
    gridLayout: { cols: 2, rows: 1, gap: 24 },
  };

  const design = await prisma.design.create({
    data: {
      productId: product.id,
      templateId: template.id,
      sessionId,
      status: "DRAFT",
      canvasData,
    },
    select: { id: true },
  });

  const assets = [];
  for (const slot of [0, 1]) {
    const a = await prisma.designAsset.create({
      data: {
        designId: design.id,
        storageUrl: `test-assets/separadores-${slot}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1000,
        width: 800,
        height: 800,
      },
      select: { id: true, storageUrl: true },
    });
    assets.push(a);
  }

  const cd = { ...canvasData };
  cd.slots = cd.slots.map((s, i) => ({
    ...s,
    assetId: assets[i].id,
    assetUrl: `https://test.supabase.co/storage/v1/object/sign/customer-uploads/${assets[i].storageUrl}`,
  }));
  await prisma.design.update({ where: { id: design.id }, data: { canvasData: cd } });

  console.log("✓ diseño creado:", design.id);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
