/*
 * Admin > Servicio al cliente > Soporte (`/admin/soporte` · Fase 10 · S21).
 *
 * Bandeja operativa gobernada con:
 *  - Búsqueda en servidor (`q` por correo, nombre, pedido, id o texto), paginación y filtros rápidos.
 *  - Semáforo de SLA legal colombiano (15 días hábiles PQR/reclamos, 10 días hábiles consultas).
 *  - Visibilidad de responsable asignado, prioridad y primera respuesta.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Clock, LifeBuoy, Search, UserCheck } from "lucide-react";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { formatRelativeTime } from "@/lib/format";
import {
  isSupportInboxView,
  isSupportPriority,
  listSupportTicketsPaginated,
  SUPPORT_PRIORITY_LABELS,
  type SupportInboxView,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "@/features/support/admin-service";
import { SUBJECT_LABELS } from "@/features/support/schemas";
import {
  AdminBadge,
  AdminEmpty,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { TicketActions } from "./ticket-actions";

export const metadata: Metadata = {
  title: "Soporte y PQR",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

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

const PRIORITY_TONE: Record<SupportTicketPriority, "slate" | "purple" | "amber" | "rose"> = {
  LOW: "slate",
  NORMAL: "purple",
  HIGH: "amber",
  URGENT: "rose",
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

export default async function AdminSoportePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireCapability("support:manage");
  const sp = await searchParams;

  const viewRaw = pickString(sp, "view") ?? pickString(sp, "status");
  const view: SupportInboxView = isSupportInboxView(viewRaw) ? viewRaw : "OPEN";
  const q = pickString(sp, "q") ?? "";
  const priorityRaw = pickString(sp, "priority");
  const priority = isSupportPriority(priorityRaw) ? priorityRaw : undefined;
  const page = Math.max(1, Number(pickString(sp, "page")) || 1);

  const data = await listSupportTicketsPaginated({
    view,
    q,
    priority,
    actorAdminId: session.admin.id,
    page,
  });

  const filterTabs: Array<{ key: SupportInboxView; label: string; count?: number }> = [
    { key: "OPEN", label: "Nuevos", count: data.counts.open },
    { key: "IN_PROGRESS", label: "En progreso", count: data.counts.inProgress },
    { key: "mine", label: "Asignados a mí", count: data.counts.mine },
    { key: "unassigned", label: "Sin asignar", count: data.counts.unassigned },
    { key: "sla-risk", label: "SLA por vencer / vencido", count: data.counts.slaRisk },
    { key: "CLOSED", label: "Cerrados" },
    { key: "all", label: "Todos" },
  ];

  function buildFilterHref(nextView: SupportInboxView, nextPage = 1) {
    const params = new URLSearchParams();
    params.set("view", nextView);
    if (q) params.set("q", q);
    if (priority) params.set("priority", priority);
    if (nextPage > 1) params.set("page", String(nextPage));
    return `/admin/soporte?${params.toString()}`;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<LifeBuoy className="h-5 w-5" />}
        title="Soporte y atención posventa"
        subtitle="Bandeja bidireccional con SLA legal colombiano, asignación por responsable y enlace a Contacto 360."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Servicio al cliente" },
          { label: "Soporte" },
        ]}
      />
      <AdminPageBody>
        <form
          action="/admin/soporte"
          method="get"
          className="border-brand-purple/10 flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-xs sm:flex-row sm:items-center"
        >
          <input type="hidden" name="view" value={view} />
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Buscar por correo, nombre, pedido (LCM-…), #ticket o texto…"
              className="pl-9"
            />
          </div>
          <select
            name="priority"
            defaultValue={priority ?? ""}
            aria-label="Filtrar por prioridad"
            className="border-brand-purple/20 h-10 rounded-md border bg-white px-3 text-xs font-medium"
          >
            <option value="">Todas las prioridades</option>
            <option value="URGENT">Urgente</option>
            <option value="HIGH">Alta</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Baja</option>
          </select>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" className="min-h-10">
              Buscar
            </Button>
            {(q || priority) && (
              <Link
                href={`/admin/soporte?view=${view}`}
                className="text-brand-purple hover:text-brand-purple-dark px-2 text-xs font-semibold"
              >
                Limpiar
              </Link>
            )}
          </div>
        </form>

        <nav aria-label="Vistas operativas de soporte" className="flex flex-wrap gap-2">
          {filterTabs.map((f) => {
            const active = view === f.key;
            return (
              <Link
                key={f.key}
                href={buildFilterHref(f.key)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-brand-purple-dark text-white"
                    : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 border bg-white"
                }`}
              >
                <span>{f.label}</span>
                {typeof f.count === "number" && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                      active
                        ? "bg-white/20 text-white"
                        : f.key === "sla-risk" && f.count > 0
                          ? "bg-rose-100 text-rose-800"
                          : "bg-brand-purple/10 text-brand-purple-dark"
                    }`}
                  >
                    {f.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {data.items.length === 0 ? (
          <AdminEmpty
            icon={<LifeBuoy className="h-5 w-5" />}
            title="No hay solicitudes en esta vista"
            description={
              q || priority
                ? "Prueba ajustando los términos de búsqueda o cambiando la pestaña activa."
                : "Cuando un cliente escriba desde contacto o responda un hilo abierto, aparecerá aquí."
            }
          />
        ) : (
          <ul className="space-y-3">
            {data.items.map((t) => (
              <li
                key={t.id}
                className="border-brand-purple/10 flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-xs sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/soporte/${t.id}`}
                      className="text-brand-purple-dark font-semibold hover:underline"
                    >
                      #{t.id.slice(0, 8).toUpperCase()} · {subjectLabel(t.subject)}
                    </Link>
                    <AdminBadge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</AdminBadge>
                    {t.priority !== "NORMAL" && (
                      <AdminBadge tone={PRIORITY_TONE[t.priority]}>
                        Prioridad {SUPPORT_PRIORITY_LABELS[t.priority]}
                      </AdminBadge>
                    )}
                    <AdminBadge tone={t.sla.badgeTone}>
                      <Clock className="mr-1 inline h-3 w-3" />
                      {t.sla.label}
                    </AdminBadge>
                    {t.linkedCaseId && (
                      <AdminBadge tone="blue">
                        {t.linkedCaseType === "retract" ? "Con retracto" : "Con garantía"}
                      </AdminBadge>
                    )}
                  </div>

                  <p className="text-brand-purple-dark/90 line-clamp-2 text-sm whitespace-pre-wrap">
                    {t.message}
                  </p>

                  <div className="text-brand-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    {t.contactId ? (
                      <Link
                        href={`/admin/clientes/${t.contactId}`}
                        className="text-brand-purple hover:text-brand-purple-dark font-semibold underline-offset-2 hover:underline"
                      >
                        {t.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{t.name}</span>
                    )}
                    <span>· {t.email}</span>
                    <span>·</span>
                    <Hint content={dateFmt.format(t.createdAt)}>
                      <span>{formatRelativeTime(t.createdAt)}</span>
                    </Hint>
                    {t.orderNumber && <span>· Pedido {t.orderNumber}</span>}
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <UserCheck className="h-3 w-3" />
                      {t.assignedToAdmin ? t.assignedToAdmin.email : "Sin asignar"}
                    </span>
                    {!t.firstRespondedAt && t.status !== "CLOSED" && (
                      <span className="font-semibold text-amber-700">· Sin primera respuesta</span>
                    )}
                  </div>
                </div>

                <div className="sm:w-64 sm:flex-shrink-0">
                  <TicketActions
                    id={t.id}
                    status={t.status}
                    updatedAtIso={t.updatedAt.toISOString()}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {data.totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs">
            <span className="text-brand-muted">
              Página {data.page} de {data.totalPages} ({data.total} solicitudes)
            </span>
            <div className="flex items-center gap-2">
              {data.page > 1 && (
                <Link
                  href={buildFilterHref(view, data.page - 1)}
                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center rounded-md border bg-white px-3 font-semibold"
                >
                  Anterior
                </Link>
              )}
              {data.page < data.totalPages && (
                <Link
                  href={buildFilterHref(view, data.page + 1)}
                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center rounded-md border bg-white px-3 font-semibold"
                >
                  Siguiente
                </Link>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
