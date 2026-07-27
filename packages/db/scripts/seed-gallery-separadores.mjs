#!/usr/bin/env node
/*
 * Seed de diseños prediseñados para Separadores de Libros.
 * Genera SVGs vectoriales, los sube al bucket público product-images y
 * crea registros en DesignGalleryImage (tag='separadores').
 * Los SVGs se convierten a PNG en el pipeline de impresión vía sharp.
 *
 * Uso:
 *   cd packages/db && pnpm dotenv -e ../../.env.local -- node scripts/seed-gallery-separadores.mjs
 *
 * Si ya existen diseños con el mismo nombre dentro del tag, se omiten.
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

const BUCKET = "product-images";
const TAG = "separadores";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const prisma = new PrismaClient();

const PALETTE = {
  purple: "#7B61FF",
  pink: "#FF61B6",
  teal: "#2EC4B6",
  yellow: "#FFD166",
  coral: "#EF476F",
  dark: "#1A103C",
  cream: "#FFF8F0",
  sky: "#A8DADC",
  lime: "#B5E48C",
};

function makeBookmarkSVG({ title, subtitle, colors, pattern = "dots", textColor = PALETTE.dark }) {
  const w = 600;
  const h = 1800;

  const patterns = {
    dots: colors
      .map(
        (c, i) =>
          `<circle cx="${100 + i * 120}" cy="160" r="60" fill="${c}" opacity="0.85"/>` +
          `<circle cx="${40 + i * 140}" cy="400" r="40" fill="${c}" opacity="0.6"/>`,
      )
      .join(""),
    stripes: `<rect x="0" y="0" width="${w}" height="${h}" fill="${colors[0]}"/>` +
      colors
        .slice(1)
        .map(
          (c, i) =>
            `<rect x="${(i * w) / (colors.length - 1)}" y="0" width="${w / (colors.length - 1)}" height="${h}" fill="${c}" opacity="0.5"/>`,
        )
        .join(""),
    hex: colors
      .map(
        (c, i) =>
          `<path d="M${100 + i * 110},120 l55,95 l-55,95 l-110,0 l-55,-95 l55,-95 z" transform="translate(0, ${i * 40})" fill="${c}" opacity="0.75"/>`,
      )
      .join(""),
    stars: `<rect x="0" y="0" width="${w}" height="${h}" fill="${PALETTE.cream}"/>` +
      colors
        .map(
          (c, i) =>
            `<path d="M${80 + (i % 3) * 180},${140 + Math.floor(i / 3) * 180} l15,-45 l45,15 l-30,30 l30,30 l-45,15 l-15,45 l-15,-45 l-45,-15 l30,-30 l-30,-30 z" fill="${c}" opacity="0.8"/>`,
        )
        .join(""),
    waves: `<rect x="0" y="0" width="${w}" height="${h}" fill="${colors[0]}"/>` +
      colors
        .slice(1)
        .map(
          (c, i) =>
            `<path d="M0,${200 + i * 180} Q150,${100 + i * 180} 300,${200 + i * 180} T600,${200 + i * 180} V${h} H0 Z" fill="${c}" opacity="0.6"/>`,
        )
        .join(""),
  };

  const lines = title.split("\\n").map((t, i) => {
    const y = 1050 + i * 90;
    const fontSize = Math.min(90, 420 / Math.max(t.length, 6));
    return `<text x="50%" y="${y}" text-anchor="middle" font-family="Georgia, serif" font-size="${fontSize}" font-weight="bold" fill="${textColor}">${escapeXml(t)}</text>`;
  });

  const subtitleLines = subtitle.split("\\n").map((t, i) => {
    const y = 1300 + i * 60;
    return `<text x="50%" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" fill="${textColor}" opacity="0.85">${escapeXml(t)}</text>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${colors[0]}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${colors[colors.length - 1]}" stop-opacity="0.15"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg)"/>
  ${patterns[pattern]}
  ${lines.join("\n  ")}
  ${subtitleLines.join("\n  ")}
  <text x="50%" y="${h - 60}" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="${textColor}" opacity="0.6">lucamsshop.com</text>
</svg>`;
}

function makeSquareSVG({ title, colors, pattern = "dots" }) {
  const w = 600;
  const h = 600;
  const patterns = {
    dots: colors
      .map(
        (c, i) =>
          `<circle cx="${100 + (i % 3) * 180}" cy="${100 + Math.floor(i / 3) * 180}" r="60" fill="${c}" opacity="0.8"/>`,
      )
      .join(""),
    stripes: colors
      .map(
        (c, i) =>
          `<rect x="${i * (w / colors.length)}" y="0" width="${w / colors.length}" height="${h}" fill="${c}" opacity="0.6"/>`,
      )
      .join(""),
    hex: `<rect x="0" y="0" width="${w}" height="${h}" fill="${colors[0]}"/>` +
      colors
        .slice(1)
        .map(
          (c, i) =>
            `<path d="M${80 + (i % 2) * 260},${120 + Math.floor(i / 2) * 260} l60,104 l-60,104 l-120,0 l-60,-104 l60,-104 z" transform="translate(0,0)" fill="${c}" opacity="0.7"/>`,
        )
        .join(""),
    stars: `<rect x="0" y="0" width="${w}" height="${h}" fill="${PALETTE.cream}"/>` +
      colors
        .map(
          (c, i) =>
            `<path d="M${150 + (i % 2) * 240},${150 + Math.floor(i / 2) * 240} l25,-75 l75,25 l-50,50 l50,50 l-75,25 l-25,75 l-25,-75 l-75,-25 l50,-50 l-50,-50 z" fill="${c}" opacity="0.85"/>`,
        )
        .join(""),
    waves: `<rect x="0" y="0" width="${w}" height="${h}" fill="${colors[0]}"/>` +
      colors
        .slice(1)
        .map(
          (c, i) =>
            `<path d="M0,${150 + i * 120} Q150,${50 + i * 120} 300,${150 + i * 120} T600,${150 + i * 120} V${h} H0 Z" fill="${c}" opacity="0.6"/>`,
        )
        .join(""),
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="0" y="0" width="${w}" height="${h}" fill="${PALETTE.cream}" opacity="0.4"/>
  ${patterns[pattern]}
  <text x="50%" y="55%" text-anchor="middle" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="${PALETTE.dark}">${escapeXml(title)}</text>
</svg>`;
}

function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const DESIGNS = [
  {
    name: "Geometría colorida",
    kind: "bookmark",
    title: "SÉ FELIZ\\nSUEÑA",
    subtitle: "Sonríe cada día",
    colors: [PALETTE.purple, PALETTE.teal, PALETTE.yellow, PALETTE.pink],
    pattern: "hex",
  },
  {
    name: "Lectura inspiradora",
    kind: "bookmark",
    title: "LEE\\nAMA",
    subtitle: "Un libro, un viaje",
    colors: [PALETTE.coral, PALETTE.yellow, PALETTE.sky],
    pattern: "waves",
  },
  {
    name: "Flores acuarela",
    kind: "bookmark",
    title: "FLORES\\nPARA TI",
    subtitle: "Pequeños detalles",
    colors: [PALETTE.pink, PALETTE.purple, PALETTE.lime],
    pattern: "dots",
  },
  {
    name: "Minimalista",
    kind: "bookmark",
    title: "MENOS\\nES MÁS",
    subtitle: "Diseño limpio",
    colors: [PALETTE.dark, PALETTE.cream, PALETTE.teal],
    pattern: "stripes",
  },
  {
    name: "Universo",
    kind: "bookmark",
    title: "SOÑAR\\nEN GRANDE",
    subtitle: "El cielo no es el límite",
    colors: [PALETTE.dark, PALETTE.purple, PALETTE.sky, PALETTE.yellow],
    pattern: "stars",
  },
  {
    name: "Tropical",
    kind: "bookmark",
    title: "SOL\\nY ARENA",
    subtitle: "Buenas vibras",
    colors: [PALETTE.yellow, PALETTE.teal, PALETTE.coral],
    pattern: "waves",
  },
  {
    name: "Colombia",
    kind: "bookmark",
    title: "COLOMBIA\\nQUERIDA",
    subtitle: "Amarillo, azul y rojo",
    colors: [PALETTE.yellow, "#003893", "#CE1126"],
    pattern: "stripes",
  },
  {
    name: "Profesiones",
    kind: "bookmark",
    title: "FUTURO\\nBRILLANTE",
    subtitle: "Eres capaz de todo",
    colors: [PALETTE.purple, PALETTE.pink, PALETTE.teal, PALETTE.yellow],
    pattern: "dots",
  },
  {
    name: "Cuadrado geométrico",
    kind: "square",
    title: "AMOR",
    colors: [PALETTE.purple, PALETTE.teal, PALETTE.yellow],
    pattern: "hex",
  },
  {
    name: "Cuadrado floral",
    kind: "square",
    title: "FLORES",
    colors: [PALETTE.pink, PALETTE.lime, PALETTE.sky],
    pattern: "dots",
  },
  {
    name: "Cuadrado minimal",
    kind: "square",
    title: "PAZ",
    colors: [PALETTE.cream, PALETTE.dark, PALETTE.teal],
    pattern: "stripes",
  },
  {
    name: "Cuadrado universo",
    kind: "square",
    title: "ESTRELLAS",
    colors: [PALETTE.dark, PALETTE.yellow, PALETTE.purple],
    pattern: "stars",
  },
];

async function uploadPngFromSVG(name, svgString) {
  const png = await sharp(Buffer.from(svgString, "utf-8"))
    .png({ quality: 95, compressionLevel: 8 })
    .toBuffer();
  const filename = `gallery-${TAG}/${randomUUID()}.png`;
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(filename, png, {
    contentType: "image/png",
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadErr) throw new Error(`Upload ${name}: ${uploadErr.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

async function main() {
  const existing = await prisma.designGalleryImage.findMany({
    where: { tag: TAG },
    select: { id: true, name: true },
  });
  console.log(`Diseños existentes para tag '${TAG}': ${existing.length}`);

  for (const d of DESIGNS) {
    const already = existing.find((e) => e.name === d.name);
    if (already) {
      console.log(`  Omitido (ya existe): ${d.name}`);
      continue;
    }

    const svg = d.kind === "bookmark" ? makeBookmarkSVG(d) : makeSquareSVG(d);
    const svgB =
      d.kind === "bookmark"
        ? makeBookmarkSVG({
            ...d,
            colors: [PALETTE.cream, PALETTE.cream, PALETTE.purple],
            pattern: "stripes",
            subtitle: "lucamsshop.com",
            title: "\\n",
          })
        : makeSquareSVG({
            ...d,
            title: "",
            colors: [PALETTE.cream, PALETTE.cream, PALETTE.purple],
            pattern: "stripes",
          });

    const [urlA, urlB] = await Promise.all([
      uploadPngFromSVG(`${d.name} A`, svg),
      uploadPngFromSVG(`${d.name} B`, svgB),
    ]);

    await prisma.designGalleryImage.create({
      data: {
        tag: TAG,
        name: d.name,
        imageUrl: urlA,
        imageUrlB: urlB,
        order: DESIGNS.indexOf(d),
        isActive: true,
      },
    });
    console.log(`  Creado: ${d.name}`);
  }

  await prisma.$disconnect();
  console.log("Seed completado.");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
