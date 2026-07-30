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
 * Healthchecks reales se hacen vía /api/health/* — esta página los
 * ejecuta server-side al cargar (force-dynamic).
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
import { isCatalogMode } from "@/lib/store-mode";

export const metadata: Metadata = {
  title: "Integraciones",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type IntegrationStatus = "ok" | "warn" | "fail" | "not-configured";

type Integration = {
  name: string;
  group: "infra" | "pago" | "envio" | "comunicacion" | "seguridad";
  description: string;
  envVarsRequired: string[];
  isConfigured: boolean;
  healthStatus: IntegrationStatus;
  healthDetail?: string;
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
      signal: AbortSignal.timeout(6000),
    });
    const latencyMs = Date.now() - start;
    if (!r.ok) return { status: "fail", detail: `HTTP ${r.status}`, latencyMs };
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

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4000";

  const [dbHealth, storageHealth, resendHealth] = await Promise.all([
    probeHealth(baseUrl, "/api/health/db"),
    probeHealth(baseUrl, "/api/health/storage"),
    probeHealth(baseUrl, "/api/health/resend"),
  ]);

  const supabaseConfigured = envConfigured([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
  ]);
  const wompiConfigured = envConfigured([
    "WOMPI_PUBLIC_KEY",
    "WOMPI_PRIVATE_KEY",
    "WOMPI_EVENTS_SECRET",
  ]);
  const aveonlineConfigured = envConfigured(["AVEONLINE_USUARIO", "AVEONLINE_CLAVE"]);
  const resendConfigured = envConfigured(["RESEND_API_KEY", "EMAIL_FROM"]);
  const turnstileConfigured = envConfigured([
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
  ]);
  const waConfigured = envConfigured(["NEXT_PUBLIC_WA_NUMBER"]);

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
      healthStatus: wompiConfigured ? "warn" : "not-configured",
      healthDetail: wompiConfigured
        ? "Healthcheck activo se cablea en Fase 2 (Checkout)."
        : "Pendiente: completar KYC en comercios.wompi.co y cargar keys.",
      docs: "/admin/auditoria",
      dashboardUrl: "https://comercios.wompi.co",
      acciones: "ACCIÓN HUMANA: completar KYC + cargar 4 keys + setear WOMPI_ENV=production",
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
      healthStatus: aveonlineConfigured ? "warn" : "not-configured",
      healthDetail: aveonlineConfigured
        ? "Cableado en checkout (cotización + guía contraentrega + tracking)."
        : "Pendiente: activar cuenta comercial + cargar usuario/clave.",
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
      healthStatus: waConfigured ? "ok" : "not-configured",
      // El número ACTIVO es el setting WA_NUMBER del CMS (Contenido → Ajustes
      // del sitio → WhatsApp); la env queda como fallback si el setting falta.
      healthDetail: waConfigured
        ? `Número activo: setting WA_NUMBER (Contenido → Ajustes del sitio → WhatsApp). Fallback env: ${process.env.NEXT_PUBLIC_WA_NUMBER}.`
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
      healthStatus: turnstileConfigured ? "ok" : "not-configured",
      healthDetail: turnstileConfigured
        ? "Configurado y activo en signup/newsletter."
        : "Pendiente: crear keys en Cloudflare dashboard.",
      dashboardUrl: "https://dash.cloudflare.com",
      acciones: turnstileConfigured
        ? undefined
        : "ACCIÓN HUMANA: crear Turnstile site + cargar siteKey + secretKey",
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

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Plug className="h-5 w-5" />}
        title="Integraciones"
        subtitle={
          <>
            {okCount} operativas · {notConfigured} sin configurar
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

        {(["infra", "pago", "envio", "comunicacion", "seguridad"] as const).map((group) => {
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
