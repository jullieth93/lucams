/*
 * Admin — detalle de ticket de soporte con hilo bidireccional, SLA legal colombiano,
 * asignación de responsable, prioridad y enlace a Contacto 360 (`Fase 10 · S21`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, LifeBuoy, Package, Scale, User, UserCheck } from "lucide-react";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { hasCapability } from "@/lib/admin-rbac";
import { evaluateSlaStatus } from "@/lib/colombian-sla";
import { CrmWorkspacePanel } from "@/components/admin/crm-workspace-panel";
import {
  listActivitiesForEntity,
  listAssignableCrmAdmins,
  listTasksForEntity,
} from "@/features/crm/service";
import {
  getSupportTicketDetail,
  getOrderItemsForCaseConversion,
} from "@/features/support/thread-service";
import {
  isSupportPriority,
  listAssignableSupportAdmins,
  SUPPORT_PRIORITY_LABELS,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "@/features/support/admin-service";
import { SUBJECT_LABELS } from "@/features/support/schemas";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminBadge } from "@/components/admin-page";
import { TicketActions } from "../ticket-actions";
import { ReplyForm } from "./reply-form";
import { ConvertCaseForm } from "./convert-case-form";
import { TicketAssignmentForm } from "./ticket-assignment-form";

export const metadata: Metadata = {
  title: "Ticket de soporte",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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
  const session = await requireCapability("support:manage");
  const canManageTasks = hasCapability(session.admin.role, "crm:manage_tasks");
  const canManageActivities = hasCapability(session.admin.role, "crm:manage_activities");
  const canViewActivities =
    hasCapability(session.admin.role, "contacts:read_360") &&
    hasCapability(session.admin.role, "contacts:read_pii");
  const { id } = await params;

  const [ticket, assignableAdmins, crmAssignableAdmins] = await Promise.all([
    getSupportTicketDetail(id),
    listAssignableSupportAdmins(),
    canManageTasks ? listAssignableCrmAdmins() : Promise.resolve([]),
  ]);
  if (!ticket) notFound();

  const [crmTasks, crmActivities] = await Promise.all([
    listTasksForEntity({ supportTicketId: ticket.id }),
    canViewActivities && ticket.contactId
      ? listActivitiesForEntity({ supportTicketId: ticket.id })
      : Promise.resolve([]),
  ]);

  const canConvert = ticket.subject === "GARANTIA_DEVOLUCION" && !ticket.linkedCaseId;
  const conversionOrder =
    canConvert && ticket.orderNumber
      ? await getOrderItemsForCaseConversion(ticket.orderNumber)
      : null;

  const status = ticket.status as SupportTicketStatus;
  const priority: SupportTicketPriority = isSupportPriority(ticket.priority)
    ? ticket.priority
    : "NORMAL";
  const sla = evaluateSlaStatus(ticket.slaDueAt, {
    isClosed: status === "CLOSED",
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<LifeBuoy className="h-5 w-5" />}
        title={`Ticket #${ticket.id.slice(0, 8).toUpperCase()} — ${subjectLabel(ticket.subject)}`}
        subtitle={`${ticket.name} · ${ticket.email} · abierto ${dateFmt.format(ticket.createdAt)}`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Soporte", href: "/admin/soporte" },
          { label: `#${ticket.id.slice(0, 8).toUpperCase()}` },
        ]}
      />
      <AdminPageBody>
        <Link
          href="/admin/soporte"
          className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-sm font-semibold"
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
                <AdminBadge tone={sla.badgeTone}>
                  <Clock className="mr-1 inline h-3 w-3" />
                  {sla.label}
                </AdminBadge>
                <AdminBadge tone="purple">Prioridad {SUPPORT_PRIORITY_LABELS[priority]}</AdminBadge>
                {ticket.firstRespondedAt ? (
                  <span className="text-brand-muted text-xs">
                    1ª respuesta: {dateFmt.format(ticket.firstRespondedAt)}
                  </span>
                ) : (
                  status !== "CLOSED" && (
                    <span className="text-xs font-semibold text-amber-700">
                      Pendiente de primera respuesta
                    </span>
                  )
                )}
                {ticket.resolvedAt && (
                  <span className="text-brand-muted text-xs">
                    · cerrado {dateFmt.format(ticket.resolvedAt)}
                  </span>
                )}
              </div>
              <p className="text-brand-purple-dark/90 mt-3 text-sm whitespace-pre-wrap">
                {ticket.message}
              </p>
            </section>

            {ticket.messages.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-brand-purple-dark text-sm font-semibold">
                  Conversación ({ticket.messages.length})
                </h2>
                <ul className="space-y-2">
                  {ticket.messages.map((m) => (
                    <li
                      key={m.id}
                      className={`rounded-xl border p-3 text-sm shadow-sm ${
                        m.isInternal
                          ? "border-amber-200 bg-amber-50"
                          : m.authorKind === "CUSTOMER"
                            ? "border-brand-turquoise/40 bg-brand-turquoise/5"
                            : "border-brand-purple/10 bg-white"
                      }`}
                    >
                      <p className="text-brand-muted text-xs font-medium">
                        {m.isInternal
                          ? "Nota interna (solo equipo)"
                          : m.authorKind === "ADMIN"
                            ? "Respuesta del equipo — enviada por correo y visible en hilo"
                            : "Respuesta del cliente"}{" "}
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
                La respuesta pública queda en el hilo y llega al correo del cliente. Marca «nota
                interna» para dejar contexto privado solo para el equipo.
              </p>
              <ReplyForm ticketId={ticket.id} disabled={status === "CLOSED"} />
            </section>

            <CrmWorkspacePanel
              title="Tareas de seguimiento del ticket"
              subtitle="Crea tareas internas con vencimiento y responsable para que aparezcan en la Bandeja Hoy."
              contactId={canViewActivities ? ticket.contactId : null}
              supportTicketId={ticket.id}
              currentAdminId={session.admin.id}
              canManageTasks={canManageTasks}
              canViewActivities={canViewActivities && Boolean(ticket.contactId)}
              canManageActivities={canManageActivities && Boolean(ticket.contactId)}
              tasks={crmTasks}
              activities={crmActivities}
              assignableAdmins={crmAssignableAdmins}
              compact
            />
          </div>

          {/* Columna lateral: Contacto 360 + responsable/SLA + pedido + caso + estado */}
          <aside className="space-y-4">
            <section className="border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="text-brand-purple-dark flex items-center gap-1.5 text-sm font-semibold">
                <User className="h-4 w-4" /> Perfil del cliente
              </h2>
              <p className="text-brand-purple-dark mt-2 text-sm font-semibold">{ticket.name}</p>
              <p className="text-brand-muted text-xs">{ticket.email}</p>
              {ticket.contactId && (
                <Link
                  href={`/admin/clientes/${ticket.contactId}`}
                  className="text-brand-purple hover:text-brand-purple-dark mt-2 inline-block text-xs font-semibold underline underline-offset-2"
                >
                  Abrir Contacto 360 completo →
                </Link>
              )}
            </section>

            <section className="border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="text-brand-purple-dark flex items-center gap-1.5 text-sm font-semibold">
                <UserCheck className="h-4 w-4" /> Responsable y SLA legal
              </h2>
              {ticket.slaDueAt && (
                <p className="text-brand-muted mt-1.5 text-xs">
                  Vencimiento legal:{" "}
                  <strong className="text-brand-purple-dark">
                    {dateFmt.format(ticket.slaDueAt)}
                  </strong>
                </p>
              )}
              <div className="mt-3">
                <TicketAssignmentForm
                  ticketId={ticket.id}
                  currentAssignedAdminId={ticket.assignedToAdminId}
                  currentPriority={priority}
                  currentActorAdminId={session.admin.id}
                  assignableAdmins={assignableAdmins}
                  updatedAtIso={ticket.updatedAt.toISOString()}
                />
              </div>
            </section>

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
                <TicketActions
                  id={ticket.id}
                  status={ticket.status}
                  updatedAtIso={ticket.updatedAt.toISOString()}
                  hideThreadLink
                />
              </div>
            </section>
          </aside>
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}
