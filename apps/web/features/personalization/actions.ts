/*
 * Server actions — Estudio de Personalización (M.3).
 *
 * Cada action:
 *   1. Resuelve owner (customerId si logueado, sessionId anon).
 *   2. Valida input con Zod (rechazo con problem details si falla).
 *   3. Delega al service layer (única lógica de DB / Storage).
 *   4. Loguea event estandarizado.
 *
 * Auth model:
 *   - Storefront público — no requiere admin. Anon flow OK.
 *   - Pero el caller siempre debe ser owner del Design para mutar.
 */

"use server";

import { getCurrentCustomer } from "@/lib/auth";
import { getOrCreateCartSession, peekCartSession } from "@/lib/cart-session";
import { logger } from "@/lib/logger";
import { uploadCustomerPhoto } from "@/lib/storage";
import { prisma } from "@/lib/db";
import {
  CreateDraftDesignSchema,
  FinalizeDesignSchema,
  SaveCanvasSchema,
  UploadAssetMetadataSchema,
} from "./schemas";
import { createDraftDesign, finalizeDesign, getOwnedDesign, saveCanvas } from "./service";

// ──────────── Helpers ────────────

async function resolveOwner() {
  const session = await getCurrentCustomer();
  const customerId = session?.customer.id ?? null;
  const sessionId = customerId ? null : await peekCartSession();
  return { customerId, sessionId };
}

// ──────────── Create draft ────────────

export async function createDraftDesignAction(input: { productId: string; templateId?: string }) {
  const parsed = CreateDraftDesignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, code: "VALIDATION" as const, message: parsed.error.message };
  }

  const { customerId, sessionId: existingSession } = await resolveOwner();
  // Si anon y no había cookie, crear una ahora. createDraftDesign requiere
  // al menos uno de customerId/sessionId.
  const sessionId =
    !customerId && !existingSession ? await getOrCreateCartSession() : existingSession;

  try {
    const design = await createDraftDesign({
      productId: parsed.data.productId,
      templateId: parsed.data.templateId,
      customerId,
      sessionId,
    });
    return { ok: true as const, designId: design.id };
  } catch (err) {
    logger.warn(
      { event: "design.create_draft.fail", err: err instanceof Error ? err.message : String(err) },
      "createDraftDesign failed",
    );
    return { ok: false as const, code: "INTERNAL" as const, message: "No pudimos crear el diseño" };
  }
}

// ──────────── Save canvas (debounced 2s desde cliente) ────────────

export async function saveCanvasAction(input: { designId: string; canvasData: unknown }) {
  const parsed = SaveCanvasSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, code: "VALIDATION" as const, message: parsed.error.message };
  }
  const { customerId, sessionId } = await resolveOwner();
  try {
    await saveCanvas({
      designId: parsed.data.designId,
      canvasData: parsed.data.canvasData,
      customerId,
      sessionId,
    });
    return { ok: true as const };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "design.save_canvas.fail", err: msg }, "saveCanvas failed");
    return { ok: false as const, code: "INTERNAL" as const, message: msg };
  }
}

// ──────────── Finalize (READY snapshot) ────────────
//
// V2: el cliente envía 1 preview compositado del grid + N production snapshots
// (uno por slot llenado). Server valida que productionDataUrls.length matchea
// el slotCount del Design + que todos los slots tienen assetUrl.
//
// El error code `INCOMPLETE_SLOTS` permite al cliente mostrar UI específica
// (modal listando slots vacíos) en lugar de error genérico.

export async function finalizeDesignAction(input: {
  designId: string;
  previewDataUrl: string;
  productionDataUrls: string[];
}) {
  const parsed = FinalizeDesignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, code: "VALIDATION" as const, message: parsed.error.message };
  }
  const { customerId, sessionId } = await resolveOwner();
  try {
    const design = await finalizeDesign({
      designId: parsed.data.designId,
      previewDataUrl: parsed.data.previewDataUrl,
      productionDataUrls: parsed.data.productionDataUrls,
      customerId,
      sessionId,
    });
    return {
      ok: true as const,
      previewUrl: design.previewUrl,
      status: design.status,
      productionSlotsCount: design.productionUrls.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code: "INCOMPLETE_SLOTS" | "INTERNAL" = msg.startsWith("INCOMPLETE_SLOTS")
      ? "INCOMPLETE_SLOTS"
      : "INTERNAL";
    logger.warn({ event: "design.finalize.fail", code, err: msg }, "finalizeDesign failed");
    return { ok: false as const, code, message: msg };
  }
}

// ──────────── Upload customer photo ────────────
//
// El cliente envía el archivo via FormData. Server:
//   1. Valida ownership del Design (si designId pasó)
//   2. Strip EXIF + auto-orient + persists DesignAsset
//   3. Devuelve signed URL para uso en editor

export async function uploadDesignAssetAction(formData: FormData) {
  const file = formData.get("file");
  const designId = formData.get("designId");
  if (!(file instanceof File)) {
    return { ok: false as const, code: "VALIDATION" as const, message: "Archivo faltante" };
  }
  const metaParsed = UploadAssetMetadataSchema.safeParse({
    designId: typeof designId === "string" && designId.length > 0 ? designId : undefined,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  if (!metaParsed.success) {
    return {
      ok: false as const,
      code: "VALIDATION" as const,
      message: metaParsed.error.issues[0]?.message ?? "Metadata inválida",
    };
  }

  const { customerId, sessionId: anonSession } = await resolveOwner();
  // sessionId garantizado: si no hay aún, lo creamos (anon sube → necesita cookie).
  const sessionId = anonSession ?? (await getOrCreateCartSession());
  const ownerId = customerId ?? sessionId;

  // Si pasaron designId, verificar ownership.
  let design = null;
  if (metaParsed.data.designId) {
    design = await getOwnedDesign(metaParsed.data.designId, { customerId, sessionId });
    if (!design) {
      return {
        ok: false as const,
        code: "FORBIDDEN" as const,
        message: "Diseño no encontrado o no autorizado",
      };
    }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadCustomerPhoto({
      buffer,
      originalMimeType: metaParsed.data.mimeType,
      ownerId,
      designId: metaParsed.data.designId ?? null,
    });

    // Persistir DesignAsset
    const asset = await prisma.designAsset.create({
      data: {
        designId: metaParsed.data.designId ?? null,
        customerId,
        sessionId,
        storageUrl: uploaded.path, // path interno; signed URL generada al demand
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        width: uploaded.width,
        height: uploaded.height,
        exifStripped: uploaded.exifStripped,
        malwareScanned: false, // V1 sin scanner; M.8 evalúa
      },
    });

    logger.info(
      {
        event: "design.asset.upload.success",
        assetId: asset.id,
        designId: metaParsed.data.designId,
        ownerType: customerId ? "customer" : "session",
        sizeBytes: uploaded.sizeBytes,
      },
      "Customer photo uploaded",
    );

    return {
      ok: true as const,
      assetId: asset.id,
      signedUrl: uploaded.signedUrl,
      width: uploaded.width,
      height: uploaded.height,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "design.asset.upload.fail", err: msg }, "uploadCustomerPhoto failed");
    return { ok: false as const, code: "INTERNAL" as const, message: msg };
  }
}
