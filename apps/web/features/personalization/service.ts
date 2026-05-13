/*
 * Service layer — Estudio de Personalización (M.3.b v2).
 *
 * Cambios vs M.3:
 *   - `createDraftDesign` lee `product.personalizationSchema.photoSlots` y
 *     construye un canvasData V2 multi-slot con N slots vacíos + plantilla
 *     unitaria embedida.
 *   - `saveCanvas` acepta tanto V1 (legacy migration on-the-fly) como V2.
 *   - `finalizeDesign` acepta N productionDataUrls (uno por imán físico)
 *     en lugar de 1 monolítico. Sube N PNGs a bucket production-assets y
 *     persiste paths en Design.productionUrls[].
 *
 * Reglas críticas (sin cambios vs M.3):
 *   1. Ownership de Design: customerId (logueado) o sessionId (anon). Server
 *      NUNCA acepta una mutation sin verificar primero que el caller posee
 *      el Design.
 *   2. Design.status state machine:
 *        DRAFT → READY (snapshot ok) → USED_IN_ORDER (cart confirmed)
 *        DRAFT/READY → ARCHIVED (Lucy admin, futuro)
 */

import "server-only";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { supabaseService } from "@/lib/supabase/service";
import { parsePhotoProductConfig } from "./schemas";
import type { CanvasData, CanvasDataV1, CanvasDataV2 } from "./schemas";
import type { z } from "zod";
import type { SlotStateSchema } from "./schemas";
type SlotState = z.infer<typeof SlotStateSchema>;

const BUCKET_PREVIEWS = "design-previews";
const BUCKET_PRODUCTION = "production-assets";

// ──────────────────────────────────────────────────────────────────
//  Ownership check
// ──────────────────────────────────────────────────────────────────

export async function getOwnedDesign(
  designId: string,
  owner: { customerId: string | null; sessionId: string | null },
) {
  const design = await prisma.design.findUnique({
    where: { id: designId },
  });
  if (!design) return null;
  if (design.customerId && design.customerId === owner.customerId) return design;
  if (design.sessionId && design.sessionId === owner.sessionId) return design;
  return null;
}

// ──────────────────────────────────────────────────────────────────
//  Grid layout helper (mirror del cliente, server-side)
// ──────────────────────────────────────────────────────────────────
//
// Replicación del helper del cliente acá para evitar import cross-boundary
// (server no puede import desde app/estudio que es client-tree).

const PRESET_LAYOUTS: Record<number, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 2, rows: 1 },
  3: { cols: 3, rows: 1 },
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 2 },
  8: { cols: 4, rows: 2 },
  9: { cols: 3, rows: 3 },
  10: { cols: 5, rows: 2 },
  12: { cols: 4, rows: 3 },
  15: { cols: 5, rows: 3 },
  16: { cols: 4, rows: 4 },
  20: { cols: 5, rows: 4 },
};

function gapForSlotCount(n: number): number {
  if (n <= 4) return 24;
  if (n <= 9) return 16;
  if (n <= 12) return 12;
  return 8;
}

function generateGridLayout(slotCount: number, stage: { width: number; height: number }) {
  const preset = PRESET_LAYOUTS[slotCount];
  let cols = preset?.cols ?? Math.ceil(Math.sqrt(slotCount));
  let rows = preset?.rows ?? Math.ceil(slotCount / cols);
  const aspect = stage.width / stage.height;
  if (aspect > 2.0 && cols > rows) [cols, rows] = [rows, cols];
  if (aspect < 0.5 && rows > cols) [cols, rows] = [rows, cols];
  return { cols, rows, gap: gapForSlotCount(slotCount) };
}

// ──────────────────────────────────────────────────────────────────
//  Create draft (V2 directamente)
// ──────────────────────────────────────────────────────────────────

