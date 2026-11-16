import type { Metadata } from "next";
import { HeartPulse, Plug } from "lucide-react";
import { AdminButton, AdminPage, AdminPageHeader } from "@/components/admin-page";
import {
  IntegrationsPanel,
  type IntegrationLatencyRow,
} from "@/components/admin/integrations/integrations-panel";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  envConfigured,
  INTEGRATION_REGISTRY,
  integrationConfigurationEnvVars,
  type IntegrationKey,
  type IntegrationPanelItem,
} from "@/features/integrations/registry";
import {
  mapAveonlineHealth,
  mapGeminiHealth,
  mapWompiHealth,
  probeAveonlineSafely,
  probeGeminiSafely,
  probeWompiSafely,
  type PanelStatus,
} from "@/lib/integration-health";
import { getTrustedSelfBaseUrl, vercelBypassHeaders } from "@/lib/origin";

export const metadata: Metadata = {
  title: "Integraciones",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function probeHealth(
  baseUrl: string,
  endpoint: string,
): Promise<{ status: PanelStatus; detail?: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      cache: "no-store",
      redirect: "manual",
      headers: vercelBypassHeaders(),
      signal: AbortSignal.timeout(6000),
    });
    const latencyMs = Date.now() - start;
    if (response.status >= 300 && response.status < 400) {
      return {
        status: "fail",
        detail: `HTTP ${response.status} — redirección inesperada (¿Deployment Protection?)`,
        latencyMs,
      };
    }
    if (!response.ok) {
      return { status: "fail", detail: `HTTP ${response.status}`, latencyMs };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      return {
        status: "fail",
        detail: `respuesta no-JSON (content-type: ${contentType.split(";")[0] || "desconocido"})`,
        latencyMs,
      };
    }
    const data = (await response.json()) as { status?: string; detail?: string };
    if (data.status === "ok") return { status: "ok", latencyMs };
    if (data.status === "skipped") {
      return { status: "not-configured", detail: data.detail ?? "no configurado", latencyMs };
    }
    if (data.status === "warn") return { status: "warn", detail: data.detail, latencyMs };
    return { status: "fail", detail: data.detail ?? "respuesta inesperada", latencyMs };
  } catch (error) {
    return {
      status: "fail",
      detail: error instanceof Error ? error.message.slice(0, 80) : "exception",
      latencyMs: Date.now() - start,
    };
  }
}

async function probeAveonlineTimed() {
  const start = Date.now();
  const probe = await probeAveonlineSafely();
  return { probe, latencyMs: Date.now() - start };
}

