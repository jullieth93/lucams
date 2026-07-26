/*
 * Admin > Reclamos de garantía — bandeja simple de WarrantyClaim.
 *
 * A diferencia de /admin/garantias (flujo largo Ley 1480: diagnóstico →
 * aprobación → remedio), esta vista es la operativa del día a día: la lista
 * muestra lo que falta por cerrar y en el detalle se resuelve de una vez
 * (remedio + nota → RESOLVED/REJECTED con resolvedAt + processedBy).
 *
 * "Pendientes" = todo reclamo sin cierre (PENDING/IN_REVIEW/APPROVED), no
 * solo PENDING: si un reclamo entró en diagnóstico desde /admin/garantias
 * también debe aparecer acá para que no quede huérfano.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Eye } from "lucide-react";
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

export const metadata: Metadata = {
  title: "Reclamos de garantía",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ status?: string }>;

// Estados sin cierre: el reclamo todavía exige gestión del negocio.
const ACTIVE_STATUSES = ["PENDING", "IN_REVIEW", "APPROVED"] as const;

const STATUS_TONE: Record<string, "amber" | "blue" | "purple" | "emerald" | "rose"> = {
  PENDING: "amber",
  IN_REVIEW: "blue",
  APPROVED: "purple",
  RESOLVED: "emerald",
  REJECTED: "rose",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  IN_REVIEW: "En diagnóstico",
  APPROVED: "Aprobado",
  RESOLVED: "Resuelto",
  REJECTED: "Rechazado",
};
const RESOLUTION_LABEL: Record<string, string> = {
  REPAIR: "Reparación",
  REPLACE: "Cambio",
  REFUND: "Devolución del dinero",
};

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function AdminReclamosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const showAll = sp.status === "all";

  const claims = await prisma.warrantyClaim.findMany({
    where: showAll ? {} : { status: { in: [...ACTIVE_STATUSES] } },
    orderBy: [{ requestedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      description: true,
      resolutionType: true,
      requestedAt: true,
      customer: { select: { email: true, firstName: true, lastName: true } },
      orderItem: {
        select: {
          qty: true,
          order: { select: { number: true } },
          variant: { select: { product: { select: { name: true } } } },
        },
      },
    },
  });

  const pendingCount = await prisma.warrantyClaim.count({
    where: { status: { in: [...ACTIVE_STATUSES] } },
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<AlertCircle className="h-5 w-5" />}
        title="Reclamos de garantía"
        subtitle={
          pendingCount === 0
            ? "No hay reclamos pendientes"
            : `${pendingCount} ${pendingCount === 1 ? "reclamo pendiente" : "reclamos pendientes"} de gestión`
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Reclamos" },
        ]}
      />

      <AdminPageBody>
        {/* Filtro Pendientes / Todos — pills de un clic, sin formulario */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: "pending", label: "Pendientes", href: "/admin/reclamos" },
            { key: "all", label: "Todos", href: "/admin/reclamos?status=all" },
          ].map((f) => {
            const active = f.key === "all" ? showAll : !showAll;
            return (
              <Link
                key={f.key}
                href={f.href}
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

        {claims.length === 0 ? (
          <AdminEmpty
            icon={<AlertCircle className="h-5 w-5" />}
            title={showAll ? "No hay reclamos todavía" : "No hay reclamos pendientes"}
            description={
              showAll
                ? "Cuando un cliente reporte un defecto de un producto, aparecerá acá."
                : "Todo está gestionado. Mira «Todos» si quieres revisar el historial."
            }
          />
        ) : (
          <AdminTable minWidth={800}>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Pedido</th>
                <th className="px-4 py-3 text-left font-semibold">Producto</th>
                <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Solicitado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {claims.map((c) => {
                const customerName =
                  [c.customer?.firstName, c.customer?.lastName].filter(Boolean).join(" ") ||
                  "Cliente";
                return (
                  <AdminTableRow key={c.id}>
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/admin/pedidos/${encodeURIComponent(c.orderItem.order.number)}`}
                        className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
                      >
                        {c.orderItem.order.number}
                      </Link>
                    </td>
                    <td className="text-brand-purple-dark px-4 py-3 align-top">
                      {c.orderItem.qty}× {c.orderItem.variant.product.name}
                      <p className="text-brand-muted mt-0.5 line-clamp-1 max-w-xs text-xs">
                        “{c.description}”
                      </p>
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 align-top text-xs">
                      {customerName}
                      {c.customer?.email && (
                        <div className="text-brand-muted">{c.customer.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center align-top">
                      <AdminBadge tone={STATUS_TONE[c.status] ?? "slate"}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </AdminBadge>
                      {c.resolutionType && (
                        <div className="text-brand-muted mt-1 text-[11px]">
                          {RESOLUTION_LABEL[c.resolutionType] ?? c.resolutionType}
                        </div>
                      )}
                    </td>
                    <td className="text-brand-muted px-4 py-3 align-top text-xs">
                      {dateFmt.format(c.requestedAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end">
                        <Link
                          href={`/admin/reclamos/${c.id}`}
                          className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1 rounded-md border bg-white px-2.5 py-1.5 text-[11px] font-semibold"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver
                        </Link>
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
