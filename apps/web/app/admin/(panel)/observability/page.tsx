/*
 * Admin — Salud técnica (Bloque D). Panel para Lucy/dev: errores del servidor
 * (ErrorLog) y del cliente (ErrorReport, deduplicado), webhooks, órdenes a
 * reconciliar, reversas de stock y Web Vitals. Fuente única para responder
 * "¿está sano el sistema?" sin Sentry.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Webhook,
  RotateCcw,
  Gauge,
  ExternalLink,
  Bug,
  ShoppingBag,
  Wallet,
  Package,
  Clock,
  MessageSquare,
  PackageX,
  ShoppingCart,
  Mail,
  DatabaseBackup,
  Radar,
  HardDrive,
  ChevronDown,
} from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import { getStorageQuota, getTechHealth } from "@/features/observability/service";
import { getDailySummary } from "@/features/observability/daily-summary";
import { getSloStatus, type SloResult } from "@/features/observability/slos";
import {
  getCronHealth,
  getBackupHealth,
  getMonitorHealth,
} from "@/features/observability/cron-heartbeat";
import {
  getEmailDeliverabilityStats,
  EMAIL_BOUNCE_RATE_ALERT_PCT,
  EMAIL_BOUNCE_MIN_EVENTS,
} from "@/features/observability/email-deliverability";
import { AdminPage, AdminPageHeader, AdminPageBody } from "@/components/admin-page";
import { ClientErrorActions } from "./client-error-actions";

export const metadata: Metadata = { title: "Salud técnica" };

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Bytes → texto corto para el tile de Storage (KB/MB/GB con 1 decimal). */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export default async function AdminObservabilityPage() {
  await requireRole(["SUPERADMIN"]);
  const [h, ops, slos, crons, email, backup, monitor, storage] = await Promise.all([
    getTechHealth(),
    getDailySummary(),
    getSloStatus(),
    getCronHealth(),
    getEmailDeliverabilityStats(),
    getBackupHealth(),
    getMonitorHealth(),
    getStorageQuota(),
  ]);
  const revenue = `$${Math.round(ops.revenueLast24hCop / 100).toLocaleString("es-CO")}`;
  const recoveryPct =
    ops.abandonedCarts24h > 0
      ? Math.round((ops.recoveredCarts24h / ops.abandonedCarts24h) * 100)
      : 0;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Activity className="h-5 w-5" />}
        title="Salud técnica"
        subtitle={
          <>
            Tu resumen de las últimas 24h (el mismo del correo diario) + la salud técnica. Se
            refresca al cargar.
            <span className="mt-1 block text-xs text-slate-500">
              <Link
                href="/admin/notificaciones"
                className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
              >
                Ver historial de avisos → /admin/notificaciones
              </Link>
            </span>
          </>
        }
      />
      <AdminPageBody>
        {/* ─── Operación · últimas 24h (lo mismo que el email diario) ─── */}
        <h2 className="text-brand-purple-dark mb-2 flex items-center gap-2 text-sm font-bold">
          <ShoppingBag className="h-4 w-4" /> Operación · últimas 24h
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            icon={<ShoppingBag className="h-4 w-4" />}
            label="Pedidos"
            value={ops.ordersLast24h}
            hint="nuevos (24h)"
          />
          <Tile
            icon={<Wallet className="h-4 w-4" />}
            label="Ingresos"
            value={revenue}
            hint={`${ops.paidOrdersLast24h} pagadas`}
          />
          <Tile
            icon={<Package className="h-4 w-4" />}
            label="Por despachar"
            value={ops.toShip}
            attention={ops.toShip > 0}
            hint="pagadas sin enviar"
          />
          <Tile
            icon={<Clock className="h-4 w-4" />}
            label="En pago"
            value={ops.pendingPayment}
            hint="checkouts sin completar"
          />
          <Tile
            icon={<PackageX className="h-4 w-4" />}
            label="Stock bajo"
            value={ops.lowStock}
            attention={ops.lowStock > 0}
            hint="variantes con ≤5"
          />
          <Tile
            icon={<MessageSquare className="h-4 w-4" />}
            label="Reseñas"
            value={ops.pendingReviews}
            attention={ops.pendingReviews > 0}
            hint="por aprobar"
          />
          <Tile
            icon={<ShoppingCart className="h-4 w-4" />}
            label="Carritos abandon."
            value={ops.abandonedCarts24h}
            hint={ops.abandonedCarts24h > 0 ? `${recoveryPct}% recuperados` : "ninguno (24h)"}
          />
          <Tile
            icon={<RotateCcw className="h-4 w-4" />}
            label="A reconciliar"
            value={ops.needsReconciliation}
            danger={ops.needsReconciliation > 0}
            hint="pago/stock inconsistente"
          />
        </div>
        <p className="text-brand-muted mt-2 text-xs">
          💵 Contra entrega <em>por cobrar</em>:{" "}
          <strong className="text-brand-purple-dark">
            ${Math.round(ops.codToCollectCop / 100).toLocaleString("es-CO")}
          </strong>{" "}
          {ops.codToCollectCop > 0
            ? "(efectivo al entregar — no incluido en Ingresos)."
            : "(sin pedidos contra entrega pendientes en 24h)."}
        </p>

        {/*
         * N-04 — entregabilidad de email (7 días). Va FUERA del <details>
         * técnico a propósito: un bounce rate alto significa clientas sin
         * confirmación de pedido ni recuperación de clave — es negocio, no
         * solo técnica (antes era invisible: ~50% de rebote sin ninguna señal).
         */}
        <Section
          title={`Entregabilidad de email (${email.windowDays} días)`}
          icon={<Mail className="h-4 w-4" />}
        >
          <div className="flex flex-wrap gap-3 text-sm">
            <VitalPill label="Entregados" value={email.delivered} tone="emerald" />
            <VitalPill
              label="Rebotados"
              value={email.bounced}
              tone={email.bounceRateAlert ? "rose" : "amber"}
            />
            <VitalPill label="Diferidos" value={email.delayed} tone="amber" />
            <VitalPill
              label="Tasa de rebote"
              value={email.bounceRatePct === null ? "—" : `${email.bounceRatePct.toFixed(1)}%`}
              tone={email.bounceRateAlert ? "rose" : "emerald"}
            />
            {email.excludedTestEvents > 0 ? (
              <VitalPill
                label="Excluidos (tests *.test)"
                value={email.excludedTestEvents}
                tone="slate"
              />
            ) : null}
          </div>
          <p className="text-brand-muted mt-2 text-xs">
            {email.bounceRateAlert ? (
              <>
                <strong className="text-rose-700">
                  La tasa de rebote supera el {EMAIL_BOUNCE_RATE_ALERT_PCT}%:
                </strong>{" "}
                revisa DKIM/SPF/DMARC del dominio y las direcciones rebotadas en el dashboard de
                Resend antes de seguir enviando.{" "}
              </>
            ) : (
              <>
                Alerta automática si la tasa supera el {EMAIL_BOUNCE_RATE_ALERT_PCT}% con ≥
                {EMAIL_BOUNCE_MIN_EVENTS} eventos terminales (entregados + rebotados).{" "}
              </>
            )}
            Los eventos a dominios <code>.test</code> (corridas de suites) se excluyen de la tasa
            porque su rebote es esperado por diseño. Fuente: webhook de Resend (
            <code>/api/webhooks/resend</code>).
          </p>
        </Section>

        {/*
         * Fase 3D — cuota de Supabase Storage por bucket. Va FUERA del
         * <details> técnico a propósito (mismo criterio que entregabilidad):
         * llenar el plan Free (1 GB) tumba las subidas de fotos de clientas —
         * es negocio, no solo técnica. Los bytes salen SOLO de tablas de la
         * app (la Management API de Supabase no está disponible en runtime);
         * los buckets sin bytes guardados se reportan como "N archivos".
         */}
        <Section title="Almacenamiento (Supabase Storage)" icon={<HardDrive className="h-4 w-4" />}>
          <div className="flex flex-wrap gap-3 text-sm">
            {storage.buckets.map((b) => (
              <VitalPill
                key={b.bucket}
                label={b.bucket}
                value={
                  b.bytes !== null
                    ? `${formatBytes(b.bytes)} · ${b.files} archivo${b.files === 1 ? "" : "s"}`
                    : `${b.files} archivo${b.files === 1 ? "" : "s"}`
                }
                tone="slate"
              />
            ))}
            <VitalPill
              label="Total medido"
              value={formatBytes(storage.measuredBytes)}
              tone={storage.measuredBytes > 800 * 1024 * 1024 ? "amber" : "emerald"}
            />
          </div>
          <p className="text-brand-muted mt-2 text-xs">
            El total suma solo los buckets que guardan el tamaño de cada archivo en la base de datos
            (<code>customer-uploads</code> y <code>cms-media</code>) — es un piso: las vistas
            previas, los PNG de producción y las fotos de producto se cuentan por archivos porque su
            tamaño no está registrado. Límite del plan Supabase: <strong>1 GB (Free)</strong> ·{" "}
            <strong>100 GB (Pro)</strong>. Si el total se acerca al límite, limpia la mediateca (
            <Link
              href="/admin/contenido/mediateca"
              className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
            >
              filtro «Sin uso»
            </Link>
            ) o sube de plan.
          </p>
        </Section>

        {/*
         * H4 — todo lo puramente técnico (SLOs, webhooks, crons, errores,
         * Web Vitals) queda colapsado: Lucy ve los tiles operativos de arriba
         * y soporte abre esto cuando lo necesita. <details> nativo, sin JS.
         */}
        <details className="group mt-6">
          <summary className="border-brand-purple/15 text-brand-purple-dark hover:border-brand-purple/35 mb-2 flex cursor-pointer items-center gap-2 rounded-lg border bg-white/70 px-4 py-3 text-sm font-bold shadow-sm transition-colors [&::-webkit-details-marker]:hidden">
            <Activity className="h-4 w-4" />
            <span className="flex-1">Detalle técnico (para soporte)</span>
            <span className="text-brand-muted text-xs font-normal">Clic para desplegar</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>

          {/* ─── SLOs (objetivos de nivel de servicio, de datos reales) ─── */}
          <h2 className="text-brand-purple-dark mt-6 mb-2 flex items-center gap-2 text-sm font-bold">
            <Gauge className="h-4 w-4" /> Objetivos de servicio (SLOs)
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {slos.map((s) => (
              <SloCard key={s.key} slo={s} />
            ))}
          </div>
          <p className="text-brand-muted mt-2 text-xs">
            Disponibilidad y latencia por ruta se miden con el monitor externo + tráfico real tras
            el lanzamiento (OBSERVABILITY.md).
          </p>

          {/* ─── Salud técnica (para dev) ─── */}
          <h2 className="text-brand-purple-dark mt-6 mb-2 flex items-center gap-2 text-sm font-bold">
            <Activity className="h-4 w-4" /> Salud técnica
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Errores (24h)"
              value={h.errors.last24h}
              danger={h.errors.last24h > 0}
              hint={`${h.errors.last7d} en 7 días`}
            />
            {/* H4 — el tile "A reconciliar" ya está arriba en Operación · 24h. */}
            <Tile
              icon={<Webhook className="h-4 w-4" />}
              label="Webhooks pendientes"
              value={h.webhooks.pending}
              danger={h.webhooks.pending > 5}
              hint={`${h.webhooks.processed7d}/${h.webhooks.total7d} procesados (7d)`}
            />
            <Tile
              icon={<RotateCcw className="h-4 w-4" />}
              label="Reversas stock (7d)"
              value={h.stockReverts7d}
              hint="cancelaciones + reembolsos"
            />
            <Tile
              icon={<Bug className="h-4 w-4" />}
              label="Errores cliente"
              value={h.clientErrors.openCount}
              danger={h.clientErrors.openCount > 0}
              hint="reportes del navegador sin resolver"
            />
          </div>

          {/* ─── Crons (dead-man switch, #15) ─── */}
          <h2 className="text-brand-purple-dark mt-6 mb-2 flex items-center gap-2 text-sm font-bold">
            <Clock className="h-4 w-4" /> Trabajos automáticos (crons)
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {crons.map((c) => (
              <Tile
                key={c.job}
                icon={<Clock className="h-4 w-4" />}
                label={c.label}
                value={c.overdue ? "Sin correr" : "Al día"}
                danger={c.overdue}
                hint={
                  c.lastRunAt ? `últ. ${dateFmt.format(c.lastRunAt)}` : "sin registro de ejecución"
                }
              />
            ))}
          </div>

          {/*
           * N-19a — backup diario a R2. DISTINTO de los jobs de arriba: no es un
           * cron pg_cron — corre en GitHub Actions (backup.yml) y avisa acá vía
           * POST /api/cron/backup-heartbeat tras cada backup exitoso. Sin latido
           * en >36h la alerta backup_stale llega al centro de notificaciones.
           */}
          <h2 className="text-brand-purple-dark mt-6 mb-2 flex items-center gap-2 text-sm font-bold">
            <DatabaseBackup className="h-4 w-4" /> Backup diario a R2
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Tile
              icon={<DatabaseBackup className="h-4 w-4" />}
              label="Backup de la base de datos"
              value={backup.stale ? "Sin latido" : "Al día"}
              danger={backup.stale}
              hint={
                backup.lastSuccessAt
                  ? `últ. éxito ${dateFmt.format(backup.lastSuccessAt)}`
                  : "ningún backup ha reportado éxito"
              }
            />
          </div>
          <p className="text-brand-muted mt-2 text-xs">
            No es un cron de la base de datos: lo corre <strong>GitHub Actions</strong> (workflow{" "}
            <code>backup.yml</code>) y reporta el éxito a la app. Si supera 36h sin latido llega una
            alerta — revisa la pestaña Actions del repo.
          </p>

          {/*
           * Monitor externo de uptime (2026-09-14, decisión Lucy: sin SaaS, sin
           * Actions y sin depender de la VM de desarrollo). Un job pg_cron en el
           * proyecto Supabase de STG sondea los 5 healthchecks de PRD cada 10 min
           * (lote asíncrono de 2 fases) y reporta cada corrida vía POST
           * /api/cron/monitor-heartbeat. Con falla PERSISTENTE (2+ corridas) envía
           * email vía Resend; sin corrida en >30 min alerta uptime_monitor_stale;
           * con probes caídos, uptime_monitor_failing.
           */}
          <h2 className="text-brand-purple-dark mt-6 mb-2 flex items-center gap-2 text-sm font-bold">
            <Radar className="h-4 w-4" /> Monitor externo (Supabase STG)
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Tile
              icon={<Radar className="h-4 w-4" />}
              label="Sondeo de PRD cada 10 min"
              value={monitor.stale ? "Sin latido" : monitor.failing ? "Con fallas" : "Al día"}
              danger={monitor.stale || monitor.failing}
              hint={
                monitor.lastRunAt
                  ? `últ. corrida ${dateFmt.format(monitor.lastRunAt)} · ${monitor.lastDetail ?? "—"}`
                  : "el monitor nunca ha reportado"
              }
            />
          </div>
          <p className="text-brand-muted mt-2 text-xs">
            Independiente de la app y de la VM: corre como{" "}
            <strong>job pg_cron en Supabase STG</strong> y alerta por correo vía Resend solo en
            fallas persistentes (2+ corridas). Si este tile queda «Sin latido», la tienda se queda
            sin monitoreo externo — revisa el job <code>uptime-monitor-prd</code> en el proyecto de
            STG.
          </p>

          {/* Top errores */}
          <Section title="Errores recientes (7 días)" icon={<AlertTriangle className="h-4 w-4" />}>
            {h.errors.top.length === 0 ? (
              <Empty>Sin errores del servidor registrados. 🎉</Empty>
            ) : (
              <ul className="divide-brand-purple/10 divide-y text-sm">
                {h.errors.top.map((e, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-brand-purple-dark truncate font-medium">{e.message}</p>
                      <p className="text-brand-muted text-xs">
                        {e.routePath ?? "—"} · últ. {dateFmt.format(e.lastAt)}
                      </p>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                      ×{e.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Errores del navegador (cliente) */}
          <Section title="Errores del navegador (cliente)" icon={<Bug className="h-4 w-4" />}>
            {h.clientErrors.top.length === 0 ? (
              <Empty>Sin errores del cliente sin resolver. 🎉</Empty>
            ) : (
              <ul className="divide-brand-purple/10 divide-y text-sm">
                {h.clientErrors.top.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-brand-purple-dark truncate font-medium">{e.message}</p>
                      <p className="text-brand-muted truncate text-xs">
                        {e.url ?? "—"} · últ. {dateFmt.format(e.lastSeenAt)}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                        ×{e.count}
                      </span>
                      <ClientErrorActions id={e.id} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Órdenes a reconciliar */}
          {h.reconciliation.count > 0 && (
            <Section
              title="Órdenes que necesitan atención"
              icon={<RotateCcw className="h-4 w-4" />}
            >
              <ul className="divide-brand-purple/10 divide-y text-sm">
                {h.reconciliation.orders.map((o) => (
                  <li key={o.number} className="flex items-center justify-between gap-3 py-2">
                    <Link
                      href={`/admin/pedidos/${encodeURIComponent(o.number)}`}
                      className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
                    >
                      {o.number}
                    </Link>
                    <span className="text-brand-muted text-xs">{o.reason ?? "sin motivo"}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Web Vitals + enlaces */}
          <Section title="Rendimiento (Web Vitals, 7 días)" icon={<Gauge className="h-4 w-4" />}>
            <div className="flex flex-wrap gap-3 text-sm">
              <VitalPill label="Buenos" value={h.vitals7d.good} tone="emerald" />
              <VitalPill label="A mejorar" value={h.vitals7d.needsImprovement} tone="amber" />
              <VitalPill label="Pobres" value={h.vitals7d.poor} tone="rose" />
              <Link
                href="/admin/performance"
                className="text-brand-purple-dark hover:text-brand-purple ml-auto inline-flex items-center gap-1 text-xs font-semibold underline"
              >
                Ver detalle <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </Section>

          <p className="text-brand-muted mt-4 text-xs">
            Healthchecks en vivo:{" "}
            <a
              href="/api/health/all"
              target="_blank"
              rel="noopener"
              className="text-brand-purple-dark hover:text-brand-purple underline"
            >
              /api/health/all
            </a>{" "}
            (DB · storage · Resend · Aveonline · Wompi).
          </p>
        </details>
      </AdminPageBody>
    </AdminPage>
  );
}

function Tile({
  icon,
  label,
  value,
  hint,
  danger,
  attention,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  danger?: boolean;
  attention?: boolean; // ámbar: acción pendiente, no error
}) {
  const box = danger
    ? "border-rose-200 bg-rose-50"
    : attention
      ? "border-amber-200 bg-amber-50"
      : "border-brand-purple/10 bg-white";
  const labelColor = danger ? "text-rose-700" : attention ? "text-amber-700" : "text-brand-muted";
  const valueColor = danger
    ? "text-rose-700"
    : attention
      ? "text-amber-800"
      : "text-brand-purple-dark";
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${box}`}>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${labelColor}`}>
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${valueColor}`}>{value}</div>
      {hint && <div className="text-brand-muted mt-0.5 text-[11px]">{hint}</div>}
    </div>
  );
}

const SLO_META: Record<
  SloResult["status"],
  { box: string; label: string; text: string; badge: string }
> = {
  met: {
    box: "border-emerald-200 bg-emerald-50",
    label: "Cumplido",
    text: "text-emerald-800",
    badge: "bg-emerald-100 text-emerald-700",
  },
  at_risk: {
    box: "border-amber-200 bg-amber-50",
    label: "En riesgo",
    text: "text-amber-800",
    badge: "bg-amber-100 text-amber-700",
  },
  breached: {
    box: "border-rose-200 bg-rose-50",
    label: "Incumplido",
    text: "text-rose-800",
    badge: "bg-rose-100 text-rose-700",
  },
  insufficient_data: {
    box: "border-brand-purple/10 bg-white",
    label: "Sin datos aún",
    text: "text-brand-purple-dark",
    badge: "bg-brand-purple/10 text-brand-purple-dark",
  },
};

function SloCard({ slo }: { slo: SloResult }) {
  const m = SLO_META[slo.status];
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${m.box}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-brand-muted text-xs font-semibold">{slo.label}</div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${m.badge}`}>{m.label}</span>
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${m.text}`}>
        {slo.sliPct === null ? "—" : `${slo.sliPct.toFixed(1)}%`}
      </div>
      <div className="text-brand-muted mt-0.5 text-[11px]">
        objetivo ≥ {slo.targetPct}% · {slo.windowLabel} · {slo.sampleSize} evento
        {slo.sampleSize === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-brand-purple/10 mt-4 rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="text-brand-purple-dark mb-2 flex items-center gap-2 text-sm font-bold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-brand-muted py-4 text-center text-sm">{children}</p>;
}

function VitalPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "emerald" | "amber" | "rose" | "slate";
}) {
  const cls = {
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
    slate: "bg-slate-200 text-slate-700",
  }[tone];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      {label}: {value}
    </span>
  );
}
