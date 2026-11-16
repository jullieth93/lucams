import type { PanelStatus } from "@/lib/integration-health";

export const INTEGRATION_GROUPS = [
  "infra",
  "pago",
  "envio",
  "comunicacion",
  "seguridad",
  "ia",
] as const;

export type IntegrationGroup = (typeof INTEGRATION_GROUPS)[number];
export type IntegrationAvailability = "core" | "optional";
export type IntegrationConnectionMode = "credentials" | "oauth" | "none";
export type IntegrationProbeKind = "Sonda interna" | "API directa" | "Por solicitud / Estática";

export type IntegrationKey =
  "supabase" | "wompi" | "aveonline" | "resend" | "whatsapp" | "turnstile" | "gemini";

export type IntegrationLink = {
  label: string;
  href: string;
};

export type IntegrationDefinition = {
  key: IntegrationKey;
  name: string;
  shortName: string;
  group: IntegrationGroup;
  availability: IntegrationAvailability;
  connectionMode: IntegrationConnectionMode;
  enabledByDefault: boolean;
  dependencies: readonly IntegrationKey[];
  probeKind: IntegrationProbeKind;
  description: string;
  envVarsRequired: readonly string[];
  configurationEnvVars?: readonly string[];
  internalLinks?: readonly IntegrationLink[];
  dashboardUrl?: string;
  getAction?: (isConfigured: boolean) => string | undefined;
};

export type IntegrationRuntimeState = {
  configuration: "configured" | "not-configured";
  connection: "not-applicable" | "connected" | "disconnected";
  enabled: boolean;
  health: PanelStatus;
};

export type IntegrationPanelItem = IntegrationDefinition & {
  isConfigured: boolean;
  healthStatus: PanelStatus;
  healthDetail?: string;
  envLabel?: string;
  latencyMs?: number;
  action?: string;
};

export const INTEGRATION_GROUP_LABEL: Record<IntegrationGroup, string> = {
  infra: "Infraestructura",
  pago: "Pago",
  envio: "Envío",
  comunicacion: "Comunicación",
  seguridad: "Seguridad",
  ia: "IA (Estudio)",
};

