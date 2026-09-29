/*
 * Bandeja de tickets del cliente (/mi-cuenta/soporte) — 5.3 (2026-09-13),
 * ampliada con hilo de respuestas (flujo de solución, 2026-09-29).
 *
 * ADR-092 difería la bandeja self-service ("si el volumen lo justifica, se
 * evalúa como feature nuevo"); aprobada en la remediación de la auditoría 360°.
 * El canal de respuesta sigue siendo TAMBIÉN el email (cada respuesta sale por
 * correo, template support-ticket-reply); acá el cliente ve además las
 * respuestas del equipo en pantalla. Las notas internas (isInternal) NUNCA se
 * devuelven: el filtro vive en la query, no en la UI.
 *
 * Solo llegan tickets con customerId (los que creó logueado desde /contacto —
 * los de invitado no tienen dueño y no se muestran a nadie). Campos NO
 * sensibles: es SU propio ticket, nunca ip/userAgent/resolvedBy/authorId ni
 * datos de otros clientes.
 */

import "server-only";
import { prisma } from "@/lib/db";

export type CustomerTicketReply = {
  body: string;
  createdAt: Date;
};

export type CustomerSupportTicket = {
  /** Id corto para mostrar (mismo formato que el email de cierre: 8 chars upper). */
  shortId: string;
  subject: string;
  status: string;
  message: string;
  /** Order.number exacto si el pedido indicado existe Y es del cliente (link a /mi-cuenta/pedidos/[number]). */
  ownOrderNumber: string | null;
  /** Respuestas del equipo (solo ADMIN, nunca notas internas), más antigua primero. */
  replies: CustomerTicketReply[];
  createdAt: Date;
  resolvedAt: Date | null;
};

/** Tope de la bandeja: los más recientes primero (patrón de /mi-cuenta/pedidos). */
const CUSTOMER_TICKETS_LIMIT = 50;

/**
 * Mapea los orderNumber crudos de los tickets (pueden ser "LCM-2026-0001" o solo
 * dígitos) al Order.number exacto de UN pedido del cliente. Un pedido de otro
 * cliente (o inexistente) nunca se enlaza.
 */
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

export async function listTicketsForCustomer(customerId: string): Promise<CustomerSupportTicket[]> {
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
      // Defensa en profundidad: el filtro de notas internas vive en DB (where),
      // y el select NO pide isInternal ni authorId → no hay forma de que una
      // nota interna cruce al cliente aunque el where cambie.
      messages: {
        where: { isInternal: false, authorKind: "ADMIN" },
        orderBy: { createdAt: "asc" },
        select: { body: true, createdAt: true },
      },
    },
  });
  const ownOrders = await resolveOwnOrderNumbers(
    customerId,
    tickets.map((t) => t.orderNumber).filter((n): n is string => !!n),
  );
  return tickets.map((t) => ({
    shortId: t.id.slice(0, 8).toUpperCase(),
    subject: t.subject,
    status: t.status,
    message: t.message,
    ownOrderNumber: t.orderNumber ? (ownOrders.get(t.orderNumber) ?? null) : null,
    replies: t.messages.map((m) => ({ body: m.body, createdAt: m.createdAt })),
    createdAt: t.createdAt,
    resolvedAt: t.resolvedAt,
  }));
}
