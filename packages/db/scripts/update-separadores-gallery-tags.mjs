import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  for (const slug of ["separadores-magneticos", "separadores-alargados"]) {
    const tag = slug;
    const prod = await prisma.product.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, personalizationSchema: true },
    });
    if (!prod) continue;
    const schema = { ...(prod.personalizationSchema ?? {}), galleryTag: tag };
    await prisma.product.update({
      where: { id: prod.id },
      data: { personalizationSchema: schema },
    });
    console.log(`✓ ${slug} galleryTag → ${tag}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
