/*
 * Admin > Integraciones — estado en vivo de cada servicio externo +
 * configuración requerida.
 *
 * Visibilidad operativa para Lucy: si algo se rompe (Wompi, Resend,
 * Supabase, Aveonline, etc.) ella lo ve acá antes de que el cliente
 * reporte. Cada integración muestra:
 *   - Si está configurada (env vars presentes)
 *   - Si el healthcheck responde OK (donde aplica)
 *   - Acción humana requerida (qué hacer si falla)
 *
 * Healthchecks reales (CF-03): DB/Storage/Resend vía /api/health/* (self-fetch);
 * Wompi y Aveonline importando los probes REALES (lib/integration-health.ts —
 * mismas funciones que usan /api/health/wompi y /api/health/aveonline, sin
 * HTTP self-fetch), con try/catch + timeout: si la sonda falla el card muestra
 * fail y la página nunca se rompe. WhatsApp y Turnstile no tienen probe seguro:
 * se declaran "Sin verificación remota" en vez de un "ok" ficticio.
 * Gemini (N-19c) sí tiene probe seguro: listado de modelos (valida que la key
 * autentica) SIN generar contenido — cero cuota consumida.
 * La página es force-dynamic: cada carga vuelve a sondear.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Plug,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import {
  mapAveonlineHealth,
  mapGeminiHealth,
  mapWompiHealth,
  probeAveonlineSafely,
  probeGeminiSafely,
  probeWompiSafely,
  type PanelStatus,
} from "@/lib/integration-health";
import { isCatalogMode } from "@/lib/store-mode";
import { getTrustedSelfBaseUrl, vercelBypassHeaders } from "@/lib/origin";

export const metadata: Metadata = {
  title: "Integraciones",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type IntegrationStatus = PanelStatus;

type Integration = {
  name: string;
  group: "infra" | "pago" | "envio" | "comunicacion" | "seguridad" | "ia";
  description: string;
  envVarsRequired: string[];
  isConfigured: boolean;
  healthStatus: IntegrationStatus;
  healthDetail?: string;
  /** Ambiente declarado por la integración (sandbox/production/test), si aplica. */
  envLabel?: string;
  latencyMs?: number;
  docs?: string;
  dashboardUrl?: string;
  acciones?: string;
};

const GROUP_LABEL: Record<Integration["group"], string> = {
  infra: "Infraestructura",
  pago: "Pago",
  envio: "Envío",
  comunicacion: "Comunicación",
  seguridad: "Seguridad",
  ia: "IA (Estudio)",
};

function statusBadge(status: IntegrationStatus) {
  if (status === "ok")
    return (
      <AdminBadge tone="emerald">
        <CheckCircle2 className="mr-1 -ml-0.5 inline h-3 w-3" />
        Operativo
      </AdminBadge>
    );
  if (status === "warn")
    return (
      <AdminBadge tone="amber">
        <AlertTriangle className="mr-1 -ml-0.5 inline h-3 w-3" />
        Revisar
      </AdminBadge>
    );
  if (status === "fail")
    return (
      <AdminBadge tone="rose">
        <XCircle className="mr-1 -ml-0.5 inline h-3 w-3" />
        Caído
      </AdminBadge>
    );
  if (status === "unverified")
    return (
      <AdminBadge tone="slate">
        <HelpCircle className="mr-1 -ml-0.5 inline h-3 w-3" />
        Sin verificación remota
      </AdminBadge>
    );
  return (
    <AdminBadge tone="slate">
      <MinusCircle className="mr-1 -ml-0.5 inline h-3 w-3" />
      Sin configurar
    </AdminBadge>
  );
}

function envConfigured(names: string[]): boolean {
  return names.every((n) => !!process.env[n] && process.env[n]!.trim() !== "");
}

