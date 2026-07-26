/*
 * Admin > Mensajes de clientes — bandeja de entrada de los mensajes que llegan
 * desde el formulario público de /contacto (modelo SupportTicket).
 *
 * A diferencia de /admin/soporte (vista operativa por tarjetas), esta es la
 * vista "inbox": tabla compacta pensada para triaje rápido — ver de un vistazo
 * qué está abierto, leer el mensaje completo desplegando la fila y cambiar el
 * estado sin salir de la bandeja. Ambas rutas operan sobre el mismo servicio
 * compartido (features/support/admin-service), así que un cambio de estado acá
 * se refleja allá y viceversa.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import {
  AdminBadge,
  AdminEmpty,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listSupportTickets, type SupportTicketStatus } from "@/features/support/admin-service";
import { SUBJECT_LABELS } from "@/features/support/schemas";
import { MessageActions } from "./message-actions";

export const metadata: Metadata = {
  title: "Mensajes de clientes",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ status?: string }>;

const STATUS_TONE: Record<SupportTicketStatus, "amber" | "blue" | "emerald"> = {
  OPEN: "amber",
  IN_PROGRESS: "blue",
  CLOSED: "emerald",
};
const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En proceso",
  CLOSED: "Cerrado",
};
const FILTERS: Array<{ key: string; label: string }> = [
  { key: "OPEN", label: "Abiertos" },
  { key: "IN_PROGRESS", label: "En proceso" },
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

/** Preview corto para la fila; el mensaje completo va en el <details> desplegable. */
function preview(message: string): string {
  return message.length > 90 ? `${message.slice(0, 90)}…` : message;
}

export default async function AdminMensajesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const statusRaw = sp.status;
  const validStatus = (["OPEN", "IN_PROGRESS", "CLOSED"] as const).find((s) => s === statusRaw);
  // Default: abiertos — es lo que requiere acción inmediata de Lucy.
  const filter = statusRaw === "all" ? undefined : (validStatus ?? "OPEN");
  const rows = await listSupportTickets(filter ? { status: filter } : {});

  // El select del servicio compartido no incluye ip/userAgent (y el servicio no es
  // editable desde este módulo); se traen aparte en una sola query por PK para
  // mostrarlos en el detalle desplegable de cada fila.
  const metaById = new Map<string, { ip: string | null; userAgent: string | null }>();
  if (rows.length > 0) {
    const meta = await prisma.supportTicket.findMany({
      where: { id: { in: rows.map((t) => t.id) } },
      select: { id: true, ip: true, userAgent: true },
    });
    for (const m of meta) metaById.set(m.id, { ip: m.ip, userAgent: m.userAgent });
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<MessageSquare className="h-5 w-5" />}
        title="Mensajes de clientes"
        subtitle="Bandeja de los mensajes que llegan desde el formulario de contacto. Léelos, respóndelos por correo y marca su estado."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Mensajes de clientes" },
        ]}
      />

      <AdminPageBody>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active =
              f.key === "all"
                ? statusRaw === "all"
                : (validStatus ?? "OPEN") === f.key && statusRaw !== "all";
            return (
              <Link
                key={f.key}
                href={`/admin/mensajes?status=${f.key}`}
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
            icon={<MessageSquare className="h-5 w-5" />}
            title="No hay mensajes en este estado"
            description="Cuando un cliente escriba desde el formulario de contacto, su mensaje aparecerá acá como Abierto."
          />
        ) : (
          <AdminTable minWidth={800}>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Recibido</th>
                <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                <th className="px-4 py-3 text-left font-semibold">Asunto</th>
                <th className="px-4 py-3 text-left font-semibold">Mensaje</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((t) => {
                const status = t.status as SupportTicketStatus;
                const meta = metaById.get(t.id);
                return (
                  <AdminTableRow key={t.id}>
                    <td className="text-brand-muted px-4 py-3 align-top text-xs whitespace-nowrap">
                      {dateFmt.format(t.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-brand-purple-dark text-sm font-semibold">{t.name}</p>
                      <p className="text-brand-muted text-xs">{t.email}</p>
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 align-top text-sm">
                      {subjectLabel(t.subject)}
                    </td>
                    <td className="max-w-md px-4 py-3 align-top">
                      {/* <details> nativo: el detalle completo no necesita JS de cliente. */}
                      <details>
                        <summary className="text-brand-purple-dark/90 cursor-pointer text-sm">
                          {preview(t.message)}{" "}
                          <span className="text-brand-purple text-xs font-semibold">
                            Ver completo
                          </span>
                        </summary>
                        <div className="mt-2">
                          <p className="text-brand-purple-dark/90 text-sm whitespace-pre-wrap">
                            {t.message}
                          </p>
                          <p className="text-brand-muted mt-2 text-xs">
                            {t.resolvedAt
                              ? `Cerrado el ${dateFmt.format(t.resolvedAt)}`
                              : "Sin cerrar todavía"}
                            {meta?.ip ? ` · IP: ${meta.ip}` : ""}
                          </p>
                          {meta?.userAgent && (
                            <p className="text-brand-muted mt-0.5 text-[11px] break-all">
                              Dispositivo: {meta.userAgent}
                            </p>
                          )}
                        </div>
                      </details>
                    </td>
                    <td className="px-4 py-3 text-center align-top">
                      <AdminBadge tone={STATUS_TONE[status] ?? "slate"}>
                        {STATUS_LABEL[status] ?? t.status}
                      </AdminBadge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end">
                        <MessageActions
                          id={t.id}
                          status={t.status}
                          email={t.email}
                          subjectLabel={subjectLabel(t.subject)}
                        />
                      </div>
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
