/*
 * AveonlineProvider — Implementación PLAN_CATALOG_V2 ADR-039.
 *
 * API legacy PHP con `tipo` discriminator — encapsulado bajo interface
 * limpia (ShippingProvider).
 *
 * Configuración split (decisión Lucy 2026-05-20):
 *   - Secretos técnicos en .env.local:
 *       AVEONLINE_USUARIO  — credencial plataforma
 *       AVEONLINE_CLAVE    — password
 *   - Business data en SiteSettings (admin/contenido/configuracion):
 *       PICKUP_CITY, PICKUP_DEPARTMENT, PICKUP_ADDRESS, PICKUP_PHONE,
 *       PICKUP_CONTACT_NAME, BUSINESS_NIT
 *   → Lucy edita los datos de recogida desde admin sin tocar código.
 */

import { CircuitBreaker } from "@/lib/circuit-breaker";
import { getSettingValue } from "@/lib/cms";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import type {
  PickupResult,
  ShipmentItem,
  ShippingAddress,
  ShippingProvider,
  ShippingQuote,
  ShippingResult,
  TrackingStatus,
  WebhookEvent,
} from "./provider";

const BASE_URL = "https://app.aveonline.co/api";

/**
 * Circuit breaker compartido para TODAS las llamadas a Aveonline (CONVENTIONS
 * §Resiliencia, threshold 5 / resetMs 30 s). El estado refleja "¿Aveonline está
 * alcanzable?" — es global al proveedor, así que un mismo breaker cubre auth,
 * cotización, generación de guía y tracking. Per-instancia en serverless
 * (mandato #11: sin Redis inicial); suficiente para nuestra escala.
 */
const aveonlineCB = new CircuitBreaker({ name: "aveonline", threshold: 5, resetMs: 30_000 });

/**
 * Wrapper único de red para Aveonline: timeout obligatorio (mandato "nunca un
 * fetch sin timeout") + circuit breaker + retry opcional con backoff.
 *
 * - `retry: true` SOLO para llamadas idempotentes (auth, cotización, listados,
 *   tracking). NUNCA para generar guía: reintentar podría crear guías duplicadas
 *   (llamada NO idempotente). El retry va POR FUERA del breaker
 *   (`withRetry(() => cb.exec(fetch))`) para que el breaker vea cada intento y,
 *   una vez abierto, `CircuitOpenError` (no reintentable) corte el loop de una.
 */
async function aveonlineFetch(
  url: string,
  init: RequestInit & { timeoutMs: number },
  opts: { retry?: boolean } = {},
): Promise<Response> {
  const call = () => aveonlineCB.exec(() => fetchWithTimeout(url, init));
  return opts.retry ? withRetry(call) : call();
}

/**
 * Valor declarado mínimo COP que Aveonline acepta (numbererror -5 si <10000).
 * Doc oficial: https://integraciones.aveonline.co/docs/nacional/cotizacion/
 */
const MIN_DECLARED_VALUE_COP = 10000;

/**
 * Credenciales de la cuenta DEMO pública que Aveonline documenta como ambiente
 * de pruebas (no existe sandbox dedicado — opera contra producción pero sin
 * facturar mientras `bloquegenerarguia=0`). Doc:
 * https://integraciones.aveonline.co/docs/nacional/autenticacion/
 *
 * idempresa = 15289 (Demo - Integracion, servicio AVEONLINE COURIER).
 * 7 transportadoras habilitadas: 99MINUTOS, COORDINADORA MERCANTIL, ENVIA,
 * GO ENVIOS, INTERRAPIDISIMO, SERVIENTREGA, TCC SA.
 */
const DEMO_CREDENTIALS = {
  usuario: "demointegracion",
  clave: "demointegra2021",
} as const;

/**
 * Determina si estamos en modo prueba según `AVEONLINE_ENV`.
 * - `test` (default si no se configura): usa cuenta demo pública +
 *   `bloquegenerarguia=0` (no genera guía real, no factura).
 * - `production`: usa AVEONLINE_USUARIO + AVEONLINE_CLAVE del .env +
 *   `bloquegenerarguia=1` (genera guía real, factura).
 *
 * Permite probar end-to-end el flow checkout sin riesgo de cobros indebidos.
 */
function isProductionEnv(): boolean {
  return process.env.AVEONLINE_ENV === "production";
}

