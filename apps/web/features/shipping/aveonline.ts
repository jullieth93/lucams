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
 * Breaker SEPARADO para la cotización (`cotizarDoble`). Es el endpoint más pesado
 * y lento (7–11 s, ver quote()) y por tanto el más propenso a timeout. Aislarlo del
 * breaker principal evita que una tormenta de cotizaciones lentas lo abra y bloquee
 * — por 30 s — la generación de guía de órdenes YA PAGADAS y el tracking (que sí son
 * críticos). Antes compartían breaker: un fallo de cotización contaminaba el fulfillment
 * (revisión adversarial #3, 2026-07-11).
 */
const aveonlineQuoteCB = new CircuitBreaker({
  name: "aveonline-quote",
  threshold: 5,
  resetMs: 30_000,
});

// ── Caché de última cotización buena (fallback de resiliencia, 2026-08-08) ──
// `cotizarDoble` mide 7–11 s SANO y tiene días degradados: un timeout transitorio
// no debe tumbar el checkout. Si la cotización EN VIVO lanza (red/timeout/breaker/
// HTTP/respuesta inválida), servimos la última cotización exitosa de la MISMA clave
// (origen, destino, paquete, modalidad) con TTL corto y flag `estimated` (la UI la
// anuncia como "tarifa estimada"). NUNCA se sirve caché cuando la llamada en vivo
// funcionó, y las respuestas vacías (sin cobertura) no se cachean: son una
// respuesta definitiva, no un fallo transitorio. Per-instancia serverless (misma
// filosofía que el token cache de auth).
const QUOTE_CACHE_TTL_MS = 10 * 60 * 1000;
const QUOTE_CACHE_MAX_KEYS = 200;
const lastGoodQuoteCache = new Map<string, { at: number; quotes: ShippingQuote[] }>();

function readLastGoodQuote(key: string): ShippingQuote[] | null {
  const hit = lastGoodQuoteCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > QUOTE_CACHE_TTL_MS) {
    lastGoodQuoteCache.delete(key);
    return null;
  }
  return hit.quotes;
}

function writeLastGoodQuote(key: string, quotes: ShippingQuote[]): void {
  // Cota de memoria defensiva (la instancia puede vivir horas): FIFO tosco.
  if (lastGoodQuoteCache.size >= QUOTE_CACHE_MAX_KEYS) {
    const oldest = lastGoodQuoteCache.keys().next().value;
    if (oldest !== undefined) lastGoodQuoteCache.delete(oldest);
  }
  lastGoodQuoteCache.set(key, { at: Date.now(), quotes });
}

/**
 * Wrapper único de red para Aveonline: timeout obligatorio (mandato "nunca un
 * fetch sin timeout") + circuit breaker + retry opcional con backoff.
 *
 * - `retry: true` SOLO para llamadas idempotentes (auth, cotización, listados,
 *   tracking). NUNCA para generar guía: reintentar podría crear guías duplicadas
 *   (llamada NO idempotente). El retry va POR FUERA del breaker
 *   (`withRetry(() => cb.exec(fetch))`) para que el breaker vea cada intento y,
 *   una vez abierto, `CircuitOpenError` (no reintentable) corte el loop de una.
 * - `retryAttempts` acota el nº de intentos (default 3). La cotización usa 2:
 *   cada intento es caro (~10 s, ver quote()), así que 3×15 s excedería el
 *   maxDuration del step 2. Con 2, el peor caso ≈ 30 s sigue bajo el techo.
 */
async function aveonlineFetch(
  url: string,
  init: RequestInit & { timeoutMs: number },
  opts: { retry?: boolean; retryAttempts?: number; breaker?: CircuitBreaker } = {},
): Promise<Response> {
  const cb = opts.breaker ?? aveonlineCB;
  const call = () => cb.exec(() => fetchWithTimeout(url, init));
  return opts.retry
    ? withRetry(call, opts.retryAttempts ? { attempts: opts.retryAttempts } : {})
    : call();
}

/**
 * Valor declarado mínimo COP que Aveonline acepta (numbererror -5 si <10000).
 * Doc oficial: https://integraciones.aveonline.co/docs/nacional/cotizacion/
 */
const MIN_DECLARED_VALUE_COP = 10000;

/**
 * Aveonline maneja PESOS enteros en `valorDeclarado` / `dsvalor_pedido` / `valorrecaudo`.
 * Nuestros montos internos son CENTAVOS COP (mandato del proyecto). Sin esta conversión
 * declarábamos 100× el valor real (ej. un imán de $45.000 → 4.500.000) y, al multiplicar
 * por la cantidad, superábamos el límite de Aveonline → numbererror=999 en TODAS las
 * transportadoras (verificado 2026-07-11: valorDeclarado 22.500.000 → 0/11). Ver ADR-053.
 */
