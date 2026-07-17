/*
 * Admin — gestión de reclamos de garantía (Ley 1480 art. 7-15).
 * Lista por estado + flujo diagnóstico→remedio (reparar/cambiar/devolver) o rechazo. Con audit.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  listWarrantyClaims,
  type WarrantyStatus,
  type WarrantyResolution,
} from "@/features/warranty/service";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminBadge } from "@/components/admin-page";
import { WarrantyActions } from "./warranty-actions";

export const metadata: Metadata = { title: "Garantías" };

type SearchParams = Promise<{ status?: string }>;

const STATUS_TONE: Record<WarrantyStatus, "amber" | "blue" | "purple" | "emerald" | "rose"> = {
  PENDING: "amber",
  IN_REVIEW: "blue",
  APPROVED: "purple",
  RESOLVED: "emerald",
  REJECTED: "rose",
};
const STATUS_LABEL: Record<WarrantyStatus, string> = {
  PENDING: "Nuevo",
  IN_REVIEW: "En diagnóstico",
  APPROVED: "Aprobado",
  RESOLVED: "Resuelto",
  REJECTED: "Rechazado",
};
const RESOLUTION_LABEL: Record<WarrantyResolution, string> = {
  REPAIR: "Reparación",
  REPLACE: "Cambio",
  REFUND: "Devolución del dinero",
};
const FILTERS: Array<{ key: string; label: string }> = [
  { key: "PENDING", label: "Nuevos" },
  { key: "IN_REVIEW", label: "En diagnóstico" },
  { key: "APPROVED", label: "Aprobados" },
  { key: "RESOLVED", label: "Resueltos" },
  { key: "REJECTED", label: "Rechazados" },
  { key: "all", label: "Todos" },
];

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function AdminGarantiasPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(["SUPERADMIN", "MANAGER"]);
  const sp = await searchParams;
  const statusRaw = sp.status;
  const validStatus = (["PENDING", "IN_REVIEW", "APPROVED", "RESOLVED", "REJECTED"] as const).find(
    (s) => s === statusRaw,
  );
  const filter = statusRaw === "all" ? undefined : (validStatus ?? "PENDING");
  const rows = await listWarrantyClaims(filter ? { status: filter } : {});

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Garantías"
        subtitle="Reclamos de garantía legal (Ley 1480). Diagnostica y aplica el remedio: reparar, cambiar o devolver."
      />
      <AdminPageBody>
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active =
              f.key === "all"
                ? statusRaw === "all"
                : (validStatus ?? "PENDING") === f.key && statusRaw !== "all";
            return (
              <Link
                key={f.key}
                href={`/admin/garantias?status=${f.key}`}
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
          <p className="text-brand-muted border-brand-purple/10 rounded-xl border bg-white p-8 text-center text-sm">
            No hay reclamos en este estado. 🦝
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((c) => (
              <li
                key={c.id}
                className="border-brand-purple/10 flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/pedidos/${encodeURIComponent(c.orderNumber)}`}
                      className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
                    >
                      {c.orderNumber}
                    </Link>
                    <AdminBadge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</AdminBadge>
                    {c.resolutionType && (
                      <span className="text-brand-muted text-xs">
                        → {RESOLUTION_LABEL[c.resolutionType]}
                      </span>
                    )}
                  </div>
                  <p className="text-brand-purple-dark mt-1 text-sm">
                    {c.qty}× {c.productName}
                  </p>
                  <p className="text-brand-purple-dark/90 mt-1 text-sm whitespace-pre-wrap">
                    “{c.description}”
                  </p>
                  {c.evidenceUrls.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {c.evidenceUrls.map((u, i) => (
                        <a
                          key={i}
                          href={u}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-pink-ink text-xs underline"
                        >
                          Foto {i + 1}
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="text-brand-muted mt-1 text-xs">
                    {c.customerName} · {c.customerEmail} · {dateFmt.format(c.requestedAt)}
                  </p>
                  {c.resolutionNote && (
                    <p className="text-brand-purple-dark/80 mt-1 text-xs italic">
                      Nota: {c.resolutionNote}
                    </p>
                  )}
                </div>
                <div className="sm:w-60 sm:flex-shrink-0">
                  <WarrantyActions id={c.id} status={c.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
