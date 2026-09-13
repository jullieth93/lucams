/*
 * Bandeja de tickets del cliente (/mi-cuenta/soporte) — 5.3 (2026-09-13).
 *
 * ADR-092 difería la bandeja self-service ("si el volumen lo justifica, se
 * evalúa como feature nuevo"); aprobada en la remediación de la auditoría 360°.
 * El canal de respuesta SIGUE siendo el email (ADR-092 vigente en eso): acá el
 * cliente solo VE sus solicitudes y su estado — la página lo dice explícito.
 *
 * Solo llegan tickets con customerId (los que creó logueado desde /contacto —
 * los de invitado no tienen dueño y no se muestran a nadie). Campos NO
 * sensibles: es SU propio ticket (su asunto y SU mensaje), nunca ip/userAgent/
 * resolvedBy ni datos de otros clientes.
 */

import "server-only";
import { prisma } from "@/lib/db";

export type CustomerSupportTicket = {
  /** Id corto para mostrar (mismo formato que el email de cierre: 8 chars upper). */
  shortId: string;
  subject: string;
  status: string;
  message: string;
  createdAt: Date;
  resolvedAt: Date | null;
};

/** Tope de la bandeja: los más recientes primero (patrón de /mi-cuenta/pedidos). */
const CUSTOMER_TICKETS_LIMIT = 50;

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
      createdAt: true,
      resolvedAt: true,
    },
  });
  return tickets.map((t) => ({
    shortId: t.id.slice(0, 8).toUpperCase(),
    subject: t.subject,
    status: t.status,
    message: t.message,
    createdAt: t.createdAt,
    resolvedAt: t.resolvedAt,
  }));
}