async function probeHealth(
  baseUrl: string,
  endpoint: string,
): Promise<{ status: IntegrationStatus; detail?: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const r = await fetch(`${baseUrl}${endpoint}`, {
      cache: "no-store",
      // Mismos guards que /api/health/all: `manual` porque un 3xx aquí es una
      // interposición (Deployment Protection de Vercel); seguirlo devolvía el
      // HTML del login y r.json() explotaba con "Unexpected token '<' ...".
      redirect: "manual",
      headers: vercelBypassHeaders(),
      signal: AbortSignal.timeout(6000),
    });
    const latencyMs = Date.now() - start;
    if (r.status >= 300 && r.status < 400) {
      return {
        status: "fail",
        detail: `HTTP ${r.status} — redirección inesperada (¿Deployment Protection?)`,
        latencyMs,
      };
    }
    if (!r.ok) return { status: "fail", detail: `HTTP ${r.status}`, latencyMs };
    const contentType = r.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      return {
        status: "fail",
        detail: `respuesta no-JSON (content-type: ${contentType.split(";")[0] || "desconocido"})`,
        latencyMs,
      };
    }
    const data = (await r.json()) as { status?: string; detail?: string };
    if (data.status === "ok") return { status: "ok", latencyMs };
    if (data.status === "skipped")
      return { status: "not-configured", detail: data.detail ?? "no configurado", latencyMs };
    if (data.status === "warn") return { status: "warn", detail: data.detail, latencyMs };
    return { status: "fail", detail: data.detail ?? "respuesta inesperada", latencyMs };
  } catch (err) {
    return {
      status: "fail",
      detail: err instanceof Error ? err.message.slice(0, 80) : "exception",
      latencyMs: Date.now() - start,
    };
  }
}

