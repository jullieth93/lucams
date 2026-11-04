"use server";

/*
 * Server actions de /pedido/[token] (vista pública del pedido, guest checkout).
 *
 *  - `reorderGuestAction`: Paquete I — "Volver a pedir" para invitados.
 *  - `requestGuestRetractAction` / `requestGuestWarrantyAction` / `submitGuestOrderSupportAction`
 *    ([CX-01]): autoservicio posventa autenticado por `publicAccessTokenHash` (timing-safe) +
 *    confirmación timing-safe del correo del comprador (`order.email`) + rate-limit por IP y token.
 */

import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentCustomer } from "@/lib/auth";
import { resolveSupportTicketContact } from "@/features/identity/resolution-service";
import { getOrCreateCartSession } from "@/lib/cart-session";
import { getClientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey, ownerKey } from "@/lib/rate-limit-keys";
import {
  hashBearerToken,
  verifyEmailMatchesTimingSafe,
  verifyTokenHashTimingSafe,
} from "@/lib/token-hash";
import { reorderGuestOrder, type ReorderActionState } from "@/features/orders/reorder";
import { createGuestRetractRequest, RetractError } from "@/features/retract/service";
import { RETRACT_WINDOW_BUSINESS_DAYS } from "@/lib/consumer-law";
import { sendRetractRequested } from "@/features/retract/emails";
import { createGuestWarrantyClaim, WarrantyError } from "@/features/warranty/service";
import { notifyWarrantyClaimCreated } from "@/features/warranty/notify";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import {
  renderSupportTicketInternalEmail,
  renderSupportTicketReceivedEmail,
} from "@/features/emails/registry";
import type { SupportSubject } from "@/features/support/schemas";

export async function reorderGuestAction(
  _prev: ReorderActionState | null,
  formData: FormData,
): Promise<ReorderActionState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!/^[a-f0-9]{32}$/.test(token)) return { error: "No encontramos ese pedido." };

  const customer = await getCurrentCustomer();
  const sessionId = await getOrCreateCartSession();

  // Mismo tope que el reorder registrado, por dueño del carrito (cada reorder clona bytes).
  const rl = await rateLimit(ownerKey("reorder", customer?.customer.id ?? sessionId), 10, 600);
  if (!rl.allowed) {
    return { error: "Ya agregamos este pedido a tu carrito. Revisa tu carrito antes de repetir." };
  }

  try {
    const summary = await reorderGuestOrder({
      token,
      sessionId,
      customerId: customer?.customer.id ?? null,
    });
    if (!summary) return { error: "No encontramos ese pedido." };
    revalidatePath("/carrito");
    revalidatePath("/", "layout");
    return { summary };
  } catch (err) {
    logger.error({
      event: "orders.reorder.guest_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos volver a armar tu pedido. Intenta de nuevo." };
  }
}

const GUEST_RETRACT_MESSAGES: Record<string, string> = {
  NOT_FOUND: "No encontramos ese producto en tu pedido.",
  FORBIDDEN: "El correo ingresado no coincide con el correo con el que se realizó la compra.",
  ALREADY_REQUESTED: "Ya solicitaste el retracto de este producto.",
  NOT_DELIVERED: "Solo puedes solicitar retracto de pedidos ya entregados.",
  OUT_OF_WINDOW: `Pasaron los ${RETRACT_WINDOW_BUSINESS_DAYS} días hábiles para retractarte de este producto.`,
  PERSONALIZED: "Los productos personalizados no tienen derecho de retracto (Ley 1480, art. 47).",
};

