#!/usr/bin/env node
/*
 * design-preview-watermarks-20261013.mjs — BACKFILL de los artefactos watermark
 * de previews de diseños YA finalizados (READY / USED_IN_ORDER).
 *
 * Desde 2026-10-13 el finalize genera, junto al preview limpio
 * (design-previews/<designId>/preview.<ext>), las versiones de EXHIBICIÓN con
 * marca de agua en tiling "LUCAMS":
 *
 *   <designId>/preview-wm.webp   preview global watermark (mismo tamaño)
 *   <designId>/thumb.webp        miniatura representativa watermark (≤800 px)
 *
 * y Design.previewWatermarkedAt sella su existencia. Los diseños anteriores al
 * cambio no los tienen y las superficies caen al preview LIMPIO (fallback). Este
 * one-shot los genera desde el preview público existente. Las PÁGINAS por unidad
 * históricas NO se pueden reconstruir sin el canvas del cliente — para esos
 * diseños el "Ver" paginado del carrito cae al preview global watermarked
 * (fallback documentado en features/personalization/preview-artifacts.ts).
 *
 * Idempotente: solo procesa diseños con previewWatermarkedAt null; re-correr no
 * retrabaja nada (y el upsert pisa los mismos paths deterministas si algo quedó
 * a medias). No toca columnas ni bytes ajenos.
 *
 * Uso (desde packages/db):
 *   pnpm exec dotenv -e ../../.env.local -- node scripts/one-shot/design-preview-watermarks-20261013.mjs           # DRY-RUN
 *   pnpm exec dotenv -e ../../.env.local -- node scripts/one-shot/design-preview-watermarks-20261013.mjs --apply   # aplica
 * Contra un remoto no permitido la env-guard (N-06) lo bloquea; si la corrida es
 * deliberada: LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 … --apply
 *
 * Manifiesto: tmp/backups/design-preview-watermarks-<ISO>.json con el resultado
 * por diseño (ok / fail + motivo) para auditoría.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
if (APPLY) assertDestructiveAllowed("design-preview-watermarks-20261013.mjs");
for (const arg of process.argv.slice(2)) {
  if (arg !== "--apply") {
    console.error(`✗ argumento no reconocido: ${arg} (válidos: --apply)`);
    process.exit(1);
  }
}

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const SUPABASE_URL = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const SERVICE_KEY = stripQuotes(process.env.SUPABASE_SECRET_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en el env del destino");
  process.exit(1);
}

const BUCKET = "design-previews";
const THUMB_MAX_EDGE_PX = 800;
const WEBP_QUALITY = 78;
const BATCH = 200;

const prisma = new PrismaClient();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// MISMA baldosa SVG que apps/web/lib/watermark.ts (buildWatermarkTileSvg) —
// duplicada a propósito: este script no puede importar TS del app.
function watermarkTileSvg(tileW, tileH) {
  const text = (x, y) =>
    `<text x="${x}" y="${y}" fill="#ffffff" fill-opacity="0.30" stroke="#000000" stroke-opacity="0.10" stroke-width="1.2">LUCAMS</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}" viewBox="0 0 380 230">` +
    `<g font-family="DejaVu Sans, Verdana, sans-serif" font-size="36" font-weight="700" letter-spacing="8">` +
    `<g transform="rotate(-24 190 115)">${text(20, 96)}${text(200, 212)}</g>` +
    `</g></svg>`
  );
}

async function watermark(buffer, maxEdgePx) {
  let img = sharp(buffer).rotate();
  if (maxEdgePx) {
    img = img.resize({
      width: maxEdgePx,
      height: maxEdgePx,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const resized = await img.toBuffer({ resolveWithObject: true });
  return sharp(resized.data)
    .composite([
      {
        input: Buffer.from(
          watermarkTileSvg(Math.min(380, resized.info.width), Math.min(230, resized.info.height)),
        ),
        tile: true,
        blend: "over",
      },
    ])
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

async function upload(path, data) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, data, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true,
  });
  return !error;
}

const designs = await prisma.design.findMany({
  where: {
    status: { in: ["READY", "USED_IN_ORDER"] },
    previewUrl: { not: null },
    previewWatermarkedAt: null,
  },
  select: { id: true, previewUrl: true },
  orderBy: { updatedAt: "asc" },
  take: APPLY ? undefined : BATCH,
});

console.log(
  `${APPLY ? "APPLY" : "DRY-RUN"} — ${designs.length} diseños con preview y sin artefactos watermark` +
    (APPLY ? "" : ` (muestra de hasta ${BATCH})`),
);

const manifest = {
  script: "design-preview-watermarks-20261013.mjs",
  at: new Date().toISOString(),
  apply: APPLY,
  supabaseRef: SUPABASE_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "local",
  total: designs.length,
  ok: 0,
  failed: 0,
  results: [],
};

for (const d of designs) {
  const entry = { designId: d.id };
  try {
    const res = await fetch(d.previewUrl);
    if (!res.ok) throw new Error(`preview HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (APPLY) {
      const [wm, thumb] = await Promise.all([
        watermark(buffer, undefined),
        watermark(buffer, THUMB_MAX_EDGE_PX),
      ]);
      const [wmOk, thumbOk] = await Promise.all([
        upload(`${d.id}/preview-wm.webp`, wm),
        upload(`${d.id}/thumb.webp`, thumb),
      ]);
      if (!wmOk || !thumbOk) throw new Error("upload falló");
      await prisma.design.update({
        where: { id: d.id },
        data: { previewWatermarkedAt: new Date() },
      });
    }
    entry.status = APPLY ? "applied" : "would-apply";
    manifest.ok++;
  } catch (err) {
    entry.status = "fail";
    entry.error = err instanceof Error ? err.message : String(err);
    manifest.failed++;
  }
  manifest.results.push(entry);
}

mkdirSync("../../tmp/backups", { recursive: true });
const manifestPath = `../../tmp/backups/design-preview-watermarks-${new Date().toISOString().replaceAll(":", "-")}.json`;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`✓ ok: ${manifest.ok} · ✗ fail: ${manifest.failed} · manifiesto: ${manifestPath}`);
await prisma.$disconnect();
if (manifest.failed > 0) process.exit(2);
