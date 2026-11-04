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
 *  - LoyaltyTxn / CouponUsage: desvinculan (customerId→null).
 *  - WishlistItem: se borran las filas (historial de interés del titular).
 *  - Auth user de Supabase: se borra (fallback: baneo) → no puede volver a entrar.
 * Qué se conserva (retención legal): órdenes/facturas (DIAN) y consentimientos.
 */

import "server-only";
import type { OrderStatus, Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { listStagedSlotPaths } from "@/features/personalization/staged-slots";
import { previewStoragePathFromRef } from "@/features/personalization/preview-access";
import { designPreviewDerivedPaths } from "@/features/personalization/preview-artifacts";
import { markResendContactUnsubscribed } from "@/features/newsletter/unsubscribe";

const CUSTOMER_UPLOADS_BUCKET = "customer-uploads";
const PREVIEWS_BUCKET = "design-previews";
const PRODUCTION_BUCKET = "production-assets";

const TERMINAL_ORDER_STATUS: OrderStatus[] = ["DELIVERED", "CANCELLED", "REFUNDED"];
const SCRUBBED_MESSAGE_BODY = "[Contenido eliminado a solicitud del titular]";

function extractPreviewStoragePath(ref: string): string | null {
  const fromHandlerOrPublic = previewStoragePathFromRef(ref);
  if (fromHandlerOrPublic) return fromHandlerOrPublic;
  const marker = `/storage/v1/object/public/${PREVIEWS_BUCKET}/`;
  const i = ref.indexOf(marker);
  if (i >= 0) return ref.slice(i + marker.length);
  return ref.startsWith("http") || ref.startsWith("/") ? null : ref;
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

  // 0) Recolectar email/teléfono actuales y rutas de Storage ANTES de limpiar la DB.
  const custRow = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, phone: true },
  });
  const customerEmail = custRow?.email?.trim().toLowerCase() ?? null;
  const customerPhone = custRow?.phone?.trim() ?? null;
  // Placeholder de supresión para las columnas de contacto obligatorias (Order.email, tickets, referidos).
  const deletedEmail = `deleted-${customerId}@deleted.lucamsshop.com`;

  const designs = await prisma.design.findMany({
    where: { customerId },
    select: {
      id: true,
      previewUrl: true,
      draftPreviewUrl: true,
      previewPagesCount: true,
      productionUrl: true,
      productionUrls: true,
      orderItems: { select: { order: { select: { status: true } } } },
    },
  });

  // Igual que Order.shippingAddress (Ley 1581 art. 9 / deber contractual de entrega):
  // si un diseño pertenece a un pedido EN CURSO (PAID / FULFILLING / SHIPPED / PENDING_PAYMENT),
  // se desvincula del titular pero conserva productionUrls hasta la entrega (luego lo purga
  // purge-delivered-designs). Borradores, diseños READY y pedidos ya finalizados se borran al 100%.
  const erasableDesigns = designs.filter((d) =>
    d.orderItems.every((oi) => TERMINAL_ORDER_STATUS.includes(oi.order.status)),
  );
  const inFlightDesigns = designs.filter((d) =>
    d.orderItems.some((oi) => !TERMINAL_ORDER_STATUS.includes(oi.order.status)),
  );
  const erasableDesignIds = erasableDesigns.map((d) => d.id);
  const inFlightDesignIds = inFlightDesigns.map((d) => d.id);

  // [PRI-01] (S08): cubrir también DesignAsset subidos antes del login (customerId null pero
  // asociados a un designId adoptado del titular).
  const assetWhere: Prisma.DesignAssetWhereInput =
    erasableDesignIds.length > 0
      ? { OR: [{ customerId }, { designId: { in: erasableDesignIds } }] }
      : { customerId };

  const [assets, terminalOrders] = await Promise.all([
    prisma.designAsset.findMany({
      where: assetWhere,
      select: { id: true, storageUrl: true, canvasPath: true },
    }),
    prisma.order.findMany({
      where: { customerId, status: { in: TERMINAL_ORDER_STATUS } },
      select: { id: true, shippingAddress: true },
    }),
  ]);

  const uploadPaths = Array.from(
    new Set(
      assets.flatMap((a) => [a.storageUrl, a.canvasPath]).filter((p): p is string => Boolean(p)),
    ),
  );
  const previewPaths = Array.from(
    new Set(
      erasableDesigns
        .flatMap((d) => [
          d.previewUrl ? extractPreviewStoragePath(d.previewUrl) : null,
          d.draftPreviewUrl ? extractPreviewStoragePath(d.draftPreviewUrl) : null,
          ...designPreviewDerivedPaths(d.id, d.previewPagesCount),
        ])
        .filter((p): p is string => Boolean(p)),
    ),
  );
  const productionPaths = Array.from(
    new Set(
      erasableDesigns.flatMap((d) => [
        ...d.productionUrls,
        ...(d.productionUrl ? [d.productionUrl] : []),
      ]),
    ),
  );
  // ADR-081 — el área de paso `{designId}/_client/` no vive en ninguna columna. Sin esto, un diseño
  // que quedó a medias dejaba en el bucket el render de las fotos del titular DESPUÉS de que pidió
  // que le borráramos la cuenta, que es exactamente lo que el derecho de supresión prohíbe.
  const stagedPaths = await listStagedSlotPaths(PRODUCTION_BUCKET, erasableDesignIds);

  // 1) Supresión + anonimización en DB (transacción).
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: customerId },
      data: {
        email: deletedEmail,
        firstName: null,
        lastName: null,
        phone: null,
        documentType: null,
        documentNumber: null,
        taxResponsibility: null,
        referredById: null,
        // NOT NULL @unique → placeholder único (desvincula del auth user borrado).
        supabaseUserId: `deleted-${customerId}`,
        deletedAt: now,
        deletedBy: customerId,
      },
    });
    await tx.customer.updateMany({
      where: { referredById: customerId },
      data: { referredById: null },
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

    // [PRI-01] (S08) — Tickets de soporte + hilo de mensajes (SupportTicketMessage):
    // incluye tickets abiertos como invitado con el mismo correo (customerId null) y limpia
    // el cuerpo de los mensajes escritos por el titular.
    const ticketWhere: Prisma.SupportTicketWhereInput = customerEmail
      ? {
          OR: [{ customerId }, { email: { equals: customerEmail, mode: "insensitive" } }],
        }
      : { customerId };
    const matchedTickets = await tx.supportTicket.findMany({
      where: ticketWhere,
      select: { id: true },
    });
    const matchedTicketIds = matchedTickets.map((t) => t.id);
    if (matchedTicketIds.length > 0) {
      await tx.supportTicketMessage.updateMany({
        where: {
          OR: [
            { ticketId: { in: matchedTicketIds }, authorKind: "CUSTOMER" },
            { authorKind: "CUSTOMER", authorId: customerId },
          ],
        },
        data: { authorId: null, body: SCRUBBED_MESSAGE_BODY },
      });
      await tx.supportTicket.updateMany({
        where: { id: { in: matchedTicketIds } },
        data: {
          customerId: null,
          email: deletedEmail,
          name: "Cliente eliminado",
          message: SCRUBBED_MESSAGE_BODY,
          ip: null,
          userAgent: null,
        },
      });
    } else {
      await tx.supportTicketMessage.updateMany({
        where: { authorKind: "CUSTOMER", authorId: customerId },
        data: { authorId: null, body: SCRUBBED_MESSAGE_BODY },
      });
    }

    // Garantías: desvincular del titular.
    await tx.warrantyClaim.updateMany({
      where: { customerId },
      data: { customerId: null },
    });

    // Diseños del Estudio: desvincular + limpiar URLs, textos en canvasData y metadata.
    if (erasableDesignIds.length > 0) {
      await tx.design.updateMany({
        where: { id: { in: erasableDesignIds } },
        data: {
          customerId: null,
          sessionId: null,
          previewUrl: null,
          draftPreviewUrl: null,
          previewWatermarkedAt: null,
          previewPagesCount: null,
          shareTokenHash: null,
          productionUrl: null,
          productionUrls: [],
          canvasData: {},
          metadata: {},
        },
      });
    }
    if (inFlightDesignIds.length > 0) {
      await tx.design.updateMany({
        where: { id: { in: inFlightDesignIds } },
        data: {
          customerId: null,
          sessionId: null,
          draftPreviewUrl: null,
          shareTokenHash: null,
        },
      });
    }
    // Assets (subidas crudas): borrar las filas (punteros de PII pura, incluidos pre-login).
    if (assets.length > 0) {
      await tx.designAsset.deleteMany({
        where: { id: { in: assets.map((a) => a.id) } },
      });
    }

    // Snapshot de dirección + columnas de contacto en órdenes YA finalizadas: scrub de PII
    // identificable (las en curso conservan la dirección para completar la entrega).
    for (const o of terminalOrders) {
      const snap = (o.shippingAddress ?? {}) as AddrSnapshot;
      await tx.order.update({
        where: { id: o.id },
        data: {
          email: deletedEmail,
          phone: "",
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

    // [PRI-01] (S08) — Consent (Ley 1581): revocar consentimientos comerciales vigentes y anonimizar
    // PII (email/phone/ipAddress/userAgent/customerId → null) preservando la traza probatoria de
    // scope/accepted/version/acceptedAt. Al quedar email=null, /admin/marketing/suscriptores y su CSV
    // excluyen automáticamente al titular suprimido.
    const consentOr: Prisma.ConsentWhereInput[] = [{ customerId }];
    if (customerEmail) {
      consentOr.push({ email: { equals: customerEmail, mode: "insensitive" } });
    }
    if (customerPhone) {
      consentOr.push({ phone: customerPhone });
    }
    const existingConsents = await tx.consent.findMany({
      where: { OR: consentOr },
      orderBy: { acceptedAt: "desc" },
      select: { id: true, scope: true, accepted: true, version: true },
    });
    if (existingConsents.length > 0) {
      for (const commercialScope of [
        "NEWSLETTER",
        "MARKETING_PROFILING",
        "COOKIES_MARKETING",
      ] as const) {
        const latestForScope = existingConsents.find((c) => c.scope === commercialScope);
        if (latestForScope?.accepted) {
          await tx.consent.create({
            data: {
              scope: commercialScope,
              accepted: false,
              version: latestForScope.version,
              revokesId: latestForScope.id,
              customerId: null,
              email: null,
            },
          });
        }
      }
      await tx.consent.updateMany({
        where: { id: { in: existingConsents.map((c) => c.id) } },
        data: {
          customerId: null,
          email: null,
          phone: null,
          ipAddress: null,
          userAgent: null,
        },
      });
    }

    // Cortar suscripciones comerciales y carritos activos del titular.
    await tx.cart.deleteMany({ where: { customerId } });
    if (customerEmail) {
      await tx.abandonedCart.deleteMany({
        where: { email: { equals: customerEmail, mode: "insensitive" } },
      });
      await tx.backInStockSubscription.deleteMany({
        where: {
          OR: [{ email: { equals: customerEmail, mode: "insensitive" } }, { customerId }],
        },
      });
    } else {
      await tx.backInStockSubscription.deleteMany({ where: { customerId } });
    }

    // Wishlist: borrar las filas del titular.
    await tx.wishlistItem.deleteMany({ where: { customerId } });

    // Marcar órdenes del titular como "reseña ya solicitada" para que el cron no dispare envíos.
    await tx.order.updateMany({
      where: { customerId, reviewRequestedAt: null },
      data: { reviewRequestedAt: now },
    });

    // Logs de lealtad, cupones personales, usos de cupón y referidos ([PRI-01] / S08):
    // desvincular y limpiar el email/descripción que identificaba al titular.
    await tx.loyaltyTxn.updateMany({ where: { customerId }, data: { customerId: null } });
    await tx.couponUsage.updateMany({
      where: customerEmail
        ? { OR: [{ customerId }, { email: { equals: customerEmail, mode: "insensitive" } }] }
        : { customerId },
      data: { customerId: null, email: null },
    });
    await tx.coupon.updateMany({
      where: { customerId },
      data: {
        customerId: null,
        isActive: false,
        description: null,
        deletedAt: now,
        deletedBy: customerId,
      },
    });
    if (customerEmail) {
      await tx.referral.updateMany({
        where: { referredEmail: { equals: customerEmail, mode: "insensitive" } },
        data: { referredEmail: deletedEmail },
      });
    }
  });

  // 2) Borrar archivos de Storage + dar de baja en Resend Contacts (best-effort, fuera de la tx).
  await Promise.all([
    removeStorage(CUSTOMER_UPLOADS_BUCKET, uploadPaths),
    removeStorage(PREVIEWS_BUCKET, previewPaths),
    removeStorage(PRODUCTION_BUCKET, [...productionPaths, ...stagedPaths]),
    ...(customerEmail ? [markResendContactUnsubscribed(customerEmail)] : []),
  ]);

  // 3) Revocar el auth user (delete → fallback ban).
  await revokeAuthUser(supabaseUserId, customerId);

  logger.info({ event: "account.delete.success", customerId });
}
