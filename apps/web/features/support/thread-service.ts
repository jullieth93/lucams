import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { renderSupportTicketReplyEmail } from "@/features/emails/registry";
import { createWarrantyClaimAsAdmin, WarrantyError } from "@/features/warranty/service";
import { notifyWarrantyClaimCreated } from "@/features/warranty/notify";
import { createRetractRequestAsAdmin, RetractError } from "@/features/retract/service";
import type { SUBJECT_LABELS } from "@/features/support/schemas";

/*
 * Hilo del ticket + conversión a caso especializado (flujo de solución, owner
 * 2026-09-29). Antes la respuesta ocurría por fuera (mailto desde el correo de
 * Lucy) y un ticket GARANTIA_DEVOLUCION quedaba huérfano del módulo legal. Acá:
 *  - addTicketMessage: respuesta pública (email al cliente + visible en
 *    /mi-cuenta/soporte) o nota interna (isInternal, nunca sale del panel).
 *  - convertTicketToCase: crea el WarrantyClaim / RetractRequest enlazado
 *    (linkedCaseType/linkedCaseId) — el ticket entra a la máquina de estados
 *    del módulo correspondiente con referencia cruzada en ambos paneles.
 */

// ──────────────────────── Hilo + detalle (flujo de solución) ────────────────────────

export type SupportTicketMessageRow = {
  id: string;
  authorKind: string; // "CUSTOMER" | "ADMIN"
  body: string;
  isInternal: boolean;
  createdAt: Date;
};

export type SupportTicketDetail = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  customerId: string | null;
  orderNumber: string | null;
  /** Order.number exacto si el pedido existe (para el link a /admin/pedidos/[number]). */
  resolvedOrderNumber: string | null;
  linkedCaseType: string | null;
  linkedCaseId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  messages: SupportTicketMessageRow[];
};

/**
 * Resuelve el orderNumber del ticket (puede venir como "LCM-2026-0001" o solo
 * dígitos "1042") al Order.number exacto. Null si no matchea ningún pedido.
 */
async function resolveOrderNumber(raw: string): Promise<string | null> {
  const normalized = raw.trim().toUpperCase();
  const exact = await prisma.order.findUnique({
    where: { number: normalized },
    select: { number: true },
  });
  if (exact) return exact.number;
  if (/^\d{1,6}$/.test(normalized)) {
    const bySuffix = await prisma.order.findFirst({
      where: { number: { endsWith: `-${normalized}` } },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    return bySuffix?.number ?? null;
  }
  return null;
}

/** Detalle completo del ticket con su hilo (para /admin/soporte/[id]). */
export async function getSupportTicketDetail(id: string): Promise<SupportTicketDetail | null> {
  const t = await prisma.supportTicket.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      subject: true,
      message: true,
      status: true,
      customerId: true,
      orderNumber: true,
      linkedCaseType: true,
      linkedCaseId: true,
      resolvedAt: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, authorKind: true, body: true, isInternal: true, createdAt: true },
      },
    },
  });
  if (!t) return null;
  const resolvedOrderNumber = t.orderNumber ? await resolveOrderNumber(t.orderNumber) : null;
  return { ...t, resolvedOrderNumber };
}

/** Email de respuesta al cliente — best-effort (patrón sendTicketClosedEmail). */
async function sendTicketReplyEmail(input: {
  messageId: string;
  ticket: { id: string; name: string; email: string; subject: string };
  body: string;
}): Promise<void> {
  try {
    const tpl = await renderSupportTicketReplyEmail({
      customerName: input.ticket.name,
      ticketId: input.ticket.id,
      subject: input.ticket.subject as keyof typeof SUBJECT_LABELS,
      replyBody: input.body,
    });
    const result = await sendEmail({
      to: input.ticket.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: tpl.replyTo,
      idempotencyKey: `support:reply:${input.messageId}`,
      tags: [{ name: "kind", value: "support-reply" }],
    });
    logger.info({
      event: "support.ticket.reply_email.sent",
      ticketId: input.ticket.id,
      messageId: input.messageId,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "support.ticket.reply_email.fail",
      ticketId: input.ticket.id,
      messageId: input.messageId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Agrega un mensaje del equipo al hilo del ticket.
 *  - internal = false: respuesta al cliente → email best-effort con
 *    idempotencyKey `support:reply:<messageId>`; el ticket pasa OPEN → IN_PROGRESS.
 *  - internal = true: nota interna → NO se envía ni se muestra al cliente; el
 *    estado del ticket no cambia.
 */
export async function addTicketMessage(input: {
  ticketId: string;
  body: string;
  adminId: string;
  internal: boolean;
}): Promise<{ id: string }> {
  const body = input.body.trim();
  if (body.length < 2) throw new Error("El mensaje está vacío");
  if (body.length > 2000) throw new Error("El mensaje supera el máximo (2000 caracteres)");
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true, name: true, email: true, subject: true },
  });
  if (!ticket) throw new Error(`Ticket ${input.ticketId} no encontrado`);

  const message = await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorKind: "ADMIN",
      authorId: input.adminId,
      body,
      isInternal: input.internal,
    },
    select: { id: true },
  });

  if (!input.internal) {
    if (ticket.status === "OPEN") {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: "IN_PROGRESS" },
      });
    }
    await sendTicketReplyEmail({ messageId: message.id, ticket, body });
  }
  return message;
}

// ──────────────────────── Conversión a caso especializado ────────────────────────

export type ConvertibleOrderItem = {
  orderItemId: string;
  productName: string;
  qty: number;
  personalized: boolean;
  hasActiveWarrantyClaim: boolean;
  hasRetractRequest: boolean;
};

