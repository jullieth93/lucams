#!/usr/bin/env node
/*
 * Fixture REAL para los tests de finalize server-side (2026-09-18).
 *
 * `finalize-server-render.integration.test.ts` clona diseños REALES de
 * `separadores-magneticos` Y de `set-fotoimanes-polaroid` (ver
 * seed-fixture-polaroid-design.mjs). Esta variante siembra el de separadores:
 * canvasData v2 con TODOS los slots (caras A/B) con foto + DesignAsset
 * apuntando a un objeto legible del bucket customer-uploads.
 *
 * A DIFERENCIA de la fixture polaroid, acá NO se inyecta el chrome IG: los
 * tests de separadores ejercitan el CAMINO NORMAL (el servidor sí renderiza
 * las plantillas de separadores) — con el chrome `ig_post` saldrían por el
 * fallback y el camino normal quedaría sin cobertura.
 *
 * Uso:
 *   cd packages/db && pnpm dotenv -e ../../.env.local -- node scripts/seed-fixture-separadores-design.mjs
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

// Guarda de ambiente (N-06, 2026-09-12): sube assets reales al bucket y crea
// un Design fixture — bloquea PRD/remotos no STG.
assertDestructiveAllowed("seed-fixture-separadores-design.mjs");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY");
  process.exit(1);
}

const BUCKET = "customer-uploads";
const SLUG = "separadores-magneticos";
const SESSION = "fixture-server-render-separadores";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const prisma = new PrismaClient();

function esFixtureValida(d, assetsCount) {
  const cd = d.canvasData ?? {};
  const slots = cd.slots ?? [];
  return (
    cd.version === 2 &&
    slots.length > 0 &&
    // assetId Y assetUrl: la guardia de finalizeDesign rechaza slots sin assetUrl.
    slots.every((s) => s && s.assetId && s.assetUrl) &&
    assetsCount > 0
  );
}

async function main() {
  const product = await prisma.product.findFirst({
    where: { slug: SLUG },
    select: { id: true },
  });
  if (!product) throw new Error(`Producto ${SLUG} no existe`);

  // ¿Ya hay fixture válida? (cualquier diseño del producto que cumpla el criterio
  // del helper clonarBorradorReal sirve — el test toma el más reciente).
  const candidatos = await prisma.design.findMany({
    where: { productId: product.id },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: { id: true, canvasData: true },
  });
  for (const c of candidatos) {
    const n = await prisma.designAsset.count({ where: { designId: c.id } });
    if (esFixtureValida(c, n)) {
      console.log(`Ya existe fixture válida (${c.id}). Nada que hacer. ✓`);
      return;
    }
  }

  // Donante estructural: el diseño más reciente con canvas v2 (slots/grid del
  // producto real, aunque vengan vacíos de las corridas e2e).
  const donor = candidatos.find((c) => (c.canvasData ?? {}).version === 2);
  if (!donor) throw new Error("No hay canvasData v2 de referencia para separadores");
  const donorFull = await prisma.design.findUnique({
    where: { id: donor.id },
    select: { canvasData: true, templateId: true, metadata: true },
  });
  const donorCd = donorFull.canvasData;
  const slotCount = donorCd.slotCount ?? donorCd.slots?.length ?? 2;

  // PNG real (rostros no hacen falta: basta un bitmap legible por el render).
  const png = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">
        <rect width="400" height="600" fill="#3D2E5C"/>
        <circle cx="200" cy="300" r="120" fill="#7B61FF"/>
        <text x="200" y="315" font-size="44" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif">Fixture</text>
      </svg>`,
      "utf-8",
    ),
  )
    .png()
    .toBuffer();

  // Diseño + assets (todas las caras apuntan al MISMO objeto de Storage; el
  // render server-side solo necesita un bitmap legible).
  const design = await prisma.design.create({
    data: {
      productId: product.id,
      templateId: donorFull.templateId,
      sessionId: SESSION,
      status: "DRAFT",
      canvasData: { ...donorCd, slots: [] },
      metadata: donorFull.metadata ?? undefined,
    },
    select: { id: true },
  });

  const path = `${SESSION}/${design.id}/${randomUUID()}.png`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, png, {
    contentType: "image/png",
    upsert: false,
  });
  if (upErr) throw new Error(`Upload fixture: ${upErr.message}`);

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    const asset = await prisma.designAsset.create({
      data: {
        designId: design.id,
        storageUrl: path,
        mimeType: "image/png",
        sizeBytes: png.length,
        width: 400,
        height: 600,
      },
      select: { id: true },
    });
    slots.push({ assetId: asset.id, assetUrl: publicUrl, slotIndex: i });
  }
  await prisma.design.update({
    where: { id: design.id },
    data: { canvasData: { ...donorCd, slots } },
  });

  console.log(`Fixture creada: design ${design.id} · ${slotCount} slots · asset ${path} ✓`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