const centsToPesos = (cents: number) => Math.round(cents / 100);

/**
 * Construye el array `productos` para la cotización a partir de los ítems del carrito.
 *
 * Aveonline **IGNORA el campo `unidades` al cotizar** — VERIFICADO contra la API real
 * (2026-07-11): `peso 0.3kg u1` y `peso 0.3kg u5` devuelven el MISMO flete (kilos=1). Si
 * dejáramos qty solo en `unidades`, un pedido de 5 imanes se cobraría como 1 → flete
 * subcobrado (la dueña pierde la diferencia). Por eso plegamos la cantidad en el PESO
 * (modelo "peso total" elegido por Lucy 2026-07-11: los imanes son densos y se apilan,
 * así que el peso es el costo real; el volumétrico casi nunca domina):
 *   - `peso` = peso_unitario × qty (kg), `unidades` = 1
 *   - `valorDeclarado` = valor_unitario × qty (el seguro cubre el valor TOTAL de la línea)
 *   - dims: las del paquete unitario (para densos, el peso real supera al volumétrico)
 * `valorDeclarado` mínimo 10.000 COP (sino Aveonline devuelve numbererror -5). Ver ADR-053.
 */
/**
 * Modelo de empaque "caja apilada" — UN bulto físico (el rótulo de Aveonline
 * imprime productos[].unidades como N bultos, verificado en vivo 2026-07-11:
 * unidades:5 imprimió "1 / 5" y la transportadora esperaba 5 paquetes).
 *
 * Liquidación correcta (la transportadora re-mide y factura por
 * max(peso real, peso volumen) de la caja REAL):
 *  - peso: Σ(peso_unit × qty) — exacto.
 *  - dims: los items del catálogo se apilan por su cara plana (imanes,
 *    calendarios, tiles). Cada item se orienta con su dim MENOR como espesor;
 *    la caja queda con huella = máx de las dos dims mayores por item y
 *    espesor = Σ(dim_menor × qty). Ni bounding-box máximo (SUB-dimensiona:
 *    3 calendarios de 1cm declaraban 30×30×1 → re-liquidación en contra) ni
 *    suma ciega de ejes (SOBRE-dimensiona).
 *  - valorDeclarado: Σ(valor_unit × qty) en PESOS, piso $10.000 (error -5).
 * Cotización y guía usan EL MISMO modelo → el flete cotizado == el facturado.
 */
export function computePackedPackage(items: ShipmentItem[]): {
  altoCm: number;
  anchoCm: number;
  largoCm: number;
  pesoKg: number;
  valorDeclaradoPesos: number;
  nombre: string;
} {
  let pesoGramos = 0;
  let espesorCm = 0;
  let caraMayorCm = 0;
  let caraMediaCm = 0;
  let valorCop = 0;
  for (const i of items) {
    const [menor, media, mayor] = [i.widthCm, i.heightCm, i.depthCm].sort((a, b) => a - b);
    caraMayorCm = Math.max(caraMayorCm, mayor);
    caraMediaCm = Math.max(caraMediaCm, media);
    espesorCm += menor * i.qty;
    pesoGramos += i.weightGrams * i.qty;
    valorCop += i.declaredValueCop * i.qty;
  }
  return {
    altoCm: caraMayorCm,
    anchoCm: caraMediaCm,
    largoCm: Math.round(espesorCm * 10) / 10,
    pesoKg: Math.max(0.1, Math.round((pesoGramos / 1000) * 10) / 10),
    valorDeclaradoPesos: Math.max(MIN_DECLARED_VALUE_COP, centsToPesos(valorCop)),
    nombre:
      items
        .map((i) => i.productSlug)
        .join(", ")
        .slice(0, 100) || "Pedido",
  };
}

export function buildCotizarProductos(items: ShipmentItem[]) {
  const pkg = computePackedPackage(items);
  return [
    {
      // La doc tipa alto/ancho/largo/peso/valorDeclarado como String (el ejemplo oficial
      // los manda entre comillas); createShipment ya los stringifica. Alineamos acá también.
      alto: String(pkg.altoCm),
      ancho: String(pkg.anchoCm),
      largo: String(pkg.largoCm),
      peso: String(pkg.pesoKg),
      unidades: 1, // UN bulto físico (Aveonline lo imprime como bultos en el rótulo)
      nombre: pkg.nombre,
      valorDeclarado: String(pkg.valorDeclaradoPesos),
    },
  ];
}

