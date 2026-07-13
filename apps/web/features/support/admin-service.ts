import "server-only";
import { prisma } from "@/lib/db";

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

/** Cambia el estado de un ticket. Al cerrar, sella resolvedAt/resolvedBy; al reabrir, los limpia. */
export async function setSupportTicketStatus(
  id: string,
  status: SupportTicketStatus,
  adminId: string,
) {
  const closing = status === "CLOSED";
  await prisma.supportTicket.update({
    where: { id },
    data: {
      status,
      resolvedAt: closing ? new Date() : null,
      resolvedBy: closing ? adminId : null,
    },
  });
}