/**
 * Normaliza ciudad+depto al formato que Aveonline espera: `CIUDAD(DEPTO)` UPPERCASE
 * sin tildes. Ej:
 *   "Bogotá D.C." + "Bogotá D.C." → "BOGOTA(CUNDINAMARCA)"
 *   "Medellín" + "Antioquia" → "MEDELLIN(ANTIOQUIA)"
 *
 * Verificado contra `listadociudades.json` oficial de Aveonline
 * (2026-05-21): Bogotá aparece como `BOGOTA(CUNDINAMARCA)`, NO como
 * `BOGOTA D.C.(BOGOTA D.C.)`. Aveonline trata históricamente Bogotá
 * como parte de Cundinamarca aunque DANE divipola la considere depto propio.
 */
function formatAveonlineCity(city: string, department: string): string {
  // 1) Quitar tildes
  const noTilde = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // 2) Quitar "D.C." con o sin espacios/puntos a los lados, sin requerir \b final
  //    (los puntos no satisfacen word boundary contra fin de string).
  const noDc = (s: string) => s.replace(/\s*D\.?\s*C\.?\s*/gi, " ");
  // 3) Limpiar espacios + uppercase
  const strip = (s: string) => noDc(noTilde(s)).replace(/\s+/g, " ").trim().toUpperCase();

  let cityClean = strip(city);
  let deptClean = strip(department);

  // Mapping especial Bogotá → Cundinamarca (formato Aveonline)
  if (cityClean === "BOGOTA" || deptClean === "BOGOTA") {
    cityClean = "BOGOTA";
    deptClean = "CUNDINAMARCA";
  }

  return `${cityClean}(${deptClean})`;
}

type CachedToken = { token: string; idempresa: number; expiresAt: number };
type CachedCarriers = { items: Array<{ id: number; text: string }>; expiresAt: number };
type CachedAgents = {
  items: Array<{ id: number; nombre: string; direccion: string; principal: boolean }>;
  expiresAt: number;
};

let tokenCache: CachedToken | null = null;
let carriersCache: CachedCarriers | null = null;
let agentsCache: CachedAgents | null = null;

/**
 * Lista agentes (puntos de despacho) habilitados en la cuenta + cachea 24h.
 * Aveonline REQUIERE idagente válido en generarGuia2 — sin él responde
 * "No se puede generar la guia" (verificado 2026-05-22).
 *
 * Doc: https://integraciones.aveonline.co/docs/nacional/agentes/crearUsuarioAgente/
 */
async function listEnabledAgents() {
  const now = Date.now();
  if (agentsCache && agentsCache.expiresAt > now) return agentsCache.items;
  const { token, idempresa } = await getAuthToken();
  const res = await aveonlineFetch(
    `${BASE_URL}/comunes/v1.0/agentes.php`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "listarAgentesPorEmpresaAuth", token, idempresa }),
      timeoutMs: 5000,
    },
    { retry: true },
  );
  if (!res.ok) throw new Error(`Aveonline listarAgentes fail HTTP ${res.status}`);
  const data = (await res.json()) as {
    status?: string;
    agentes?: Array<{
      id?: number;
      nombre?: string;
      direccion?: string;
      principal?: string;
    }>;
  } | null;
  const items = (data?.agentes ?? []).map((a) => ({
    id: Number(a.id),
    nombre: String(a.nombre ?? ""),
    direccion: String(a.direccion ?? ""),
    principal: (a.principal ?? "").toUpperCase() === "SI",
  }));
  agentsCache = { items, expiresAt: now + 24 * 60 * 60_000 };
  logger.info({
    event: "shipping.aveonline.agents_refresh",
    count: items.length,
    principal: items.find((a) => a.principal)?.nombre ?? null,
  });
  return items;
}

/**
 * Resuelve el idagente a usar. Prioriza el agente con `principal: SI`,
 * sino usa el primero de la lista. Lanza error si la cuenta no tiene
 * ninguno (admin debe crear uno en dashboard Aveonline).
 */
async function resolveDefaultAgentId(): Promise<string> {
  const agents = await listEnabledAgents();
  if (agents.length === 0) {
    throw new Error(
      "Aveonline: la cuenta NO tiene agentes (puntos de despacho) registrados. " +
        "Creá uno en https://app.aveonline.co/ → menú Agentes/Puntos de despacho.",
    );
  }
  const principal = agents.find((a) => a.principal);
  return String((principal ?? agents[0]).id);
}

/**
 * Lista transportadoras habilitadas para la cuenta + cachea 24h.
 * Sirve para resolver carrier-name → idtransportador cuando el quoteId
 * original no está persistido (saga post-pago).
 */
