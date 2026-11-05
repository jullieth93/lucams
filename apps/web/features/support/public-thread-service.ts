/*
 * Servicio de hilo bidireccional de soporte para clientes autenticados e invitados (`Fase 10 · S21`).
 *
 * Seguridad mandatoria (cero suposiciones):
 *  - Las notas internas (`isInternal: true`) se excluyen en la cláusula SQL `WHERE` y los
 *    campos internos (`ip`, `userAgent`, `resolvedBy`, `authorId`, `assignedToAdminId`)
 *    JAMÁS entran en ningún `select` hacia cliente o navegador público.
 *  - Acceso de invitado (`/soporte/[token]`) autenticado exclusivamente con `publicAccessTokenHash`
 *    (SHA-256 de 128 bits CSPRNG) validado con `verifyTokenHashTimingSafe` y sin revelar `email`
 *    completo del comprador (solo primer nombre).
 *  - Respuesta de cliente (`authorKind = "CUSTOMER"`): si el ticket estaba `CLOSED` o `IN_PROGRESS`,
 *    vuelve automáticamente a `OPEN` (`resolvedAt = null`, `resolvedBy = null`) para que ningún
 *    mensaje entrante del cliente quede enterrado sin visibilidad operativa.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { hashBearerToken, verifyTokenHashTimingSafe } from "@/lib/token-hash";

const CUSTOMER_TICKETS_LIMIT = 50;

export type PublicThreadMessage = {
  id: string;
  authorKind: "CUSTOMER" | "ADMIN";
  body: string;
  createdAt: Date;
};

export type BidirectionalCustomerTicket = {
  id: string;
  shortId: string;
  subject: string;
  status: string;
  message: string;
  ownOrderNumber: string | null;
  messages: PublicThreadMessage[];
  createdAt: Date;
  resolvedAt: Date | null;
};

export type GuestPublicSupportThread = {
  shortId: string;
  customerFirstName: string;
  subject: string;
  status: string;
  message: string;
  orderNumber: string | null;
  messages: PublicThreadMessage[];
  createdAt: Date;
  resolvedAt: Date | null;
};

export class CustomerSupportReplyError extends Error {
  readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_MESSAGE";

  constructor(code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_MESSAGE", message: string) {
    super(message);
    this.name = "CustomerSupportReplyError";
    this.code = code;
  }
}

async function resolveOwnOrderNumbers(
  customerId: string,
  raws: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (raws.length === 0) return map;
  const or = raws.flatMap((raw) => {
    const normalized = raw.trim().toUpperCase();
    return /^\d{1,6}$/.test(normalized)
      ? [{ number: normalized }, { number: { endsWith: `-${normalized}` } }]
      : [{ number: normalized }];
  });
  const orders = await prisma.order.findMany({
    where: { customerId, deletedAt: null, OR: or },
    select: { number: true },
  });
  for (const raw of raws) {
    const normalized = raw.trim().toUpperCase();
    const hit = orders.find(
      (o) =>
        o.number === normalized ||
        (/^\d{1,6}$/.test(normalized) && o.number.endsWith(`-${normalized}`)),
    );
    if (hit) map.set(raw, hit.number);
  }
  return map;
}

/**
 * Lista los tickets propios de un `Customer` autenticado incluyendo el hilo público
 * completo (mensajes propios + respuestas del equipo, cero notas internas).
 */
export async function listBidirectionalTicketsForCustomer(
  customerId: string,
): Promise<BidirectionalCustomerTicket[]> {
  const tickets = await prisma.supportTicket.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: CUSTOMER_TICKETS_LIMIT,
    select: {
      id: true,
      subject: true,
      status: true,
      message: true,
      orderNumber: true,
      createdAt: true,
      resolvedAt: true,
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, authorKind: true, body: true, createdAt: true },
      },
    },
  });

  const ownOrders = await resolveOwnOrderNumbers(
    customerId,
    tickets.map((t) => t.orderNumber).filter((n): n is string => Boolean(n)),
  );

  return tickets.map((t) => ({
    id: t.id,
    shortId: t.id.slice(0, 8).toUpperCase(),
    subject: t.subject,
    status: t.status,
    message: t.message,
    ownOrderNumber: t.orderNumber ? (ownOrders.get(t.orderNumber) ?? null) : null,
    messages: t.messages.map((m) => ({
      id: m.id,
      authorKind: m.authorKind === "ADMIN" ? "ADMIN" : "CUSTOMER",
      body: m.body,
      createdAt: m.createdAt,
    })),
    createdAt: t.createdAt,
    resolvedAt: t.resolvedAt,
  }));
}

/**
 * Consulta un hilo público de soporte por token bearer de 32 hex chars (`/soporte/[token]`).
 */