/**
 * `idempresa` de la cuenta DEMO pública que Aveonline documenta como ambiente
 * de pruebas (no existe sandbox dedicado — opera contra la API de producción
 * pero no factura mientras `bloquegenerarguia=1`, ver el comentario del payload
 * de la guía). Es una fixture PÚBLICA, no configuración:
 * https://integraciones.aveonline.co/docs/nacional/autenticacion/
 * Las credenciales demo viven en el MISMO set de siempre
 * (AVEONLINE_USUARIO/CLAVE) con sus valores por ambiente: demo en
 * dev/stg/preview, reales solo en prod.
 *
 * 7 transportadoras habilitadas: 99MINUTOS, COORDINADORA MERCANTIL, ENVIA,
 * GO ENVIOS, INTERRAPIDISIMO, SERVIENTREGA, TCC SA.
 */
const DEMO_ACCOUNT_IDEMPRESA = 15289;

/**
 * Modo DECLARADO según `AVEONLINE_ENV` ("production" | default "test"). Ya NO
 * selecciona credenciales (hay un solo set, AVEONLINE_USUARIO/CLAVE, cuyo valor
 * cambia por ambiente) — su uso es:
 *   - guard del health check: en modo production la cuenta autenticada NO puede
 *     ser la demo pública (misconfig cara: la tienda cree que genera guías
 *     reales contra la cuenta de Lucy y no es así).
 *   - etiqueta de logs (`env` en shipping.aveonline.auth_refresh).
 * La facturación NO depende de este flag: la gobiernan AVEONLINE_GENERATE_REAL
 * + NODE_ENV (+FORCE_BILLING) — ver el payload de la guía (doble gate).
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
    message?: string;
    agentes?: Array<{
      id?: number;
      nombre?: string;
      direccion?: string;
      principal?: string;
    }>;
  } | null;
  // La API legacy PHP responde HTTP 200 con status:"error" en cuerpo (token
  // inválido → "credenciales incorrectas"). Sin este chequeo caía a agentes:[] y le
  // decíamos a la admin "crea un agente" cuando el problema real es el token (audit
  // Aveonline). NO cacheamos respuestas de error.
  if (data?.status !== "ok") {
    throw new Error(`Aveonline listarAgentes: ${data?.message ?? "respuesta inválida"}`);
  }
  const items = (data.agentes ?? []).map((a) => ({
    id: Number(a.id),
    nombre: String(a.nombre ?? ""),
    direccion: String(a.direccion ?? ""),
    // La doc documenta "S"/"N"; la cuenta real devuelve "SI"/"NO" (verificado en vivo).
    // Aceptamos ambos (+ "1") para no dejar la selección de agente-principal en código muerto.
    principal: ["S", "SI", "1"].includes(
      String(a.principal ?? "")
        .trim()
        .toUpperCase(),
    ),
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
        "Crea uno en https://app.aveonline.co/ → menú Agentes/Puntos de despacho.",
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
    message?: string;
    transportadoras?: Array<{ id: number; text: string }>;
  };
  // La API PHP responde HTTP 200 con status:"error" (token inválido → "credenciales
  // incorrectas"; sin registros → "registros no encontrados"), SIN la clave
  // `transportadoras`. Sin este chequeo, `?? []` cacheaba [] durante 24h y bloqueaba
  // la generación de guía (resolveCarrierId → "no habilitado") de pedidos YA PAGADOS
  // por un día entero, incluso tras recuperarse Aveonline (audit). NO cacheamos vacío/error.
  if (data.status !== "ok" || !Array.isArray(data.transportadoras)) {
    logger.warn({
      event: "shipping.aveonline.carriers_refresh.error",
      status: data.status ?? null,
      message: data.message?.slice(0, 160) ?? null,
    });
    throw new Error(`Aveonline listarTransportadoras: ${data.message ?? "respuesta inválida"}`);
  }
  const items = data.transportadoras;
  // Solo cacheamos una lista NO vacía (una vacía sería anómala en una cuenta con
  // transportadoras habilitadas → no la fijamos 24h).
  if (items.length > 0) carriersCache = { items, expiresAt: now + 24 * 60 * 60_000 };
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
  // listWebhook.php NO está documentado y, verificado en vivo (2026-07-11), responde una
  // página de LOGIN HTML (no JSON) → `res.json()` lanzaría y tumbaría la página admin.
  // Degradamos con gracia: si no es JSON, lista vacía + warn (audit Aveonline, pendiente).
  let data: { webhooks?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> };
  try {
    data = await res.json();
  } catch {
    logger.warn({ event: "shipping.aveonline.list_webhooks.non_json" });
    return { items: [], raw: { error: "respuesta no-JSON (endpoint no documentado)" } };
  }
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
  // deleteWebhook.php tampoco está documentado (mismo caso que listWebhook). Si no
  // responde JSON, degradamos con gracia en vez de lanzar.
  let data: { success?: boolean; messages?: string };
  try {
    data = await res.json();
  } catch {
    logger.warn({ event: "shipping.aveonline.delete_webhook.non_json" });
    return { ok: false, message: "respuesta no-JSON (endpoint no documentado)" };
  }
  return { ok: Boolean(data.success), message: data.messages ?? "" };
}

async function getAuthToken(): Promise<{ token: string; idempresa: number }> {
  const now = Date.now();
  // Refresh con 5 min de buffer antes de expirar
  if (tokenCache && tokenCache.expiresAt > now + 5 * 60_000) {
    return { token: tokenCache.token, idempresa: tokenCache.idempresa };
  }

  // Un solo set de credenciales cuyo valor cambia por ambiente (demo fuera de
  // prod, reales solo en prod). AVEONLINE_ENV ya no selecciona credenciales.
  const isProd = isProductionEnv();
  const usuario = process.env.AVEONLINE_USUARIO;
  const clave = process.env.AVEONLINE_CLAVE;
  if (!usuario || !clave) {
    throw new Error(
      "AVEONLINE_USUARIO + AVEONLINE_CLAVE no configurados " +
        `(modo ${isProd ? "production" : "test"}). Ver ADR-039 + .env.example.`,
    );
  }

  // retryAttempts:2 (no el default 3): auth corre ANTES del quote (2×15 s) dentro del
  // mismo maxDuration=45 del step 2. Con el default 3×5 s el peor caso auth+quote
  // excedía 45 s → Vercel mataba la función y el usuario veía un 504 crudo en vez del
  // banner ámbar de fallback (revisión adversarial #2). Auth mide ~0.3 s, así que 2
  // intentos sobran para tolerar un blip transitorio sin inflar el presupuesto.
  const res = await aveonlineFetch(
    `${BASE_URL}/comunes/v1.0/autenticarusuario.php`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "auth", usuario, clave }),
      timeoutMs: 5000,
    },
    { retry: true, retryAttempts: 2 },
  );
  if (!res.ok) throw new Error(`Aveonline auth fail HTTP ${res.status}`);
  const data = (await res.json()) as {
    status: string;
    message?: string;
    token?: string;
    cuentas?: Array<{ usuarios: Array<{ id: number }> }>;
  };
  // Credenciales inválidas: la doc muestra status:"ok" pero cuentas:[] ("la contraseña
  // no coincide y NO se lista registro"). Distinguimos ese caso para que la admin sepa
  // que el problema es la credencial (no un fallo genérico) — audit Aveonline.
  if (data.status === "ok" && !data.cuentas?.[0]?.usuarios?.[0]) {
    throw new Error("Aveonline auth: credenciales inválidas (revisar AVEONLINE_USUARIO/CLAVE)");
  }
  if (data.status !== "ok" || !data.token || !data.cuentas?.[0]?.usuarios?.[0]) {
    throw new Error(`Aveonline auth: ${data.message ?? "respuesta inválida"}`);
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

export type AveonlineHealth = {
  /** Modo declarado por AVEONLINE_ENV. En `test` NO se generan guías reales. */
  mode: "production" | "test";
  authenticated: boolean;
  idempresa: number | null;
  /** true si la cuenta autenticada es la DEMO pública. En modo production es un ERROR. */
  isDemoAccount: boolean;
  ok: boolean;
  detail?: string;
};

