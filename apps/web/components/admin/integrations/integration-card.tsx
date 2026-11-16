import Link from "next/link";
import { ArrowRight, CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { AdminBadge, AdminCard } from "@/components/admin-page";
import type { IntegrationPanelItem } from "@/features/integrations/registry";
import { IntegrationStatusBadge } from "./integration-status-badge";

export function IntegrationCard({ integration }: { integration: IntegrationPanelItem }) {
  return (
    <AdminCard className="p-5" hover>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-brand-purple-dark font-display text-base font-bold">
              {integration.name}
            </h3>
            <IntegrationStatusBadge status={integration.healthStatus} />
            {integration.envLabel && <AdminBadge tone="blue">{integration.envLabel}</AdminBadge>}
            <AdminBadge tone="purple">{integration.probeKind}</AdminBadge>
            {typeof integration.latencyMs === "number" && (
              <AdminBadge
                tone={
                  integration.latencyMs <= 400
                    ? "emerald"
                    : integration.latencyMs <= 1200
                      ? "amber"
                      : "rose"
                }
              >
                {integration.latencyMs} ms
              </AdminBadge>
            )}
            {!integration.isConfigured && <AdminBadge tone="slate">env vars faltantes</AdminBadge>}
          </div>
          <p className="text-brand-purple-dark/75 mt-1 text-sm">{integration.description}</p>
          {integration.healthDetail && (
            <p className="text-brand-muted mt-2 text-xs">
              <strong>Detalle:</strong> {integration.healthDetail}
            </p>
          )}
          {integration.action && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>{integration.action.startsWith("ACCIÓN") ? "" : "💡 "}</strong>
              {integration.action}
            </p>
          )}
          {integration.internalLinks && integration.internalLinks.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {integration.internalLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="border-brand-purple/15 bg-brand-purple/5 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors"
                >
                  {link.label}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ))}
            </div>
          )}
          <details className="mt-3">
            <summary className="text-brand-muted hover:text-brand-purple-dark cursor-pointer text-xs">
              Ver variables de entorno requeridas ({integration.envVarsRequired.length})
            </summary>
            <ul className="text-brand-muted mt-2 grid grid-cols-1 gap-1 font-mono text-[11px] sm:grid-cols-2">
              {integration.envVarsRequired.map((name) => {
                const present = Boolean(process.env[name]?.trim());
                return (
                  <li key={name} className="flex items-center gap-1.5">
                    {present ? (
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="h-3 w-3 flex-shrink-0 text-rose-500" />
                    )}
                    <span className={present ? "" : "text-rose-700"}>{name}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
        {integration.dashboardUrl && (
          <Link
            href={integration.dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            Abrir dashboard
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </AdminCard>
  );
}