async function listEnabledCarriers(): Promise<Array<{ id: number; text: string }>> {
  const now = Date.now();
  if (carriersCache && carriersCache.expiresAt > now) {
    return carriersCache.items;
  }
  const { token, idempresa } = await getAuthToken();
  const res = await aveonlineFetch(
    `${BASE_URL}/box/v1.0/transportadora.php`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "listarTransportadorasPorEmpresa", token, id: idempresa }),
      timeoutMs: 5000,
    },
    { retry: true },
  );
  if (!res.ok) {
    throw new Error(`Aveonline listarTransportadorasPorEmpresa fail HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    status?: string;
    transportadoras?: Array<{ id: number; text: string }>;
  };
  const items = data.transportadoras ?? [];
  carriersCache = { items, expiresAt: now + 24 * 60 * 60_000 }; // 24h
  logger.info({
    event: "shipping.aveonline.carriers_refresh",
    count: items.length,
  });
  return items;
}

/**
 * Normaliza un carrier-name a slug comparable: lowercase + sin espacios +
 * sin tildes. Ej: "COORDINADORA MERCANTIL" → "coordinadoramercantil";
 * "coordinadora-mercantil" → "coordinadoramercantil".
 */
function normalizeCarrierName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Resuelve carrier slug/name → idtransportador llamando a
 * listEnabledCarriers. Si no encuentra match exacto, intenta substring.
 * Lanza error si no hay match.
 */
async function resolveCarrierId(carrierNameOrSlug: string): Promise<string> {
  const target = normalizeCarrierName(carrierNameOrSlug);
  const carriers = await listEnabledCarriers();
  // Match exacto primero
  const exact = carriers.find((c) => normalizeCarrierName(c.text) === target);
  if (exact) return String(exact.id);
  // Substring fallback (ej. "coordinadora" matchea "COORDINADORA MERCANTIL")
  const partial = carriers.find(
    (c) =>
      normalizeCarrierName(c.text).startsWith(target) ||
      target.startsWith(normalizeCarrierName(c.text)),
  );
  if (partial) return String(partial.id);
  throw new Error(
    `Aveonline: carrier "${carrierNameOrSlug}" no está habilitado en esta cuenta. ` +
      `Habilitados: ${carriers.map((c) => c.text).join(", ")}`,
  );
}

// ─── Webhook management (Aveonline AveCRM) ────────────────────────────────
// Aveonline expone 3 endpoints en `avestock/api/` para que el cliente
// registre/liste/elimine webhooks de notificación de cambios de estado.
// Doc: https://integraciones.aveonline.co/docs/avecrm/crearWebhook/
//
// Como NO hay HMAC, mitigamos con `param1_value=<secret>` que Aveonline
// envía en cada request. El receptor valida `?secret=<X>` o header.

const AVECRM_BASE = "https://app.aveonline.co/avestock/api";

/** Registra (o re-registra) un webhook en Aveonline para esta cuenta. */
export async function createAveonlineWebhook(input: {
  url: string;
  secret: string;
  extra?: Record<string, string>;
}): Promise<{ ok: boolean; message: string; raw: unknown }> {
  const { idempresa } = await getAuthToken();
  const body: Record<string, unknown> = {
    tipo: "authave",
    empresa: idempresa,
    url: input.url.slice(0, 500),
    param1_name: "secret",
    param1_value: input.secret.slice(0, 255),
  };
  if (input.extra) {
    Object.entries(input.extra)
      .slice(0, 3)
      .forEach(([k, v], i) => {
        body[`param${i + 2}_name`] = k.slice(0, 50);
        body[`param${i + 2}_value`] = String(v).slice(0, 255);
      });
  }
  const res = await aveonlineFetch(`${AVECRM_BASE}/createWebhook.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 8000,
  });
  if (!res.ok) {
    throw new Error(`Aveonline createWebhook HTTP ${res.status}`);
  }
  const data = (await res.json()) as { success?: boolean; messages?: string; message?: string };
  return {
    ok: Boolean(data.success),
    message: data.messages ?? data.message ?? "",
    raw: data,
  };
}