export async function createDraftDesign(opts: {
  productId: string;
  templateId?: string;
  customerId: string | null;
  sessionId: string | null;
}) {
  if (!opts.customerId && !opts.sessionId) {
    throw new Error("createDraftDesign: requires customerId or sessionId");
  }

  // Cargar producto + su personalizationSchema para saber cuántos slots crear
  const product = await prisma.product.findUnique({
    where: { id: opts.productId },
    select: {
      id: true,
      personalizationKind: true,
      personalizationSchema: true,
    },
  });
  if (!product) {
    throw new Error(`createDraftDesign: product ${opts.productId} not found`);
  }

  const photoConfig = parsePhotoProductConfig(product.personalizationSchema);
  const slotCount = photoConfig.photoSlots;

  // Cargar unitTemplate desde PersonalizationTemplate (si se pasó templateId
  // explícito) o el primer template activo del kind del producto.
  let unitTemplate: CanvasDataV1;
  let templateIdToUse: string | null = opts.templateId ?? null;

  if (opts.templateId) {
    const tpl = await prisma.personalizationTemplate.findUnique({
      where: { id: opts.templateId },
      select: { canvasData: true, isActive: true, deletedAt: true },
    });
    if (!tpl || !tpl.isActive || tpl.deletedAt) {
      throw new Error(`createDraftDesign: template ${opts.templateId} not available`);
    }
    unitTemplate = tpl.canvasData as unknown as CanvasDataV1;
  } else {
    // Default: primer template activo del kind
    const tpl = await prisma.personalizationTemplate.findFirst({
      where: {
        kind: product.personalizationKind,
        isActive: true,
        deletedAt: null,
        OR: [{ productId: product.id }, { productId: null }],
      },
      orderBy: { order: "asc" },
      select: { id: true, canvasData: true },
    });
    if (tpl) {
      unitTemplate = tpl.canvasData as unknown as CanvasDataV1;
      templateIdToUse = tpl.id;
    } else {
      // Fallback: stage 1080×1080 vacío
      unitTemplate = {
        version: 1,
        stage: { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 },
        layers: [{ id: "background", type: "background", color: "#FFFFFF" }],
      };
    }
  }

  const slots: SlotState[] = Array.from({ length: slotCount }, (_, idx) => ({
    slotIndex: idx,
    assetId: null,
    assetUrl: null,
  }));

  const canvasData: CanvasDataV2 = {
    version: 2,
    unitTemplate,
    slotCount,
    slots,
    gridLayout: generateGridLayout(slotCount, unitTemplate.stage),
  };

  const design = await prisma.design.create({
    data: {
      productId: opts.productId,
      templateId: templateIdToUse,
      customerId: opts.customerId,
      sessionId: opts.sessionId,
      status: "DRAFT",
      canvasData: canvasData as unknown as Prisma.InputJsonValue,
      metadata: { kind: product.personalizationKind, schemaVersion: 2 },
    },
  });

  logger.info(
    {
      event: "design.create_draft.success",
      designId: design.id,
      productId: opts.productId,
      templateId: templateIdToUse,
      kind: product.personalizationKind,
      slotCount,
      ownerType: opts.customerId ? "customer" : "session",
    },
    "Draft design created (V2)",
  );

  return design;
}

// ──────────────────────────────────────────────────────────────────
//  Save canvas (DRAFT only). Acepta V1 o V2.
// ──────────────────────────────────────────────────────────────────

export async function saveCanvas(opts: {
  designId: string;
  canvasData: CanvasData;
  customerId: string | null;
  sessionId: string | null;
}) {
  const design = await getOwnedDesign(opts.designId, opts);
  if (!design) {
    throw new Error("Design not found or not owned by caller");
  }
  if (design.status !== "DRAFT") {
    throw new Error(`Design is ${design.status} — only DRAFT can be edited`);
  }

  await prisma.design.update({
    where: { id: design.id },
    data: { canvasData: opts.canvasData as unknown as Prisma.InputJsonValue },
  });
}

// ──────────────────────────────────────────────────────────────────
//  Finalize (snapshot READY) — V2 multi-PNG
// ──────────────────────────────────────────────────────────────────
//
// Recibe `previewDataUrl` (snapshot del grid completo, 1 PNG) +
// `productionDataUrls[]` (snapshots individuales, N PNGs a 300 DPI).
//
// Server:
//   1. Valida ownership + status DRAFT
//   2. Valida productionDataUrls.length === Design canvasData.slotCount
//      (todos los slots tienen snapshot — el cliente NO debe enviar
//       finalize si hay slots vacíos; el server bloquea por defensa)
//   3. Sube preview compositado a bucket design-previews (público)
//   4. Sube N production PNGs a bucket production-assets (privado)
//   5. Marca Design.status=READY, persiste previewUrl + productionUrls[]