/**
 * Diagnóstico de la integración de envíos, sin generar ninguna guía.
 *
 * Existe porque las credenciales viven cifradas en Vercel y no se pueden auditar leyéndolas: la
 * única forma de saber si `AVEONLINE_USUARIO`/`AVEONLINE_CLAVE` son de la cuenta real o quedaron
 * apuntando a la demo es autenticarse y mirar qué `idempresa` devuelve. En modo production la app
 * espera la cuenta real de Lucams (la que generará guías facturables cuando el doble gate de
 * facturación se abra en el lanzamiento) — confundir ambas cuentas es un error caro y silencioso.
 *
 * NO se agrega a /api/health/all a propósito: cada llamada gasta una autenticación contra un
 * proveedor externo, y un monitor haría cientos al día.
 */
export async function probeAveonlineHealth(): Promise<AveonlineHealth> {
  const mode = isProductionEnv() ? "production" : "test";
  const base: AveonlineHealth = {
    mode,
    authenticated: false,
    idempresa: null,
    isDemoAccount: false,
    ok: false,
  };

  if (mode === "production") {
    const missing = ["AVEONLINE_USUARIO", "AVEONLINE_CLAVE"].filter((k) => !process.env[k]);
    if (missing.length > 0) {
      return { ...base, detail: `Modo production sin credenciales: falta ${missing.join(", ")}.` };
    }
  }

  try {
    const { idempresa } = await getAuthToken();
    const isDemoAccount = idempresa === DEMO_ACCOUNT_IDEMPRESA;
    if (mode === "production" && isDemoAccount) {
      return {
        ...base,
        authenticated: true,
        idempresa,
        isDemoAccount,
        detail:
          "AVEONLINE_ENV=production pero las credenciales son las de la cuenta DEMO pública: " +
          "la tienda cree que genera guías reales y no es así.",
      };
    }
    return { ...base, authenticated: true, idempresa, isDemoAccount, ok: true };
  } catch (err) {
    return { ...base, detail: err instanceof Error ? err.message : "fallo de autenticación" };
  }
}

