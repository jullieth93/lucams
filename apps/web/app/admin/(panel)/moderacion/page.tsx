/*
 * Admin — Cola e historial ejecutivo de moderación de contenido (ADR-062 P0-2, Bloque 5).
 * Print-on-demand: el equipo revisa el contenido de cada diseño personalizado ANTES de imprimirlo.
 * Aprobar → habilita producción/envío. Rechazar → avisa al cliente con el motivo y bloquea el
 * envío del pedido. Diseños de pedidos activos (PAID/FULFILLING), cotizaciones activas y
 * diseños compartidos por link público (/d/<token>) pendientes de revisar (A4-01).
 */

import type { Metadata } from "next";
import Link from "next/link";
import type { AdminRole } from "@lucams/db";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Package,
  Search,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import { ADMIN_ROLE_SETS, canAccessAdminPath } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  getModerationSummaryForActor,
  listPendingModerationForActor,
  listRecentModeratedForActor,
  type ModerationSource,
  type PendingModerationDesign,
  type RecentModeratedDesign,
} from "@/features/moderation/service";
import {
  AdminBadge,
  AdminCard,
  AdminDonutChart,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  OpsCard,
} from "@/components/admin-page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ModerationActions } from "./moderation-actions";
import { ProductionPiecesButton } from "./production-pieces-button";
import { ModerationPreviewZoom } from "./preview-zoom";
import { previewRefToAuthorizedUrl } from "@/features/personalization/preview-artifacts";
import { formatDateCO, formatDateTimeCO } from "@/lib/datetime";

export const metadata: Metadata = { title: "Moderación" };

type VistaMode = "cola" | "historial";
type OrigenFilter = "todos" | "pedido" | "cotizacion" | "compartido";
type CalidadFilter = "todos" | "con_aviso";

type SearchParams = Promise<{
  approved?: string;
  rejected?: string;
  error?: string;
  q?: string;
  /** Alias heredado de enlaces previos (?pedido=LCM-…). */
  pedido?: string;
  vista?: string;
  origen?: string;
  calidad?: string;
}>;

function resolveSourceLink(
  s: ModerationSource,
  role: AdminRole,
): { href: string | null; label: string; suffix?: string } {
  if (s.tipo === "pedido") {
    const href = `/admin/pedidos/${encodeURIComponent(s.numero)}`;
    return {
      href: canAccessAdminPath(role, href) ? href : null,
      label: `Pedido ${s.numero}`,
    };
  }

  if (s.quoteId) {
    const detailHref = `/admin/cotizaciones/${encodeURIComponent(s.quoteId)}`;
    if (canAccessAdminPath(role, detailHref)) {
      return { href: detailHref, label: `Cotización ${s.numero}` };
    }
    const workshopHref = `/admin/cotizaciones/${encodeURIComponent(s.quoteId)}/taller`;
    if (canAccessAdminPath(role, workshopHref)) {
      return {
        href: workshopHref,
        label: `Cotización ${s.numero}`,
        suffix: "Ficha taller",
      };
    }
  }

  const fallbackList = `/admin/cotizaciones?q=${encodeURIComponent(s.numero)}`;
  return {
    href: canAccessAdminPath(role, "/admin/cotizaciones") ? fallbackList : null,
    label: `Cotización ${s.numero}`,
  };
}

function formatWaitDuration(
  createdAt: Date,
  nowMs: number,
): {
  label: string;
  tone: "slate" | "amber" | "rose";
} {
  const diffMinutes = Math.max(1, Math.floor((nowMs - createdAt.getTime()) / 60_000));
  if (diffMinutes < 60) {
    return { label: `Hace ${diffMinutes} min`, tone: "slate" };
  }
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) {
    return {
      label: `En espera ${hours} h`,
      tone: hours >= 12 ? "amber" : "slate",
    };
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return {
    label: remHours > 0 ? `En espera ${days} d ${remHours} h` : `En espera ${days} d`,
    tone: "rose",
  };
}

function buildModerationHref(params: {
  vista?: VistaMode;
  q?: string;
  origen?: OrigenFilter;
  calidad?: CalidadFilter;
}): string {
  const qs = new URLSearchParams();
  if (params.vista && params.vista !== "cola") qs.set("vista", params.vista);
  if (params.q) qs.set("q", params.q);
  if (params.origen && params.origen !== "todos") qs.set("origen", params.origen);
  if (params.calidad && params.calidad !== "todos") qs.set("calidad", params.calidad);
  const s = qs.toString();
  return s ? `/admin/moderacion?${s}` : "/admin/moderacion";
}

