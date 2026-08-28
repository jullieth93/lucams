/*
 * ola2a-frame-options.mjs — Declara `frameOptions` (paleta de marcos del Estudio) en los
 * personalizationSchema de Fotoimanes Polaroid y Fotoimanes Cuadrados (Ola 2A, Lucy
 * 2026-07-22). El "Estilo"/"Marco" deja de ser variante de la PDP → es una plantilla
 * (borde de color) dentro del Estudio.
 *
 * NO toca variantes ni precios: solo agrega la clave frameOptions al JSON del producto,
 * preservando el resto del schema. Idempotente (re-correr deja el mismo valor).
 *
 * Uso: pnpm --filter @lucams/db exec node scripts/ola2a-frame-options.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

// Misma paleta que apps/web/features/personalization/frame-palette.ts (orden de la marca).
const FRAME_OPTIONS = ["blanco", "negro", "aguamarina", "rosa", "lavanda", "amarillo"];

const SLUGS = ["set-fotoimanes-polaroid", "set-fotoimanes-cuadrados"];

const updated = await prisma.$transaction(async (tx) => {
  const out = [];
  for (const slug of SLUGS) {
    const product = await tx.product.findUnique({
      where: { slug },
      select: { id: true, name: true, personalizationSchema: true },
    });
    if (!product) {
      console.log(`⚠ Producto /${slug} no encontrado — omitido`);
      continue;
    }
    console.log(`ANTES  ${product.name}: schema=${JSON.stringify(product.personalizationSchema)}`);
    const schema =
      typeof product.personalizationSchema === "object" && product.personalizationSchema !== null
        ? product.personalizationSchema
        : {};
    const row = await tx.product.update({
      where: { id: product.id },
      data: { personalizationSchema: { ...schema, frameOptions: FRAME_OPTIONS } },
      select: { id: true, name: true, personalizationSchema: true },
    });
    console.log(`DESPUÉS ${row.name}: schema=${JSON.stringify(row.personalizationSchema)}`);
    out.push(row.id);
  }
  return out;
});

console.log(`\n✓ ${updated.length} productos actualizados con frameOptions: ${updated.join(", ")}`);
await prisma.$disconnect();