/** Lista webhooks registrados para la cuenta. */
export async function listAveonlineWebhooks(): Promise<{
  items: Array<{ url?: string; id?: string | number; [k: string]: unknown }>;
  raw: unknown;
}> {
  const { idempresa } = await getAuthToken();
  const res = await aveonlineFetch(
    `${AVECRM_BASE}/listWebhook.php`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "authave", empresa: idempresa }),
      timeoutMs: 8000,
    },
    { retry: true },
  );
  if (!res.ok) return { items: [], raw: { error: `HTTP ${res.status}` } };
  const data = (await res.json()) as {
    webhooks?: Array<Record<string, unknown>>;
    data?: Array<Record<string, unknown>>;
  };
  const items = Array.isArray(data?.webhooks)
    ? data.webhooks
    : Array.isArray(data?.data)
      ? data.data
      : [];
  return { items: items as { url?: string; id?: string | number }[], raw: data };
}

/** Elimina webhook por URL. */
export async function deleteAveonlineWebhook(url: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const { idempresa } = await getAuthToken();
  const res = await aveonlineFetch(`${AVECRM_BASE}/deleteWebhook.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "authave", empresa: idempresa, url }),
    timeoutMs: 8000,
  });
  if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
  const data = (await res.json()) as { success?: boolean; messages?: string };
  return { ok: Boolean(data.success), message: data.messages ?? "" };
}

async function getAuthToken(): Promise<{ token: string; idempresa: number }> {
  const now = Date.now();
  // Refresh con 5 min de buffer antes de expirar
  if (tokenCache && tokenCache.expiresAt > now + 5 * 60_000) {
    return { token: tokenCache.token, idempresa: tokenCache.idempresa };
  }

  // En modo test usa la cuenta demo pública (sin requerir env vars).
  // En production usa AVEONLINE_USUARIO + AVEONLINE_CLAVE del .env.
  const isProd = isProductionEnv();
  const usuario = isProd ? process.env.AVEONLINE_USUARIO : DEMO_CREDENTIALS.usuario;
  const clave = isProd ? process.env.AVEONLINE_CLAVE : DEMO_CREDENTIALS.clave;
  if (!usuario || !clave) {
    throw new Error(
      isProd
        ? "AVEONLINE_USUARIO + AVEONLINE_CLAVE no configurados (modo production). Ver ADR-039 + .env.example."
        : "Aveonline modo test: credenciales demo no disponibles (revisar DEMO_CREDENTIALS hardcoded).",
    );
  }

  const res = await aveonlineFetch(
    `${BASE_URL}/comunes/v1.0/autenticarusuario.php`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "auth", usuario, clave }),
      timeoutMs: 5000,
    },
    { retry: true },
  );
  if (!res.ok) throw new Error(`Aveonline auth fail HTTP ${res.status}`);
  const data = (await res.json()) as {
    status: string;
    token?: string;
    cuentas?: Array<{ usuarios: Array<{ id: number }> }>;
  };
  if (data.status !== "ok" || !data.token || !data.cuentas?.[0]?.usuarios?.[0]) {
    throw new Error("Aveonline auth: respuesta inválida");
  }
  const idempresa = data.cuentas[0].usuarios[0].id;
  tokenCache = {
    token: data.token,
    idempresa,
    expiresAt: now + 60 * 60_000, // 1h vigencia documentada
  };
  logger.info({
    event: "shipping.aveonline.auth_refresh",
    idempresa,
    env: isProd ? "production" : "test",
  });
  return { token: data.token, idempresa };
}

export class AveonlineProvider implements ShippingProvider {
  readonly name = "aveonline" as const;

  async quote(params: {
    origin: { city: string; department: string };
    destination: { city: string; department: string };
    items: ShipmentItem[];
    contraentrega: boolean;
  }): Promise<ShippingQuote[]> {
    const { token, idempresa } = await getAuthToken();
    // PR C (Lucy 2026-05-21): peso + dims REALES del item.weightGrams/widthCm/etc.
    // El caller (features/checkout/service.ts) los resuelve via
    // getEffectiveShippingDims(product, variant) y lanza error si faltan.
    // valorDeclarado forzado a mínimo Aveonline (10.000 COP) — sino devuelve numbererror -5.
    const productos = params.items.map((i) => ({
      alto: i.heightCm,
      ancho: i.widthCm,
      largo: i.depthCm,
      peso: Math.max(0.1, Math.round((i.weightGrams / 1000) * 10) / 10), // kg, 1 decimal
      unidades: i.qty,
      nombre: i.productSlug,
      valorDeclarado: Math.max(MIN_DECLARED_VALUE_COP, i.declaredValueCop),
    }));

    // Aveonline 2026-05-21: usar `cotizarDoble` (multi-carrier) en vez de `cotizar2`
    // (single-carrier). cotizar2 devolvía numbererror=999 cuando idtransportador no
    // estaba habilitado para la cuenta. cotizarDoble cotiza TODAS las habilitadas y
    // filtramos por numbererror='-0-' acá. Doc: docs/INTEGRATIONS_AVEONLINE.md §3.
    // Ciudad UPPERCASE con formato `CIUDAD(DEPTO)` — sino numbererror=-1 o -2.
    const origenFmt = formatAveonlineCity(params.origin.city, params.origin.department);
    const destinoFmt = formatAveonlineCity(params.destination.city, params.destination.department);

    const res = await aveonlineFetch(
      `${BASE_URL}/nal/v1.0/generarGuiaTransporteNacional.php`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "cotizarDoble",
          access: "",
          token,
          idempresa,
          origen: origenFmt,
          destino: destinoFmt,
          productos,
          contraentrega: params.contraentrega ? 1 : 0,
          contraentregaPayment: 0,
          valorrecaudo: 0,
          valorMinimo: 0,
          idasumecosto: 0,
          plugin: "lucamsshop",
        }),
        timeoutMs: 5000,
      },
      { retry: true },
    );
    if (!res.ok) throw new Error(`Aveonline quote fail HTTP ${res.status}`);

    // Schema completo (Aveonline devuelve strings donde deberían ser numbers — parseo defensivo).
    const data = (await res.json()) as {
      status?: string;
      message?: string;
      cotizaciones?: Array<{
        numbererror?: string;
        dataerror?: string;
        codTransportadora?: string;
        nombreTransportadora?: string;
        total?: number;
        diasentrega?: number | string;
      }>;
    };

    const all = data.cotizaciones ?? [];
    const ok = all.filter((c) => c.numbererror === "-0-");
    const failed = all.filter((c) => c.numbererror !== "-0-");

    // Log estructurado: si todas fallaron, capturamos numbererror+dataerror para
    // que admin vea la causa exacta en /admin/logs (con stdbuf line-buffer).
    if (ok.length === 0 && failed.length > 0) {
      logger.warn({
        event: "shipping.aveonline.quote.all_failed",
        origen: origenFmt,
        destino: destinoFmt,
        totalCotizaciones: all.length,
        errores: failed.slice(0, 8).map((c) => ({
          carrier: c.nombreTransportadora,
          code: c.numbererror,
          msg: c.dataerror?.slice(0, 160),
        })),
      });
      throw new Error(
        `Aveonline: ninguna transportadora cubre ${destinoFmt} desde ${origenFmt} para los productos del carrito. ` +
          `Verificá cobertura o contactá soporte.`,
      );
    }

    if (ok.length > 0 && failed.length > 0) {
      logger.info({
        event: "shipping.aveonline.quote.partial",
        ok: ok.length,
        failed: failed.length,
        failedCarriers: failed.map((c) => c.nombreTransportadora),
      });
    }

    return ok.map((c) => ({
      carrier: (c.nombreTransportadora ?? "carrier").toLowerCase().replace(/\s+/g, "-"),
      carrierName: c.nombreTransportadora ?? "Transportadora",
      fleteCop: Math.round((c.total ?? 0) * 100), // pasamos a centavos
      deliveryDays: Number(c.diasentrega) || 0,
      contraentrega: params.contraentrega,
      quoteId: c.codTransportadora ?? "",
    }));
  }

  async createShipment(params: {
    carrier: string;
    quoteId?: string;
    pickup: ShippingAddress;
    delivery: ShippingAddress;
    items: ShipmentItem[];
    contraentrega: boolean;
    valorRecaudoCop?: number;
    orderId: string;
  }): Promise<ShippingResult> {
    // Contrato Aveonline: docs/nacional/generacionGuia
    // Mismo endpoint que cotización pero tipo="generarGuia2".
    // idtransportador viene del quoteId que cotización devolvió como codTransportadora.
    const { token, idempresa } = await getAuthToken();
    // En modo test usa creds demo, en prod usa env vars.
    const isProd = isProductionEnv();
    const usuario = isProd ? process.env.AVEONLINE_USUARIO! : DEMO_CREDENTIALS.usuario;
    const clave = isProd ? process.env.AVEONLINE_CLAVE! : DEMO_CREDENTIALS.clave;

    // Resolver idtransportador: si caller pasó quoteId (del flow inmediato
    // post-checkout) lo usamos; sino lo derivamos del carrier name via
    // listEnabledCarriers (cacheado 24h). Esto permite que la saga post-pago
    // funcione aunque el quoteId no se haya persistido en Order.
    const idtransportador = params.quoteId ?? (await resolveCarrierId(params.carrier));

    // Resolver idagente (REQUERIDO por Aveonline — sin él responde
    // "No se puede generar la guia"). Cacheado 24h.
    const idagente = await resolveDefaultAgentId();

    // Business data se lee de SiteSettings (admin/contenido/configuracion).
    // params.pickup tiene precedencia si caller los pasa explícitos (útil para
    // testing o overrides). Si vienen vacíos, fallback a settings.
    const [settingNit, settingCity, settingDept, settingAddress, settingPhone, settingContact] =
      await Promise.all([
        getSettingValue("BUSINESS_NIT", "0000000000"),
        getSettingValue("PICKUP_CITY", ""),
        getSettingValue("PICKUP_DEPARTMENT", ""),
        getSettingValue("PICKUP_ADDRESS", ""),
        getSettingValue("PICKUP_PHONE", ""),
        getSettingValue("PICKUP_CONTACT_NAME", ""),
      ]);

    const pickupCity = params.pickup.city || settingCity;
    const pickupDept = params.pickup.department || settingDept;
    const pickupAddress = params.pickup.address || settingAddress;
    const pickupPhone = params.pickup.phone || settingPhone;
    const pickupContact = params.pickup.contactName || settingContact;

    // Validación: si falta cualquier dato de pickup, error claro apuntando
    // al admin (no a env vars).
    const missing: string[] = [];
    if (!pickupCity) missing.push("PICKUP_CITY");
    if (!pickupDept) missing.push("PICKUP_DEPARTMENT");
    if (!pickupAddress) missing.push("PICKUP_ADDRESS");
    if (!pickupPhone) missing.push("PICKUP_PHONE");
    if (!pickupContact) missing.push("PICKUP_CONTACT_NAME");
    if (missing.length > 0) {
      throw new Error(
        `Aveonline createShipment: faltan datos de recogida [${missing.join(", ")}]. ` +
          `Configurálos en /admin/contenido/configuracion (categoría 'Negocio').`,
      );
    }

    // PR C — dims REALES de cada producto/variant (caller las pasó en ShipmentItem).
    const productos = params.items.map((i) => ({
      alto: String(i.heightCm),
      ancho: String(i.widthCm),
      largo: String(i.depthCm),
      peso: String(Math.max(0.1, Math.round((i.weightGrams / 1000) * 10) / 10)), // kg, 1 decimal
      unidades: i.qty,
      nombre: i.productSlug,
      ref: i.productSlug,
      valorDeclarado: String(i.declaredValueCop),
    }));

    const valorRecaudo = params.contraentrega ? (params.valorRecaudoCop ?? 0) : 0;
    const totalDeclarado = params.items.reduce((acc, i) => acc + i.declaredValueCop * i.qty, 0);

    const body = {
      tipo: "generarGuia2",
      token,
      idempresa,
      codigo: usuario,
      dsclavex: clave,
      // Origen (remitente = nosotros) — datos de SiteSettings
      origen: formatAveonlineCity(pickupCity, pickupDept),
      dsdirre: pickupAddress,
      dsbarrioo: "", // opcional Aveonline; usaríamos un SiteSetting PICKUP_BARRIO si llega
      dsnitre: settingNit,
      dsnombre: pickupContact,
      dstelre: pickupPhone,
      dscelularre: pickupPhone,
      dscorreopre: process.env.EMAIL_FROM?.match(/<(.+?)>/)?.[1] ?? "hola@lucamsshop.co",
      // Destino (destinatario = cliente). Lucy 2026-05-21:
      // - destino con formato `CIUDAD(DEPTO)` UPPERCASE igual que cotización.
      // - dsnit del cliente (Aveonline exige ≥6 dígitos numéricos). Si el cliente
      //   no ingresó CC en checkout, usamos "000001" como placeholder válido
      //   (admin debe completarlo desde /admin/pedidos antes de despachar).
      // - dscorreop con el email real del cliente (Aveonline le notifica).
      destino: formatAveonlineCity(params.delivery.city, params.delivery.department),
      dsdir: params.delivery.address,
      dsbarrio: "", // opcional Aveonline
      IdTipoEntrega: "1", // 1=domicilio, 2=oficina
      dsnit: (params.delivery.documentNumber ?? "").replace(/\D/g, "").slice(0, 15) || "000001",
      dsnombrecompleto: params.delivery.contactName,
      dstel: params.delivery.phone,
      dscelular: params.delivery.phone,
      dscorreop: params.delivery.email ?? "",
      idtransportador, // del quoteId (flow inmediato) o resuelto via resolveCarrierId
      idagente, // resuelto via resolveDefaultAgentId (cacheado 24h)
      unidades: params.items.reduce((acc, i) => acc + i.qty, 0),
      productos,
      dscontenido: params.items
        .map((i) => i.productSlug)
        .join(", ")
        .slice(0, 80),
      dscom: "",
      idasumecosto: 1, // tenant asume costo flete
      contraentrega: params.contraentrega ? 1 : 0,
      valorrecaudo: valorRecaudo,
      // Aveonline `bloquegenerarguia` (semántica contraintuitiva):
      //   "1" = BLOQUEA generación facturable → SEGURO (igual devuelve numguia + PDF para staging)
      //   "0" = genera guía REAL facturable → cartera pendiente en cuenta Aveonline
      //
      // Doble gate (Lucy 2026-06-26): solo facturamos si AMBAS condiciones se cumplen:
      //   1. AVEONLINE_GENERATE_REAL === "true" (env explícita)
      //   2. NODE_ENV === "production" O AVEONLINE_FORCE_BILLING === "true" (escape hatch dev)
      // Default seguro: "1" (NO factura). Bug histórico: default "0" con cuenta real
      // genera cartera pendiente (vs cuenta demo donde "0" simulaba sin facturar).
      bloquegenerarguia:
        process.env.AVEONLINE_GENERATE_REAL === "true" &&
        (process.env.NODE_ENV === "production" || process.env.AVEONLINE_FORCE_BILLING === "true")
          ? "0"
          : "1",
      relacion_envios: "1",
      enviarcorreos: "1",
      cartaporte: "0",
      valorMinimo: 1, // 1 = aplicar valoración mínima (recomendado por dossier)
      dsvalor_pedido: String(totalDeclarado),
      dsreferencia: params.orderId, // tracking interno
      plugin: "lucamsshop",
    };

    // Sin `retry`: generar guía NO es idempotente — un reintento tras timeout
    // podría crear una guía DUPLICADA (doble cobro/etiqueta). Solo timeout + CB.
    //
    // Timeout 20s (NO el 15s genérico de la tabla): generarGuia2 es el endpoint
    // PHP más lento (genera guía + PDF + sticker) y es la ÚNICA llamada
    // no-reintentable. Bajarlo aumenta la probabilidad de abortar una guía que
    // Aveonline SÍ completó server-side → queda huérfana (nuestra DB no guardó el
    // trackingNumber) y un retry posterior de la saga generaría una segunda guía.
    // 20s era el valor previo probado; no se baja sin evidencia del p99 real
    // (mandato #9). Ver ADR-045/048.
    const res = await aveonlineFetch(`${BASE_URL}/nal/v1.0/generarGuiaTransporteNacional.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 20_000,
    });

    if (!res.ok) {
      logger.error({
        event: "shipping.aveonline.createshipment.http_fail",
        status: res.status,
        orderId: params.orderId,
      });
      throw new Error(`Aveonline createShipment HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      status: string;
      message?: string;
      resultado?: {
        guia?: {
          codigo?: string;
          mensaje?: string;
          numguia?: number | string;
          rutaguia?: string;
          rotulo?: string;
          rutasticker?: string;
          transportadora?: string;
        };
      };
    };

    if (data.status !== "ok" || !data.resultado?.guia?.numguia) {
      const msg = data.resultado?.guia?.mensaje ?? data.message ?? "respuesta inválida";
      logger.error({
        event: "shipping.aveonline.createshipment.fail",
        orderId: params.orderId,
        msg,
        // Lucy 2026-05-22: log response completo + body sanitizado para diagnosticar
        // errores genéricos tipo "No se puede generar la guia".
        responseFull: data,
        requestBodySent: {
          origen: body.origen,
          destino: body.destino,
          dsdir: body.dsdir,
          dsnit: body.dsnit,
          dsnombrecompleto: body.dsnombrecompleto,
          idtransportador: body.idtransportador,
          unidades: body.unidades,
          productosCount: body.productos.length,
          valorrecaudo: body.valorrecaudo,
          contraentrega: body.contraentrega,
          bloquegenerarguia: body.bloquegenerarguia,
        },
      });
      throw new Error(`Aveonline createShipment falló: ${msg}`);
    }

    const guia = data.resultado.guia;
    const trackingNumber = String(guia.numguia);
    // labelUrl: preferimos rutasticker (110x120 térmico) por tamaño; fallback rutaguia (PDF normal)
    const labelUrl = guia.rutasticker ?? guia.rutaguia ?? "";
    const trackingUrl = guia.rutaguia ?? labelUrl;

    logger.info({
      event: "shipping.aveonline.createshipment.success",
      orderId: params.orderId,
      trackingNumber,
      carrier: guia.transportadora,
    });

    return {
      trackingNumber,
      trackingUrl,
      labelUrl,
      carrier: (guia.transportadora ?? params.carrier).toLowerCase().replace(/\s+/g, "-"),
      // Aveonline no devuelve ETA exacta — caller puede estimar usando deliveryDays
      // del quote previo y guardarlo en Order si lo necesita.
      estimatedDeliveryAt: null,
    };
  }

  async getTracking(trackingNumber: string): Promise<TrackingStatus> {
    const { token, idempresa } = await getAuthToken();
    const res = await aveonlineFetch(
      `${BASE_URL}/nal/v1.0/guia.php`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "obtenerEstadoAuth",
          token,
          id: idempresa,
          guia: trackingNumber,
        }),
        timeoutMs: 5000,
      },
      { retry: true },
    );
    if (!res.ok) throw new Error(`Aveonline tracking fail HTTP ${res.status}`);
    const data = (await res.json()) as {
      guias?: Array<{
        estado?: string;
        historicos?: Array<{ fecha?: string; descripcion?: string; estado?: string }>;
      }>;
    };
    const guia = data.guias?.[0];
    const status: TrackingStatus["status"] = mapAveonlineStatus(guia?.estado ?? "");
    return {
      trackingNumber,
      status,
      carrierStatusRaw: guia?.estado ?? "",
      history: (guia?.historicos ?? []).map((h) => ({
        status: h.estado ?? "",
        description: h.descripcion ?? "",
        timestamp: h.fecha ? new Date(h.fecha) : new Date(),
      })),
    };
  }

  async requestPickup(_params: {
    trackingNumbers: string[];
    comments?: string;
  }): Promise<PickupResult> {
    // STUB. RESTRICCIÓN documentada: recogidas hasta 11:00 AM del día.
    throw new Error("AveonlineProvider.requestPickup no implementado (stub).");
  }

  async handleWebhook(rawBody: string, _headers: Record<string, string>): Promise<WebhookEvent> {
    // PLAN_CATALOG_V2 ADR-039 — Webhook Aveonline NO documenta HMAC.
    // MITIGACIÓN: route handler valida secret en paramN (ver
    // app/api/webhooks/aveonline/route.ts).
    //
    // Aveonline envía 2 shapes posibles:
    //   - Plugin legacy WordPress: estado:[{estado_id, nombre_estado, fecha}]
    //   - AveCRM nuevo: estado:[{nombre, timestamp}] o {nombre}
    // Soportamos ambos via nombre_estado || nombre.
    type EstadoItem = {
      nombre?: string;
      nombre_estado?: string;
      timestamp?: string;
      fecha?: string;
    };
    const body = JSON.parse(rawBody) as {
      guia?: string;
      estado?: EstadoItem[] | EstadoItem;
    };
    const trackingNumber = body.guia ?? "";
    const estadoArr: EstadoItem[] = Array.isArray(body.estado)
      ? body.estado
      : body.estado
        ? [body.estado]
        : [];
    const last = estadoArr[estadoArr.length - 1];
    const nombreRaw = last?.nombre_estado ?? last?.nombre ?? "";
    const status = mapAveonlineStatus(nombreRaw);
    const tsRaw = last?.timestamp ?? last?.fecha;
    return {
      trackingNumber,
      status,
      carrierStatusRaw: nombreRaw,
      timestamp: tsRaw ? new Date(tsRaw) : new Date(),
    };
  }
}

function mapAveonlineStatus(raw: string): TrackingStatus["status"] {
  const s = raw.toUpperCase();
  if (s.includes("ENTREGAD")) return "DELIVERED";
  if (s.includes("DEVUELT") || s.includes("RETORN")) return "RETURNED";
  if (s.includes("NOVEDAD") || s.includes("EXCEPCI")) return "EXCEPTION";
  if (s.includes("TRANSITO") || s.includes("TRÁNSITO") || s.includes("CAMINO")) return "IN_TRANSIT";
  if (s.includes("DESPACHAD") || s.includes("ADMITID")) return "DISPATCHED";
  return "PENDING";
}
