import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Reasignar diseños prediseñados de separadores al tag específico.
  // Los "Cuadrado" son para magnéticos; el resto, también por ahora.
  const items = await prisma.designGalleryImage.findMany({
    where: { tag: "separadores", isActive: true },
    select: { id: true, name: true },
  });
  for (const it of items) {
    await prisma.designGalleryImage.update({
      where: { id: it.id },
      data: { tag: "separadores-magneticos" },
    });
    console.log(`✓ ${it.name} → separadores-magneticos`);
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
