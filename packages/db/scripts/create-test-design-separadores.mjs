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

  const sessionId = "fixture-design-separadores";
  await prisma.designAsset.deleteMany({ where: { design: { sessionId } } });
  await prisma.design.deleteMany({ where: { sessionId } });

  // Los assets del fixture deben existir DE VERDAD en el bucket (el render
  // server-side los descarga de customer-uploads por storageUrl — antes eran
  // URLs inventadas y el render fallaba con NEEDS_KONVA "no se pudo cargar la
  // foto"). Se sube un PNG 1×1 válido por slot; al render le basta cargarlo.
  // sessionId "fixture-*" (no "test-*"): el teardown global de vitest borra
  // "test-%" y se los comía entre corridas (2026-08-05).
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

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
    const path = `fixture-assets/separadores-${slot}.png`;
    const { error } = await supabase.storage
      .from("customer-uploads")
      .upload(path, PNG_1X1, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`upload a customer-uploads falló: ${error.message}`);
    const a = await prisma.designAsset.create({
      data: {
        designId: design.id,
        storageUrl: path,
        mimeType: "image/png",
        sizeBytes: PNG_1X1.length,
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
    assetUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/customer-uploads/${assets[i].storageUrl}`,
  }));
  await prisma.design.update({ where: { id: design.id }, data: { canvasData: cd } });

  console.log("✓ diseño creado:", design.id);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