export default async function AdminIntegracionesPage() {
  await requireRole(ADMIN_ROLE_SETS.SUPER);

  const baseUrl = getTrustedSelfBaseUrl();
  const configured = Object.fromEntries(
    INTEGRATION_REGISTRY.map((definition) => [
      definition.key,
      envConfigured(integrationConfigurationEnvVars(definition)),
    ]),
  ) as Record<IntegrationKey, boolean>;

  const productionDeployment = process.env.VERCEL_ENV === "production";
  const [dbHealth, storageHealth, resendHealth, wompiProbe, aveonlineTimed, geminiProbe] =
    await Promise.all([
      probeHealth(baseUrl, "/api/health/db"),
      probeHealth(baseUrl, "/api/health/storage"),
      probeHealth(baseUrl, "/api/health/resend"),
      configured.wompi ? probeWompiSafely() : Promise.resolve(null),
      configured.aveonline ? probeAveonlineTimed() : Promise.resolve(null),
      configured.gemini ? probeGeminiSafely() : Promise.resolve(null),
    ]);
  const wompiHealth = mapWompiHealth(wompiProbe, { productionDeployment });
  const aveonlineHealth = mapAveonlineHealth(aveonlineTimed?.probe ?? null, {
    productionDeployment,
  });
  const geminiHealth = mapGeminiHealth(geminiProbe);

  const integrations: IntegrationPanelItem[] = INTEGRATION_REGISTRY.map((definition) => {
    const isConfigured = configured[definition.key];
    const item: IntegrationPanelItem = {
      ...definition,
      isConfigured,
      healthStatus: "not-configured",
      action: definition.getAction?.(isConfigured),
    };

    switch (definition.key) {
      case "supabase":
        item.healthStatus =
          dbHealth.status === "ok" && storageHealth.status === "ok" ? "ok" : "fail";
        item.healthDetail =
          dbHealth.status !== "ok"
            ? `DB: ${dbHealth.detail ?? "fail"}`
            : storageHealth.status !== "ok"
              ? `Storage: ${storageHealth.detail ?? "fail"}`
              : `DB ${dbHealth.latencyMs}ms · Storage: ${storageHealth.latencyMs}ms`;
        item.latencyMs = dbHealth.latencyMs;
        break;
      case "wompi":
        item.healthStatus = wompiHealth.status;
        item.healthDetail = isConfigured
          ? wompiHealth.detail
          : "Pendiente: completar KYC en comercios.wompi.co y cargar las 4 llaves.";
        item.envLabel = wompiHealth.envLabel;
        item.latencyMs = wompiHealth.latencyMs;
        break;
      case "aveonline":
        item.healthStatus = aveonlineHealth.status;
        item.healthDetail = isConfigured
          ? aveonlineHealth.detail
          : "Pendiente: activar cuenta comercial + cargar usuario/clave.";
        item.envLabel = aveonlineHealth.envLabel;
        item.latencyMs = aveonlineTimed?.latencyMs;
        break;
      case "resend":
        item.healthStatus = resendHealth.status;
        item.healthDetail = isConfigured
          ? (resendHealth.detail ?? `${resendHealth.latencyMs}ms`)
          : "Pendiente: crear cuenta Resend + cargar API key.";
        item.latencyMs = resendHealth.latencyMs;
        break;
      case "whatsapp":
        item.healthStatus = isConfigured ? "unverified" : "not-configured";
        item.healthDetail = isConfigured
          ? `Sin verificación remota (wa.me no ofrece sonda sin iniciar un chat). Número activo: setting WA_NUMBER (Contenido → Ajustes del sitio → WhatsApp). Fallback env: ${process.env.NEXT_PUBLIC_WA_NUMBER}.`
          : "El número activo se edita en Contenido → Ajustes del sitio → WhatsApp. NEXT_PUBLIC_WA_NUMBER queda como fallback (formato wa.me).";
        break;
      case "turnstile":
        item.healthStatus = isConfigured ? "unverified" : "not-configured";
        item.healthDetail = isConfigured
          ? "Sin verificación remota: Turnstile se valida por request en producción (cada formulario verifica su token contra Cloudflare). Activo en signup/newsletter."
          : "Pendiente: crear keys en Cloudflare dashboard.";
        break;
      case "gemini":
        item.healthStatus = geminiHealth.status;
        item.healthDetail = isConfigured
          ? geminiHealth.detail
          : "Pendiente: crear API key en Google AI Studio y cargar GEMINI_API_KEY.";
        item.latencyMs = geminiHealth.latencyMs;
        break;
    }

    return item;
  });

  const latencyRows = [
    { key: "db", label: "Supabase Postgres", ms: dbHealth.latencyMs, status: dbHealth.status },
    {
      key: "storage",
      label: "Supabase Storage",
      ms: storageHealth.latencyMs,
      status: storageHealth.status,
    },
    ...(configured.wompi
      ? [
          {
            key: "wompi",
            label: "Wompi API",
            ms: wompiHealth.latencyMs,
            status: wompiHealth.status,
          },
        ]
      : []),
    ...(configured.aveonline
      ? [
          {
            key: "aveonline",
            label: "Aveonline Auth",
            ms: aveonlineTimed?.latencyMs,
            status: aveonlineHealth.status,
          },
        ]
      : []),
    ...(configured.resend
      ? [
          {
            key: "resend",
            label: "Resend API",
            ms: resendHealth.latencyMs,
            status: resendHealth.status,
          },
        ]
      : []),
    ...(configured.gemini
      ? [
          {
            key: "gemini",
            label: "Google Gemini",
            ms: geminiHealth.latencyMs,
            status: geminiHealth.status,
          },
        ]
      : []),
  ].filter(
    (row): row is IntegrationLatencyRow => typeof row.ms === "number" && Number.isFinite(row.ms),
  );

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Plug className="h-5 w-5" />}
        title="Integraciones"
        subtitle={
          <>
            {okCount(integrations)} operativas
            {countByStatus(integrations, "warn") > 0 && (
              <> · {countByStatus(integrations, "warn")} por revisar</>
            )}
            {" · "}
            {countByStatus(integrations, "not-configured")} sin configurar
            {countByStatus(integrations, "unverified") > 0 && (
              <> · {countByStatus(integrations, "unverified")} sin verificación remota</>
            )}
            {countByStatus(integrations, "fail") > 0 && (
              <>
                {" · "}
                <strong className="text-rose-700">
                  {countByStatus(integrations, "fail")} con falla
                </strong>
              </>
            )}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Configuración" },
          { label: "Integraciones" },
        ]}
        actions={
          <AdminButton href="/admin/observability" variant="secondary" size="sm">
            <HeartPulse className="h-3.5 w-3.5" />
            Salud técnica y SLOs
          </AdminButton>
        }
      />
      <IntegrationsPanel
        integrations={integrations}
        latencyRows={latencyRows}
        productionDeployment={productionDeployment}
      />
    </AdminPage>
  );
}

function countByStatus(items: IntegrationPanelItem[], status: PanelStatus): number {
  return items.filter((item) => item.healthStatus === status).length;
}

function okCount(items: IntegrationPanelItem[]): number {
  return countByStatus(items, "ok");
}
