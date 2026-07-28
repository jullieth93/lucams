import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const product = await prisma.product.findFirst({
    where: { slug: "set-fotoimanes-polaroid", deletedAt: null },
    select: { id: true },
  });
  if (!product) throw new Error("producto no encontrado");

  const template = await prisma.personalizationTemplate.findFirst({
    where: { productId: product.id, slug: "photo-pack-polaroid-instagram" },
    select: { id: true, canvasData: true },
  });
  if (!template) throw new Error("plantilla no encontrada");

  const sessionId = "test-design-polaroid-ig";
  await prisma.designAsset.deleteMany({ where: { design: { sessionId } } });
  await prisma.design.deleteMany({ where: { sessionId } });

  // CanvasData V2 con 12 slots (fotoimanes) llenos.
  const slots = Array.from({ length: 12 }, (_, i) => ({
    slotIndex: i,
    assetId: "will-be-filled",
    assetUrl: "will-be-filled",
  }));
  const canvasData = {
    version: 2,
    unitTemplate: template.canvasData,
    slotCount: 12,
    slots,
    gridLayout: { cols: 4, rows: 3, gap: 12 },
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
  for (let i = 0; i < 12; i++) {
    const a = await prisma.designAsset.create({
      data: {
        designId: design.id,
        storageUrl: `test-assets/polaroid-${i}.jpg`,
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