export async function requestGuestRetractAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const token = String(formData.get("token") ?? "").trim();
  const orderItemId = String(formData.get("orderItemId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!/^[a-f0-9]{32}$/.test(token) || !orderItemId) {
    return { error: "No encontramos ese producto en tu pedido." };
  }
  if (!email) {
    return { error: "Confirma el correo con el que hiciste la compra." };
  }

  const ip = getClientIp(await headers());
  const tokenHash = hashBearerToken(token);
  const [byIp, byToken] = await Promise.all([
    rateLimit(ipKey("guest_retract", ip), 8, 3600),
    rateLimit(ownerKey("guest_retract_tok", tokenHash), 6, 3600),
  ]);
  if (!byIp.allowed || !byToken.allowed) {
    return { error: "Recibimos varios intentos seguidos. Espera unos minutos e intenta de nuevo." };
  }

  try {
    const { id } = await createGuestRetractRequest(orderItemId, {
      token,
      email,
      reason,
    });
    await sendRetractRequested(id);
    revalidatePath(`/pedido/${token}`);
    return {
      success:
        "¡Listo! Recibimos tu solicitud de retracto. Te enviamos un correo de confirmación y te escribiremos para coordinar la devolución.",
    };
  } catch (err) {
    if (err instanceof RetractError) {
      return { error: GUEST_RETRACT_MESSAGES[err.reason] ?? "No pudimos procesar tu solicitud." };
    }
    logger.error({
      event: "retract.guest_request.fail",
      orderItemId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos procesar tu solicitud. Intenta de nuevo." };
  }
}

const GUEST_WARRANTY_MESSAGES: Record<string, string> = {
  NOT_FOUND: "No encontramos ese producto en tu pedido.",
  FORBIDDEN: "El correo ingresado no coincide con el correo con el que se realizó la compra.",
  NOT_DELIVERED: "Solo puedes reclamar garantía de pedidos ya entregados.",
  OUT_OF_WARRANTY: "Este producto ya está fuera del periodo de garantía.",
  ACTIVE_CLAIM: "Ya tienes un reclamo de garantía en curso para este producto.",
  INVALID: "Cuéntanos un poco más sobre la falla (mínimo 10 caracteres).",
};

export async function requestGuestWarrantyAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const token = String(formData.get("token") ?? "").trim();
  const orderItemId = String(formData.get("orderItemId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!/^[a-f0-9]{32}$/.test(token) || !orderItemId) {
    return { error: "No encontramos ese producto en tu pedido." };
  }
  if (!email) {
    return { error: "Confirma el correo con el que hiciste la compra." };
  }
  if (description.length < 10) {
    return { error: GUEST_WARRANTY_MESSAGES.INVALID };
  }

  const ip = getClientIp(await headers());
  const tokenHash = hashBearerToken(token);
  const [byIp, byToken] = await Promise.all([
    rateLimit(ipKey("guest_warranty", ip), 8, 3600),
    rateLimit(ownerKey("guest_warranty_tok", tokenHash), 6, 3600),
  ]);
  if (!byIp.allowed || !byToken.allowed) {
    return { error: "Recibimos varios intentos seguidos. Espera unos minutos e intenta de nuevo." };
  }

  try {
    const claim = await createGuestWarrantyClaim({
      token,
      email,
      orderItemId,
      description,
    });
    await notifyWarrantyClaimCreated(claim.id).catch((e) =>
      logger.warn({ event: "warranty.guest_notify_fail", claimId: claim.id, err: String(e) }),
    );
    revalidatePath(`/pedido/${token}`);
    return {
      success:
        "¡Listo! Recibimos tu reclamo de garantía. Lo revisamos y te escribiremos con la solución.",
    };
  } catch (err) {
    if (err instanceof WarrantyError) {
      return { error: GUEST_WARRANTY_MESSAGES[err.reason] ?? "No pudimos procesar tu reclamo." };
    }
    logger.error({
      event: "warranty.guest_request.fail",
      orderItemId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos procesar tu reclamo. Intenta de nuevo." };
  }
}

export type GuestOrderSupportState =
  { ok: true; ticketShortId: string } | { ok: false; error: string } | null;

const ALLOWED_GUEST_ORDER_SUBJECTS: readonly SupportSubject[] = [
  "MI_PEDIDO",
  "ENVIO_RASTREO",
  "GARANTIA_DEVOLUCION",
  "PAGO_FACTURACION",
];

export async function submitGuestOrderSupportAction(
  _prev: GuestOrderSupportState,
  formData: FormData,
): Promise<GuestOrderSupportState> {
  const token = String(formData.get("token") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const rawSubject = String(formData.get("subject") ?? "MI_PEDIDO").trim() as SupportSubject;
  const message = String(formData.get("message") ?? "").trim();

  if (!/^[a-f0-9]{32}$/.test(token)) {
    return { ok: false, error: "No encontramos ese pedido." };
  }
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Ingresa el correo válido con el que realizaste la compra." };
  }
  if (!ALLOWED_GUEST_ORDER_SUBJECTS.includes(rawSubject)) {
    return { ok: false, error: "Selecciona un motivo válido." };
  }
  if (message.length < 10 || message.length > 2000) {
    return { ok: false, error: "Cuéntanos un poco más (entre 10 y 2.000 caracteres)." };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const userAgent = hdrs.get("user-agent") ?? null;
  const tokenHash = hashBearerToken(token);

  const [byIp, byToken] = await Promise.all([
    rateLimit(ipKey("guest_order_support", ip), 6, 24 * 60 * 60),
    rateLimit(ownerKey("guest_order_support_tok", tokenHash), 4, 24 * 60 * 60),
  ]);
  if (!byIp.allowed || !byToken.allowed) {
    return {
      ok: false,
      error: "Ya recibimos varias solicitudes hoy para este pedido. Si es urgente, usa WhatsApp.",
    };
  }

  try {
    const order = await prisma.order.findFirst({
      where: { publicAccessTokenHash: tokenHash, deletedAt: null },
      select: {
        number: true,
        email: true,
        customerId: true,
        contactId: true,
        publicAccessTokenHash: true,
        shippingAddress: true,
        isGift: true,
        recipientName: true,
      },
    });
    if (!order || !verifyTokenHashTimingSafe(token, order.publicAccessTokenHash)) {
      return { ok: false, error: "No encontramos ese pedido." };
    }
    if (!verifyEmailMatchesTimingSafe(email, order.email)) {
      return {
        ok: false,
        error: "El correo ingresado no coincide con el correo con el que se realizó la compra.",
      };
    }

    const ship = order.shippingAddress as { fullName?: string } | null;
    const customerName = ship?.fullName?.trim() || "Cliente";
    const contactId = await resolveSupportTicketContact(prisma, {
      customerId: order.customerId,
      orderContactId: order.contactId,
      email: order.email,
      name: order.isGift || order.recipientName ? null : customerName,
    });

    const ticket = await prisma.supportTicket.create({
      data: {
        name: customerName.slice(0, 120),
        email: order.email,
        subject: rawSubject,
        message,
        orderNumber: order.number,
        status: "OPEN",
        ip,
        userAgent,
        customerId: order.customerId,
        ...(contactId ? { contactId } : {}),
      },
      select: { id: true },
    });

    logger.info({
      event: "support.ticket.guest_order_created",
      ticketId: ticket.id,
      orderNumber: order.number,
      subject: rawSubject,
    });

    after(async () => {
      try {
        const contactEmail = await getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.com");
        const [received, internal] = await Promise.all([
          renderSupportTicketReceivedEmail({
            customerName,
            ticketId: ticket.id,
            subject: rawSubject,
            message,
          }),
          renderSupportTicketInternalEmail({
            customerName,
            customerEmail: order.email,
            ticketId: ticket.id,
            subject: rawSubject,
            message: `[Pedido ${order.number}]\n\n${message}`,
            ip,
          }),
        ]);
        await Promise.all([
          sendEmail({
            to: order.email,
            subject: received.subject,
            html: received.html,
            text: received.text,
            idempotencyKey: `support:received:${ticket.id}`,
            tags: [{ name: "kind", value: "support-received" }],
          }),
          sendEmail({
            to: contactEmail,
            subject: internal.subject,
            html: internal.html,
            text: internal.text,
            replyTo: internal.replyTo,
            idempotencyKey: `support:internal:${ticket.id}`,
            tags: [{ name: "kind", value: "support-internal" }],
          }),
        ]);
      } catch (err) {
        logger.error({
          event: "support.ticket.guest_order_email_failed",
          ticketId: ticket.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return { ok: true, ticketShortId: ticket.id.slice(0, 8).toUpperCase() };
  } catch (err) {
    logger.error({
      event: "support.ticket.guest_order_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "No pudimos enviar tu solicitud. Intenta de nuevo." };
  }
}
