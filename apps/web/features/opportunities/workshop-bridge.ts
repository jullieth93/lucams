/*
 * Puente de Taller 300 DPI para Pedidos B2B / Eventos (`ADR-210`).
 *
 * Conecta un `OrderItem` originado en propuesta B2B con el mismo contrato exacto
 * que usa el Taller (`PRINT_WORKSHOP`):
 *   - Crea un `Design` oficial en `USED_IN_ORDER` con `moderationStatus = "APPROVED"`
 *     (auditado por el administrador que validó y subió los masters).
 *   - Guarda vista previa limpia en `design-previews/<designId>/preview.webp` y los
 *     archivos maestros 300 DPI en `production-assets/<designId>/slot-NN.png`.
 *   - Inyecta en `Design.metadata` las instrucciones operativas de empaque/arte B2B
 *     (cero cifras COP) para `LEEME.txt` y el paquete ZIP `/admin/pedidos/[n]/produccion`.
 *   - Actualiza `Order.b2bArtworkReady = true` cuando todas las líneas B2B quedan listas,
 *     liberando la compuerta hacia `SHIPPED`.
 */

import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { supabaseService } from "@/lib/supabase/service";
import sharp, { compressPreviewImage } from "@/features/personalization/sharp-safe";
import { PREVIEW_ROUTE_PREFIX } from "@/features/personalization/preview-access";
import { OpportunityValidationError } from "./service";

const PREVIEW_BUCKET = "design-previews";
const PRODUCTION_BUCKET = "production-assets";
const MAX_PRINT_MASTER_BYTES = 20 * 1024 * 1024;
const SHARP_PRINT_LIMITS = {
  limitInputPixels: 64_000_000,
  limitInputChannels: 4,
  pages: 1,
  failOn: "warning" as const,
};

