/*
 * Admin — gestión ejecutiva y contable de solicitudes de retracto (Bloque F3 / Bloque 6 · Ley 2439).
 *
 * - Operación (`retract:manage`): aprueba devoluciones, rechaza con motivo, confirma recepción física
 *   y asigna responsable con semáforo SLA de 15 días calendario.
 * - Salida final de dinero (`retract:refund`): exclusiva de `SUPERADMIN` + verificación MFA reciente.
 * - Modo contable (`FINANCE_ANALYST` · `finance:read` sin `retract:manage`): lectura de importes,
 *   estados y método de reversa con PII enmascarada en el servidor y cero controles mutantes.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  ExternalLink,
  PackageCheck,
  Search,
  Undo2,
  UserCheck,
} from "lucide-react";
import type { RetractStatus } from "@lucams/db";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  ADMIN_ROLE_SETS,
  adminHomePath,
  canAccessAdminPath,
  hasCapability,
} from "@/lib/admin-rbac";
import { formatCOP, formatRelativeTime } from "@/lib/format";
import { formatDateCO, formatDateTimeCO } from "@/lib/datetime";
import {
  isRetractInboxView,
  listRetractRequestsAdmin,
  type AdminRetractCaseRow,
  type RetractInboxView,
} from "@/features/retract/service";
import { listAssignableSupportAdmins } from "@/features/support/admin-service";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminSegmentedBar,
  OpsCard,
} from "@/components/admin-page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RetractActions } from "./retract-actions";

export const metadata: Metadata = {
  title: "Retractos",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

const STATUS_TONE: Record<RetractStatus, "amber" | "purple" | "blue" | "emerald" | "rose"> = {
  PENDING: "amber",
  APPROVED: "purple",
  RECEIVED: "blue",
  REFUNDED: "emerald",
  REJECTED: "rose",
};

const STATUS_LABEL: Record<RetractStatus, string> = {
  PENDING: "En revisión",
  APPROVED: "Aprobado · esperando paquete",
  RECEIVED: "Producto recibido",
  REFUNDED: "Reembolsado",
  REJECTED: "Rechazado",
};

function buildFilterHref(opts: { status?: string; q?: string; page?: number }) {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.q && opts.q.trim()) params.set("q", opts.q.trim());
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return qs ? `/admin/retractos?${qs}` : "/admin/retractos";
}

function RetractLifecycleStepper({ row }: { row: AdminRetractCaseRow }) {
  if (row.status === "REJECTED") {
    return (
      <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200/80 bg-rose-50/60 px-3 py-1.5 text-[11px] text-rose-800">
        <span className="font-semibold">Ciclo cerrado sin devolución</span>
        <span aria-hidden>·</span>
        <span>Solicitado el {formatDateCO(row.requestedAt)}</span>
      </div>
    );
  }

  const stepIndex =
    row.status === "PENDING"
      ? 0
      : row.status === "APPROVED"
        ? 1
        : row.status === "RECEIVED"
          ? 2
          : 3;

  const steps: Array<{ label: string; date: Date | null }> = [
    { label: "Solicitud", date: row.requestedAt },
    { label: "Aprobado", date: row.approvedAt },
    { label: "Recibido", date: row.receivedAt },
    { label: "Reembolsado", date: row.refundedAt },
  ];

  return (
    <ol
      aria-label="Progreso legal del retracto"
      className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4"
    >
      {steps.map((step, idx) => {
        const done = idx < stepIndex || row.status === "REFUNDED";
        const current = idx === stepIndex && row.status !== "REFUNDED";
        return (
          <li
            key={step.label}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
              done
                ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
                : current
                  ? "border-brand-purple/30 bg-brand-purple/8 text-brand-purple-dark ring-brand-purple/20 ring-1"
                  : "border-slate-200/80 bg-slate-50/60 text-slate-500"
            }`}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <span
                className={`inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] ${
                  done
                    ? "bg-emerald-600 text-white"
                    : current
                      ? "bg-brand-purple text-white"
                      : "bg-slate-200 text-slate-600"
                }`}
              >
                {done ? "✓" : idx + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </div>
            <p className="mt-0.5 truncate pl-5 text-[10px] tabular-nums opacity-80">
              {step.date ? formatDateCO(step.date) : "Pendiente"}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export default async function AdminRetractosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireRole(ADMIN_ROLE_SETS.RETRACTOS_READ);
  const role = session.admin.role;
  const canManage = hasCapability(role, "retract:manage");
  const canRefund = hasCapability(role, "retract:refund");
  const canReadPii = hasCapability(role, "orders:read_pii");

  const sp = await searchParams;
  const rawView = pickString(sp, "status") ?? pickString(sp, "view");
  const defaultView: RetractInboxView = canManage ? "PENDING" : "all";
  const view: RetractInboxView = isRetractInboxView(rawView) ? rawView : defaultView;
  const q = pickString(sp, "q") ?? "";
  const page = Math.max(1, Number(pickString(sp, "page")) || 1);

  const [data, assignableAdmins] = await Promise.all([
    listRetractRequestsAdmin({
      view,
      q,
      actorAdminId: session.admin.id,
      canManage,
      canReadPii,
      page,
      pageSize: 20,
    }),
    canManage ? listAssignableSupportAdmins() : Promise.resolve([]),
  ]);

  const canOpenOrders = canAccessAdminPath(role, "/admin/pedidos");
  const canOpenContacts = canAccessAdminPath(role, "/admin/clientes");
  const canOpenSupport = canAccessAdminPath(role, "/admin/soporte");
  const canOpenFinance = canAccessAdminPath(role, "/admin/finanzas");
  const canOpenWarranty = canAccessAdminPath(role, "/admin/garantias");

  const filterPills: Array<{ key: RetractInboxView; label: string; count: number }> = [
    { key: "PENDING", label: "En revisión", count: data.counts.pending },
    { key: "APPROVED", label: "Aprobados", count: data.counts.approved },
    { key: "RECEIVED", label: "Recibidos", count: data.counts.received },
    { key: "sla-risk", label: "SLA en riesgo", count: data.counts.slaRisk },
    ...(canManage ? [{ key: "mine" as const, label: "Mis casos", count: data.counts.mine }] : []),
    { key: "REFUNDED", label: "Reembolsados", count: data.counts.refunded },
    { key: "REJECTED", label: "Rechazados", count: data.counts.rejected },
    { key: "all", label: "Todos", count: data.counts.all },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Undo2 className="h-5 w-5" />}
        title="Retractos"
        subtitle="Derecho de retracto (Ley 1480 art. 47 y Ley 2439): 5 días hábiles desde entrega, reembolso en máx. 15 días calendario."
        breadcrumbs={[{ label: "Admin", href: adminHomePath(role) }, { label: "Retractos" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canOpenWarranty && (
              <AdminButton href="/admin/garantias" variant="secondary" size="sm">
                Garantías
              </AdminButton>
            )}
            {canOpenFinance && (
              <AdminButton href="/admin/finanzas" variant="secondary" size="sm">
                Conciliar en Finanzas
              </AdminButton>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {!canManage && (
          <AdminNotice tone="info">
            <strong>Vista contable de solo lectura:</strong> consultas montos en centavos COP,
            estados legales y canales de reversa para conciliación financiera. Los datos personales
            y motivos de texto libre permanecen protegidos en el servidor.
          </AdminNotice>
        )}

        {/* KPIs ejecutivos */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OpsCard
            href={buildFilterHref({ status: "PENDING" })}
            label="En revisión inicial"
            value={data.counts.pending}
            icon={Clock}
            tone="amber"
            urgent={data.counts.pending > 0}
            description={`${formatCOP(data.financials.pendingReviewCashCents)} solicitados`}
          />
          <OpsCard
            href={buildFilterHref({ status: "RECEIVED" })}
            label="Listos para reembolsar"
            value={data.counts.received}
            icon={PackageCheck}
            tone="coral"
            urgent={data.counts.received > 0}
            description={`${formatCOP(data.financials.readyToRefundCashCents)} con producto en bodega`}
          />
          <OpsCard
            href={buildFilterHref({ status: "sla-risk" })}
            label="SLA legal en riesgo"
            value={data.counts.slaRisk}
            icon={AlertTriangle}
            tone="pink"
            urgent={data.counts.slaRisk > 0}
            description="Vencidos o a ≤ 48 h del límite legal"
          />
          <OpsCard
            href={buildFilterHref({ status: "REFUNDED" })}
            label="Efectivo reembolsado"
            value={formatCOP(data.financials.refundedCashCents)}
            icon={Banknote}
            tone="turquoise"
            description={`${data.counts.refunded.toLocaleString("es-CO")} cerrados · Pasivo abierto ${formatCOP(data.financials.openLiabilityCashCents)}`}
          />
        </div>

        {/* Embudo legal segmentado */}
        <AdminCard className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-brand-purple-dark font-display text-base font-semibold">
                Pipeline del ciclo legal de retracto
              </h2>
              <p className="text-brand-muted text-xs">
                Haz clic en cualquier etapa para filtrar la bandeja. Los ítems personalizados están
                exceptuados por ley.
              </p>
            </div>
            <span className="text-brand-muted text-xs tabular-nums">
              {data.counts.openTotal.toLocaleString("es-CO")} abiertos de{" "}
              {data.counts.all.toLocaleString("es-CO")} históricos
            </span>
          </div>
          <AdminSegmentedBar
            ariaLabel="Distribución de solicitudes de retracto por etapa legal"
            items={[
              {
                key: "PENDING",
                label: "En revisión",
                count: data.counts.pending,
                tone: "amber",
                href: buildFilterHref({ status: "PENDING" }),
                sublabel: formatCOP(data.financials.pendingReviewCashCents),
              },
              {
                key: "APPROVED",
                label: "Aprobados (en tránsito)",
                count: data.counts.approved,
                tone: "purple",
                href: buildFilterHref({ status: "APPROVED" }),
                sublabel: formatCOP(data.financials.approvedTransitCashCents),
              },
              {
                key: "RECEIVED",
                label: "Recibidos por reembolsar",
                count: data.counts.received,
                tone: "blue",
                href: buildFilterHref({ status: "RECEIVED" }),
                sublabel: formatCOP(data.financials.readyToRefundCashCents),
              },
              {
                key: "REFUNDED",
                label: "Reembolsados",
                count: data.counts.refunded,
                tone: "emerald",
                href: buildFilterHref({ status: "REFUNDED" }),
                sublabel: formatCOP(data.financials.refundedCashCents),
              },
              {
                key: "REJECTED",
                label: "Rechazados",
                count: data.counts.rejected,
                tone: "rose",
                href: buildFilterHref({ status: "REJECTED" }),
              },
            ]}
          />
        </AdminCard>

        {/* Buscador y filtros */}
        <AdminCard className="p-4">
          <form
            method="GET"
            action="/admin/retractos"
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input type="hidden" name="status" value={view} />
            <div className="relative flex-1">
              <Search
                aria-hidden
                className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              />
              <Input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={
                  canManage && canReadPii
                    ? "Buscar por pedido (LCM-…), ID de caso, producto, correo o motivo…"
                    : "Buscar por número de pedido (LCM-…), ID de caso o producto…"
                }
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm">
                Buscar
              </Button>
              {q.trim().length > 0 && (
                <AdminButton href={buildFilterHref({ status: view })} variant="ghost" size="sm">
                  Limpiar
                </AdminButton>
              )}
            </div>
          </form>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {filterPills.map((f) => {
              const active = view === f.key;
              return (
                <Link
                  key={f.key}
                  href={buildFilterHref({ status: f.key, q })}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-brand-purple-dark text-white shadow-xs"
                      : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 border bg-white"
                  }`}
                >
                  <span>{f.label}</span>
                  <span
                    className={`py-0.2 rounded-full px-1.5 text-[10px] tabular-nums ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-brand-purple/10 text-brand-purple-dark"
                    }`}
                  >
                    {f.count}
                  </span>
                </Link>
              );
            })}
          </div>
        </AdminCard>

        {/* Listado de casos */}
        {data.items.length === 0 ? (
          <AdminEmpty
            icon={<Undo2 className="h-5 w-5" />}
            title="No encontramos solicitudes con este filtro"
            description={
              q.trim()
                ? "Prueba limpiando la búsqueda o cambiando a la pestaña «Todos»."
                : "Cuando un cliente solicite devolver un producto estándar dentro de los 5 días hábiles posteriores a la entrega, aparecerá acá."
            }
            action={
              view !== "all" || q.trim() ? (
                <AdminButton href="/admin/retractos?status=all" variant="secondary" size="sm">
                  Ver todos los retractos
                </AdminButton>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-3">
            {data.items.map((r) => (
              <li
                key={r.id}
                className="card-hover border-brand-purple/10 flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0 flex-1">
                  {/* Cabecera del caso */}
                  <div className="flex flex-wrap items-center gap-2">
                    {canOpenOrders ? (
                      <Link
                        href={`/admin/pedidos/${encodeURIComponent(r.orderNumber)}`}
                        className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
                      >
                        {r.orderNumber}
                      </Link>
                    ) : (
                      <span className="text-brand-purple-dark font-semibold">{r.orderNumber}</span>
                    )}
                    <AdminBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</AdminBadge>
                    <span
                      title={
                        r.slaDueAt ? `Límite legal: ${formatDateTimeCO(r.slaDueAt)}` : undefined
                      }
                    >
                      <AdminBadge tone={r.sla.badgeTone}>{r.sla.label}</AdminBadge>
                    </span>
                    <code className="bg-brand-purple/5 text-brand-purple-dark rounded px-1.5 py-0.5 font-mono text-[11px]">
                      #{r.id.slice(-8)}
                    </code>
                    {r.assignedToAdmin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                        <UserCheck className="h-3 w-3 text-emerald-600" aria-hidden />
                        {r.assignedToAdmin.email}
                      </span>
                    ) : (
                      r.status !== "REFUNDED" &&
                      r.status !== "REJECTED" && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          Sin responsable
                        </span>
                      )
                    )}
                  </div>

                  {/* Línea económica */}
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-brand-purple-dark text-sm font-medium">
                      {r.qty}× {r.productName}
                    </p>
                    <span className="text-slate-300" aria-hidden>
                      ·
                    </span>
                    <p className="text-brand-purple-dark text-sm font-bold tabular-nums">
                      {formatCOP(r.refundAmount)}{" "}
                      <span className="text-brand-muted text-xs font-normal">
                        efectivo a devolver
                      </span>
                    </p>
                    {r.discountShareCents > 0 && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 tabular-nums">
                        Línea {formatCOP(r.lineTotal)} − {formatCOP(r.discountShareCents)} dto.
                        prorrateado
                      </span>
                    )}
                    {r.orderPaymentMethod && (
                      <span className="text-brand-muted text-xs">
                        Pago original:{" "}
                        {r.orderPaymentMethod === "COD"
                          ? "Contraentrega"
                          : r.orderPaymentMethod === "DIRECT_TRANSFER"
                            ? "Bre-B / Transferencia"
                            : "Wompi"}
                      </span>
                    )}
                  </div>

                  {r.pointsToRestore > 0 && r.status !== "REJECTED" && (
                    <p className="text-brand-purple-dark bg-brand-purple/8 mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
                      {r.status === "REFUNDED"
                        ? `${r.pointsToRestore.toLocaleString("es-CO")} Puntos Lucams restaurados al cliente`
                        : `+${r.pointsToRestore.toLocaleString("es-CO")} Puntos Lucams se restauran al reembolsar`}
                    </p>
                  )}

                  {/* Metadatos del cliente + conexiones 360° */}
                  <div className="text-brand-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span>
                      {r.customerName ? `${r.customerName} (${r.customerEmail})` : r.customerEmail}
                    </span>
                    <span aria-hidden>·</span>
                    <span title={formatDateTimeCO(r.requestedAt)}>
                      Solicitado {formatRelativeTime(r.requestedAt)}
                    </span>
                    {r.contactId && canOpenContacts && (
                      <>
                        <span aria-hidden>·</span>
                        <Link
                          href={`/admin/clientes/${r.contactId}`}
                          className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 font-medium underline"
                        >
                          Contacto 360
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </Link>
                      </>
                    )}
                    {r.sourceTicketId && canOpenSupport && (
                      <>
                        <span aria-hidden>·</span>
                        <Link
                          href={`/admin/soporte/${r.sourceTicketId}`}
                          className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 font-medium underline"
                        >
                          Ticket origen
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </Link>
                      </>
                    )}
                    {r.status === "REFUNDED" && canOpenFinance && (
                      <>
                        <span aria-hidden>·</span>
                        <Link
                          href="/admin/finanzas"
                          className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 font-medium underline"
                        >
                          Ver en Finanzas
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </Link>
                      </>
                    )}
                  </div>

                  {r.reason && (
                    <p className="border-brand-purple/15 bg-brand-purple/[0.03] text-brand-purple-dark mt-2 rounded-lg border px-3 py-2 text-xs">
                      <span className="font-semibold">Motivo del cliente:</span> “{r.reason}”
                    </p>
                  )}
                  {r.rejectionNote && (
                    <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-800">
                      <span className="font-semibold">Motivo de rechazo:</span> {r.rejectionNote}
                    </p>
                  )}
                  {r.refundMethod && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                      Reembolsado vía{" "}
                      {r.refundMethod === "BANK_TRANSFER"
                        ? "transferencia bancaria"
                        : "reversa Wompi"}
                      {r.refundedAt ? ` (${formatDateCO(r.refundedAt)})` : ""}
                    </p>
                  )}

                  {/* Stepper de ciclo legal */}
                  <RetractLifecycleStepper row={r} />
                </div>

                {/* Columna de acciones operativas (oculta en modo contable de solo lectura) */}
                {canManage ? (
                  <div className="border-brand-purple/10 border-t pt-3 lg:w-72 lg:flex-shrink-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
                    <RetractActions
                      id={r.id}
                      status={r.status}
                      canRefund={canRefund}
                      assignedToAdminId={r.assignedToAdmin?.id ?? null}
                      currentAdminId={session.admin.id}
                      assignableAdmins={assignableAdmins}
                    />
                  </div>
                ) : (
                  <div className="flex items-center lg:w-48 lg:flex-shrink-0 lg:justify-end">
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
                      Solo lectura contable
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Paginación */}
        {data.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-600">
            <span className="tabular-nums">
              Página {data.page} de {data.totalPages} ({data.total.toLocaleString("es-CO")}{" "}
              solicitudes)
            </span>
            <div className="flex items-center gap-2">
              {data.page > 1 && (
                <AdminButton
                  href={buildFilterHref({ status: view, q, page: data.page - 1 })}
                  variant="secondary"
                  size="sm"
                >
                  ← Anterior
                </AdminButton>
              )}
              {data.page < data.totalPages && (
                <AdminButton
                  href={buildFilterHref({ status: view, q, page: data.page + 1 })}
                  variant="secondary"
                  size="sm"
                >
                  Siguiente →
                </AdminButton>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
