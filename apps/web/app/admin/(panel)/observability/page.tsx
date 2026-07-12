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
} from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import { getTechHealth } from "@/features/observability/service";
import { getDailySummary } from "@/features/observability/daily-summary";
import { AdminPage, AdminPageHeader, AdminPageBody } from "@/components/admin-page";
import { ClientErrorActions } from "./client-error-actions";

export const metadata: Metadata = { title: "Operación y salud" };

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminObservabilityPage() {
  await requireRole(["SUPERADMIN"]);
  const [h, ops] = await Promise.all([getTechHealth(), getDailySummary()]);
  const revenue = `$${Math.round(ops.revenueLast24hCop / 100).toLocaleString("es-CO")}`;
  const recoveryPct =
    ops.abandonedCarts24h > 0 ? Math.round((ops.recoveredCarts24h / ops.abandonedCarts24h) * 100) : 0;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Activity className="h-5 w-5" />}
        title="Operación y salud"
        subtitle="Tu resumen de las últimas 24h (el mismo del correo diario) + la salud técnica. Se refresca al cargar."
      />
      <AdminPageBody>
        {/* ─── Operación · últimas 24h (lo mismo que el email diario) ─── */}
        <h2 className="text-brand-purple-dark mb-2 flex items-center gap-2 text-sm font-bold">
          <ShoppingBag className="h-4 w-4" /> Operación · últimas 24h
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile icon={<ShoppingBag className="h-4 w-4" />} label="Pedidos" value={ops.ordersLast24h} hint="nuevos (24h)" />
          <Tile icon={<Wallet className="h-4 w-4" />} label="Ingresos" value={revenue} hint={`${ops.paidOrdersLast24h} pagadas`} />
          <Tile
            icon={<Package className="h-4 w-4" />}
            label="Por despachar"
            value={ops.toShip}
            attention={ops.toShip > 0}
            hint="pagadas sin enviar"
          />
          <Tile icon={<Clock className="h-4 w-4" />} label="En pago" value={ops.pendingPayment} hint="checkouts sin completar" />
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
          <Tile
            icon={<RotateCcw className="h-4 w-4" />}
            label="A reconciliar"
            value={h.reconciliation.count}
            danger={h.reconciliation.count > 0}
            hint="órdenes con pago/stock inconsistente"
          />
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
          <Section title="Órdenes que necesitan atención" icon={<RotateCcw className="h-4 w-4" />}>
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
          (DB · storage · Resend).
        </p>
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
  value: number;
  tone: "emerald" | "amber" | "rose";
}) {
  const cls = {
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
  }[tone];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      {label}: {value}
    </span>
  );
}
