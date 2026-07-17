/*
 * VenndeloProvider — Plan B dormido (PLAN_CATALOG_V2 ADR-039 + Nota N5).
 *
 * Si Aveonline falla en producción, swap aquí. API REST clean (vs RPC PHP
 * de Aveonline). Cobertura: Coordinadora únicamente (1 carrier).
 *
 * Variables de entorno:
 *   VENNDELO_API_URL    — base URL
 *   VENNDELO_API_KEY    — API key
 *   VENNDELO_WEBHOOK_SECRET — HMAC verification
 *
 * Estado: STUB. Sin implementación real porque Aveonline es primario.
 * Implementar solo si Aveonline rinde mal. Tiempo estimado swap: 8-12h.
 */

import type {
  ShipmentItem,
  ShippingAddress,
  ShippingProvider,
  ShippingQuote,
  ShippingResult,
  TrackingStatus,
  WebhookEvent,
} from "./provider";

const NOT_IMPLEMENTED = "VenndeloProvider — Plan B dormido. Implementar solo si swap necesario.";

export class VenndeloProvider implements ShippingProvider {
  readonly name = "venndelo" as const;

  async quote(_params: {
    origin: { city: string; department: string };
    destination: { city: string; department: string };
    items: ShipmentItem[];
    contraentrega: boolean;
  }): Promise<ShippingQuote[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async createShipment(_params: {
    carrier: string;
    pickup: ShippingAddress;
    delivery: ShippingAddress;
    items: ShipmentItem[];
    contraentrega: boolean;
    valorRecaudoCop?: number;
    orderId: string;
  }): Promise<ShippingResult> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async getTracking(_trackingNumber: string): Promise<TrackingStatus> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async handleWebhook(_rawBody: string, _headers: Record<string, string>): Promise<WebhookEvent> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
