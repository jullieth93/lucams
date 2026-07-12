/*
 * ADR-057 — Sets de fichas por defecto (Español + Inglés), vacíos y listos para que
 * Lucy suba las 53 ilustraciones en el admin. Idempotente (upsert por nombre+idioma).
 *
 * Uso: DATABASE_URL=$DIRECT_URL node packages/db/scripts/seed-letter-sets.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SETS = [
  { name: "Kawaii Animales · Español", language: "es" },
  { name: "Kawaii Animals · English", language: "en" },
];

async function main() {
  for (const s of SETS) {
    const existing = await prisma.letterTileSet.findFirst({
      where: { name: s.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      await prisma.letterTileSet.update({
        where: { id: existing.id },
        data: { isActive: true, isDefault: true, deletedAt: null },
      });
      console.log(`~ ${s.name} (ya existía)`);
    } else {
      await prisma.letterTileSet.create({
        data: { name: s.name, language: s.language, isActive: true, isDefault: true },
      });
      console.log(`+ ${s.name}`);
    }
  }
  console.log("✓ DONE. Sube las fichas en /admin/contenido/fichas.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
