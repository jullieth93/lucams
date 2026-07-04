/*
 * Admin — gestión de solicitudes de retracto (Bloque F3, Ley 2439).
 * Lista por estado + acciones (aprobar/rechazar/recibir/reembolsar). Dinero manual.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Undo2 } from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatCOP } from "@/lib/format";
import { listRetractRequests } from "@/features/retract/service";
import type { RetractStatus } from "@lucams/db";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminBadge } from "@/components/admin-page";
import { RetractActions } from "./retract-actions";

export const metadata: Metadata = { title: "Retractos" };

type SearchParams = Promise<{ status?: string }>;

const STATUS_TONE: Record<RetractStatus, "amber" | "purple" | "blue" | "emerald" | "rose"> = {
  PENDING: "amber",
  APPROVED: "purple",
  RECEIVED: "blue",
  REFUNDED: "emerald",
  REJECTED: "rose",
};
const STATUS_LABEL: Record<RetractStatus, string> = {
  PENDING: "En revisión",
  APPROVED: "Aprobado",
  RECEIVED: "Recibido",
  REFUNDED: "Reembolsado",
  REJECTED: "Rechazado",
};
const FILTERS: Array<{ key: string; label: string }> = [
  { key: "PENDING", label: "En revisión" },
  { key: "APPROVED", label: "Aprobados" },
  { key: "RECEIVED", label: "Recibidos" },
  { key: "REFUNDED", label: "Reembolsados" },
  { key: "REJECTED", label: "Rechazados" },
  { key: "all", label: "Todos" },
];

const dateFmt = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" });

export default async function AdminRetractosPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(["SUPERADMIN"]);
  const sp = await searchParams;
  const statusRaw = sp.status;
  const validStatus = (["PENDING", "APPROVED", "RECEIVED", "REFUNDED", "REJECTED"] as const).find(
    (s) => s === statusRaw,
  );
  // Default: pendientes (lo que requiere acción).
  const filter = statusRaw === "all" ? undefined : (validStatus ?? "PENDING");
  const rows = await listRetractRequests(filter ? { status: filter } : {});

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Undo2 className="h-5 w-5" />}
        title="Retractos"
        subtitle="Solicitudes de devolución (Ley 1480/2439). El dinero se emite manualmente."
      />
      <AdminPageBody>
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = (f.key === "all" ? statusRaw === "all" : (validStatus ?? "PENDING") === f.key && statusRaw !== "all");
            return (
              <Link
                key={f.key}
                href={`/admin/retractos?status=${f.key}`}
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
          <p className="text-brand-muted rounded-xl border border-brand-purple/10 bg-white p-8 text-center text-sm">
            No hay solicitudes en este estado. 🦝
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="border-brand-purple/10 flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/pedidos/${encodeURIComponent(r.orderNumber)}`}
                      className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
                    >
                      {r.orderNumber}
                    </Link>
                    <AdminBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</AdminBadge>
                  </div>
                  <p className="text-brand-purple-dark mt-1 text-sm">
                    {r.qty}× {r.productName} · <span className="font-semibold">{formatCOP(r.refundAmount)}</span>
                  </p>
                  <p className="text-brand-muted text-xs">
                    {r.customerEmail} · solicitado {dateFmt.format(r.requestedAt)}
                  </p>
                  {r.reason && (
                    <p className="text-brand-purple-dark/80 mt-1 text-xs italic">“{r.reason}”</p>
                  )}
                  {r.rejectionNote && (
                    <p className="mt-1 text-xs text-rose-700">Rechazo: {r.rejectionNote}</p>
                  )}
                  {r.refundMethod && (
                    <p className="mt-1 text-xs text-emerald-700">
                      Reembolsado vía {r.refundMethod === "BANK_TRANSFER" ? "transferencia" : "Wompi"}
                    </p>
                  )}
                </div>
                <div className="sm:w-64 sm:flex-shrink-0">
                  <RetractActions id={r.id} status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
