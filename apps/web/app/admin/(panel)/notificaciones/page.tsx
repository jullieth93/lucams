/*
 * Admin — Centro de notificaciones (2026-08-05).
 *
 * Feed in-app de eventos del sistema aislado por alcance RBAC:
 *   - `SUPERADMIN`: vista completa (alertas técnicas, crons, finanzas/DIAN, pedidos y cotizaciones).
 *   - `OPERATIONS_MANAGER` / `MANAGER`: avisos operativos y comerciales dentro de sus rutas permitidas
 *     (pedidos, inventario, cotizaciones, oportunidades), sin exponer ingresos COP, DIAN ni seguridad.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarCheck2,
  Check,
  CheckCheck,
  Clock,
  Info,
  Package,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { adminHomePath, canAccessAdminPath } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
import {
  listNotifications,
  getNotificationPulseAndSummary,
  type NotificationType,
  type NotificationSeverity,
} from "@/features/notifications/service";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminButton,
  AdminCard,
  AdminComboBarLineChart,
  AdminSegmentedBar,
  AdminEmpty,
  type ComboChartDatum,
  type SegmentedBarItem,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { markReadAction, markAllReadAction } from "./actions";
import { formatRelativeTime } from "@/lib/format";
import { formatDateTimeNoYearCO } from "@/lib/datetime";
import { isSafeInternalPath } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Notificaciones",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

// Icono + color por tipo (Bell como fallback defensivo: la columna es String,
// mañana puede llegar un tipo nuevo sin tocar esta pantalla).
const TYPE_META: Record<NotificationType, { label: string; Icon: LucideIcon; iconClass: string }> =
  {
    ALERT: { label: "Alerta", Icon: AlertTriangle, iconClass: "bg-amber-100 text-amber-600" },
    CRON: { label: "Cron", Icon: Clock, iconClass: "bg-brand-purple/10 text-brand-purple" },
    QUOTE: {
      label: "Cotización",
      Icon: ShoppingBag,
      iconClass: "bg-brand-turquoise/15 text-cyan-700",
    },
    ORDER: {
      label: "Pedido",
      Icon: Package,
      iconClass: "bg-emerald-100 text-emerald-700",
    },
    SYSTEM: { label: "Sistema", Icon: Info, iconClass: "bg-slate-100 text-slate-500" },
  };
const TYPE_FALLBACK = { label: "Aviso", Icon: Bell, iconClass: "bg-slate-100 text-slate-500" };

// Badge de severidad: crítica en rosa brand, warning en ámbar, info en gris.
const SEVERITY_META: Record<NotificationSeverity, { label: string; classes: string }> = {
  critical: { label: "Crítica", classes: "bg-brand-pink/10 text-brand-pink-ink" },
  warning: { label: "Atención", classes: "bg-amber-50 text-amber-700" },
  info: { label: "Info", classes: "bg-slate-100 text-brand-muted" },
};
const SEVERITY_FALLBACK = SEVERITY_META.info;

const ALL_TYPE_FILTERS: Array<{
  key: NotificationType | null;
  label: string;
  techOnly?: boolean;
}> = [
  { key: null, label: "Todos" },
  { key: "ORDER", label: "Pedidos" },
  { key: "QUOTE", label: "Cotizaciones" },
  { key: "ALERT", label: "Alertas" },
  { key: "CRON", label: "Crons", techOnly: true },
  { key: "SYSTEM", label: "Sistema", techOnly: true },
];

/** Arma el href preservando el otro filtro (view=unread es el default → sin param). */
function filterHref(view: "unread" | "all", type: NotificationType | null): string {
  const params = new URLSearchParams();
  if (view !== "unread") params.set("view", view);
  if (type) params.set("type", type);
  const qs = params.toString();
  return qs ? `/admin/notificaciones?${qs}` : "/admin/notificaciones";
}

