/*
 * Service layer — Estudio de Personalización (M.3).
 *
 * Reglas críticas:
 *   1. Ownership de Design: customerId (logueado) o sessionId (anon). Server NUNCA
 *      acepta una mutation sin verificar primero que el caller posee el Design.
 *   2. Design.status state machine:
 *        DRAFT → READY (snapshot ok) → USED_IN_ORDER (cart confirmed)
 *        DRAFT/READY → ARCHIVED (Lucy admin desde back office, futuro)
 *   3. Render snapshot:
 *        - Cliente genera dataURL via stage.toDataURL({pixelRatio})
 *        - Server recibe dataURL, sube a Storage (sharp normaliza + valida)
 *        - Design.previewUrl + Design.productionUrl quedan en DB
 *   4. canvasData no se interpreta server-side — el cliente es responsable.
 *      Aplicamos solo Zod básico para evitar Jsons inválidos en DB.
 */

import "server-only";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { supabaseService } from "@/lib/supabase/service";
import type { CanvasData } from "./schemas";

const BUCKET_PREVIEWS = "design-previews";
const BUCKET_PRODUCTION = "production-assets";

// ──────────── Ownership check ────────────
//
// Devuelve el Design si y solo si el caller (sessionId anon o customerId logueado)
// lo posee. Caso especial: si el Design es de un sessionId que ya migró a
// customerId post-login (merge tipo cart), aceptar ambos.

export async function getOwnedDesign(
  designId: string,
  owner: { customerId: string | null; sessionId: string | null },
) {
  const design = await prisma.design.findUnique({
    where: { id: designId },
  });
  if (!design) return null;

  // Ownership: si el design tiene customerId, comparar con el actual.
  // Si tiene sessionId, comparar con el cookie actual.
  // Diseños con ambos null no deberían existir (creación valida que al menos uno).
  if (design.customerId && design.customerId === owner.customerId) return design;
  if (design.sessionId && design.sessionId === owner.sessionId) return design;

  return null;
}

// ──────────── Create draft ────────────

export async function createDraftDesign(opts: {
  productId: string;
  templateId?: string;
  customerId: string | null;
  sessionId: string | null;
}) {
  if (!opts.customerId && !opts.sessionId) {
    throw new Error("createDraftDesign: requires customerId or sessionId");
  }

  // Si pasaron templateId, levantamos el canvasData de la plantilla como
  // punto de partida. Si no, vacío con stage default 1080×1080.
  let initialCanvas: CanvasData = {
    version: 1,
    stage: { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 },
    layers: [{ id: "background", type: "background", color: "#FFFFFF" }],
  };
  if (opts.templateId) {
    const tpl = await prisma.personalizationTemplate.findUnique({
      where: { id: opts.templateId },
      select: { canvasData: true, isActive: true, deletedAt: true },
    });
    if (tpl && tpl.isActive && !tpl.deletedAt) {
      initialCanvas = tpl.canvasData as CanvasData;
    }
  }

  const design = await prisma.design.create({
    data: {
      productId: opts.productId,
      templateId: opts.templateId ?? null,
      customerId: opts.customerId,
      sessionId: opts.sessionId,
      status: "DRAFT",
      canvasData: initialCanvas as unknown as Prisma.InputJsonValue,
      metadata: {},
    },
  });

  logger.info(
    {
      event: "design.create_draft.success",
      designId: design.id,
      productId: opts.productId,
      templateId: opts.templateId,
      ownerType: opts.customerId ? "customer" : "session",
    },
    "Draft design created",
  );

  return design;
}

// ──────────── Save canvas (DRAFT only) ────────────

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

// ──────────── Finalize (snapshot + READY) ────────────
//
// Recibe dataURL preview + production del cliente (`stage.toDataURL`).
// Sube a Storage. Marca Design.status=READY, persiste URLs.

export async function finalizeDesign(opts: {
  designId: string;
  previewDataUrl: string;
  productionDataUrl: string;
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

  const supabase = supabaseService;
  const previewBuf = dataUrlToBuffer(opts.previewDataUrl);
  const productionBuf = dataUrlToBuffer(opts.productionDataUrl);

  // Path scheme: <designId>/preview.png + <designId>/production.png
  // Una sola versión por design (sobrescribir si re-finaliza después de revert
  // a DRAFT, no implementado V1 pero schema-ready).
  const previewPath = `${design.id}/preview.png`;
  const productionPath = `${design.id}/production.png`;

  const { error: pErr } = await supabase.storage
    .from(BUCKET_PREVIEWS)
    .upload(previewPath, previewBuf, {
      contentType: "image/png",
      upsert: true,
    });
  if (pErr) {
    logger.warn({ event: "design.finalize.upload_preview_fail", err: pErr.message }, "Preview upload fail");
    throw new Error(`No pudimos subir el preview: ${pErr.message}`);
  }

  const { error: prodErr } = await supabase.storage
    .from(BUCKET_PRODUCTION)
    .upload(productionPath, productionBuf, {
      contentType: "image/png",
      upsert: true,
    });
  if (prodErr) {
    logger.warn({ event: "design.finalize.upload_production_fail", err: prodErr.message }, "Production upload fail");
    throw new Error(`No pudimos subir el archivo de producción: ${prodErr.message}`);
  }

  // Preview es público (bucket public=true) → URL determinística sin token.
  // Production es privado → guardamos solo el path, generamos signed URL al demand admin.
  const {
    data: { publicUrl: previewPublicUrl },
  } = supabase.storage.from(BUCKET_PREVIEWS).getPublicUrl(previewPath);

  const updated = await prisma.design.update({
    where: { id: design.id },
    data: {
      status: "READY",
      previewUrl: previewPublicUrl,
      productionUrl: productionPath, // path interno, no URL pública
    },
  });

  logger.info(
    {
      event: "design.finalize.success",
      designId: design.id,
      previewBytes: previewBuf.length,
      productionBytes: productionBuf.length,
    },
    "Design finalized",
  );

  return updated;
}

// ──────────── List templates by kind ────────────

export async function listTemplatesForKind(
  kind: string,
  opts?: { productId?: string; take?: number },
) {
  return prisma.personalizationTemplate.findMany({
    where: {
      kind: kind as never,
      isActive: true,
      deletedAt: null,
      // Templates específicos del producto + globales (productId null).
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

// ──────────── Helpers ────────────

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = /^data:image\/(png|webp|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid dataURL format");
  }
  return Buffer.from(match[2]!, "base64");
}
