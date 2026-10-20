/*
 * One-shot 2026-10-20 — purga DIRIGIDA de diseños de prueba idle en STG (auditoría integral
 * de capacidad). STG acumuló ~920 MB en production-assets (386 objetos, todos creados entre
 * 2026-10-09 y 2026-10-17 por corridas de prueba/E2E manuales): diseños DRAFT y READY
 * referenciados, no huérfanos, así que el barrido de huérfanos no los toca y la retención
 * normal (30/90 días, pensada para PRD) los retendría meses sin finalidad. Es el mismo tipo
 * de fuga que ADR-130 cerró para PRD; acá se reclama el backlog YA.
 *
 * Réplica EXACTA de las guardas de la app (apps/web/features/personalization/
 * retention-service.ts — purgeIdleCustomerDesigns / purgeIdleReadyDesigns /
 * purgeDesignBatch), con olderThanDays=3 (todo lo anterior al 2026-10-17):
 *   - DRAFT (anónimos y logueados) y READY / ARCHIVED-desde-READY, idle > 3 días.
 *   - NUNCA toca: diseños con carrito VIVO, con OrderItem, o con cotización vigente
 *     (PENDING/CONTACTED con movimiento < 365 d, o cualquiera con movimiento < 90 d).
 *   - Bytes compartidos con diseños vivos (cloneDesignForEdit) se preservan.
 *   - Borra bytes de customer-uploads (fotos crudas), design-previews (preview + derivados
 *     por convención de paths) y production-assets (productionUrls + área de paso _client/),
 *     luego las filas DesignAsset + Design en transacción. Si falla la remoción de las fotos
 *     crudas NO borra las filas (misma invariante estricta de la app).
 *   - USED_IN_ORDER queda FUERA: sus bytes los rige retention-delivered.ts (en STG, tras el
 *     deploy del tope no-productivo ADR-161, se purgan a los 14 días de entregada la orden).
 *
 * Guarda de ambiente: assertDestructiveAllowed — solo corre contra local/STG (bloquea PRD).
 *
 * Uso:
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/one-shot/purge-stg-idle-test-designs-20261020.mjs          # DRY-RUN
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/one-shot/purge-stg-idle-test-designs-20261020.mjs --apply  # ejecuta
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

assertDestructiveAllowed("purge-stg-idle-test-designs-20261020.mjs");

const SUPABASE_URL = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const SERVICE_KEY = stripQuotes(process.env.SUPABASE_SECRET_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en el env del destino");
  process.exit(1);
}

const prisma = new PrismaClient();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const APPLY = process.argv.includes("--apply");
const IDLE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const PREVIEWS_BUCKET = "design-previews";
const PRODUCTION_BUCKET = "production-assets";
const CUSTOMER_UPLOADS_BUCKET = "customer-uploads";
const REMOVE_BATCH = 100;
const PREVIEW_PAGES_MAX = 24;

const now = new Date();
const cutoff = new Date(now.getTime() - IDLE_DAYS * DAY_MS);

// activeQuoteWhere de la app (grace 90 d / techo 365 d con defaults).
const stillNeededQuote = {
  OR: [
    {
      deletedAt: null,
      status: { in: ["PENDING", "CONTACTED"] },
      updatedAt: { gte: new Date(now.getTime() - 365 * DAY_MS) },
    },
    { updatedAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
  ],
};
const noLiveCartItem = { none: { cart: { deletedAt: null } } };

const CANDIDATE_SELECT = {
  id: true,
  previewUrl: true,
  draftPreviewUrl: true,
  previewPagesCount: true,
  productionUrls: true,
  assets: { select: { storageUrl: true } },
};

function pathFromPublicUrl(url, bucket) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i >= 0) return url.slice(i + marker.length);
  return url.startsWith("http") ? null : url;
}

// designPreviewDerivedPaths de la app (preview-artifacts.ts).
function previewDerivedPaths(designId, pagesCount) {
  const paths = [`${designId}/preview-wm.webp`, `${designId}/thumb.webp`];
  const n = Math.min(PREVIEW_PAGES_MAX, Math.max(0, Math.trunc(pagesCount ?? 0) || 0));
  for (let p = 1; p <= n; p++) {
    const stem = String(p).padStart(2, "0");
    paths.push(`${designId}/pages/${stem}.webp`, `${designId}/wm/pages/${stem}.webp`);
  }
  return paths;
}

async function removeStorage(bucket, paths) {
  const clean = paths.filter(Boolean);
  for (let i = 0; i < clean.length; i += REMOVE_BATCH) {
    const chunk = clean.slice(i, i + REMOVE_BATCH);
    if (!APPLY) continue;
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      console.error(`✗ remove ${bucket} (${chunk.length} paths): ${error.message}`);
      return false;
    }
  }
  return true;
}

async function listStagedSlotPaths(designIds) {
  const out = [];
  for (const id of designIds) {
    try {
      const { data, error } = await supabase.storage.from(PRODUCTION_BUCKET).list(`${id}/_client`);
      if (error || !data) continue;
      for (const f of data) out.push(`${id}/_client/${f.name}`);
    } catch {
      continue;
    }
  }
  return out;
}

async function main() {
  console.log(
    `${APPLY ? "APLICANDO" : "DRY-RUN"} — diseños DRAFT/READY idle > ${IDLE_DAYS} días (cutoff ${cutoff.toISOString()})`,
  );

  const candidates = await prisma.design.findMany({
    where: {
      OR: [{ status: "DRAFT" }, { status: "READY" }, { status: "ARCHIVED", archivedFrom: "READY" }],
      updatedAt: { lt: cutoff },
      cartItems: noLiveCartItem,
      orderItems: { none: {} },
      quoteItems: { none: { quote: stillNeededQuote } },
    },
    select: { ...CANDIDATE_SELECT, status: true, customerId: true, updatedAt: true },
  });

  const byStatus = {};
  for (const d of candidates) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
  console.log(`Candidatos: ${candidates.length}`, byStatus);
  if (candidates.length === 0) {
    console.log("Nada que purgar.");
    return;
  }

  const designIds = candidates.map((d) => d.id);

  // Bytes compartidos con diseños VIVOS (fuera del lote) se preservan (cloneDesignForEdit).
  let uploadPaths = candidates.flatMap((d) => d.assets.map((a) => a.storageUrl)).filter(Boolean);
  if (uploadPaths.length > 0) {
    const shared = await prisma.designAsset.findMany({
      where: { storageUrl: { in: uploadPaths }, designId: { notIn: designIds } },
      select: { storageUrl: true },
    });
    const sharedUrls = new Set(shared.map((s) => s.storageUrl));
    uploadPaths = uploadPaths.filter((p) => !sharedUrls.has(p));
  }

  const previewPaths = [
    ...candidates
      .flatMap((d) => [d.previewUrl, d.draftPreviewUrl])
      .map((u) => (u ? pathFromPublicUrl(u, PREVIEWS_BUCKET) : null))
      .filter(Boolean),
    ...candidates.flatMap((d) => previewDerivedPaths(d.id, d.previewPagesCount)),
  ];
  const productionPaths = candidates.flatMap((d) => d.productionUrls).filter(Boolean);
  const stagedPaths = APPLY ? await listStagedSlotPaths(designIds) : [];

  console.log(
    `Bytes a borrar: customer-uploads=${uploadPaths.length} design-previews=${previewPaths.length} production-assets=${productionPaths.length}+${stagedPaths.length} staged`,
  );
  if (!APPLY) {
    console.log("DRY-RUN — no se borró nada. Reejecuta con --apply.");
    return;
  }

  const uploadsOk = await removeStorage(CUSTOMER_UPLOADS_BUCKET, uploadPaths);
  await removeStorage(PREVIEWS_BUCKET, previewPaths);
  await removeStorage(PRODUCTION_BUCKET, [...productionPaths, ...stagedPaths]);
  if (!uploadsOk) {
    console.error("✗ falló la remoción de fotos crudas — NO se borran filas (reintentar).");
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.quoteItem.updateMany({
      where: { designId: { in: designIds }, previewUrl: { not: null } },
      data: { previewUrl: null },
    }),
    prisma.designAsset.deleteMany({ where: { designId: { in: designIds } } }),
    prisma.design.deleteMany({ where: { id: { in: designIds } } }),
  ]);

  console.log(`✓ Purgados ${candidates.length} diseños (${uploadPaths.length} fotos crudas).`);
}

main()
  .catch((err) => {
    console.error("✗", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