export default async function AdminNotificacionesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireCapability("notifications:manage");
  const role = session.admin.role;
  const canSeeObservability = canAccessAdminPath(role, "/admin/observability");
  const canSeeHoy = canAccessAdminPath(role, "/admin/hoy");

  const visibleTypeFilters = ALL_TYPE_FILTERS.filter((f) => !f.techOnly || canSeeObservability);
  const allowedTypeKeys = visibleTypeFilters
    .map((f) => f.key)
    .filter((k): k is NotificationType => k !== null);

  const sp = await searchParams;
  const viewParam = pickString(sp, "view") ?? pickString(sp, "vista");
  const view = viewParam === "all" ? "all" : "unread";
  const typeRaw = pickString(sp, "type") ?? pickString(sp, "tipo");
  const type = allowedTypeKeys.find((t) => t === typeRaw) ?? null;

  const [notifications, summary] = await Promise.all([
    listNotifications({
      unreadOnly: view === "unread",
      type: type ?? undefined,
      limit: 100,
      role,
    }),
    getNotificationPulseAndSummary({ role, days: 14 }),
  ]);

  const unreadCount = summary.unreadCount;

  const pulseChartData: ComboChartDatum[] = summary.buckets.map((b) => ({
    key: b.key,
    label: b.label,
    tickLabel: b.tickLabel,
    barValue: b.total,
    barFormatted: `${b.total.toLocaleString("es-CO")} ${b.total === 1 ? "aviso" : "avisos"}`,
    lineValue: b.priority,
    lineFormatted: `${b.priority.toLocaleString("es-CO")} prioritarios`,
  }));

  const segmentedItems: SegmentedBarItem[] = [
    {
      key: "ORDER",
      label: "Pedidos",
      count: summary.byType.ORDER,
      tone: "emerald",
      href: filterHref("all", "ORDER"),
    },
    {
      key: "QUOTE",
      label: "Cotizaciones",
      count: summary.byType.QUOTE,
      tone: "turquoise",
      href: filterHref("all", "QUOTE"),
    },
    {
      key: "ALERT",
      label: "Alertas",
      count: summary.byType.ALERT,
      tone: "amber",
      href: filterHref("all", "ALERT"),
    },
    ...(canSeeObservability
      ? ([
          {
            key: "CRON",
            label: "Crons",
            count: summary.byType.CRON,
            tone: "purple",
            href: filterHref("all", "CRON"),
          },
          {
            key: "SYSTEM",
            label: "Sistema",
            count: summary.byType.SYSTEM,
            tone: "slate",
            href: filterHref("all", "SYSTEM"),
          },
        ] satisfies SegmentedBarItem[])
      : []),
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        breadcrumbs={[{ label: "Inicio", href: adminHomePath(role) }, { label: "Notificaciones" }]}
        icon={<Bell className="h-5 w-5" />}
        title="Notificaciones"
        subtitle={
          <>
            {canSeeObservability
              ? "Centro unificado de eventos del sistema: pedidos, cotizaciones nuevas, alertas operativas, crons y resumen diario — sin llenar tu correo."
              : "Avisos operativos y comerciales de tu ámbito: pedidos confirmados, alertas de stock o despacho y cotizaciones nuevas — sin llenar tu correo."}
            {canSeeObservability && (
              <span className="mt-1 block text-xs text-slate-500">
                Acá queda el historial de avisos. Para revisar telemetría e infraestructura en vivo,
                ve a{" "}
                <Link
                  href="/admin/observability"
                  className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
                >
                  Salud técnica
                </Link>
                .
              </span>
            )}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canSeeHoy && (
              <Link
                href="/admin/hoy"
                className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden />
                Mi día
              </Link>
            )}
            {canSeeObservability && (
              <Link
                href="/admin/observability"
                className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                <Activity className="h-3.5 w-3.5" aria-hidden />
                Salud técnica
              </Link>
            )}
            {unreadCount > 0 && (
              <form action={markAllReadAction}>
                {type && <input type="hidden" name="type" value={type} />}
                <AdminButton type="submit" variant="secondary" size="sm" pendingLabel="Marcando…">
                  <CheckCheck className="h-3.5 w-3.5" />
                  {type
                    ? `Marcar ${TYPE_META[type].label.toLowerCase()} leídas`
                    : `Marcar todas como leídas (${unreadCount})`}
                </AdminButton>
              </form>
            )}
          </div>
        }
      />
      <AdminPageBody>
        {/* KPIs ejecutivos del alcance RBAC */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="border-brand-purple/10 rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Pendientes de leer</p>
            <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={summary.unreadCount} />
            </p>
            <p className="mt-1 text-[11px] text-slate-500">En tu bandeja activa</p>
          </div>
          <div
            className={`rounded-2xl border p-4 shadow-sm ${
              summary.priorityUnreadCount > 0
                ? "border-brand-pink/30 bg-brand-pink/[0.04]"
                : "border-brand-purple/10 bg-white"
            }`}
          >
            <p className="text-xs font-medium text-slate-500">Prioridad alta sin leer</p>
            <p
              className={`font-display mt-1 text-2xl font-bold tabular-nums ${
                summary.priorityUnreadCount > 0 ? "text-brand-pink-ink" : "text-brand-purple-dark"
              }`}
            >
              <CountUp value={summary.priorityUnreadCount} />
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Críticas o de atención inmediata</p>
          </div>
          <div className="border-brand-purple/10 rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Volumen (14 días)</p>
            <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={summary.windowTotal} />
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Hora Colombia (UTC-5)</p>
          </div>
          <div className="border-brand-purple/10 rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Pedidos y cotizaciones (14d)</p>
            <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={summary.commercialWindowCount} />
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Flujo comercial entrante</p>
          </div>
        </div>

        {/* Pulso diario 14d + distribución por categoría */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AdminCard className="p-5">
              <div className="mb-3">
                <h2 className="text-brand-purple-dark font-display text-base font-bold">
                  Pulso de avisos (últimos 14 días)
                </h2>
                <p className="text-brand-muted text-xs">
                  Volumen diario en hora Colombia frente a avisos críticos o de atención
                </p>
              </div>
              <AdminComboBarLineChart
                data={pulseChartData}
                ariaLabel="Pulso de notificaciones en los últimos 14 días"
                barLegend="Avisos recibidos"
                lineLegend="Críticos / atención"
              />
            </AdminCard>
          </div>
          <AdminCard className="p-5">
            <div className="mb-3">
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Mezcla por categoría (14d)
              </h2>
              <p className="text-brand-muted text-xs">
                Haz clic en una categoría para filtrar el historial completo
              </p>
            </div>
            <AdminSegmentedBar
              items={segmentedItems}
              ariaLabel="Distribución de notificaciones por categoría en 14 días"
            />
          </AdminCard>
        </div>

        {/* Filtros: vista (No leídas/Todas) + tipo. Links RSC (mismo patrón que SortableHeader). */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {(
              [
                { key: "unread", label: "No leídas" },
                { key: "all", label: "Todas" },
              ] as const
            ).map((v) => (
              <Link
                key={v.key}
                href={filterHref(v.key, type)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  view === v.key
                    ? "bg-brand-purple text-white shadow-sm"
                    : "text-brand-purple-dark hover:bg-brand-purple/10 bg-white"
                }`}
              >
                {v.label}
                {v.key === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
              </Link>
            ))}
          </div>
          <span className="text-brand-purple/30">·</span>
          <div className="flex flex-wrap items-center gap-1">
            {visibleTypeFilters.map((t) => (
              <Link
                key={t.label}
                href={filterHref(view, t.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  type === t.key
                    ? "bg-brand-pink text-white shadow-sm"
                    : "text-brand-purple-dark hover:bg-brand-pink/10 bg-white"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>

        {notifications.length === 0 ? (
          <AdminEmpty
            icon={<span className="text-2xl">🦝</span>}
            title={view === "unread" ? "Nada pendiente por leer" : "Sin notificaciones por ahora"}
            description={
              view === "unread"
                ? "Ya estás al día: no queda nada sin leer. Cuando algo necesite tu atención va a aparecer acá."
                : canSeeObservability
                  ? "Cuando algo necesite tu atención (una alerta, un cron que falle, una cotización nueva o tu resumen diario), va a aparecer acá — sin llenar tu correo."
                  : "Cuando entre un pedido nuevo, una cotización o una alerta operativa de tu ámbito, va a aparecer acá — sin llenar tu correo."
            }
          />
        ) : (
          <ul className="space-y-3">
            {notifications.map((n) => {
              const typeMeta = TYPE_META[n.type as NotificationType] ?? TYPE_FALLBACK;
              const sev = SEVERITY_META[n.severity as NotificationSeverity] ?? SEVERITY_FALLBACK;
              const unread = n.readAt === null;
              return (
                <li
                  key={n.id}
                  className={`border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm transition-colors ${
                    unread ? "border-l-brand-pink border-l-4" : "opacity-75"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${typeMeta.iconClass}`}
                    >
                      <typeMeta.Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${sev.classes}`}
                        >
                          {sev.label}
                        </span>
                        <span className="text-brand-muted text-xs">{typeMeta.label}</span>
                        <span
                          className="text-brand-muted text-xs"
                          title={formatDateTimeNoYearCO(n.createdAt)}
                        >
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>
                      <p
                        className={`text-brand-purple-dark mt-1.5 text-sm ${
                          unread ? "font-bold" : "font-medium"
                        }`}
                      >
                        {n.title}
                      </p>
                      <p className="text-brand-muted mt-1 text-sm break-words whitespace-pre-line">
                        {n.detail}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {n.actionUrl &&
                          isSafeInternalPath(n.actionUrl) &&
                          (!n.actionUrl.startsWith("/admin") ||
                            canAccessAdminPath(session.admin.role, n.actionUrl)) && (
                            <Link
                              href={n.actionUrl}
                              className="text-brand-pink-ink hover:bg-brand-pink/10 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
                            >
                              {n.actionLabel ?? "Ver detalle"} →
                            </Link>
                          )}
                        {unread && (
                          <form action={markReadAction}>
                            <input type="hidden" name="id" value={n.id} />
                            <AdminButton type="submit" variant="ghost" size="sm" pendingLabel="…">
                              <Check className="h-3.5 w-3.5" />
                              Marcar leída
                            </AdminButton>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
