/*
 * Admin — gestión de tickets de soporte (P2 backoffice).
 * Lista por estado + cambio de estado + responder por email. Antes los tickets solo llegaban al
 * correo de Lucy sin panel; ahora se gestionan acá (con audit trail).
 */

import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import { listSupportTickets, type SupportTicketStatus } from "@/features/support/admin-service";
import { SUBJECT_LABELS } from "@/features/support/schemas";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminBadge,
  AdminEmpty,
} from "@/components/admin-page";
import Link from "next/link";
import { TicketActions } from "./ticket-actions";

export const metadata: Metadata = { title: "Soporte" };

type SearchParams = Promise<{ status?: string }>;

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
const FILTERS: Array<{ key: string; label: string }> = [
  { key: "OPEN", label: "Nuevos" },
  { key: "IN_PROGRESS", label: "En progreso" },
  { key: "CLOSED", label: "Cerrados" },
  { key: "all", label: "Todos" },
];

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
  await requireRole(["SUPERADMIN", "MANAGER"]);
  const sp = await searchParams;
  const statusRaw = sp.status;
  const validStatus = (["OPEN", "IN_PROGRESS", "CLOSED"] as const).find((s) => s === statusRaw);
  // Default: nuevos (lo que requiere acción).
  const filter = statusRaw === "all" ? undefined : (validStatus ?? "OPEN");
  const rows = await listSupportTickets(filter ? { status: filter } : {});

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<LifeBuoy className="h-5 w-5" />}
        title="Soporte"
        subtitle="Mensajes de contacto y reclamos de clientes. Responde por email y marca su estado."
      />
      <AdminPageBody>
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active =
              f.key === "all"
                ? statusRaw === "all"
                : (validStatus ?? "OPEN") === f.key && statusRaw !== "all";
            return (
              <Link
                key={f.key}
                href={`/admin/soporte?status=${f.key}`}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-brand-purple-dark text-white"
                    : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 border"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <AdminEmpty
            icon={<LifeBuoy className="h-5 w-5" />}
            title="No hay tickets en este estado"
            description="Cuando un cliente escriba desde el formulario de contacto, su mensaje aparecerá acá."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((t) => (
              <li
                key={t.id}
                className="border-brand-purple/10 flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-brand-purple-dark font-semibold">
                      {subjectLabel(t.subject)}
                    </span>
                    <AdminBadge tone={STATUS_TONE[t.status as SupportTicketStatus]}>
                      {STATUS_LABEL[t.status as SupportTicketStatus] ?? t.status}
                    </AdminBadge>
                  </div>
                  <p className="text-brand-purple-dark/90 mt-1 text-sm whitespace-pre-wrap">
                    {t.message}
                  </p>
                  <p className="text-brand-muted mt-1 text-xs">
                    {t.name} · {t.email} · {dateFmt.format(t.createdAt)}
                    {t.resolvedAt ? ` · cerrado ${dateFmt.format(t.resolvedAt)}` : ""}
                  </p>
                </div>
                <div className="sm:w-56 sm:flex-shrink-0">
                  <TicketActions
                    id={t.id}
                    status={t.status}
                    email={t.email}
                    subjectLabel={subjectLabel(t.subject)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
