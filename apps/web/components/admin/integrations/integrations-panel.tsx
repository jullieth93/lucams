import { ArrowRight, Gauge } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminNotice,
  AdminPageBody,
  AdminSegmentedBar,
  KpiCard,
} from "@/components/admin-page";
import {
  INTEGRATION_GROUP_LABEL,
  INTEGRATION_GROUPS,
  type IntegrationPanelItem,
} from "@/features/integrations/registry";
import type { PanelStatus } from "@/lib/integration-health";
import { IntegrationCard } from "./integration-card";

export type IntegrationLatencyRow = {
  key: string;
  label: string;
  ms: number;
  status: PanelStatus;
};

export function IntegrationsPanel({
  integrations,
  latencyRows,
  productionDeployment,
}: {
  integrations: IntegrationPanelItem[];
  latencyRows: IntegrationLatencyRow[];
  productionDeployment: boolean;
}) {
  const okCount = integrations.filter((item) => item.healthStatus === "ok").length;
  const warnCount = integrations.filter((item) => item.healthStatus === "warn").length;
  const failCount = integrations.filter((item) => item.healthStatus === "fail").length;
  const notConfigured = integrations.filter(
    (item) => item.healthStatus === "not-configured",
  ).length;
  const unverified = integrations.filter((item) => item.healthStatus === "unverified").length;
  const maxLatencyMs = Math.max(500, ...latencyRows.map((row) => row.ms));
  const avgLatencyMs =
    latencyRows.length > 0
      ? Math.round(latencyRows.reduce((total, row) => total + row.ms, 0) / latencyRows.length)
      : null;

  return (
    <AdminPageBody>
      <AdminNotice tone="info">
        <strong>¿Qué ves acá?</strong> Estado en vivo de los servicios externos que usa la tienda.
        Las tareas marcadas como <strong>ACCIÓN HUMANA</strong> se ejecutan en el panel de cada
        proveedor. Recarga la página para correr nuevamente las sondas en tiempo real.
      </AdminNotice>

      {failCount > 0 && (
        <AdminNotice tone="error">
          <strong>Atención:</strong> hay {failCount} integración{failCount === 1 ? "" : "es"} con
          falla activa. Revisa el detalle abajo y consulta el panel del proveedor correspondiente.
        </AdminNotice>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Conectores operativos"
          value={okCount}
          trend={failCount === 0 ? "up" : "down"}
          trendLabel={`De ${integrations.length} integraciones monitoreadas`}
        />
        <KpiCard
          label="Alertas o caídas"
          value={failCount + warnCount}
          trend={failCount + warnCount === 0 ? "up" : "down"}
          trendLabel={
            failCount > 0
              ? `${failCount} caída${failCount === 1 ? "" : "s"} · ${warnCount} por revisar`
              : warnCount > 0
                ? `${warnCount} con advertencia de ambiente`
                : "Cero incidentes detectados"
          }
        />
        <KpiCard
          label="Variables configuradas"
          value={`${integrations.filter((item) => item.isConfigured).length}/${integrations.length}`}
          trend="neutral"
          trendLabel={
            notConfigured === 0
              ? "100 % de conectores con credenciales"
              : `${notConfigured} pendiente${notConfigured === 1 ? "" : "s"} de credenciales`
          }
        />
        <KpiCard
          label="Latencia media en vivo"
          value={avgLatencyMs !== null ? `${avgLatencyMs} ms` : "—"}
          trend={
            avgLatencyMs === null
              ? "neutral"
              : avgLatencyMs <= 450
                ? "up"
                : avgLatencyMs > 1200
                  ? "down"
                  : "neutral"
          }
          trendLabel={`${latencyRows.length} sondas remotas medidas ahora`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <AdminCard className="p-5 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Postura global de conectores
              </h2>
              <p className="text-brand-muted text-xs">
                Distribución actual de las {integrations.length} integraciones del ecosistema.
              </p>
            </div>
            <AdminBadge tone={productionDeployment ? "emerald" : "blue"}>
              {productionDeployment ? "Entorno PRD" : "Entorno STG / Dev"}
            </AdminBadge>
          </div>
          <AdminSegmentedBar
            ariaLabel="Distribución de salud de las integraciones"
            items={[
              { key: "ok", label: "Operativas", count: okCount, tone: "emerald" },
              { key: "warn", label: "Por revisar", count: warnCount, tone: "amber" },
              {
                key: "unverified",
                label: "Estáticas / Por req.",
                count: unverified,
                tone: "blue",
              },
              { key: "not-cfg", label: "Sin configurar", count: notConfigured, tone: "slate" },
              { key: "fail", label: "Con falla", count: failCount, tone: "rose" },
            ]}
          />
          <div className="border-brand-purple/10 mt-4 rounded-lg border bg-slate-50/70 p-3 text-xs text-slate-600">
            <p className="text-brand-purple-dark font-semibold">Arquitectura de sondas</p>
            <p className="mt-0.5 leading-relaxed">
              <strong>Sonda interna</strong> consulta <code>/api/health/*</code> con bypass de
              Deployment Protection; <strong>API directa</strong> autentica contra el proveedor sin
              gastar saldo ni cuota; <strong>Por solicitud</strong> valida cada formulario en tiempo
              real.
            </p>
          </div>
        </AdminCard>

        <AdminCard className="p-5 lg:col-span-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gauge className="text-brand-purple h-4 w-4" />
              <div>
                <h2 className="text-brand-purple-dark font-display text-base font-bold">
                  Termómetro de latencia en vivo
                </h2>
                <p className="text-brand-muted text-xs">
                  Tiempo de respuesta medida en esta carga (&lt; 400 ms óptima · 400–1200 ms
                  moderada · &gt; 1200 ms alta).
                </p>
              </div>
            </div>
          </div>
          {latencyRows.length === 0 ? (
            <p className="text-brand-muted text-xs">
              No hay sondas con medición de latencia disponible en este momento.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {latencyRows.map((row) => {
                const pct = Math.max(4, Math.min(100, Math.round((row.ms / maxLatencyMs) * 100)));
                const barColor =
                  row.status === "fail"
                    ? "#F43F5E"
                    : row.ms <= 400
                      ? "#10B981"
                      : row.ms <= 1200
                        ? "#F59E0B"
                        : "#F43F5E";
                const badgeTone =
                  row.status === "fail"
                    ? "rose"
                    : row.ms <= 400
                      ? "emerald"
                      : row.ms <= 1200
                        ? "amber"
                        : "rose";
                const speedLabel =
                  row.status === "fail"
                    ? "Falla"
                    : row.ms <= 400
                      ? "Óptima"
                      : row.ms <= 1200
                        ? "Moderada"
                        : "Alta";
                return (
                  <li key={row.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-brand-purple-dark font-medium">{row.label}</span>
                      <span className="inline-flex items-center gap-2 tabular-nums">
                        <AdminBadge tone={badgeTone}>{speedLabel}</AdminBadge>
                        <strong className="text-brand-purple-dark w-16 text-right">
                          {row.ms.toLocaleString("es-CO")} ms
                        </strong>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="admin-bar-grow-x h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </AdminCard>
      </div>

      {INTEGRATION_GROUPS.map((group) => {
        const items = integrations.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group}>
            <h2 className="text-brand-purple-dark/70 mb-2 text-xs font-bold tracking-wider uppercase">
              {INTEGRATION_GROUP_LABEL[group]}
            </h2>
            <div className="space-y-3">
              {items.map((item) => (
                <IntegrationCard key={item.key} integration={item} />
              ))}
            </div>
          </section>
        );
      })}

      <AdminCard className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-brand-purple-dark font-display mb-1 text-base font-bold">
              Healthcheck unificado y observabilidad continua
            </h3>
            <p className="text-brand-purple-dark/75 text-sm">
              Para monitores externos (UptimeRobot, BetterStack), apunta a{" "}
              <code className="bg-brand-purple/10 rounded px-1.5 py-0.5 font-mono text-xs">
                /api/health/all
              </code>{" "}
              — devuelve <code>200 OK</code> si todo lo crítico (DB + Storage) está sano, o{" "}
              <code>503</code> si algo crítico falla. Para revisar colas de webhooks, crons y
              errores recientes, entra a Salud técnica.
            </p>
          </div>
          <AdminButton href="/admin/observability" variant="secondary" size="sm">
            Ir a Salud técnica
            <ArrowRight className="h-3.5 w-3.5" />
          </AdminButton>
        </div>
      </AdminCard>
    </AdminPageBody>
  );
}
