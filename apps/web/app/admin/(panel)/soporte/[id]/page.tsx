/*
 * Admin — detalle de ticket de soporte con hilo (flujo de solución, 2026-09-29).
 *
 * Antes el admin solo cambiaba el estado y respondía por fuera (mailto). Acá:
 *  - Hilo SupportTicketMessage: mensaje original + respuestas del equipo + notas
 *    internas (isInternal, solo visibles en el panel).
 *  - "Responder": guarda en el hilo y envía email al cliente (support-ticket-reply).
 *  - "Convertir a caso" (subject GARANTIA_DEVOLUCION): crea el WarrantyClaim o
 *    RetractRequest enlazado (linkedCaseType/linkedCaseId) con referencia cruzada.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, LifeBuoy, Package, Scale } from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  getSupportTicketDetail,
  getOrderItemsForCaseConversion,
} from "@/features/support/thread-service";
import type { SupportTicketStatus } from "@/features/support/admin-service";
import { SUBJECT_LABELS } from "@/features/support/schemas";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminBadge } from "@/components/admin-page";
import { TicketActions } from "../ticket-actions";
import { ReplyForm } from "./reply-form";
import { ConvertCaseForm } from "./convert-case-form";

export const metadata: Metadata = { title: "Ticket de soporte" };

const STATUS_TONE: Record<SupportTicketStatus, "amber" | "blue" | "emerald"> = {
  OPEN: "amber",
  IN_PROGRESS: "blue",
  CLOSED: "emerald",
};
const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: "Nuevo",
  IN_PROGRESS: "En progreso",
  CLOSED: "Cerrado",
};

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function subjectLabel(subject: string): string {
  return (SUBJECT_LABELS as Record<string, string>)[subject] ?? subject;
}

export default async function AdminSoporteTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["SUPERADMIN", "MANAGER"]);
  const { id } = await params;
  const ticket = await getSupportTicketDetail(id);
  if (!ticket) notFound();

  // Solo se cargan los items del pedido cuando la conversión aplica (ticket de
  // garantía/devolución sin caso enlazado y con número de pedido).
  const canConvert = ticket.subject === "GARANTIA_DEVOLUCION" && !ticket.linkedCaseId;
  const conversionOrder =
    canConvert && ticket.orderNumber
      ? await getOrderItemsForCaseConversion(ticket.orderNumber)
      : null;

  const status = ticket.status as SupportTicketStatus;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<LifeBuoy className="h-5 w-5" />}
        title={`Ticket #${ticket.id.slice(0, 8).toUpperCase()} — ${subjectLabel(ticket.subject)}`}
        subtitle={`${ticket.name} · ${ticket.email} · ${dateFmt.format(ticket.createdAt)}`}
      />
      <AdminPageBody>
        <Link
          href="/admin/soporte"
          className="text-brand-purple-dark hover:text-brand-purple mb-4 inline-flex items-center gap-1 text-sm font-semibold"
        >
          <ChevronLeft className="h-4 w-4" /> Volver a soporte
        </Link>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Columna principal: mensaje original + hilo + responder */}
          <div className="space-y-4 lg:col-span-2">
            <section className="border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <AdminBadge tone={STATUS_TONE[status]}>
                  {STATUS_LABEL[status] ?? ticket.status}
                </AdminBadge>
                {ticket.resolvedAt && (
                  <span className="text-brand-muted text-xs">
                    cerrado {dateFmt.format(ticket.resolvedAt)}
                  </span>
                )}
              </div>
              <p className="text-brand-purple-dark/90 mt-3 text-sm whitespace-pre-wrap">
                {ticket.message}
              </p>
            </section>

            {ticket.messages.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-brand-purple-dark text-sm font-semibold">Hilo</h2>
                <ul className="space-y-2">
                  {ticket.messages.map((m) => (
                    <li
                      key={m.id}
                      className={`rounded-xl border p-3 text-sm shadow-sm ${
                        m.isInternal
                          ? "border-amber-200 bg-amber-50"
                          : "border-brand-purple/10 bg-white"
                      }`}
                    >
                      <p className="text-brand-muted text-xs">
                        {m.isInternal
                          ? "Nota interna (no visible para el cliente)"
                          : m.authorKind === "ADMIN"
                            ? "Respuesta del equipo — enviada por correo"
                            : "Cliente"}{" "}
                        · {dateFmt.format(m.createdAt)}
                      </p>
                      <p className="text-brand-purple-dark/90 mt-1 whitespace-pre-wrap">{m.body}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="text-brand-purple-dark text-sm font-semibold">Responder</h2>
              <p className="text-brand-muted mt-1 text-xs">
                La respuesta se guarda en el hilo y llega al correo del cliente. Marca «nota
                interna» para dejar un comentario solo para el equipo.
              </p>
              <ReplyForm ticketId={ticket.id} disabled={status === "CLOSED"} />
            </section>
          </div>

          {/* Columna lateral: datos + pedido + caso + estado */}
          <aside className="space-y-4">
            <section className="border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="text-brand-purple-dark flex items-center gap-1.5 text-sm font-semibold">
                <Package className="h-4 w-4" /> Pedido relacionado
              </h2>
              {ticket.orderNumber ? (
                ticket.resolvedOrderNumber ? (
                  <p className="mt-2 text-sm">
                    <Link
                      href={`/admin/pedidos/${ticket.resolvedOrderNumber}`}
                      className="text-brand-purple font-mono font-semibold underline underline-offset-2"
                    >
                      {ticket.resolvedOrderNumber}
                    </Link>
                  </p>
                ) : (
                  <p className="text-brand-muted mt-2 text-sm">
                    <span className="font-mono">{ticket.orderNumber}</span> — no coincide con ningún
                    pedido.
                  </p>
                )
              ) : (
                <p className="text-brand-muted mt-2 text-sm">El cliente no indicó número.</p>
              )}
            </section>

            <section className="border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="text-brand-purple-dark flex items-center gap-1.5 text-sm font-semibold">
                <Scale className="h-4 w-4" /> Caso legal
              </h2>
              {ticket.linkedCaseId ? (
                <p className="mt-2 text-sm">
                  <Link
                    href={
                      ticket.linkedCaseType === "retract" ? "/admin/retractos" : "/admin/garantias"
                    }
                    className="text-brand-purple font-semibold underline underline-offset-2"
                  >
                    {ticket.linkedCaseType === "retract"
                      ? "Solicitud de retracto enlazada"
                      : "Reclamo de garantía enlazado"}
                  </Link>
                  <span className="text-brand-muted mt-1 block font-mono text-xs">
                    {ticket.linkedCaseId}
                  </span>
                </p>
              ) : ticket.subject === "GARANTIA_DEVOLUCION" ? (
                conversionOrder ? (
                  <ConvertCaseForm
                    ticketId={ticket.id}
                    order={conversionOrder}
                    disabled={status === "CLOSED"}
                  />
                ) : (
                  <p className="text-brand-muted mt-2 text-sm">
                    {ticket.orderNumber
                      ? "El pedido indicado no existe — pide el número correcto al cliente para convertir."
                      : "Sin número de pedido no se puede convertir — pídelo al cliente al responder."}
                  </p>
                )
              ) : (
                <p className="text-brand-muted mt-2 text-sm">
                  Este asunto no requiere caso de garantía o retracto.
                </p>
              )}
            </section>

            <section className="border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="text-brand-purple-dark text-sm font-semibold">Estado</h2>
              <div className="mt-2">
                <TicketActions id={ticket.id} status={ticket.status} />
              </div>
            </section>
          </aside>
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}