export class AveonlineProvider implements ShippingProvider {
  readonly name = "aveonline" as const;

  async quote(params: {
    origin: { city: string; department: string };
    destination: { city: string; department: string };
    items: ShipmentItem[];
    contraentrega: boolean;
  }): Promise<ShippingQuote[]> {
    // UN bulto con el modelo "caja apilada" (computePackedPackage): peso y espesor
    // Σ(qty), huella máxima. La guía usa el MISMO modelo → flete cotizado == facturado.
    const productos = buildCotizarProductos(params.items);

    // Aveonline 2026-05-21: usar `cotizarDoble` (multi-carrier) en vez de `cotizar2`
    // (single-carrier). cotizar2 devolvía numbererror=999 cuando idtransportador no
    // estaba habilitado para la cuenta. cotizarDoble cotiza TODAS las habilitadas y
    // filtramos por numbererror='-0-' acá. Doc: docs/INTEGRATIONS_AVEONLINE.md §3.
    // Ciudad UPPERCASE con formato `CIUDAD(DEPTO)` — sino numbererror=-1 o -2.
    const origenFmt = formatAveonlineCity(params.origin.city, params.origin.department);
    const destinoFmt = formatAveonlineCity(params.destination.city, params.destination.department);

    // Fallback de resiliencia (2026-08-08): quoteLive lanza SOLO por causas
    // transitorias (red/timeout/breaker/HTTP/respuesta inválida); la "sin
    // cobertura" retorna [] como respuesta definitiva. Solo los lanzamientos
    // consultan la caché de última cotización buena.
    const cacheKey =
      `${origenFmt}→${destinoFmt}|cod:${params.contraentrega ? 1 : 0}|` + JSON.stringify(productos);
    try {
      const quotes = await this.quoteLive({ params, productos, origenFmt, destinoFmt });
      // Solo se cachea cotización viva NO vacía (una vacía = sin cobertura: no es
      // un fallo y no sirve como fallback de ninguna clave).
      if (quotes.length > 0) writeLastGoodQuote(cacheKey, quotes);
      return quotes;
    } catch (err) {
      const cached = readLastGoodQuote(cacheKey);
      if (cached) {
        logger.warn({
          event: "shipping.aveonline.quote.cache_fallback",
          origen: origenFmt,
          destino: destinoFmt,
          quotes: cached.length,
          err: err instanceof Error ? err.message : String(err),
        });
        return cached.map((q) => ({ ...q, estimated: true }));
      }
      throw err;
    }
  }