export async function attachB2bPrintMastersToOrderItem(input: {
  orderId: string;
  orderItemId: string;
  actorAdminId: string;
  files: ReadonlyArray<{ name: string; buffer: Buffer }>;
  workshopNote?: string;
}): Promise<{ designId: string; orderArtworkReady: boolean; orderNumber: string }> {
  if (input.files.length === 0 || input.files.length > 60) {
    throw new OpportunityValidationError("Sube entre 1 y 60 archivos maestros de impresión.");
  }

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, deletedAt: null },
    include: {
      items: {
        include: {
          design: { select: { id: true, moderationStatus: true, productionUrls: true } },
          variant: {
            select: {
              id: true,
              attributes: true,
              product: {
                select: {
                  id: true,
                  fulfillmentMode: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new OpportunityValidationError("El pedido no existe.");
  }
  const targetItem = order.items.find((it) => it.id === input.orderItemId);
  if (!targetItem) {
    throw new OpportunityValidationError("La línea del pedido no existe.");
  }

  const normalizedPngs: Buffer[] = [];
  for (let i = 0; i < input.files.length; i++) {
    const file = input.files[i]!;
    if (file.buffer.length === 0 || file.buffer.length > MAX_PRINT_MASTER_BYTES) {
      throw new OpportunityValidationError(
        `El archivo "${file.name}" supera el límite permitido de 20 MB.`,
      );
    }
    try {
      const pngBuf = await sharp(file.buffer, SHARP_PRINT_LIMITS)
        .rotate()
        .withMetadata({ density: 300 })
        .png({ compressionLevel: 6 })
        .toBuffer();
      normalizedPngs.push(pngBuf);
    } catch {
      throw new OpportunityValidationError(
        `El archivo "${file.name}" no es una imagen raster válida (PNG, JPG o WebP).`,
      );
    }
  }

  const previewCompressed = await compressPreviewImage(normalizedPngs[0]!);
  const designId = `cb2b${randomBytes(10).toString("hex")}`;
  const previewStoragePath = `${designId}/preview.webp`;

  const previewUpload = await supabaseService.storage
    .from(PREVIEW_BUCKET)
    .upload(previewStoragePath, previewCompressed.buffer, {
      contentType: previewCompressed.mime,
      upsert: true,
    });
  if (previewUpload.error) {
    logger.error({
      event: "b2b.workshop.preview_upload_failed",
      orderId: order.id,
      err: previewUpload.error.message,
    });
    throw new OpportunityValidationError("No pudimos subir la vista previa al bucket privado.");
  }

  const productionUrls: string[] = [];
  for (let idx = 0; idx < normalizedPngs.length; idx++) {
    const slotNum = String(idx + 1).padStart(2, "0");
    const prodPath = `${designId}/slot-${slotNum}.png`;
    const up = await supabaseService.storage
      .from(PRODUCTION_BUCKET)
      .upload(prodPath, normalizedPngs[idx]!, {
        contentType: "image/png",
        upsert: true,
      });
    if (up.error) {
      logger.error({
        event: "b2b.workshop.master_upload_failed",
        orderId: order.id,
        prodPath,
        err: up.error.message,
      });
      throw new OpportunityValidationError("No pudimos subir los archivos 300 DPI a Storage.");
    }
    productionUrls.push(prodPath);
  }

  const existingMeta =
    targetItem.metadata && typeof targetItem.metadata === "object"
      ? (targetItem.metadata as Record<string, unknown>)
      : {};
  const previewUrl = `${PREVIEW_ROUTE_PREFIX}${previewStoragePath}`;
  const now = new Date();
  const slotCount = productionUrls.length;
  const unitCount = Math.max(1, targetItem.designUnits);
  const unitSlots = Math.max(1, Math.ceil(slotCount / unitCount));

  const canvasData = {
    version: 2,
    slotCount,
    unitCount,
    unitSlots,
    slots: productionUrls.map((_, i) => ({ index: i })),
  };

  const designMetadata = {
    b2bOrder: true,
    variantId: targetItem.variantId,
    ...(typeof existingMeta.b2bPackagingLabel === "string"
      ? { b2bPackagingLabel: existingMeta.b2bPackagingLabel }
      : {}),
    ...(typeof existingMeta.b2bArtworkLabel === "string"
      ? { b2bArtworkLabel: existingMeta.b2bArtworkLabel }
      : {}),
    ...(input.workshopNote?.trim()
      ? { b2bWorkshopNote: input.workshopNote.trim() }
      : typeof existingMeta.b2bWorkshopNote === "string"
        ? { b2bWorkshopNote: existingMeta.b2bWorkshopNote }
        : {}),
  };

  const orderArtworkReady = await prisma.$transaction(async (tx) => {
    await tx.design.create({
      data: {
        id: designId,
        customerId: order.customerId,
        productId: targetItem.variant.product.id,
        status: "USED_IN_ORDER",
        moderationStatus: "APPROVED",
        moderatedAt: now,
        moderatedById: input.actorAdminId,
        canvasData: canvasData as unknown as Prisma.InputJsonValue,
        previewUrl,
        productionUrl: productionUrls[0] ?? null,
        productionUrls,
        metadata: designMetadata as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.orderItem.update({
      where: { id: targetItem.id },
      data: {
        designId,
        customDesign: canvasData as unknown as Prisma.InputJsonValue,
        designAssetUrl: productionUrls[0] ?? null,
        metadata: {
          ...existingMeta,
          ...(input.workshopNote?.trim() ? { b2bWorkshopNote: input.workshopNote.trim() } : {}),
          designSnapshot: {
            previewUrl,
            productionUrl: productionUrls[0] ?? null,
            productionUrls,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const refreshedItems = await tx.orderItem.findMany({
      where: { orderId: order.id },
      include: {
        design: { select: { moderationStatus: true, productionUrls: true } },
        variant: { select: { product: { select: { fulfillmentMode: true } } } },
      },
    });

    const allReady = refreshedItems.every(
      (it) =>
        (it.variant.product.fulfillmentMode === "PHYSICAL_STOCK" && it.designId === null) ||
        Boolean(
          it.design &&
          it.design.moderationStatus === "APPROVED" &&
          it.design.productionUrls.length > 0,
        ),
    );

    await tx.order.update({
      where: { id: order.id },
      data: { b2bArtworkReady: allReady },
    });

    if (order.b2bProposalId && allReady) {
      await tx.opportunityProposal.updateMany({
        where: { id: order.b2bProposalId, proofApprovedAt: null },
        data: { proofApprovedAt: now },
      });
    }

    return allReady;
  });

  return { designId, orderArtworkReady, orderNumber: order.number };
}
