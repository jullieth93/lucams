/*
 * Eliminación de cuenta del cliente — derecho de supresión (Ley 1581, art. 8).
 *
 * Enfoque ANONIMIZAR + soft-delete (no borrado físico) para conciliar la supresión
 * con la RETENCIÓN FISCAL de la DIAN (facturas/órdenes se conservan). Se suprime
 * TODA la PII de la persona en todas las tablas + archivos, y se corta el acceso.
 * Ver docs/COMPLIANCE.md. Auditado por revisión adversarial (2026-07-10): antes
 * esta función solo tocaba Customer/Address/Review y dejaba PII sensible atrás.
 *
 * Qué se suprime:
 *  - Customer: nombre/tel/documento→null, email→placeholder, supabaseUserId→placeholder, deletedAt.
 *  - Address: scrub de columnas PII (nombre/dirección/teléfono) + soft-delete.
 *  - Review: desvincula (customerId→null) + anonimiza el nombre snapshot.
 *  - SupportTicket: desvincula + scrub (email/name/ip/userAgent/message).
 *  - Fotos del Estudio (lo más sensible): DesignAsset (bucket customer-uploads) →
 *    borra archivos + filas; Design → borra previews (design-previews) y assets de
 *    producción (production-assets), desvincula y limpia URLs.
 *  - Order.shippingAddress: scrub de PII en órdenes YA finalizadas (las en curso
 *    conservan la dirección por finalidad legítima: completar la entrega).
 *  - RecommendationLog / LoyaltyTxn / CouponUsage: desvinculan (customerId→null).
 *  - Auth user de Supabase: se borra (fallback: baneo) → no puede volver a entrar.
 * Qué se conserva (retención legal): órdenes/facturas (DIAN) y consentimientos.
 */

import "server-only";
import type { OrderStatus } from "@lucams/db";
import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

const CUSTOMER_UPLOADS_BUCKET = "customer-uploads";
const PREVIEWS_BUCKET = "design-previews";
const PRODUCTION_BUCKET = "production-assets";

const TERMINAL_ORDER_STATUS: OrderStatus[] = ["DELIVERED", "CANCELLED", "REFUNDED"];

function pathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i >= 0) return url.slice(i + marker.length);
  // Si ya es un path (sin host), devolverlo tal cual.
  return url.startsWith("http") ? null : url;
}

async function removeStorage(bucket: string, paths: string[]): Promise<void> {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return;
  const { error } = await supabaseService.storage.from(bucket).remove(clean);
  if (error) {
    logger.error({ event: "account.delete.storage_remove_fail", bucket, err: error.message });
  }
}

async function revokeAuthUser(supabaseUserId: string, customerId: string): Promise<void> {
  const del = await supabaseService.auth.admin.deleteUser(supabaseUserId);
  if (!del.error) return;
  logger.warn({
    event: "account.delete.auth_user_delete_fail",
    customerId,
    err: del.error.message,
  });
  // Fallback: banear (no puede iniciar sesión) aunque el delete físico falle.
  const ban = await supabaseService.auth.admin.updateUserById(supabaseUserId, {
    ban_duration: "876000h", // ~100 años
  });
  if (ban.error) {
    logger.error({
      event: "account.delete.auth_user_fail_final",
      customerId,
      err: ban.error.message,
    });
  } else {
    logger.warn({ event: "account.delete.auth_user_banned_fallback", customerId });
  }
}

type AddrSnapshot = Record<string, unknown> & {
  fullName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  phone?: string | null;
  notes?: string | null;
};