export async function finalizeDesign(opts: {
  designId: string;
  previewDataUrl: string;
  productionDataUrls: string[];
  customerId: string | null;
  sessionId: string | null;
}) {
  const design = await getOwnedDesign(opts.designId, opts);
  if (!design) {
    throw new Error("Design not found or not owned by caller");
  }
  if (design.status !== "DRAFT") {
    throw new Error(`Design is ${design.status} — only DRAFT can be finalized`);
  }

  // Validar que la cantidad de production snapshots matchea slotCount del Design
  const canvasData = design.canvasData as unknown as CanvasData;
  const expectedSlotCount = canvasData.version === 2 ? (canvasData as CanvasDataV2).slotCount : 1;
  if (opts.productionDataUrls.length !== expectedSlotCount) {
    throw new Error(
      `INCOMPLETE_SLOTS: expected ${expectedSlotCount} production snapshots, got ${opts.productionDataUrls.length}`,
    );
  }

  // Validar también que todos los slots V2 tienen assetUrl (defensa server)
  if (canvasData.version === 2) {
    const v2 = canvasData as CanvasDataV2;
    const empty = v2.slots.filter((s) => !s.assetUrl).map((s) => s.slotIndex);
    if (empty.length > 0) {
      throw new Error(`INCOMPLETE_SLOTS: slots vacíos ${empty.join(", ")}`);
    }
  }

  const supabase = supabaseService;
  const previewBuf = dataUrlToBuffer(opts.previewDataUrl);

  // Subir preview compositado del grid completo
  const previewPath = `${design.id}/preview.png`;
  const { error: pErr } = await supabase.storage
    .from(BUCKET_PREVIEWS)
    .upload(previewPath, previewBuf, { contentType: "image/png", upsert: true });
  if (pErr) {
    logger.warn(
      { event: "design.finalize.upload_preview_fail", err: pErr.message },
      "Preview upload fail",
    );
    throw new Error(`No pudimos subir el preview: ${pErr.message}`);
  }
  const {
    data: { publicUrl: previewPublicUrl },
  } = supabase.storage.from(BUCKET_PREVIEWS).getPublicUrl(previewPath);

  // Subir N production PNGs (uno por imán físico)
  const productionPaths: string[] = [];
  let totalProductionBytes = 0;
  for (let i = 0; i < opts.productionDataUrls.length; i++) {
    const buf = dataUrlToBuffer(opts.productionDataUrls[i]!);
    totalProductionBytes += buf.length;
    const path = `${design.id}/slot-${String(i + 1).padStart(2, "0")}.png`;
    const { error: prodErr } = await supabase.storage
      .from(BUCKET_PRODUCTION)
      .upload(path, buf, { contentType: "image/png", upsert: true });
    if (prodErr) {
      logger.warn(
        { event: "design.finalize.upload_production_fail", err: prodErr.message, slotIndex: i },
        "Production upload fail",
      );
      throw new Error(`No pudimos subir el slot ${i + 1}: ${prodErr.message}`);
    }
    productionPaths.push(path);
  }

  const updated = await prisma.design.update({
    where: { id: design.id },
    data: {
      status: "READY",
      previewUrl: previewPublicUrl,
      productionUrls: productionPaths,
      // Legacy field: en V2 dejamos null (el array es source-of-truth).
      productionUrl: null,
    },
  });

  logger.info(
    {
      event: "design.finalize.success",
      designId: design.id,
      previewBytes: previewBuf.length,
      productionSlotsCount: productionPaths.length,
      productionTotalBytes: totalProductionBytes,
    },
    "Design finalized (V2)",
  );

  return updated;
}

// ──────────────────────────────────────────────────────────────────
//  List templates by kind
// ──────────────────────────────────────────────────────────────────

export async function listTemplatesForKind(
  kind: string,
  opts?: { productId?: string; take?: number },
) {
  return prisma.personalizationTemplate.findMany({
    where: {
      kind: kind as never,
      isActive: true,
      deletedAt: null,
      OR: opts?.productId
        ? [{ productId: opts.productId }, { productId: null }]
        : [{ productId: null }],
    },
    orderBy: { order: "asc" },
    take: opts?.take ?? 30,
    select: {
      id: true,
      slug: true,
      name: true,
      previewUrl: true,
      canvasData: true,
    },
  });
}

// ──────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = /^data:image\/(png|webp|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid dataURL format");
  }
  return Buffer.from(match[2]!, "base64");
}
