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

import { getSettingValue } from "@/lib/cms";
import { logger } from "@/lib/logger";
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

let tokenCache: CachedToken | null = null;

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

  const res = await fetch(`${BASE_URL}/comunes/v1.0/autenticarusuario.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "auth", usuario, clave }),
  });
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

    const res = await fetch(`${BASE_URL}/nal/v1.0/generarGuiaTransporteNacional.php`, {
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
    });
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
    const usuario = process.env.AVEONLINE_USUARIO!;
    const clave = process.env.AVEONLINE_CLAVE!;

    if (!params.quoteId) {
      throw new Error(
        "Aveonline createShipment requiere quoteId (idtransportador de la cotización).",
      );
    }

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
      origen: `${pickupCity.toUpperCase()}(${pickupDept.toUpperCase()})`,
      dsdirre: pickupAddress,
      dsnitre: settingNit,
      dsnombre: pickupContact,
      dstelre: pickupPhone,
      dscelularre: pickupPhone,
      dscorreopre: process.env.EMAIL_FROM?.match(/<(.+?)>/)?.[1] ?? "hola@lucamsshop.co",
      // Destino (destinatario = cliente)
      destino: `${params.delivery.city.toUpperCase()}(${params.delivery.department.toUpperCase()})`,
      dsdir: params.delivery.address,
      IdTipoEntrega: "1", // 1=domicilio, 2=oficina
      dsnit: "00000",
      dsnombrecompleto: params.delivery.contactName,
      dstel: params.delivery.phone,
      dscelular: params.delivery.phone,
      dscorreop: "", // si Order tiene email, se puede inyectar via params en V2
      idtransportador: params.quoteId, // viene de quote().quoteId = codTransportadora
      unidades: params.items.reduce((acc, i) => acc + i.qty, 0),
      productos,
      dscontenido: params.items
        .map((i) => i.productSlug)
        .join(", ")
        .slice(0, 80),
      idasumecosto: 0,
      contraentrega: params.contraentrega ? 1 : 0,
      valorrecaudo: valorRecaudo,
      // En modo test: bloquegenerarguia="0" → simula sin generar guía real (no factura).
      // En production: "1" → genera guía real (factura).
      bloquegenerarguia: isProductionEnv() ? "1" : "0",
      relacion_envios: "1",
      enviarcorreos: "1",
      valorMinimo: 0, // 0 = suma valorDeclarado (correcto para nuestro caso)
      dsvalor_pedido: String(totalDeclarado),
      dsreferencia: params.orderId, // tracking interno
      plugin: "lucamsshop",
    };

    const res = await fetch(`${BASE_URL}/nal/v1.0/generarGuiaTransporteNacional.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
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
    const res = await fetch(`${BASE_URL}/nal/v1.0/guia.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "obtenerEstadoAuth",
        token,
        id: idempresa,
        guia: trackingNumber,
      }),
    });
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
    // MITIGACIÓN actual: validar existencia del trackingNumber en DB + IP whitelist.
    // Lucy debe consultar soporte Aveonline para agregar HMAC.
    const body = JSON.parse(rawBody) as {
      guia?: string;
      estado?: Array<{ nombre?: string; timestamp?: string }> | { nombre?: string };
    };
    const trackingNumber = body.guia ?? "";
    const estadoArr = Array.isArray(body.estado) ? body.estado : body.estado ? [body.estado] : [];
    const last = estadoArr[estadoArr.length - 1];
    const status = mapAveonlineStatus(last?.nombre ?? "");
    return {
      trackingNumber,
      status,
      carrierStatusRaw: last?.nombre ?? "",
      timestamp:
        Array.isArray(body.estado) && body.estado[0]?.timestamp
          ? new Date(body.estado[0].timestamp)
          : new Date(),
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