export async function deleteCustomerAccount(
  customerId: string,
  supabaseUserId: string,
): Promise<void> {
  const now = new Date();

  // 0) Recolectar rutas de Storage ANTES de limpiar las URLs en DB.
  const [assets, designs, terminalOrders] = await Promise.all([
    prisma.designAsset.findMany({ where: { customerId }, select: { storageUrl: true } }),
    prisma.design.findMany({
      where: { customerId },
      select: { previewUrl: true, productionUrl: true, productionUrls: true },
    }),
    prisma.order.findMany({
      where: { customerId, status: { in: TERMINAL_ORDER_STATUS } },
      select: { id: true, shippingAddress: true },
    }),
  ]);

  const uploadPaths = assets.map((a) => a.storageUrl).filter(Boolean);
  const previewPaths = designs
    .map((d) => (d.previewUrl ? pathFromPublicUrl(d.previewUrl, PREVIEWS_BUCKET) : null))
    .filter((p): p is string => Boolean(p));
  const productionPaths = designs.flatMap((d) => [
    ...d.productionUrls,
    ...(d.productionUrl ? [d.productionUrl] : []),
  ]);

  // 1) Supresión + anonimización en DB (transacción).
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: customerId },
      data: {
        email: `deleted-${customerId}@deleted.lucamsshop.co`,
        firstName: null,
        lastName: null,
        phone: null,
        documentType: null,
        documentNumber: null,
        taxResponsibility: null,
        // NOT NULL @unique → placeholder único (desvincula del auth user borrado).
        supabaseUserId: `deleted-${customerId}`,
        deletedAt: now,
        deletedBy: customerId,
      },
    });

    // Direcciones: scrub de PII + soft-delete.
    await tx.address.updateMany({
      where: { customerId, deletedAt: null },
      data: {
        name: "Cliente eliminado",
        line1: "",
        line2: null,
        zip: null,
        phone: "",
        isDefault: false,
        deletedAt: now,
        deletedBy: customerId,
      },
    });

    // Reseñas: desvincular + anonimizar nombre snapshot (conserva contenido público).
    await tx.review.updateMany({
      where: { customerId },
      data: { customerId: null, authorName: "Cliente Lucams", authorCity: null },
    });

    // Tickets de soporte: desvincular + scrub de PII (texto libre incluido).
    await tx.supportTicket.updateMany({
      where: { customerId },
      data: {
        customerId: null,
        email: `deleted-${customerId}@deleted.lucamsshop.co`,
        name: "Cliente eliminado",
        message: "[Contenido eliminado a solicitud del titular]",
        ip: null,
        userAgent: null,
      },
    });

    // Diseños del Estudio: desvincular + limpiar URLs (los archivos se borran abajo).
    await tx.design.updateMany({
      where: { customerId },
      data: { customerId: null, previewUrl: null, productionUrl: null, productionUrls: [] },
    });
    // Assets (subidas crudas): borrar las filas (punteros de PII pura).
    await tx.designAsset.deleteMany({ where: { customerId } });

    // Snapshot de dirección en órdenes YA finalizadas: scrub de PII identificable
    // (las en curso conservan la dirección para completar la entrega).
    for (const o of terminalOrders) {
      const snap = (o.shippingAddress ?? {}) as AddrSnapshot;
      await tx.order.update({
        where: { id: o.id },
        data: {
          shippingAddress: {
            ...snap,
            fullName: null,
            phone: null,
            addressLine1: null,
            addressLine2: null,
            notes: null,
          },
        },
      });
    }

    // Logs de comportamiento/lealtad: desvincular del titular.
    await tx.recommendationLog.updateMany({ where: { customerId }, data: { customerId: null } });
    await tx.loyaltyTxn.updateMany({ where: { customerId }, data: { customerId: null } });
    await tx.couponUsage.updateMany({ where: { customerId }, data: { customerId: null } });
  });

  // 2) Borrar archivos de Storage (best-effort, fuera de la tx).
  await Promise.all([
    removeStorage(CUSTOMER_UPLOADS_BUCKET, uploadPaths),
    removeStorage(PREVIEWS_BUCKET, previewPaths),
    removeStorage(PRODUCTION_BUCKET, productionPaths),
  ]);

  // 3) Revocar el auth user (delete → fallback ban).
  await revokeAuthUser(supabaseUserId, customerId);

  logger.info({ event: "account.delete.success", customerId });
}