  /**
   * Cotización EN VIVO contra Aveonline. El caller (quote) la envuelve con el
   * fallback de caché; por eso la regla de salida es: [] = sin cobertura
   * (definitivo), throw = fallo transitorio (elegible a caché).
   */
  private async quoteLive(input: {
    params: { contraentrega: boolean };
    productos: ReturnType<typeof buildCotizarProductos>;
    origenFmt: string;
    destinoFmt: string;
  }): Promise<ShippingQuote[]> {
    const { params, productos, origenFmt, destinoFmt } = input;
    const { token, idempresa } = await getAuthToken();

    // Timeout 15 s (NO el 5 s genérico): `cotizarDoble` cotiza TODAS las
    // transportadoras habilitadas server-side, así que es LENTO. Medido contra la
    // cuenta real (idempresa 43581, 2026-07-11): 7.0–11.3 s (mediana ~9.8 s). El 5 s
    // previo (ADR-045) hacía que TODO intento expirara → "no pudo cotizar envío"
    // permanente. 15 s da ~33% de headroom sobre el max medido. Retry acotado a 2
    // intentos (cada uno ~10 s) para no exceder el maxDuration=45 del step 2. Ver ADR-053.
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
          plugin: "apiave", // valor documentado por Aveonline ("Colocar apiave")
        }),
        timeoutMs: 15_000,
      },
      { retry: true, retryAttempts: 2, breaker: aveonlineQuoteCB },
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

    // Error TOP-LEVEL de Aveonline (token expirado a mitad, origen/destino malformado,
    // error de cuenta/plugin): la respuesta llega con status != "ok" y SIN el array
    // `cotizaciones`. Sin este chequeo caía a `?? []` y devolvía [] silenciosamente →
    // el usuario veía "no encontramos transportadoras" (como si la ciudad no tuviera
    // cobertura) y la causa real jamás se logueaba (revisión adversarial #5). Auth y
    // createShipment sí chequean status; la cotización no lo hacía.
    if (data.status !== "ok" || !Array.isArray(data.cotizaciones)) {
      logger.warn({
        event: "shipping.aveonline.quote.response_error",
        origen: origenFmt,
        destino: destinoFmt,
        status: data.status ?? null,
        message: data.message?.slice(0, 200) ?? null,
      });
      throw new Error(
        `Aveonline no devolvió cotizaciones (status=${data.status ?? "?"}` +
          `${data.message ? `: ${data.message.slice(0, 120)}` : ""}).`,
      );
    }

    const all = data.cotizaciones;
    const ok = all.filter((c) => c.numbererror === "-0-");
    const failed = all.filter((c) => c.numbererror !== "-0-");

    // Log estructurado: si todas fallaron, capturamos numbererror+dataerror para
    // que admin vea la causa exacta en /admin/logs (con stdbuf line-buffer).
    // TODAS las transportadoras fallaron con numbererror/dataerror = respuesta
    // DEFINITIVA de cobertura/datos (999 genérico — verificado con sonda live
    // 2026-08-08: un destino inexistente devuelve 16 carriers con 999; también
    // -2 destino inválido, -5/-6/-7 límites de valor/unidades/peso). NO es un
    // fallo transitorio → devolvemos [] y la UI muestra "No encontramos
    // transportadoras que cubran esa ciudad". Antes se lanzaba excepción y el
    // cliente veía el banner "reintenta en unos segundos" que JAMÁS se resolvía
    // (el bug de producción reportado 2026-08-08).
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
      return [];
    }

    if (ok.length > 0 && failed.length > 0) {
      logger.info({
        event: "shipping.aveonline.quote.partial",
        ok: ok.length,
        failed: failed.length,
        failedCarriers: failed.map((c) => c.nombreTransportadora),
      });
    }

    // Saneamos cada cotización al shape que ShippingSelectionSchema acepta, para que
    // ninguna fila "OK" se muestre pero luego falle en silencio al seleccionarla
    // (revisión adversarial #4). En concreto:
    //  - codTransportadora vacío ⇒ quoteId="" (falla min(1)): descartamos esa fila.
    //  - diasentrega puede venir >30 o no-entero (schema tope max(30)): clamp+round.
    //  - total puede venir como string no-numérico ⇒ NaN (falla .int()): coerción a 0.
    return ok
      .filter((c) => (c.codTransportadora ?? "") !== "")
      .map((c) => ({
        carrier: (c.nombreTransportadora ?? "carrier").toLowerCase().replace(/\s+/g, "-"),
        carrierName: c.nombreTransportadora ?? "Transportadora",
        fleteCop: Math.round((Number(c.total) || 0) * 100), // pasamos a centavos
        deliveryDays: Math.min(30, Math.max(0, Math.round(Number(c.diasentrega) || 0))),
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
    // Set único: mismas vars en todo ambiente (demo fuera de prod); getAuthToken
    // ya validó que existen (lanza si faltan).
    const usuario = process.env.AVEONLINE_USUARIO!;
    const clave = process.env.AVEONLINE_CLAVE!;

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
          `Configurálos en /admin/contenido/paginas/global (sección 'Negocio').`,
      );
    }

    // `dscorreop` es REQUERIDO por generarGuia2 (doc oficial; error tipificado -13
    // "El correo del destinatario no existe"). Fallar temprano con causa accionable
    // en vez de quemar la llamada no-idempotente contra Aveonline.
    if (!params.delivery.email?.trim()) {
      throw new Error(
        "Aveonline createShipment: la orden no tiene email del destinatario " +
          "(dscorreop es requerido por Aveonline). Completarlo en /admin/pedidos antes de reintentar.",
      );
    }

    // Aveonline en PESOS (montos internos en centavos → centsToPesos).
    const valorRecaudo = params.contraentrega ? centsToPesos(params.valorRecaudoCop ?? 0) : 0;
    const totalDeclaradoPesos = centsToPesos(
      params.items.reduce((acc, i) => acc + i.declaredValueCop * i.qty, 0),
    );

    // El pedido se despacha como UN paquete físico (imanes: todo va en una caja)
    // con el MISMO modelo de empaque de la cotización (computePackedPackage:
    // peso y espesor Σ, huella máxima) → el flete facturado == el cotizado, y
    // qty=2 nunca duplica el flete (una sola guía tarifada por peso/volumen
    // real, no 2 guías ni 2 bultos). Ver ADR-053 + auditoría doc 2026-07-28.
    const pkg = computePackedPackage(params.items);
    const productos = [
      {
        alto: String(pkg.altoCm),
        ancho: String(pkg.anchoCm),
        largo: String(pkg.largoCm),
        peso: String(pkg.pesoKg),
        unidades: 1,
        nombre: pkg.nombre,
        ref: params.orderId,
        valorDeclarado: String(pkg.valorDeclaradoPesos),
      },
    ];

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
      dscorreopre: process.env.EMAIL_FROM?.match(/<(.+?)>/)?.[1] ?? "hola@lucamsshop.com",
      // Destino (destinatario = cliente). Lucy 2026-05-21:
      // - destino con formato `CIUDAD(DEPTO)` UPPERCASE igual que cotización.
      // - dsnit del cliente (Aveonline exige numérico ≥5 dígitos y valor >10000 —
      //   verificado sandbox 2026-07-28: "000001" se rechaza por "mayor a 10000").
      //   Si el cliente no ingresó CC en checkout, usamos "100001" como placeholder
      //   válido (admin debe completarlo desde /admin/pedidos antes de despachar).
      // - dscorreop con el email real del cliente (Aveonline le notifica).
      destino: formatAveonlineCity(params.delivery.city, params.delivery.department),
      dsdir: params.delivery.address,
      dsbarrio: "", // opcional Aveonline
      IdTipoEntrega: "1", // 1=domicilio, 2=oficina
      dsnit: (params.delivery.documentNumber ?? "").replace(/\D/g, "").slice(0, 15) || "100001",
      dsnombrecompleto: params.delivery.contactName,
      dstel: params.delivery.phone,
      dscelular: params.delivery.phone,
      dscorreop: params.delivery.email ?? "",
      idtransportador, // del quoteId (flow inmediato) o resuelto via resolveCarrierId
      idagente, // resuelto via resolveDefaultAgentId (cacheado 24h)
      unidades: 1, // 1 paquete físico (el peso total ya va en productos[0].peso)
      productos,
      dscontenido: params.items
        .map((i) => i.productSlug)
        .join(", ")
        .slice(0, 80),
      dscom: "",
      // Formas de pago de la guía (tabla oficial de la doc de cotización,
      // verificada 2026-07-28): `contraentrega` = "el DESTINATARIO asume el costo
      // del ENVÍO"; `idasumecosto` = "el DESTINATARIO asume el costo del RECAUDO".
      // Ambos en 0 SIEMPRE:
      //  - Prepagada (Wompi): fila 1 de la tabla — destinatario no paga nada.
      //  - COD: fila 5 — el mensajero cobra EXACTAMENTE `valorrecaudo`
      //    (= order.total, que YA incluye el flete que el cliente vio en checkout)
      //    y Lucams asume transporte + fee de recaudo en la liquidación.
      //  Antes iban 1/1 (fila 2): el mensajero cobraba valorrecaudo + flete + fee
      //  ENCIMA → el cliente pagaba el flete DOS veces (auditoría doc 2026-07-28).
      idasumecosto: 0,
      contraentrega: 0,
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
      relacion_envios: "0", // no creamos la relación de envíos (doc: 1=sí, 0=no)
      enviarcorreos: "1",
      cartaporte: "0",
      // valorMinimo=0: usar la SUMA de valores declarados reales (no la valoración fija
      // de $10.000 que aplica el "1"). Con "1" la guía sub-aseguraba TODO envío a $10.000
      // (el imán más barato ya vale $45.000) y contradecía el valor real que calcula
      // ADR-053; además queda coherente con la cotización, que también usa 0. Verificado
      // en vivo: la guía genera OK con valorMinimo=0 (audit Aveonline).
      valorMinimo: 0,
      dsvalor_pedido: String(totalDeclaradoPesos),
      dsreferencia: params.orderId, // tracking interno
      plugin: "apiave", // valor documentado por Aveonline
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
        // Diagnóstico SIN PII (auditoría 2026-07-13): NO logueamos responseFull ni los
        // datos personales del destinatario (dsdir=dirección, dsnit=cédula/NIT,
        // dsnombrecompleto=nombre). Solo campos operativos y de configuración de la guía.
        requestBodySent: {
          origen: body.origen,
          destino: body.destino,
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
      status?: string;
      message?: string;
      guias?: Array<{
        estado?: string;
        // La doc del histórico usa `fechamostrar` (MM/DD/YYYY HH:mm:ss), NO `fecha`.
        historicos?: Array<{
          fechamostrar?: string;
          fecha?: string;
          descripcion?: string;
          estado?: string;
        }>;
      }>;
    };
    // status:"error" (HTTP 200) → "La guia no existe" / "autenticacion fallida". Sin
    // este chequeo devolvíamos un PENDING falso enmascarando la causa real (audit).
    if (data.status !== "ok" || !data.guias?.length) {
      throw new Error(`Aveonline tracking: ${data.message ?? "guía no encontrada"}`);
    }
    const guia = data.guias[0];
    const status: TrackingStatus["status"] = mapAveonlineStatus(guia?.estado ?? "");
    return {
      trackingNumber,
      status,
      carrierStatusRaw: guia?.estado ?? "",
      history: (guia?.historicos ?? []).map((h) => {
        const raw = h.fechamostrar ?? h.fecha; // real: fechamostrar; fecha = fallback defensivo
        return {
          status: h.estado ?? "",
          description: h.descripcion ?? "",
          timestamp: raw ? new Date(raw) : new Date(),
        };
      }),
    };
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
      // La doc envía `guia` como NÚMERO (892349021). Sin String() se pasaba un number
      // a Order.trackingNumber (columna String) → PrismaClientValidationError tragado
      // en el route → la orden NUNCA pasaba a SHIPPED/DELIVERED ni salían los correos.
      guia?: string | number;
      estado?: EstadoItem[] | EstadoItem;
    };
    const trackingNumber = body.guia != null ? String(body.guia) : "";
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
      timestamp: parseAveonlineDate(tsRaw),
      // Without a carrier timestamp, parseAveonlineDate falls back to `new Date()`:
      // the route must NOT use that non-deterministic value in the dedup key (D-4).
      hasCarrierTimestamp: tsRaw != null,
    };
  }
}

