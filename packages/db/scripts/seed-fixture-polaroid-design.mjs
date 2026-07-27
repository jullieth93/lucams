#!/usr/bin/env node
/*
 * Fixture REAL para los tests de finalize server-side (2026-07-27).
 *
 * `finalize-server-render.integration.test.ts` clona un diseño REAL de
 * `set-fotoimanes-polaroid` que tenga TODOS los slots con foto (canvasData v2 +
 * DesignAsset apuntando a un objeto legible del bucket customer-uploads). Las
 * corridas e2e solo dejan borradores vacíos, así que la fixture hay que
 * sembrarla una vez (idempotente: si ya existe una válida, no hace nada).
 *
 * Uso:
 *   cd packages/db && pnpm dotenv -e ../../apps/web/.env.local -- node scripts/seed-fixture-polaroid-design.mjs
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY");
  process.exit(1);
}

const BUCKET = "customer-uploads";
const SLUG = "set-fotoimanes-polaroid";
const SESSION = "fixture-server-render-polaroid";

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
  if (!donor) throw new Error("No hay canvasData v2 de referencia para polaroid");
  const donorFull = await prisma.design.findUnique({
    where: { id: donor.id },
    select: { canvasData: true, templateId: true, metadata: true },
  });
  const donorCd = donorFull.canvasData;
  const slotCount = donorCd.slotCount ?? donorCd.slots?.length ?? 12;

  // PNG real (rostros no hacen falta: basta un bitmap legible por el render).
  const png = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
        <rect width="600" height="400" fill="#7B61FF"/>
        <circle cx="300" cy="200" r="120" fill="#FFD166"/>
        <text x="300" y="215" font-size="48" text-anchor="middle" fill="#1A103C" font-family="sans-serif">Fixture</text>
      </svg>`,
      "utf-8",
    ),
  )
    .png()
    .toBuffer();

  // Diseño + assets (todas las slots apuntan al MISMO objeto de Storage; los
  // tests de fallback no renderizan, solo validan tickets/propiedad).
  //
  // El unitTemplate se fuerza a la variante INSTAGRAM (chrome `ig_post` SVG):
  // es el caso real que el test de fallback documenta — "marco SVG con fuentes
  // horneadas" que ningún tier server-side reproduce → NEEDS_CLIENT_SLOTS. Los
  // borradores que dejan las corridas e2e son de la Polaroid Clásica (frame-card,
  // sí renderizable en servidor), así que sin esta capa el finalize saldría por
  // el camino normal y el fallback nunca se ejercitaría.
  const ut = donorCd.unitTemplate ?? {};
  const utLayers = Array.isArray(ut.layers) ? ut.layers : [];
  const tieneChromeIg = utLayers.some(
    (l) => l && l.type === "asset" && typeof l.src === "string" && l.src.includes("ig_post"),
  );
  const unitTemplate = tieneChromeIg
    ? ut
    : {
        ...ut,
        layers: [
          ...utLayers,
          {
            id: "ig-chrome",
            type: "asset",
            src: "/templates/ig_post_3x4.svg",
            x: 0,
            y: 0,
            width: ut.stage?.width ?? 1080,
            height: ut.stage?.height ?? 1350,
            rotation: 0,
          },
        ],
      };
  const design = await prisma.design.create({
    data: {
      productId: product.id,
      templateId: donorFull.templateId,
      sessionId: SESSION,
      status: "DRAFT",
      canvasData: { ...donorCd, unitTemplate, slots: [] },
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
        width: 600,
        height: 400,
      },
      select: { id: true },
    });
    slots.push({ assetId: asset.id, assetUrl: publicUrl, slotIndex: i });
  }
  await prisma.design.update({
    where: { id: design.id },
    data: { canvasData: { ...donorCd, unitTemplate, slots } },
  });

  console.log(`Fixture creada: design ${design.id} · ${slotCount} slots · asset ${path} ✓`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