export const INTEGRATION_REGISTRY: readonly IntegrationDefinition[] = [
  {
    key: "supabase",
    name: "Supabase — Base de datos + Auth + Storage",
    shortName: "Supabase (DB + Storage)",
    group: "infra",
    availability: "core",
    connectionMode: "credentials",
    enabledByDefault: true,
    dependencies: [],
    probeKind: "Sonda interna",
    description:
      "Postgres + autenticación + almacenamiento de imágenes. Núcleo del sistema. Sin Supabase nada funciona.",
    envVarsRequired: [
      "DATABASE_URL",
      "DIRECT_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
    ],
    configurationEnvVars: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
    ],
    internalLinks: [
      { label: "Salud técnica y SLOs", href: "/admin/observability" },
      { label: "Mediateca Storage", href: "/admin/contenido/mediateca" },
    ],
    dashboardUrl: "https://supabase.com/dashboard",
    getAction: () => "Si falla: revisar quota y estado en status.supabase.com",
  },
  {
    key: "wompi",
    name: "Wompi — Pasarela de pago",
    shortName: "Wompi API",
    group: "pago",
    availability: "core",
    connectionMode: "credentials",
    enabledByDefault: true,
    dependencies: ["supabase"],
    probeKind: "API directa",
    description: "Procesa pagos con tarjeta crédito/débito + PSE + Nequi + Bancolombia transfer.",
    envVarsRequired: [
      "WOMPI_PUBLIC_KEY",
      "WOMPI_PRIVATE_KEY",
      "WOMPI_EVENTS_SECRET",
      "WOMPI_INTEGRITY_SECRET",
      "WOMPI_ENV",
    ],
    configurationEnvVars: [
      "WOMPI_PUBLIC_KEY",
      "WOMPI_PRIVATE_KEY",
      "WOMPI_EVENTS_SECRET",
      "WOMPI_INTEGRITY_SECRET",
    ],
    internalLinks: [
      { label: "Resumen financiero y pagos", href: "/admin/finanzas" },
      { label: "Pedidos y cobros", href: "/admin/pedidos" },
    ],
    dashboardUrl: "https://comercios.wompi.co",
    getAction: (isConfigured) =>
      isConfigured
        ? "Si falla: revisar el dashboard de Wompi y que las 4 llaves correspondan al ambiente declarado en WOMPI_ENV (test ↔ sandbox, prod ↔ production)."
        : "ACCIÓN HUMANA: completar KYC + cargar las 4 llaves (pública, privada, events, integrity) + definir WOMPI_ENV=production",
  },
  {
    key: "aveonline",
    name: "Aveonline — Envíos Colombia",
    shortName: "Aveonline Auth",
    group: "envio",
    availability: "core",
    connectionMode: "credentials",
    enabledByDefault: true,
    dependencies: ["supabase"],
    probeKind: "API directa",
    description:
      "Cotiza y gestiona envíos con transportadoras aliadas (Servientrega, Coordinadora, TCC, Interrapidísimo, Envía y otras) + impresión de etiquetas + tracking.",
    envVarsRequired: [
      "AVEONLINE_USUARIO",
      "AVEONLINE_CLAVE",
      "AVEONLINE_ENV",
      "AVEONLINE_GENERATE_REAL",
    ],
    configurationEnvVars: ["AVEONLINE_USUARIO", "AVEONLINE_CLAVE"],
    internalLinks: [
      { label: "Webhooks de tracking", href: "/admin/integraciones/aveonline" },
      { label: "Transportadoras y tarifas", href: "/admin/envios" },
      { label: "Origen de despacho (PICKUP)", href: "/admin/contenido/paginas/global" },
    ],
    dashboardUrl: "https://app.aveonline.co",
    getAction: () =>
      "ACCIÓN HUMANA: cuenta comercial + AVEONLINE_USUARIO/CLAVE + AVEONLINE_ENV=production + AVEONLINE_GENERATE_REAL=true + SiteSettings de origen (PICKUP_* + BUSINESS_NIT)",
  },
  {
    key: "resend",
    name: "Resend — Email transaccional",
    shortName: "Resend API",
    group: "comunicacion",
    availability: "core",
    connectionMode: "credentials",
    enabledByDefault: true,
    dependencies: [],
    probeKind: "Sonda interna",
    description: "Envío de emails (signup, recuperación, confirmación pedido, newsletter).",
    envVarsRequired: ["RESEND_API_KEY", "EMAIL_FROM"],
    internalLinks: [
      { label: "32 plantillas y correo de prueba", href: "/admin/email-templates" },
      { label: "Salud de colas y rebotes", href: "/admin/observability" },
    ],
    dashboardUrl: "https://resend.com/dashboard",
    getAction: () => "Si emails no llegan: revisar DKIM/SPF/DMARC del dominio + bounces dashboard",
  },
  {
    key: "whatsapp",
    name: "WhatsApp — wa.me deeplinks",
    shortName: "WhatsApp (wa.me)",
    group: "comunicacion",
    availability: "optional",
    connectionMode: "none",
    enabledByDefault: true,
    dependencies: ["supabase"],
    probeKind: "Por solicitud / Estática",
    description:
      "Botones 'Hablar por WhatsApp' en PDP, soporte, post-pedido (sin API, solo links).",
    envVarsRequired: ["NEXT_PUBLIC_WA_NUMBER"],
    internalLinks: [
      { label: "Editar número y mensajes WA", href: "/admin/contenido/paginas/global" },
    ],
    getAction: (isConfigured) =>
      isConfigured
        ? undefined
        : "ACCIÓN HUMANA: revisar el número en Contenido → Ajustes del sitio → WhatsApp",
  },
  {
    key: "turnstile",
    name: "Cloudflare Turnstile — anti-bot",
    shortName: "Turnstile",
    group: "seguridad",
    availability: "core",
    connectionMode: "credentials",
    enabledByDefault: true,
    dependencies: [],
    probeKind: "Por solicitud / Estática",
    description: "CAPTCHA invisible en formularios públicos (signup, newsletter, contacto).",
    envVarsRequired: ["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"],
    dashboardUrl: "https://dash.cloudflare.com",
    getAction: (isConfigured) =>
      isConfigured ? undefined : "ACCIÓN HUMANA: crear Turnstile site + cargar siteKey + secretKey",
  },
  {
    key: "gemini",
    name: "Gemini — IA del Estudio",
    shortName: "Google Gemini",
    group: "ia",
    availability: "optional",
    connectionMode: "credentials",
    enabledByDefault: true,
    dependencies: [],
    probeKind: "API directa",
    description:
      "Sugerencias de diseño con IA en el Estudio (frase, color, composición según la ocasión). Si cae, el Estudio sigue funcionando pero el botón de ideas responde 'sin ideas' — en silencio.",
    envVarsRequired: ["GEMINI_API_KEY", "GEMINI_MODEL_PRIMARY", "GEMINI_MODEL_FALLBACK"],
    configurationEnvVars: ["GEMINI_API_KEY"],
    internalLinks: [{ label: "Plantillas del Estudio", href: "/admin/plantillas" }],
    dashboardUrl: "https://aistudio.google.com/apikey",
    getAction: (isConfigured) =>
      isConfigured
        ? "Si falla: revisar la key en Google AI Studio (¿revocada o sin cuota?) — el provider reintenta con el modelo de respaldo (features/ai/gemini-provider.ts) antes de rendirse."
        : "ACCIÓN HUMANA: crear API key en aistudio.google.com + cargar GEMINI_API_KEY (opcional: GEMINI_MODEL_PRIMARY/FALLBACK)",
  },
];

export function envConfigured(names: readonly string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

export function integrationConfigurationEnvVars(
  definition: IntegrationDefinition,
): readonly string[] {
  return definition.configurationEnvVars ?? definition.envVarsRequired;
}