/**
 * Aveonline manda fechas SIN zona horaria, en hora local de Colombia (America/Bogota,
 * UTC-5): "2020-12-11 11:04:43". `new Date(str)` las interpretaría en la TZ del servidor
 * (UTC en Vercel) → ~5 h de desfase. Normalizamos ese formato a ISO con offset -05:00.
 */
function parseAveonlineDate(raw: string | undefined): Date {
  if (!raw) return new Date();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(raw.trim());
  if (m) return new Date(`${m[1]}T${m[2]}-05:00`);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function mapAveonlineStatus(raw: string): TrackingStatus["status"] {
  const s = raw.toUpperCase();
  if (s.includes("ENTREGAD")) return "DELIVERED";
  if (s.includes("DEVUELT") || s.includes("DEVOLUC") || s.includes("RETORN")) return "RETURNED";
  if (s.includes("NOVEDAD") || s.includes("EXCEPCI")) return "EXCEPTION";
  // Estados canónicos documentados (doc "Tipos de estados de envíos" + flujo
  // sandbox avanzarEstado): GENERADA → PRODUCIDA → EN DESPACHO → EN REPARTO →
  // ENTREGADA (+ EN NOVEDAD, ANULADA terminal). Antes "EN DESPACHO"/"EN REPARTO"
  // no matcheaban nada → la orden jamás transicionaba a SHIPPED y una guía
  // ANULADA quedaba "pendiente" para siempre (auditoría doc 2026-07-28).
  if (s.includes("ANULAD") || s.includes("CANCEL")) return "EXCEPTION";
  if (
    s.includes("REPARTO") ||
    s.includes("TRANSITO") ||
    s.includes("TRÁNSITO") ||
    s.includes("CAMINO")
  )
    return "IN_TRANSIT";
  if (
    s.includes("DESPACHO") ||
    s.includes("DESPACHAD") ||
    s.includes("ADMITID") ||
    s.includes("PRODUCIDA")
  )
    return "DISPATCHED";
  return "PENDING";
}