export type CaseConversionOrder = {
  orderNumber: string;
  orderStatus: string;
  orderEmail: string;
  items: ConvertibleOrderItem[];
};

const WARRANTY_ACTIVE_STATUSES = ["PENDING", "IN_REVIEW", "APPROVED"] as const;

/**
 * Items del pedido del ticket con su estado de elegibilidad, para que el admin
 * elija sobre cuál item crear la garantía o el retracto. Null si el pedido no existe.
 */
export async function getOrderItemsForCaseConversion(
  orderNumberRaw: string,
): Promise<CaseConversionOrder | null> {
  const number = await resolveOrderNumber(orderNumberRaw);
  if (!number) return null;
  const order = await prisma.order.findUnique({
    where: { number },
    select: {
      number: true,
      status: true,
      email: true,
      items: {
        select: {
          id: true,
          qty: true,
          customDesign: true,
          designId: true,
          variant: { select: { product: { select: { name: true } } } },
          warrantyClaims: {
            where: { status: { in: [...WARRANTY_ACTIVE_STATUSES] } },
            select: { id: true },
            take: 1,
          },
          retractRequest: { select: { id: true } },
        },
      },
    },
  });
  if (!order) return null;
  return {
    orderNumber: order.number,
    orderStatus: order.status,
    orderEmail: order.email,
    items: order.items.map((it) => ({
      orderItemId: it.id,
      productName: it.variant.product.name,
      qty: it.qty,
      personalized: it.customDesign != null || it.designId != null,
      hasActiveWarrantyClaim: it.warrantyClaims.length > 0,
      hasRetractRequest: it.retractRequest != null,
    })),
  };
}

export type LinkedCaseKind = "warranty" | "retract";

/**
 * Convierte un ticket GARANTIA_DEVOLUCION en un caso del módulo especializado
 * (WarrantyClaim o RetractRequest) y lo enlaza (linkedCaseType/linkedCaseId).
 *
 * El admin elige el item del pedido; la descripción del caso se pre-llena con el
 * mensaje del ticket (prefijado con el short id → referencia cruzada visible en
 * /admin/garantias y /admin/retractos). La elegibilidad fina la valida el módulo
 * destino (pedido entregado, sin caso activo, personalizados exceptuados de
 * retracto); la ventana de tiempo es válvula admin (documentado en los services).
 * Deja además una nota interna en el hilo con el id del caso creado.
 */
export async function convertTicketToCase(input: {
  ticketId: string;
  kind: LinkedCaseKind;
  orderItemId: string;
  adminId: string;
}): Promise<{ caseId: string }> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, subject: true, status: true, message: true, linkedCaseId: true },
  });
  if (!ticket) throw new Error(`Ticket ${input.ticketId} no encontrado`);
  if (ticket.linkedCaseId) throw new Error("El ticket ya tiene un caso enlazado");
  if (ticket.subject !== "GARANTIA_DEVOLUCION") {
    throw new Error("Solo los tickets de garantía/devolución se convierten a caso");
  }

  const shortId = ticket.id.slice(0, 8).toUpperCase();
  const caseText = `[Ticket #${shortId}] ${ticket.message}`.slice(0, 1900);
  let caseId: string;
  if (input.kind === "warranty") {
    const claim = await createWarrantyClaimAsAdmin({
      orderItemId: input.orderItemId,
      description: caseText,
      adminId: input.adminId,
    });
    caseId = claim.id;
  } else {
    const request = await createRetractRequestAsAdmin(input.orderItemId, {
      reason: caseText.slice(0, 500),
      adminId: input.adminId,
    });
    caseId = request.id;
  }

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      linkedCaseType: input.kind,
      linkedCaseId: caseId,
      ...(ticket.status === "OPEN" ? { status: "IN_PROGRESS" } : {}),
    },
  });
  await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorKind: "ADMIN",
      authorId: input.adminId,
      body:
        input.kind === "warranty"
          ? `Ticket convertido a reclamo de garantía (${caseId}) — se gestiona en /admin/garantias.`
          : `Ticket convertido a solicitud de retracto (${caseId}) — se gestiona en /admin/retractos.`,
      isInternal: true,
    },
  });

  // Acuse de garantía recibida al cliente (best-effort, captura sus propios errores).
  if (input.kind === "warranty") {
    await notifyWarrantyClaimCreated(caseId).catch((err) =>
      logger.error({
        event: "support.ticket.case_notify.fail",
        ticketId: ticket.id,
        caseId,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
  logger.info({
    event: "support.ticket.converted",
    ticketId: ticket.id,
    kind: input.kind,
    caseId,
    adminId: input.adminId,
  });
  return { caseId };
}

/** Mensaje amigable para los errores de elegibilidad de los módulos destino. */
export function caseConversionErrorMessage(err: unknown): string {
  const reason = err instanceof WarrantyError || err instanceof RetractError ? err.reason : null;
  switch (reason) {
    case "NOT_FOUND":
      return "No se encontró el item del pedido.";
    case "NOT_DELIVERED":
      return "El pedido aún no está entregado: garantía y retracto aplican después de la entrega.";
    case "ACTIVE_CLAIM":
      return "Ese item ya tiene un reclamo de garantía activo.";
    case "ALREADY_REQUESTED":
      return "Ese item ya tiene una solicitud de retracto.";
    case "PERSONALIZED":
      return "Los productos personalizados están exceptuados del retracto (Ley 1480 art. 47). Usa garantía.";
    case "INVALID":
      return "La descripción del caso es muy corta.";
    default:
      return "No se pudo convertir el ticket.";
  }
}
