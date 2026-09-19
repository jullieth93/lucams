import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { renderSupportTicketClosedEmail } from "@/features/emails/registry";
import type { SUBJECT_LABELS } from "@/features/support/schemas";

/*
 * Gestión admin de tickets de soporte (P2 backoffice). Antes los tickets se guardaban y
 * notificaban por email pero NO había panel para gestionarlos → Lucy solo los veía en su
 * bandeja. Este servicio + la page /admin/soporte cierran ese hueco operativo.
 */

export type SupportTicketStatus = "OPEN" | "IN_PROGRESS" | "CLOSED";

export const SUPPORT_STATUSES: SupportTicketStatus[] = ["OPEN", "IN_PROGRESS", "CLOSED"];

export async function listSupportTickets(filter?: { status?: SupportTicketStatus }) {
  return prisma.supportTicket.findMany({
    where: filter?.status ? { status: filter.status } : {},
    // Abiertos primero (lo que requiere acción), luego los más recientes.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      email: true,
      name: true,
      subject: true,
      message: true,
      status: true,
      customerId: true,
      resolvedAt: true,
      createdAt: true,
    },
  });
}

/** Nº de tickets que requieren atención (para el badge del dashboard). */
export async function countOpenSupportTickets(): Promise<number> {
  return prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } });
}

/**
 * N-14 — email de cierre al cliente (ciclo de soporte: acuse "te respondemos por
 * correo" → aviso de cierre). Best-effort estilo features/orders/emails.ts: un
 * fallo de Resend NUNCA rompe el cambio de estado, solo se loguea.
 *
 * Idempotencia por partida doble (mismo criterio que orders):
 *   1. Guard de transición en el llamador: solo se invoca cuando el ticket pasa
 *      de !CLOSED → CLOSED (no en reopen, no si ya estaba CLOSED — en ese caso
 *      resolvedAt ya estaba sellado).
 *   2. idempotencyKey `support:closed:<ticketId>` en Resend: si dos cierres
 *      concurrentes pasan el guard a la vez, Resend deduplica el segundo envío.
 */
async function sendTicketClosedEmail(ticket: {
  id: string;
  name: string;
  email: string;
  subject: string;
}): Promise<void> {
  try {
    const tpl = await renderSupportTicketClosedEmail({
      customerName: ticket.name,
      ticketId: ticket.id,
      // Los tickets se crean validados por SupportTicketSchema (mismo enum).
      subject: ticket.subject as keyof typeof SUBJECT_LABELS,
    });
    const result = await sendEmail({
      to: ticket.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: tpl.replyTo,
      idempotencyKey: `support:closed:${ticket.id}`,
      tags: [{ name: "kind", value: "support-closed" }],
    });
    logger.info({
      event: "support.ticket.closed_email.sent",
      ticketId: ticket.id,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "support.ticket.closed_email.fail",
      ticketId: ticket.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Cambia el estado de un ticket. Al cerrar, sella resolvedAt/resolvedBy; al reabrir, los limpia.
 * N-14: en la transición real → CLOSED (estado previo != CLOSED) avisa al cliente por correo.
 */
export async function setSupportTicketStatus(
  id: string,
  status: SupportTicketStatus,
  adminId: string,
) {
  const closing = status === "CLOSED";
  // Estado previo: dispara el guard del email de cierre (N-14). Sin esta lectura
  // un re-click en "Cerrar" sobre un ticket ya CLOSED reenviaría el correo.
  const prev = await prisma.supportTicket.findUnique({
    where: { id },
    select: { status: true, name: true, email: true, subject: true },
  });
  if (!prev) throw new Error(`Ticket ${id} no encontrado`);
  await prisma.supportTicket.update({
    where: { id },
    data: {
      status,
      resolvedAt: closing ? new Date() : null,
      resolvedBy: closing ? adminId : null,
    },
  });
  if (closing && prev.status !== "CLOSED") {
    await sendTicketClosedEmail({ id, name: prev.name, email: prev.email, subject: prev.subject });
  }
}