export default async function AdminIntegracionesPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  // Modo catálogo (Etapa 1): Wompi/Aveonline/Gemini están apagadas — el nav ya
  // oculta esta página; esto cierra también el acceso por URL directa.
  if (isCatalogMode()) redirect("/admin/dashboard");

  // ADR-062: base de self-fetch confiable (env del deployment), no spoofable.
  const baseUrl = getTrustedSelfBaseUrl();

  const supabaseConfigured = envConfigured([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
  ]);
  // Las 4 llaves que exige lib/wompi.ts (getWompiConfig) — antes el panel
  // chequeaba solo 3 y podía marcar "configurado" un Wompi inutilizable.
  const wompiConfigured = envConfigured([
    "WOMPI_PUBLIC_KEY",
    "WOMPI_PRIVATE_KEY",
    "WOMPI_EVENTS_SECRET",
    "WOMPI_INTEGRITY_SECRET",
  ]);
  const aveonlineConfigured = envConfigured(["AVEONLINE_USUARIO", "AVEONLINE_CLAVE"]);
  const resendConfigured = envConfigured(["RESEND_API_KEY", "EMAIL_FROM"]);
  const turnstileConfigured = envConfigured([
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
  ]);
  const waConfigured = envConfigured(["NEXT_PUBLIC_WA_NUMBER"]);
  const geminiConfigured = envConfigured(["GEMINI_API_KEY"]);

  // Wompi/Aveonline/Gemini: solo se sondea lo configurado — sin credenciales la
  // integración está NOT_CONFIGURED (no caída) y la sonda sería ruido.
  const productionDeployment = process.env.VERCEL_ENV === "production";
  const [dbHealth, storageHealth, resendHealth, wompiProbe, aveonlineProbe, geminiProbe] =
    await Promise.all([
      probeHealth(baseUrl, "/api/health/db"),
      probeHealth(baseUrl, "/api/health/storage"),
      probeHealth(baseUrl, "/api/health/resend"),
      wompiConfigured ? probeWompiSafely() : Promise.resolve(null),
      aveonlineConfigured ? probeAveonlineSafely() : Promise.resolve(null),
      geminiConfigured ? probeGeminiSafely() : Promise.resolve(null),
    ]);
  const wompiHealth = mapWompiHealth(wompiProbe, { productionDeployment });
  const aveonlineHealth = mapAveonlineHealth(aveonlineProbe, { productionDeployment });
  const geminiHealth = mapGeminiHealth(geminiProbe);

  const integrations: Integration[] = [
    {
      name: "Supabase — Base de datos + Auth + Storage",
      group: "infra",
      description:
        "Postgres + autenticación + almacenamiento de imágenes. Núcleo del sistema. Sin Supabase nada funciona.",
      envVarsRequired: [
        "DATABASE_URL",
        "DIRECT_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SECRET_KEY",
      ],
      isConfigured: supabaseConfigured,
      healthStatus: dbHealth.status === "ok" && storageHealth.status === "ok" ? "ok" : "fail",
      healthDetail:
        dbHealth.status !== "ok"
          ? `DB: ${dbHealth.detail ?? "fail"}`
          : storageHealth.status !== "ok"
            ? `Storage: ${storageHealth.detail ?? "fail"}`
            : `DB ${dbHealth.latencyMs}ms · Storage ${storageHealth.latencyMs}ms`,
      latencyMs: dbHealth.latencyMs,
      dashboardUrl: "https://supabase.com/dashboard",
      acciones: "Si falla: revisar quota Free + status.supabase.com",
    },
    {
      name: "Wompi — Pasarela de pago",
      group: "pago",
      description: "Procesa pagos con tarjeta crédito/débito + PSE + Nequi + Bancolombia transfer.",
      envVarsRequired: [
        "WOMPI_PUBLIC_KEY",
        "WOMPI_PRIVATE_KEY",
        "WOMPI_EVENTS_SECRET",
        "WOMPI_INTEGRITY_SECRET",
        "WOMPI_ENV",
      ],
      isConfigured: wompiConfigured,
      healthStatus: wompiHealth.status,
      healthDetail: wompiConfigured
        ? wompiHealth.detail
        : "Pendiente: completar KYC en comercios.wompi.co y cargar las 4 llaves.",
      envLabel: wompiHealth.envLabel,
      latencyMs: wompiHealth.latencyMs,
      docs: "/admin/auditoria",
      dashboardUrl: "https://comercios.wompi.co",
      acciones: wompiConfigured
        ? "Si falla: revisar el dashboard de Wompi y que las 4 llaves correspondan al ambiente declarado en WOMPI_ENV (test ↔ sandbox, prod ↔ production)."
        : "ACCIÓN HUMANA: completar KYC + cargar las 4 llaves (pública, privada, events, integrity) + setear WOMPI_ENV=production",
    },
    {
      name: "Aveonline — Envíos Colombia",
      group: "envio",
      description:
        "Cotiza y gestiona envíos con transportadoras aliadas (Servientrega, Coordinadora, TCC, Interrapidísimo, Envía y otras) + impresión de etiquetas + tracking.",
      // Credenciales por env; la dirección de ORIGEN (recogida) vive en SiteSettings
      // (PICKUP_* + BUSINESS_NIT), editable desde /admin, no en env.
      envVarsRequired: [
        "AVEONLINE_USUARIO",
        "AVEONLINE_CLAVE",
        "AVEONLINE_ENV",
        "AVEONLINE_GENERATE_REAL",
      ],
      isConfigured: aveonlineConfigured,
      healthStatus: aveonlineHealth.status,
      healthDetail: aveonlineConfigured
        ? aveonlineHealth.detail
        : "Pendiente: activar cuenta comercial + cargar usuario/clave.",
      envLabel: aveonlineHealth.envLabel,
      docs: "/admin/integraciones/aveonline",
      dashboardUrl: "https://app.aveonline.co",
      acciones:
        "ACCIÓN HUMANA: cuenta comercial + AVEONLINE_USUARIO/CLAVE + AVEONLINE_ENV=production + AVEONLINE_GENERATE_REAL=true + SiteSettings de origen (PICKUP_* + BUSINESS_NIT)",
    },
    {
      name: "Resend — Email transaccional",
      group: "comunicacion",
      description: "Envío de emails (signup, recuperación, confirmación pedido, newsletter).",
      envVarsRequired: ["RESEND_API_KEY", "EMAIL_FROM"],
      isConfigured: resendConfigured,
      healthStatus: resendHealth.status,
      healthDetail: resendConfigured
        ? (resendHealth.detail ?? `${resendHealth.latencyMs}ms`)
        : "Pendiente: crear cuenta Resend + cargar API key.",
      latencyMs: resendHealth.latencyMs,
      dashboardUrl: "https://resend.com/dashboard",
      acciones: "Si emails no llegan: revisar DKIM/SPF/DMARC del dominio + bounces dashboard",
    },
    {
      name: "WhatsApp — wa.me deeplinks",
      group: "comunicacion",
      description:
        "Botones 'Hablar por WhatsApp' en PDP, soporte, post-pedido (sin API, solo links).",
      envVarsRequired: ["NEXT_PUBLIC_WA_NUMBER"],
      isConfigured: waConfigured,
      // UNKNOWN_NOT_PROBED: wa.me no tiene probe seguro sin efectos laterales
      // (no se puede "pingear" un número sin iniciar un chat).
      healthStatus: waConfigured ? "unverified" : "not-configured",
      // El número ACTIVO es el setting WA_NUMBER del CMS (Contenido → Ajustes
      // del sitio → WhatsApp); la env queda como fallback si el setting falta.
      healthDetail: waConfigured
        ? `Sin verificación remota (wa.me no ofrece sonda sin iniciar un chat). Número activo: setting WA_NUMBER (Contenido → Ajustes del sitio → WhatsApp). Fallback env: ${process.env.NEXT_PUBLIC_WA_NUMBER}.`
        : "El número activo se edita en Contenido → Ajustes del sitio → WhatsApp. NEXT_PUBLIC_WA_NUMBER queda como fallback (formato wa.me).",
      acciones: waConfigured
        ? undefined
        : "ACCIÓN HUMANA: revisar el número en Contenido → Ajustes del sitio → WhatsApp",
    },
    {
      name: "Cloudflare Turnstile — anti-bot",
      group: "seguridad",
      description: "CAPTCHA invisible en formularios públicos (signup, newsletter, contacto).",
      envVarsRequired: ["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"],
      isConfigured: turnstileConfigured,
      // UNKNOWN_NOT_PROBED: la verificación real ocurre por-request (cada form
      // valida su token contra Cloudflare); sondear el siteverify sin un token
      // legítimo no prueba nada útil.
      healthStatus: turnstileConfigured ? "unverified" : "not-configured",
      healthDetail: turnstileConfigured
        ? "Sin verificación remota: Turnstile se valida por request en producción (cada formulario verifica su token contra Cloudflare). Activo en signup/newsletter."
        : "Pendiente: crear keys en Cloudflare dashboard.",
      dashboardUrl: "https://dash.cloudflare.com",
      acciones: turnstileConfigured
        ? undefined
        : "ACCIÓN HUMANA: crear Turnstile site + cargar siteKey + secretKey",
    },
    {
      name: "Gemini — IA del Estudio",
      group: "ia",
      description:
        "Sugerencias de diseño con IA en el Estudio (frase, color, composición según la ocasión). Si cae, el Estudio sigue funcionando pero el botón de ideas responde 'sin ideas' — en silencio.",
      envVarsRequired: ["GEMINI_API_KEY", "GEMINI_MODEL_PRIMARY", "GEMINI_MODEL_FALLBACK"],
      isConfigured: geminiConfigured,
      // Probe REAL acotado (N-19c): listado de modelos — valida que la key
      // autentica SIN generar contenido (generateContent consumiría cuota).
      healthStatus: geminiHealth.status,
      healthDetail: geminiConfigured
        ? geminiHealth.detail
        : "Pendiente: crear API key en Google AI Studio y cargar GEMINI_API_KEY.",
      latencyMs: geminiHealth.latencyMs,
      dashboardUrl: "https://aistudio.google.com/apikey",
      acciones: geminiConfigured
        ? "Si falla: revisar la key en Google AI Studio (¿revocada o sin cuota?) — el provider reintenta con el modelo de respaldo (features/ai/gemini-provider.ts) antes de rendirse."
        : "ACCIÓN HUMANA: crear API key en aistudio.google.com + cargar GEMINI_API_KEY (opcional: GEMINI_MODEL_PRIMARY/FALLBACK)",
    },
  ];

  const grouped = integrations.reduce<Record<Integration["group"], Integration[]>>(
    (acc, item) => {
      (acc[item.group] ??= []).push(item);
      return acc;
    },
    {} as Record<Integration["group"], Integration[]>,
  );

  const okCount = integrations.filter((i) => i.healthStatus === "ok").length;
  const failCount = integrations.filter((i) => i.healthStatus === "fail").length;
  const notConfigured = integrations.filter((i) => i.healthStatus === "not-configured").length;
  const unverified = integrations.filter((i) => i.healthStatus === "unverified").length;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Plug className="h-5 w-5" />}
        title="Integraciones"
        subtitle={
          <>
            {okCount} operativas · {notConfigured} sin configurar
            {unverified > 0 && <> · {unverified} sin verificación remota</>}
            {failCount > 0 && (
              <>
                {" · "}
                <strong className="text-rose-700">{failCount} con falla</strong>
              </>
            )}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Configuración" },
          { label: "Integraciones" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Qué ves acá?</strong> Estado real de los servicios externos que usa el sitio. Las
          acciones marcadas como <strong>ACCIÓN HUMANA</strong> son tareas que tú (o un superadmin)
          tienes que hacer en el dashboard del proveedor (no se hacen desde este panel). Refresca la
          página para volver a probar.
        </AdminNotice>

        {failCount > 0 && (
          <AdminNotice tone="error">
            <strong>Atención:</strong> hay {failCount} integración{failCount === 1 ? "" : "es"} con
            falla. Revisa el detalle abajo y consulta el dashboard correspondiente.
          </AdminNotice>
        )}

        {(["infra", "pago", "envio", "comunicacion", "seguridad", "ia"] as const).map((group) => {
          const items = grouped[group];
          if (!items || items.length === 0) return null;
          return (
            <section key={group}>
              <h2 className="text-brand-purple-dark/70 mb-2 text-xs font-bold tracking-wider uppercase">
                {GROUP_LABEL[group]}
              </h2>
              <div className="space-y-3">
                {items.map((i) => (
                  <AdminCard key={i.name} className="p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-brand-purple-dark font-display text-base font-bold">
                            {i.name}
                          </h3>
                          {statusBadge(i.healthStatus)}
                          {i.envLabel && <AdminBadge tone="blue">{i.envLabel}</AdminBadge>}
                          {!i.isConfigured && (
                            <AdminBadge tone="slate">env vars faltantes</AdminBadge>
                          )}
                        </div>
                        <p className="text-brand-purple-dark/75 mt-1 text-sm">{i.description}</p>
                        {i.healthDetail && (
                          <p className="text-brand-muted mt-2 text-xs">
                            <strong>Detalle:</strong> {i.healthDetail}
                          </p>
                        )}
                        {i.acciones && (
                          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            <strong>{i.acciones.startsWith("ACCIÓN") ? "" : "💡 "}</strong>
                            {i.acciones}
                          </p>
                        )}
                        {i.docs && (
                          <Link
                            href={i.docs}
                            className="text-brand-purple hover:text-brand-purple-dark mt-2 inline-flex items-center gap-1 text-xs font-semibold"
                          >
                            Ver detalle
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                        <details className="mt-3">
                          <summary className="text-brand-muted hover:text-brand-purple-dark cursor-pointer text-xs">
                            Ver variables de entorno requeridas ({i.envVarsRequired.length})
                          </summary>
                          <ul className="text-brand-muted mt-2 grid grid-cols-1 gap-1 font-mono text-[11px] sm:grid-cols-2">
                            {i.envVarsRequired.map((v) => {
                              const present = !!process.env[v] && process.env[v]!.trim() !== "";
                              return (
                                <li key={v} className="flex items-center gap-1.5">
                                  {present ? (
                                    <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-emerald-600" />
                                  ) : (
                                    <XCircle className="h-3 w-3 flex-shrink-0 text-rose-500" />
                                  )}
                                  <span className={present ? "" : "text-rose-700"}>{v}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      </div>
                      {i.dashboardUrl && (
                        <Link
                          href={i.dashboardUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
                        >
                          Abrir dashboard
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </AdminCard>
                ))}
              </div>
            </section>
          );
        })}

        <AdminCard className="p-5">
          <h3 className="text-brand-purple-dark font-display mb-2 text-base font-bold">
            Healthcheck unificado
          </h3>
          <p className="text-brand-purple-dark/75 text-sm">
            Para monitores externos (UptimeRobot, BetterStack), apuntá a{" "}
            <code className="bg-brand-purple/10 rounded px-1.5 py-0.5 font-mono text-xs">
              /api/health/all
            </code>{" "}
            — devuelve <code>200 OK</code> si todo lo crítico (DB + Storage) está sano, o{" "}
            <code>503</code> si algo crítico falla.
          </p>
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}
