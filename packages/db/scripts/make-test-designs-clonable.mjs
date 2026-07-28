import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Hacer que los diseños de prueba sean clonables por el test (sessionId null).
  for (const sessionId of ["test-design-separadores", "test-design-polaroid-ig"]) {
    const designs = await prisma.design.findMany({ where: { sessionId }, select: { id: true } });
    for (const d of designs) {
      await prisma.design.update({ where: { id: d.id }, data: { sessionId: null } });
    }
    console.log(`✓ ${designs.length} diseños de ${sessionId} → sessionId null`);
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