export async function getPublicSupportThreadByToken(
  token: string,
): Promise<GuestPublicSupportThread | null> {
  const cleanToken = token.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(cleanToken)) return null;

  const tokenHash = hashBearerToken(cleanToken);
  const ticket = await prisma.supportTicket.findFirst({
    where: { publicAccessTokenHash: tokenHash },
    select: {
      id: true,
      publicAccessTokenHash: true,
      name: true,
      subject: true,
      status: true,
      message: true,
      orderNumber: true,
      createdAt: true,
      resolvedAt: true,
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, authorKind: true, body: true, createdAt: true },
      },
    },
  });

  if (!ticket || !verifyTokenHashTimingSafe(cleanToken, ticket.publicAccessTokenHash)) {
    return null;
  }

  const firstName = ticket.name.trim().split(/\s+/)[0] || "Cliente";

  return {
    shortId: ticket.id.slice(0, 8).toUpperCase(),
    customerFirstName: firstName,
    subject: ticket.subject,
    status: ticket.status,
    message: ticket.message,
    orderNumber: ticket.orderNumber,
    messages: ticket.messages.map((m) => ({
      id: m.id,
      authorKind: m.authorKind === "ADMIN" ? "ADMIN" : "CUSTOMER",
      body: m.body,
      createdAt: m.createdAt,
    })),
    createdAt: ticket.createdAt,
    resolvedAt: ticket.resolvedAt,
  };
}

function normalizeReplyBody(raw: string): string {
  const clean = raw.trim();
  if (clean.length < 2) {
    throw new CustomerSupportReplyError(
      "INVALID_MESSAGE",
      "Escribe un mensaje de al menos 2 caracteres.",
    );
  }
  if (clean.length > 2000) {
    throw new CustomerSupportReplyError(
      "INVALID_MESSAGE",
      "El mensaje no puede superar 2.000 caracteres.",
    );
  }
  return clean;
}

/**
 * Registra una respuesta del cliente autenticado sobre su propio ticket y reabre a `OPEN`
 * si estaba en `IN_PROGRESS` o `CLOSED`.
 */
export async function addCustomerReplyForSession(input: {
  ticketId: string;
  customerId: string;
  body: string;
}): Promise<{ messageId: string; reopened: boolean }> {
  const body = normalizeReplyBody(input.body);
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId.trim() },
    select: { id: true, customerId: true, status: true },
  });

  if (!ticket) {
    throw new CustomerSupportReplyError("NOT_FOUND", "La solicitud no existe.");
  }
  if (!ticket.customerId || ticket.customerId !== input.customerId) {
    throw new CustomerSupportReplyError("FORBIDDEN", "No tienes permiso sobre esta solicitud.");
  }

  return prisma.$transaction(async (tx) => {
    const msg = await tx.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorKind: "CUSTOMER",
        authorId: input.customerId,
        body,
        isInternal: false,
      },
      select: { id: true },
    });

    const reopened = ticket.status !== "OPEN";
    if (reopened) {
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: "OPEN",
          resolvedAt: null,
          resolvedBy: null,
        },
      });
    }

    return { messageId: msg.id, reopened };
  });
}

/**
 * Registra una respuesta del comprador (invitado o titular con enlace) vía `/soporte/[token]`.
 */
export async function addGuestReplyByToken(input: {
  token: string;
  body: string;
}): Promise<{ ticketId: string; messageId: string; reopened: boolean }> {
  const cleanToken = input.token.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(cleanToken)) {
    throw new CustomerSupportReplyError("NOT_FOUND", "Enlace de seguimiento no válido.");
  }
  const body = normalizeReplyBody(input.body);

  const tokenHash = hashBearerToken(cleanToken);
  const ticket = await prisma.supportTicket.findFirst({
    where: { publicAccessTokenHash: tokenHash },
    select: {
      id: true,
      publicAccessTokenHash: true,
      customerId: true,
      status: true,
    },
  });

  if (!ticket || !verifyTokenHashTimingSafe(cleanToken, ticket.publicAccessTokenHash)) {
    throw new CustomerSupportReplyError("NOT_FOUND", "Enlace de seguimiento no válido.");
  }

  return prisma.$transaction(async (tx) => {
    const msg = await tx.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorKind: "CUSTOMER",
        authorId: ticket.customerId,
        body,
        isInternal: false,
      },
      select: { id: true },
    });

    const reopened = ticket.status !== "OPEN";
    if (reopened) {
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: "OPEN",
          resolvedAt: null,
          resolvedBy: null,
        },
      });
    }

    return { ticketId: ticket.id, messageId: msg.id, reopened };
  });
}
