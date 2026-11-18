/*
 * Admin — gestión ejecutiva y contable de reclamos de garantía (Ley 1480 art. 7-15 y art. 58 · Bloque 6).
 *
 * - Operación (`warranty:manage`): diagnostica, aprueba remedios (`REPAIR` / `REPLACE`), rechaza con motivo
 *   y asigna responsable con semáforo SLA de 15 días hábiles colombianos.
 * - Salida final de dinero (`warranty:refund`): remedio `REFUND` exclusivo de `SUPERADMIN` + MFA reciente.
 * - Modo contable (`FINANCE_ANALYST` · `finance:read` sin `warranty:manage`): lectura de exposición económica,
 *   estados y remedios con PII, textos libres y fotos protegidos en el servidor.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Camera,
  Clock,
  ExternalLink,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Wrench,
} from "lucide-react";
import {
  ADMIN_ROLE_SETS,
  adminHomePath,
  canAccessAdminPath,
  hasCapability,
} from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatCOP, formatRelativeTime } from "@/lib/format";
import { formatDateCO, formatDateTimeCO } from "@/lib/datetime";
import {
  isWarrantyInboxView,
  isWarrantyResolution,
  listWarrantyClaimsAdmin,
  type AdminWarrantyCaseRow,
  type WarrantyInboxView,
  type WarrantyResolution,
  type WarrantyStatus,
} from "@/features/warranty/service";
import { listAssignableSupportAdmins } from "@/features/support/admin-service";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminDonutChart,
  AdminEmpty,
  AdminNotice,
  AdminSegmentedBar,
  OpsCard,
} from "@/components/admin-page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WarrantyActions } from "./warranty-actions";

export const metadata: Metadata = {
  title: "Garantías",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

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
  APPROVED: "Remedio aprobado",
  RESOLVED: "Resuelto",
  REJECTED: "Rechazado",
};

const RESOLUTION_LABEL: Record<WarrantyResolution, string> = {
  REPAIR: "Reparación",
  REPLACE: "Cambio de unidad",
  REFUND: "Devolución del dinero",
};

const RESOLUTION_TONE: Record<WarrantyResolution, "turquoise" | "purple" | "coral"> = {
  REPAIR: "turquoise",
  REPLACE: "purple",
  REFUND: "coral",
};

function buildFilterHref(opts: {
  status?: string;
  resolution?: string;
  q?: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.resolution) params.set("resolution", opts.resolution);
  if (opts.q && opts.q.trim()) params.set("q", opts.q.trim());
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return qs ? `/admin/garantias?${qs}` : "/admin/garantias";
}

function WarrantyLifecycleStepper({ row }: { row: AdminWarrantyCaseRow }) {
  if (row.status === "REJECTED") {
    return (
      <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200/80 bg-rose-50/60 px-3 py-1.5 text-[11px] text-rose-800">
        <span className="font-semibold">Reclamo cerrado como no procedente</span>
        {row.resolvedAt && (
          <>
            <span aria-hidden>·</span>
            <span>Cerrado el {formatDateCO(row.resolvedAt)}</span>
          </>
        )}
      </div>
    );
  }

  const stepIndex =
    row.status === "PENDING"
      ? 0
      : row.status === "IN_REVIEW"
        ? 1
        : row.status === "APPROVED"
          ? 2
          : 3;

  const steps: Array<{ label: string; detail: string }> = [
    { label: "Solicitud", detail: formatDateCO(row.requestedAt) },
    {
      label: "Diagnóstico",
      detail: stepIndex >= 1 ? "Evaluado" : "Pendiente",
    },
    {
      label: "Remedio Ley 1480",
      detail: row.resolutionType ? RESOLUTION_LABEL[row.resolutionType] : "Por definir",
    },
    {
      label: "Resuelto",
      detail: row.resolvedAt ? formatDateCO(row.resolvedAt) : "Pendiente",
    },
  ];

  return (
    <ol
      aria-label="Progreso legal de la garantía"
      className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4"
    >
      {steps.map((step, idx) => {
        const done = idx < stepIndex || row.status === "RESOLVED";
        const current = idx === stepIndex && row.status !== "RESOLVED";
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
              {step.detail}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export default async function AdminGarantiasPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireRole(ADMIN_ROLE_SETS.GARANTIAS_READ);
  const role = session.admin.role;
  const canManage = hasCapability(role, "warranty:manage");
  const canRefund = hasCapability(role, "warranty:refund");
  const canReadPii = hasCapability(role, "orders:read_pii");

  const sp = await searchParams;
  const rawView = pickString(sp, "status") ?? pickString(sp, "view");
  const defaultView: WarrantyInboxView = canManage ? "PENDING" : "all";
  const view: WarrantyInboxView = isWarrantyInboxView(rawView) ? rawView : defaultView;
  const rawRes = pickString(sp, "resolution");
  const resolution = isWarrantyResolution(rawRes) ? rawRes : undefined;
  const q = pickString(sp, "q") ?? "";
  const page = Math.max(1, Number(pickString(sp, "page")) || 1);

  const [data, assignableAdmins] = await Promise.all([
    listWarrantyClaimsAdmin({
      view,
      resolution,
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
  const canOpenRetract = canAccessAdminPath(role, "/admin/retractos");

  const totalRemediesAssigned =
    data.byResolution.REPAIR + data.byResolution.REPLACE + data.byResolution.REFUND;
  const totalRefundCases =
    data.refundExposure.approvedRefundCount + data.refundExposure.resolvedRefundCount;

  const filterPills: Array<{ key: WarrantyInboxView; label: string; count: number }> = [
    { key: "PENDING", label: "Nuevos", count: data.counts.pending },
    { key: "IN_REVIEW", label: "En diagnóstico", count: data.counts.inReview },
    { key: "APPROVED", label: "Aprobados", count: data.counts.approved },
    { key: "sla-risk", label: "SLA en riesgo", count: data.counts.slaRisk },
    ...(canManage ? [{ key: "mine" as const, label: "Mis casos", count: data.counts.mine }] : []),
    { key: "RESOLVED", label: "Resueltos", count: data.counts.resolved },
    { key: "REJECTED", label: "Rechazados", count: data.counts.rejected },
    { key: "all", label: "Todos", count: data.counts.all },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<BadgeCheck className="h-5 w-5" />}
        title="Garantías"
        subtitle="Garantía legal (Ley 1480 art. 7-15 y art. 58): ventana sellada en compra, respuesta máxima en 15 días hábiles."
        breadcrumbs={[{ label: "Admin", href: adminHomePath(role) }, { label: "Garantías" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canOpenRetract && (
              <AdminButton href="/admin/retractos" variant="secondary" size="sm">
                Retractos
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
            <strong>Vista contable de solo lectura:</strong> consultas estados, remedios Ley 1480 e
            importes de líneas con devolución de dinero. Los datos personales, relatos de falla y
            fotos del cliente permanecen protegidos en el servidor.
          </AdminNotice>
        )}

        {/* KPIs ejecutivos */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OpsCard
            href={buildFilterHref({ status: "PENDING" })}
            label="Nuevos por revisar"
            value={data.counts.pending}
            icon={Clock}
            tone="amber"
            urgent={data.counts.pending > 0}
            description={`${data.counts.inReview.toLocaleString("es-CO")} en diagnóstico técnico`}
          />
          <OpsCard
            href={buildFilterHref({ status: "APPROVED" })}
            label="Remedios en ejecución"
            value={data.counts.approved}
            icon={Wrench}
            tone="purple"
            urgent={data.counts.approved > 0}
            description="Aprobados pendientes de cerrar"
          />
          <OpsCard
            href={buildFilterHref({ status: "sla-risk" })}
            label="SLA legal en riesgo"
            value={data.counts.slaRisk}
            icon={AlertTriangle}
            tone="pink"
            urgent={data.counts.slaRisk > 0}
            description="Vencidos o a ≤ 48 h (15 días hábiles CO)"
          />
          <OpsCard
            href={buildFilterHref({ status: "all", resolution: "REFUND" })}
            label="Devoluciones de dinero"
            value={totalRefundCases}
            icon={Banknote}
            tone="turquoise"
            description={`Resueltas ${formatCOP(data.refundExposure.resolvedRefundCents)} · En curso ${formatCOP(data.refundExposure.approvedRefundCents)}`}
          />
        </div>

        {/* Analítica visual: Pipeline legal + Distribución de remedios Ley 1480 */}
        <div className="grid gap-4 lg:grid-cols-12">
          <AdminCard className="p-5 lg:col-span-7">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-brand-purple-dark font-display text-base font-semibold">
                  Pipeline de reclamos de garantía
                </h2>
                <p className="text-brand-muted text-xs">
                  Cubre catálogo estándar y productos personalizados. Haz clic en cada estado para
                  filtrar.
                </p>
              </div>
              <span className="text-brand-muted text-xs tabular-nums">
                {data.counts.activeTotal.toLocaleString("es-CO")} activos de{" "}
                {data.counts.all.toLocaleString("es-CO")} históricos
              </span>
            </div>
            <AdminSegmentedBar
              ariaLabel="Distribución de reclamos de garantía por estado"
              items={[
                {
                  key: "PENDING",
                  label: "Nuevos",
                  count: data.counts.pending,
                  tone: "amber",
                  href: buildFilterHref({ status: "PENDING" }),
                },
                {
                  key: "IN_REVIEW",
                  label: "En diagnóstico",
                  count: data.counts.inReview,
                  tone: "blue",
                  href: buildFilterHref({ status: "IN_REVIEW" }),
                },
                {
                  key: "APPROVED",
                  label: "Remedio aprobado",
                  count: data.counts.approved,
                  tone: "purple",
                  href: buildFilterHref({ status: "APPROVED" }),
                },
                {
                  key: "RESOLVED",
                  label: "Resueltos",
                  count: data.counts.resolved,
                  tone: "emerald",
                  href: buildFilterHref({ status: "RESOLVED" }),
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

          <AdminCard className="p-5 lg:col-span-5">
            <div className="mb-3">
              <h2 className="text-brand-purple-dark font-display text-base font-semibold">
                Remedios aplicados (Ley 1480)
              </h2>
              <p className="text-brand-muted text-xs">
                Proporción entre reparación, cambio y devolución del dinero.
              </p>
            </div>
            <AdminDonutChart
              ariaLabel="Distribución de garantías por tipo de remedio Ley 1480"
              centerValue={totalRemediesAssigned.toLocaleString("es-CO")}
              centerLabel="Con remedio"
              slices={[
                {
                  key: "REPAIR",
                  label: "Reparación",
                  count: data.byResolution.REPAIR,
                  tone: RESOLUTION_TONE.REPAIR,
                  href: buildFilterHref({ status: "all", resolution: "REPAIR" }),
                },
                {
                  key: "REPLACE",
                  label: "Cambio de unidad",
                  count: data.byResolution.REPLACE,
                  tone: RESOLUTION_TONE.REPLACE,
                  href: buildFilterHref({ status: "all", resolution: "REPLACE" }),
                },
                {
                  key: "REFUND",
                  label: "Devolución del dinero",
                  count: data.byResolution.REFUND,
                  tone: RESOLUTION_TONE.REFUND,
                  href: buildFilterHref({ status: "all", resolution: "REFUND" }),
                  hint:
                    data.refundExposure.approvedRefundCents +
                      data.refundExposure.resolvedRefundCents >
                    0
                      ? `Exposición: ${formatCOP(
                          data.refundExposure.approvedRefundCents +
                            data.refundExposure.resolvedRefundCents,
                        )}`
                      : undefined,
                },
              ]}
            />
          </AdminCard>
        </div>

        {/* Buscador y filtros */}
        <AdminCard className="p-4">
          <form
            method="GET"
            action="/admin/garantias"
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input type="hidden" name="status" value={view} />
            {resolution && <input type="hidden" name="resolution" value={resolution} />}
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
                    ? "Buscar por pedido (LCM-…), ID de reclamo, producto, correo o falla…"
                    : "Buscar por número de pedido (LCM-…), ID de reclamo o producto…"
                }
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm">
                Buscar
              </Button>
              {(q.trim().length > 0 || resolution) && (
                <AdminButton href={buildFilterHref({ status: view })} variant="ghost" size="sm">
                  Limpiar filtros
                </AdminButton>
              )}
            </div>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {filterPills.map((f) => {
              const active = view === f.key;
              return (
                <Link
                  key={f.key}
                  href={buildFilterHref({ status: f.key, resolution, q })}
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

            {resolution && (
              <Link
                href={buildFilterHref({ status: view, q })}
                className="border-brand-pink/30 bg-brand-pink/10 text-brand-pink-ink ml-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
              >
                Remedio: {RESOLUTION_LABEL[resolution]} ×
              </Link>
            )}
          </div>
        </AdminCard>

        {/* Listado de reclamos */}
        {data.items.length === 0 ? (
          <AdminEmpty
            icon={<ShieldCheck className="h-5 w-5" />}
            title="No encontramos reclamos con este filtro"
            description={
              q.trim() || resolution
                ? "Prueba limpiando los filtros o cambiando a la pestaña «Todos»."
                : "Cuando un cliente reporte un defecto cubierto por la garantía legal, aparecerá acá."
            }
            action={
              view !== "all" || q.trim() || resolution ? (
                <AdminButton href="/admin/garantias?status=all" variant="secondary" size="sm">
                  Ver todos los reclamos
                </AdminButton>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-3">
            {data.items.map((c) => (
              <li
                key={c.id}
                className="card-hover border-brand-purple/10 flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0 flex-1">
                  {/* Cabecera del reclamo */}
                  <div className="flex flex-wrap items-center gap-2">
                    {canOpenOrders ? (
                      <Link
                        href={`/admin/pedidos/${encodeURIComponent(c.orderNumber)}`}
                        className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
                      >
                        {c.orderNumber}
                      </Link>
                    ) : (
                      <span className="text-brand-purple-dark font-semibold">{c.orderNumber}</span>
                    )}
                    <AdminBadge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</AdminBadge>
                    {c.resolutionType && (
                      <AdminBadge
                        tone={
                          c.resolutionType === "REFUND"
                            ? "rose"
                            : c.resolutionType === "REPLACE"
                              ? "purple"
                              : "turquoise"
                        }
                      >
                        {RESOLUTION_LABEL[c.resolutionType]}
                      </AdminBadge>
                    )}
                    <span
                      title={
                        c.slaDueAt ? `Límite legal: ${formatDateTimeCO(c.slaDueAt)}` : undefined
                      }
                    >
                      <AdminBadge tone={c.sla.badgeTone}>{c.sla.label}</AdminBadge>
                    </span>
                    <code className="bg-brand-purple/5 text-brand-purple-dark rounded px-1.5 py-0.5 font-mono text-[11px]">
                      #{c.id.slice(-8)}
                    </code>
                    {c.assignedToAdmin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                        <UserCheck className="h-3 w-3 text-emerald-600" aria-hidden />
                        {c.assignedToAdmin.email}
                      </span>
                    ) : (
                      c.status !== "RESOLVED" &&
                      c.status !== "REJECTED" && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          Sin responsable
                        </span>
                      )
                    )}
                  </div>

                  {/* Producto + Cobertura sellada + Evidencia de calidad del Estudio */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <p className="text-brand-purple-dark text-sm font-medium">
                      {c.designUnits > 1
                        ? `${c.designUnits} diseños × ${c.qty} ${c.qty === 1 ? "copia" : "copias"} (${c.designUnits * c.qty} uds.)`
                        : `${c.qty}×`}{" "}
                      {c.productName}
                    </p>
                    <span className="text-slate-300" aria-hidden>
                      ·
                    </span>
                    <span className="text-brand-purple-dark text-xs font-semibold tabular-nums">
                      Valor línea {formatCOP(c.lineTotal)}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      Garantía sellada: {c.warrantyMonths}{" "}
                      {c.warrantyMonths === 1 ? "mes" : "meses"}
                      {c.warrantyEndsAt ? ` (hasta ${formatDateCO(c.warrantyEndsAt)})` : ""}
                    </span>
                    {c.isPersonalized && (
                      <span className="bg-brand-purple/8 text-brand-purple-dark inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium">
                        <Sparkles className="h-3 w-3" aria-hidden />
                        Personalizado
                      </span>
                    )}
                    {c.qualityAcknowledgedAt && (
                      <span
                        title={`Aceptado al finalizar diseño el ${formatDateTimeCO(c.qualityAcknowledgedAt)}`}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                      >
                        Aviso de baja resolución aceptado ({formatDateCO(c.qualityAcknowledgedAt)})
                      </span>
                    )}
                  </div>

                  {/* Relato del defecto (oculto en modo contable de solo lectura) */}
                  {c.description && (
                    <p className="border-brand-purple/15 bg-brand-purple/[0.03] text-brand-purple-dark mt-2 rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap">
                      “{c.description}”
                    </p>
                  )}

                  {/* Evidencias fotográficas sanitizadas */}
                  {c.evidenceUrls.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {c.evidenceUrls.map((u, i) => (
                        <a
                          key={u}
                          href={u}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="border-brand-pink/25 bg-brand-pink/8 text-brand-pink-ink hover:bg-brand-pink/15 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors"
                        >
                          <Camera className="h-3.5 w-3.5" aria-hidden />
                          Evidencia {i + 1}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Metadatos del cliente + conexiones 360° */}
                  <div className="text-brand-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span>
                      {c.customerName} ({c.customerEmail})
                    </span>
                    <span aria-hidden>·</span>
                    <span title={formatDateTimeCO(c.requestedAt)}>
                      Reportado {formatRelativeTime(c.requestedAt)}
                    </span>
                    {c.orderPaymentMethod && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          Pago:{" "}
                          {c.orderPaymentMethod === "COD"
                            ? "Contraentrega"
                            : c.orderPaymentMethod === "DIRECT_TRANSFER"
                              ? "Bre-B / Transferencia"
                              : "Wompi"}
                        </span>
                      </>
                    )}
                    {c.contactId && canOpenContacts && (
                      <>
                        <span aria-hidden>·</span>
                        <Link
                          href={`/admin/clientes/${c.contactId}`}
                          className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 font-medium underline"
                        >
                          Contacto 360
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </Link>
                      </>
                    )}
                    {c.sourceTicketId && canOpenSupport && (
                      <>
                        <span aria-hidden>·</span>
                        <Link
                          href={`/admin/soporte/${c.sourceTicketId}`}
                          className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 font-medium underline"
                        >
                          Ticket origen
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </Link>
                      </>
                    )}
                    {c.resolutionType === "REFUND" && canOpenFinance && (
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

                  {c.resolutionNote && (
                    <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                      <span className="font-semibold">Nota de resolución:</span> {c.resolutionNote}
                    </p>
                  )}

                  {c.status === "RESOLVED" && c.resolutionType === "REFUND" && (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800">
                      <strong>Devolución del dinero manual:</strong> el reembolso por garantía se
                      emite en Wompi o transferencia bancaria. Verifica que quede constancia en{" "}
                      {canOpenOrders ? (
                        <Link
                          href={`/admin/pedidos/${encodeURIComponent(c.orderNumber)}`}
                          className="font-semibold underline"
                        >
                          el pedido {c.orderNumber}
                        </Link>
                      ) : (
                        <span>el pedido {c.orderNumber}</span>
                      )}
                      .
                    </p>
                  )}

                  {/* Stepper de ciclo legal */}
                  <WarrantyLifecycleStepper row={c} />
                </div>

                {/* Columna de acciones operativas */}
                {canManage ? (
                  <div className="border-brand-purple/10 border-t pt-3 lg:w-72 lg:flex-shrink-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
                    <WarrantyActions
                      id={c.id}
                      status={c.status}
                      resolutionType={c.resolutionType}
                      canRefund={canRefund}
                      assignedToAdminId={c.assignedToAdmin?.id ?? null}
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
              reclamos)
            </span>
            <div className="flex items-center gap-2">
              {data.page > 1 && (
                <AdminButton
                  href={buildFilterHref({
                    status: view,
                    resolution,
                    q,
                    page: data.page - 1,
                  })}
                  variant="secondary"
                  size="sm"
                >
                  ← Anterior
                </AdminButton>
              )}
              {data.page < data.totalPages && (
                <AdminButton
                  href={buildFilterHref({
                    status: view,
                    resolution,
                    q,
                    page: data.page + 1,
                  })}
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
