/*
 * AveonlineProvider — Implementación stub que define la estructura.
 *
 * PLAN_CATALOG_V2 ADR-039. API legacy PHP con `tipo` discriminator —
 * encapsulado bajo interface limpia.
 *
 * Estado: STUB inicial. Lucy debe completar onboarding comercial
 * en aveonline.co + verificar HMAC en webhook antes de habilitar producción.
 *
 * Variables de entorno requeridas:
 *   AVEONLINE_USUARIO        — credencial plataforma
 *   AVEONLINE_CLAVE          — password
 *   AVEONLINE_PICKUP_CITY    — ciudad recogida (ej. "Bogotá")
 *   AVEONLINE_PICKUP_DEPT    — departamento (ej. "Cundinamarca")
 *   AVEONLINE_PICKUP_ADDRESS — dirección física
 *   AVEONLINE_PICKUP_PHONE   — teléfono operativo
 */

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

type CachedToken = { token: string; idempresa: number; expiresAt: number };

let tokenCache: CachedToken | null = null;

async function getAuthToken(): Promise<{ token: string; idempresa: number }> {
  const now = Date.now();
  // Refresh con 5 min de buffer antes de expirar
  if (tokenCache && tokenCache.expiresAt > now + 5 * 60_000) {
    return { token: tokenCache.token, idempresa: tokenCache.idempresa };
  }

  const usuario = process.env.AVEONLINE_USUARIO;
  const clave = process.env.AVEONLINE_CLAVE;
  if (!usuario || !clave) {
    throw new Error(
      "AVEONLINE_USUARIO + AVEONLINE_CLAVE no configurados. Ver ADR-039 + .env.example.",
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
  logger.info({ event: "shipping.aveonline.auth_refresh", idempresa });
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
    const productos = params.items.map((i) => ({
      alto: 5,
      ancho: 5,
      largo: 5,
      peso: Math.max(1, Math.round(i.weightGrams / 100) / 10), // kg
      unidades: i.qty,
      nombre: i.productSlug,
      valorDeclarado: i.declaredValueCop,
    }));
    const res = await fetch(`${BASE_URL}/nal/v1.0/generarGuiaTransporteNacional.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "cotizar2",
        token,
        idempresa,
        origen: params.origin.city,
        destino: params.destination.city,
        productos,
        contraentrega: params.contraentrega ? 1 : 0,
        idasumecosto: 0,
        plugin: "apiave",
      }),
    });
    if (!res.ok) throw new Error(`Aveonline quote fail HTTP ${res.status}`);
    const data = (await res.json()) as {
      cotizaciones?: Array<{
        codTransportadora: string;
        nombreTransportadora: string;
        total: number;
        diasentrega: number;
      }>;
    };
    return (data.cotizaciones ?? []).map((c) => ({
      carrier: c.nombreTransportadora.toLowerCase().replace(/\s+/g, "-"),
      carrierName: c.nombreTransportadora,
      fleteCop: Math.round(c.total * 100), // pasamos a centavos
      deliveryDays: c.diasentrega,
      contraentrega: params.contraentrega,
      quoteId: c.codTransportadora,
    }));
  }

  async createShipment(_params: {
    carrier: string;
    quoteId?: string;
    pickup: ShippingAddress;
    delivery: ShippingAddress;
    items: ShipmentItem[];
    contraentrega: boolean;
    valorRecaudoCop?: number;
    orderId: string;
  }): Promise<ShippingResult> {
    // STUB — implementación real cuando Lucy complete onboarding KYC.
    // ACCIÓN HUMANA REQUERIDA: validar payload exacto con soporte Aveonline.
    throw new Error(
      "AveonlineProvider.createShipment no implementado. Lucy debe completar onboarding KYC + validar payload con soporte.",
    );
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
