import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";
import { NEW_PRODUCT_GALLERY } from "./lib/new-products.mjs";

const APPLY = process.argv.includes("--apply");
const ACTOR = "system:seed-new-product-gallery";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const stripQuotes = (value) => value?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);
assertDestructiveAllowed("seed-new-product-gallery.mjs");

const supabaseUrl = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const secretKey = stripQuotes(process.env.SUPABASE_SECRET_KEY);
if (APPLY && (!supabaseUrl || !secretKey)) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const prisma = new PrismaClient();
const supabase = APPLY
  ? createClient(supabaseUrl, secretKey, { auth: { persistSession: false } })
  : null;

function publicUrl(path) {
  return `${supabaseUrl}/storage/v1/object/public/product-images/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function watermarkTile(width, height) {
  const text = (x, y) =>
    `<text x="${x}" y="${y}" fill="#ffffff" fill-opacity="0.30" stroke="#000000" stroke-opacity="0.10" stroke-width="1.2">LUCAMS</text>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 380 230"><g font-family="DejaVu Sans, Verdana, sans-serif" font-size="36" font-weight="700" letter-spacing="8"><g transform="rotate(-24 190 115)">${text(20, 96)}${text(200, 212)}</g></g></svg>`,
  );
}

async function upload(path, data) {
  const { error } = await supabase.storage.from("product-images").upload(path, data, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`${path}: ${error.message}`);
}

for (const item of NEW_PRODUCT_GALLERY) {
  console.log(`${APPLY ? "Sembrando" : "Se sembraría"} ${item.tag} · ${item.name}`);
  if (!APPLY) continue;
  const svg = await readFile(join(root, "apps/web/public/templates", `${item.fileBase}.svg`));
  const master = await sharp(svg)
    .resize(item.width * 3, item.height * 3)
    .webp({ quality: 90 })
    .toBuffer();
  const resized = await sharp(svg)
    .resize(800, 800, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  const thumb = await sharp(resized.data)
    .composite([
      {
        input: watermarkTile(Math.min(380, resized.info.width), Math.min(230, resized.info.height)),
        tile: true,
      },
    ])
    .webp({ quality: 78 })
    .toBuffer();
  const masterPath = `gallery-${item.tag}/${item.fileBase}.webp`;
  const thumbPath = `gallery-${item.tag}/thumbs/${item.fileBase}.webp`;
  await upload(masterPath, master);
  await upload(thumbPath, thumb);
  const imageUrl = publicUrl(masterPath);
  const data = {
    tag: item.tag,
    name: item.name,
    imageUrl,
    imageUrlB: null,
    variantFilter: { sizeCm: item.sizeCm },
    order: item.order,
    updatedBy: ACTOR,
  };
  const existing = await prisma.designGalleryImage.findFirst({
    where: { tag: item.tag, name: item.name },
    select: { id: true },
  });
  if (existing) {
    await prisma.designGalleryImage.update({ where: { id: existing.id }, data });
  } else {
    await prisma.designGalleryImage.create({
      data: { ...data, isActive: true, createdBy: ACTOR },
    });
  }
}

console.log(`${APPLY ? "Aplicados" : "Pendientes"}: ${NEW_PRODUCT_GALLERY.length} diseños.`);
await prisma.$disconnect();