function SourceLinksRow({
  sources,
  shared,
  role,
}: {
  sources: ModerationSource[];
  shared: boolean;
  role: AdminRole;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {sources.map((s) => {
        const resolved = resolveSourceLink(s, role);
        return resolved.href ? (
          <Link
            key={`${s.tipo}:${s.numero}`}
            href={resolved.href}
            className="bg-brand-purple/8 text-brand-purple-dark hover:bg-brand-purple/15 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition-colors"
          >
            <span>{resolved.label}</span>
            {resolved.suffix ? (
              <span className="text-brand-purple text-[10px] font-medium">· {resolved.suffix}</span>
            ) : null}
            <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
          </Link>
        ) : (
          <span
            key={`${s.tipo}:${s.numero}`}
            className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700"
          >
            {resolved.label}
          </span>
        );
      })}
      {shared && <AdminBadge tone="pink">Link público compartido (/d/…)</AdminBadge>}
    </div>
  );
}

function ModerationQueueItem({
  d,
  role,
  nowMs,
  qFilter,
  origenFilter,
  calidadFilter,
}: {
  d: PendingModerationDesign;
  role: AdminRole;
  nowMs: number;
  qFilter: string;
  origenFilter: OrigenFilter;
  calidadFilter: CalidadFilter;
}) {
  const wait = formatWaitDuration(d.createdAt, nowMs);

  return (
    <li className="border-brand-purple/10 hover:border-brand-purple/25 flex flex-col gap-4 rounded-xl border bg-white p-4 shadow-sm transition-colors sm:flex-row sm:items-start">
      <div className="sm:w-64 sm:flex-shrink-0">
        {d.previewUrl ? (
          <ModerationPreviewZoom
            src={previewRefToAuthorizedUrl(d.previewUrl) ?? ""}
            alt={`Diseño de ${d.productName}`}
          />
        ) : (
          <div className="text-brand-muted border-brand-purple/10 flex aspect-square w-40 items-center justify-center rounded-lg border bg-slate-50 text-xs">
            Sin vista previa
          </div>
        )}
        {d.productionUrls.length > 0 && (
          <ProductionPiecesButton
            designId={d.designId}
            pieceCount={d.productionUrls.length}
            productName={d.productName}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-brand-purple-dark font-semibold">{d.productName}</p>
          <AdminBadge tone={wait.tone}>
            <Clock className="mr-1 h-3 w-3" aria-hidden />
            {wait.label}
          </AdminBadge>
          <span className="font-mono text-[11px] text-slate-400">#{d.designId.slice(-8)}</span>
        </div>

        <SourceLinksRow sources={d.sources} shared={d.shared} role={role} />

        {d.sources.length > 0 && (
          <p className="text-brand-muted mt-1.5 text-xs">
            Contacto registrado:{" "}
            <span className="font-medium text-slate-700">
              {d.sources.map((s) => s.contacto).join(" · ")}
            </span>
          </p>
        )}

        <p className="text-brand-muted mt-1 text-xs">
          Ingresó a la cola el {formatDateTimeCO(d.createdAt)}
        </p>

        {d.qualityAcknowledgedAt && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Aceptó aviso de resolución de fotos el {formatDateCO(d.qualityAcknowledgedAt)}
          </p>
        )}
      </div>

      <div className="sm:w-56 sm:flex-shrink-0">
        <ModerationActions
          designId={d.designId}
          qFilter={qFilter}
          origenFilter={origenFilter !== "todos" ? origenFilter : ""}
          calidadFilter={calidadFilter !== "todos" ? calidadFilter : ""}
        />
      </div>
    </li>
  );
}

function ModerationHistoryItem({ d, role }: { d: RecentModeratedDesign; role: AdminRole }) {
  const isApproved = d.moderationStatus === "APPROVED";

  return (
    <li className="border-brand-purple/10 flex flex-col gap-4 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-start">
      <div className="sm:w-48 sm:flex-shrink-0">
        {d.previewUrl ? (
          <ModerationPreviewZoom
            src={previewRefToAuthorizedUrl(d.previewUrl) ?? ""}
            alt={`Diseño de ${d.productName}`}
          />
        ) : (
          <div className="text-brand-muted border-brand-purple/10 flex aspect-square w-32 items-center justify-center rounded-lg border bg-slate-50 text-xs">
            Sin vista previa
          </div>
        )}
        {d.productionUrls.length > 0 && (
          <ProductionPiecesButton
            designId={d.designId}
            pieceCount={d.productionUrls.length}
            productName={d.productName}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-brand-purple-dark font-semibold">{d.productName}</p>
          {isApproved ? (
            <AdminBadge tone="emerald">
              <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
              Aprobado
            </AdminBadge>
          ) : (
            <AdminBadge tone="rose">
              <XCircle className="mr-1 h-3 w-3" aria-hidden />
              Rechazado
            </AdminBadge>
          )}
          <span className="font-mono text-[11px] text-slate-400">#{d.designId.slice(-8)}</span>
        </div>

        <SourceLinksRow sources={d.sources} shared={d.shared} role={role} />

        <p className="text-brand-muted mt-1.5 text-xs">
          Revisado el <strong className="text-slate-700">{formatDateTimeCO(d.moderatedAt)}</strong>{" "}
          por <strong className="text-slate-700">{d.moderatorName}</strong>
        </p>

        {!isApproved && d.moderationReason && (
          <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-800">
            <span className="font-semibold">Motivo informado al cliente:</span> {d.moderationReason}
          </div>
        )}

        {d.qualityAcknowledgedAt && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Aceptó aviso de resolución el {formatDateCO(d.qualityAcknowledgedAt)}
          </p>
        )}
      </div>
    </li>
  );
}

export default async function AdminModeracionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireRole(ADMIN_ROLE_SETS.PRODUCTION_MODERATE);
  const role = session.admin.role;
  const sp = await searchParams;

  const vista: VistaMode = sp.vista === "historial" ? "historial" : "cola";
  const origenFilter: OrigenFilter =
    sp.origen === "pedido" || sp.origen === "cotizacion" || sp.origen === "compartido"
      ? sp.origen
      : "todos";
  const calidadFilter: CalidadFilter = sp.calidad === "con_aviso" ? "con_aviso" : "todos";
  const qRaw = (sp.q ?? sp.pedido ?? "").trim();
  const qLower = qRaw.toLowerCase();

  const pendingRows = await listPendingModerationForActor(role);
  const [summary, historyRows] = await Promise.all([
    getModerationSummaryForActor(role, pendingRows),
    vista === "historial"
      ? listRecentModeratedForActor(role, { q: qRaw || undefined, limit: 24 })
      : Promise.resolve([]),
  ]);

  const nowMs = summary.evaluatedAtMs;
  const oldestWait = summary.oldestPendingAt
    ? formatWaitDuration(summary.oldestPendingAt, nowMs)
    : null;

  // Filtrado combinable en memoria sobre la cola activa (ordenada createdAt asc).
  const filteredQueue = pendingRows.filter((d) => {
    if (origenFilter === "pedido" && !d.sources.some((s) => s.tipo === "pedido")) return false;
    if (origenFilter === "cotizacion" && !d.sources.some((s) => s.tipo === "cotizacion")) {
      return false;
    }
    if (origenFilter === "compartido" && (d.sources.length > 0 || !d.shared)) return false;
    if (calidadFilter === "con_aviso" && d.qualityAcknowledgedAt === null) return false;
    if (qLower) {
      const matchId = d.designId.toLowerCase().includes(qLower);
      const matchProduct = d.productName.toLowerCase().includes(qLower);
      const matchSource = d.sources.some((s) => s.numero.toLowerCase().includes(qLower));
      if (!matchId && !matchProduct && !matchSource) return false;
    }
    return true;
  });

  // Agrupación visual por primera fuente (pedido/cotización) y diseños solo-compartidos al final.
  const withSource = filteredQueue.filter((d) => d.sources.length > 0);
  const withoutSource = filteredQueue.filter((d) => d.sources.length === 0);
  const groups: { source: ModerationSource | null; items: PendingModerationDesign[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const d of withSource) {
    const source = d.sources[0]!;
    const key = `${source.tipo}:${source.numero}`;
    let idx = groupIndex.get(key);
    if (idx === undefined) {
      idx = groups.length;
      groupIndex.set(key, idx);
      groups.push({ source, items: [] });
    }
    groups[idx]!.items.push(d);
  }
  if (withoutSource.length > 0) groups.push({ source: null, items: withoutSource });

  const canSeeOrdersHub = canAccessAdminPath(role, "/admin/pedidos");
  const canSeeAudit = canAccessAdminPath(role, "/admin/auditoria");
  const totalReviewed7d = summary.approved7d + summary.rejected7d;
  const hasActiveFilters = Boolean(qRaw) || origenFilter !== "todos" || calidadFilter !== "todos";

  return (
    <AdminPage>
      <AdminPageHeader
        breadcrumbs={[
          {
            label: "Inicio",
            href: canAccessAdminPath(role, "/admin/dashboard") ? "/admin/dashboard" : undefined,
          },
          ...(canSeeOrdersHub ? [{ label: "Pedidos", href: "/admin/pedidos" }] : []),
          { label: "Moderación de contenido" },
        ]}
        icon={<ShieldAlert className="h-5 w-5" />}
        title="Moderación de contenido"
        subtitle="Revisa cada diseño personalizado antes de imprimirlo. Aprobar libera taller y despacho; rechazar avisa al cliente con el motivo y bloquea el envío."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canSeeOrdersHub && (
              <Link
                href="/admin/pedidos?taller=1"
                className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-semibold transition-colors"
              >
                <Package className="h-3.5 w-3.5" aria-hidden />
                Pedidos pendientes de taller
              </Link>
            )}
            {canSeeAudit && (
              <Link
                href="/admin/auditoria?entity=Design"
                className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-semibold transition-colors"
              >
                <History className="h-3.5 w-3.5" aria-hidden />
                Bitácora forense
              </Link>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {sp.approved && (
          <AdminNotice tone="success">
            Diseño aprobado para producción. Los pedidos asociados quedaron habilitados para avanzar
            a despacho si no tienen más piezas pendientes.
          </AdminNotice>
        )}
        {sp.rejected && (
          <AdminNotice tone="warning">
            Diseño rechazado. Notificamos al cliente con el motivo y revocamos cualquier enlace
            público compartido.
          </AdminNotice>
        )}
        {sp.error && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {/* KPIs ejecutivos con CountUp */}
        <section
          aria-label="Indicadores operativos de moderación"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <OpsCard
            href={buildModerationHref({ vista: "cola" })}
            label="Pendientes en cola"
            value={summary.pendingTotal}
            icon={ShieldAlert}
            tone="purple"
            urgent={summary.pendingTotal > 0}
            description={
              oldestWait
                ? `Más antiguo: ${oldestWait.label.toLowerCase()}`
                : "Cola al día sin diseños en espera"
            }
          />
          <OpsCard
            href={buildModerationHref({ vista: "cola", origen: "pedido" })}
            label="Pedidos bloqueados"
            value={summary.blockedOrdersCount}
            icon={Package}
            tone="coral"
            urgent={summary.blockedOrdersCount > 0}
            description="Pedidos activos esperando aprobación para despacho"
          />
          <OpsCard
            href={buildModerationHref({ vista: "cola", calidad: "con_aviso" })}
            label="Con aviso de calidad"
            value={summary.withQualityWarningCount}
            icon={AlertTriangle}
            tone="amber"
            description="Cliente aceptó advertencia de baja resolución"
          />
          <OpsCard
            href={buildModerationHref({ vista: "historial" })}
            label="Revisados (7 días)"
            value={totalReviewed7d}
            icon={Sparkles}
            tone="turquoise"
            description={`${summary.approved7d} aprobados · ${summary.rejected7d} rechazados`}
          />
        </section>

        {/* Franja gráfica ejecutiva: composición de cola + decisiones 7d */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <AdminCard className="p-4 sm:p-5 lg:col-span-7">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                  Origen de la cola activa
                </h2>
                <p className="text-brand-muted mt-0.5 text-xs">
                  Haz clic en un segmento para filtrar por canal de entrada
                </p>
              </div>
              {oldestWait ? (
                <AdminBadge tone={oldestWait.tone}>SLA actual: {oldestWait.label}</AdminBadge>
              ) : (
                <AdminBadge tone="emerald">Cola en 0 pendientes</AdminBadge>
              )}
            </div>
            <div className="mt-3">
              <AdminSegmentedBar
                ariaLabel="Distribución de diseños pendientes por origen"
                items={[
                  {
                    key: "pedido",
                    label: "Pedidos activos",
                    count: summary.fromOrdersDesignsCount,
                    tone: "purple",
                    href: buildModerationHref({ vista: "cola", origen: "pedido" }),
                  },
                  {
                    key: "cotizacion",
                    label: "Cotizaciones",
                    count: summary.fromQuotesDesignsCount,
                    tone: "turquoise",
                    href: buildModerationHref({ vista: "cola", origen: "cotizacion" }),
                  },
                  {
                    key: "compartido",
                    label: "Solo link público (/d/…)",
                    count: summary.sharedOnlyDesignsCount,
                    tone: "pink",
                    href: buildModerationHref({ vista: "cola", origen: "compartido" }),
                  },
                ]}
              />
            </div>
          </AdminCard>

          <AdminCard className="p-4 sm:p-5 lg:col-span-5">
            <div>
              <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                Decisiones (últimos 7 días)
              </h2>
              <p className="text-brand-muted mt-0.5 text-xs">
                Balance entre aprobaciones, rechazos y cola actual
              </p>
            </div>
            <div className="mt-3">
              <AdminDonutChart
                ariaLabel="Distribución de decisiones de moderación en los últimos 7 días"
                centerValue={totalReviewed7d.toLocaleString("es-CO")}
                centerLabel="revisados 7d"
                slices={[
                  {
                    key: "approved",
                    label: "Aprobados (7d)",
                    count: summary.approved7d,
                    tone: "emerald",
                    href: buildModerationHref({ vista: "historial" }),
                  },
                  {
                    key: "rejected",
                    label: "Rechazados (7d)",
                    count: summary.rejected7d,
                    tone: "rose",
                    href: buildModerationHref({ vista: "historial" }),
                  },
                  {
                    key: "pending",
                    label: "En cola ahora",
                    count: summary.pendingTotal,
                    tone: "amber",
                    href: buildModerationHref({ vista: "cola" }),
                  },
                ]}
              />
            </div>
          </AdminCard>
        </section>

        {/* Selector de vista + barra de filtros combinables */}
        <AdminCard className="p-4">
          <div className="border-brand-purple/10 mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex flex-wrap items-center gap-2" role="tablist">
              <Link
                href={buildModerationHref({ vista: "cola", q: qRaw || undefined })}
                role="tab"
                aria-selected={vista === "cola"}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  vista === "cola"
                    ? "bg-brand-purple text-white shadow-xs"
                    : "text-brand-purple-dark hover:bg-brand-purple/8 bg-slate-100"
                }`}
              >
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                En cola pendiente ({summary.pendingTotal})
              </Link>
              <Link
                href={buildModerationHref({ vista: "historial", q: qRaw || undefined })}
                role="tab"
                aria-selected={vista === "historial"}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  vista === "historial"
                    ? "bg-brand-purple text-white shadow-xs"
                    : "text-brand-purple-dark hover:bg-brand-purple/8 bg-slate-100"
                }`}
              >
                <History className="h-3.5 w-3.5" aria-hidden />
                Historial reciente (solo lectura)
              </Link>
            </div>

            {vista === "cola" && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {(
                  [
                    { key: "todos", label: "Todos" },
                    { key: "pedido", label: "Pedidos" },
                    { key: "cotizacion", label: "Cotizaciones" },
                    { key: "compartido", label: "Links públicos" },
                  ] as const
                ).map((pill) => (
                  <Link
                    key={pill.key}
                    href={buildModerationHref({
                      vista: "cola",
                      q: qRaw || undefined,
                      origen: pill.key,
                      calidad: calidadFilter,
                    })}
                    className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                      origenFilter === pill.key
                        ? "bg-brand-purple/15 text-brand-purple-dark ring-brand-purple/30 ring-1"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {pill.label}
                  </Link>
                ))}
                <Link
                  href={buildModerationHref({
                    vista: "cola",
                    q: qRaw || undefined,
                    origen: origenFilter,
                    calidad: calidadFilter === "con_aviso" ? "todos" : "con_aviso",
                  })}
                  className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                    calidadFilter === "con_aviso"
                      ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  ⚠️ Con aviso de resolución
                </Link>
              </div>
            )}
          </div>

          <form method="GET" className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            {vista === "historial" && <input type="hidden" name="vista" value="historial" />}
            {vista === "cola" && origenFilter !== "todos" && (
              <input type="hidden" name="origen" value={origenFilter} />
            )}
            {vista === "cola" && calidadFilter !== "todos" && (
              <input type="hidden" name="calidad" value={calidadFilter} />
            )}
            <div className="sm:col-span-8">
              <label
                htmlFor="f-moderacion-q"
                className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
              >
                Buscar por pedido, cotización, producto o ID de diseño
              </label>
              <div className="relative">
                <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="f-moderacion-q"
                  name="q"
                  type="search"
                  defaultValue={qRaw}
                  placeholder="Ej. LCM-2026-0010, COT-2026-…, Imán o ID de diseño"
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30 pl-9"
                />
              </div>
            </div>
            <div className="flex items-end gap-3 sm:col-span-4">
              <Button
                type="submit"
                size="sm"
                className="bg-gradient-brand h-9 text-white hover:brightness-110"
              >
                Aplicar búsqueda
              </Button>
              {(hasActiveFilters || Boolean(qRaw)) && (
                <Link
                  href={buildModerationHref({ vista })}
                  className="text-brand-muted hover:text-brand-purple-dark pb-2 text-xs font-semibold"
                >
                  Limpiar filtros
                </Link>
              )}
            </div>
          </form>
        </AdminCard>

        {vista === "historial" ? (
          historyRows.length === 0 ? (
            <AdminEmpty
              icon={<History className="h-5 w-5" />}
              title={
                qRaw
                  ? `Sin decisiones recientes para «${qRaw}»`
                  : "Aún no hay decisiones de moderación registradas"
              }
              description={
                qRaw
                  ? "Prueba buscando con otro número de pedido, cotización o nombre de producto."
                  : "Cuando apruebes o rechaces diseños desde la cola activa, aparecerán aquí como referencia de solo lectura."
              }
            />
          ) : (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-brand-purple-dark text-sm font-bold">
                  Últimos {historyRows.length} diseños revisados (solo lectura)
                </h2>
                <p className="text-brand-muted text-xs">
                  Para re-moderar un caso puntual o auditar trazas antiguas, abre el pedido o la
                  bitácora forense.
                </p>
              </div>
              <ul className="space-y-3">
                {historyRows.map((d) => (
                  <ModerationHistoryItem key={d.designId} d={d} role={role} />
                ))}
              </ul>
            </section>
          )
        ) : pendingRows.length === 0 ? (
          <AdminEmpty
            icon={<ShieldAlert className="h-5 w-5" />}
            title="No hay diseños pendientes de revisar"
            description="¡Todo al día! Cuando ingrese un pedido pago, una cotización o un enlace público con diseño personalizado, aparecerá aquí para tu aprobación."
          />
        ) : filteredQueue.length === 0 ? (
          <AdminEmpty
            icon={<Search className="h-5 w-5" />}
            title="Ningún diseño pendiente coincide con los filtros activos"
            description="Revisa el término buscado o limpia los filtros de origen y calidad para ver toda la cola pendiente."
            action={
              <Link
                href="/admin/moderacion"
                className="text-brand-purple hover:text-brand-purple-dark text-xs font-semibold underline"
              >
                Ver toda la cola ({pendingRows.length})
              </Link>
            }
          />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => {
              const headerLink = g.source ? resolveSourceLink(g.source, role) : null;
              return (
                <section key={g.source ? `${g.source.tipo}:${g.source.numero}` : "__shared__"}>
                  <h2 className="text-brand-purple-dark mb-2.5 flex flex-wrap items-center gap-2 text-sm font-bold">
                    {g.source && headerLink ? (
                      headerLink.href ? (
                        <Link
                          href={headerLink.href}
                          className="hover:text-brand-purple inline-flex items-center gap-1 underline"
                        >
                          <span>{headerLink.label}</span>
                          {headerLink.suffix ? (
                            <span className="text-brand-purple text-xs font-medium">
                              ({headerLink.suffix})
                            </span>
                          ) : null}
                        </Link>
                      ) : (
                        <span>{headerLink.label}</span>
                      )
                    ) : (
                      <span>Sin pedido ni cotización — solo enlace público (/d/…)</span>
                    )}
                    <span className="text-brand-muted text-xs font-semibold">
                      · {g.items.length} {g.items.length === 1 ? "diseño" : "diseños"}
                    </span>
                  </h2>
                  <ul className="space-y-3">
                    {g.items.map((d) => (
                      <ModerationQueueItem
                        key={d.designId}
                        d={d}
                        role={role}
                        nowMs={nowMs}
                        qFilter={qRaw}
                        origenFilter={origenFilter}
                        calidadFilter={calidadFilter}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
