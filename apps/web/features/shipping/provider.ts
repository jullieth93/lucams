/*
 * Interface ShippingProvider — PLAN_CATALOG_V2 ADR-039.
 *
 * Pattern equivalente a PaymentProvider (Wompi/Mercado Pago).
 *
 * Implementación única: features/shipping/aveonline.ts (activa, decisión 4.10).
 * El Plan B Venndelo se eliminó del código y de los docs el 2026-07-29 por
 * decisión de negocio (la logística es y será Aveonline).
 */

export type ShippingAddress = {
  city: string;
  department: string;
  address: string;
  zip?: string;
  phone: string;
  contactName: string;
  /** Documento (CC/NIT/etc) — Aveonline lo exige ≥6 dígitos numéricos. */
  documentNumber?: string;
  /** Email del destinatario (Aveonline lo notifica si presente). */
  email?: string;
};

export type ShipmentItem = {
  productSlug: string;
  qty: number;
  // PR C (Lucy 2026-05-21): peso + dimensiones REALES por producto/variant.
  // Sin defaults hardcoded — el caller (checkout service) los resuelve via
  // getEffectiveShippingDims(product, variant). Si falta data, lanza error
  // antes de llegar acá.
  weightGrams: number;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  declaredValueCop: number; // Para seguro
};

export type ShippingQuote = {
  carrier: string; // "envia" | "tcc" | "coordinadora" | "saferbo" | etc.
  carrierName: string;
  fleteCop: number; // costo en COP centavos
  deliveryDays: number;
  contraentrega: boolean;
  quoteId: string; // Para createShipment posterior
  /**
   * true SOLO cuando la cotización viene de la caché de fallback (la cotización
   * en vivo falló por red/timeout/breaker). Hint de display para la UI
   * ("tarifa estimada"); nunca lo setea una cotización en vivo exitosa.
   */
  estimated?: boolean;
};

export type ShippingResult = {
  trackingNumber: string;
  trackingUrl: string;
  labelUrl: string;
  carrier: string;
  estimatedDeliveryAt: Date | null;
};

export type TrackingStatus = {
  trackingNumber: string;
  status: "PENDING" | "DISPATCHED" | "IN_TRANSIT" | "DELIVERED" | "RETURNED" | "EXCEPTION";
  carrierStatusRaw: string;
  history: Array<{ status: string; description: string; timestamp: Date }>;
};

export type WebhookEvent = {
  trackingNumber: string;
  status: TrackingStatus["status"];
  carrierStatusRaw: string;
  timestamp: Date;
  /**
   * false when the payload carried no carrier `fecha`/`timestamp` and `timestamp` is a
   * `new Date()` fallback (non-deterministic). The webhook route uses it to build a
   * stable dedup key ("no-ts") instead of a fresh epoch per delivery (audit D-4).
   */
  hasCarrierTimestamp: boolean;
};

export interface ShippingProvider {
  /** Cotiza envío. Retorna la lista multi-carrier de Aveonline. */
  quote(params: {
    origin: { city: string; department: string };
    destination: { city: string; department: string };
    items: ShipmentItem[];
    contraentrega: boolean;
  }): Promise<ShippingQuote[]>;

  /** Crea guía con el carrier elegido. Retorna número guía + URL etiqueta. */
  createShipment(params: {
    carrier: string;
    quoteId?: string;
    pickup: ShippingAddress;
    delivery: ShippingAddress;
    items: ShipmentItem[];
    contraentrega: boolean;
    valorRecaudoCop?: number;
    orderId: string;
  }): Promise<ShippingResult>;

  /** Consulta estado actual de una guía. */
  getTracking(trackingNumber: string): Promise<TrackingStatus>;

  // Nota: la solicitud de recogida (pickup) es MANUAL por ahora (se coordina en el panel de
  // Aveonline). No forma parte del contrato hasta que exista una necesidad real con credenciales
  // del endpoint de recogidas (auditoría 2026-07-17: se retiró el stub que solo lanzaba).

  /** Procesa webhook entrante (verificación firma + parse). */
  handleWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent>;

  /** Nombre del proveedor para logs/telemetría. */
  readonly name: "aveonline";
}

let _provider: ShippingProvider | null = null;

/**
 * Singleton del provider activo (Aveonline — único soportado).
 * Lazy load para no romper build cuando vars no están configuradas.
 */
export async function getShippingProvider(): Promise<ShippingProvider> {
  if (_provider) return _provider;
  const { AveonlineProvider } = await import("./aveonline");
  _provider = new AveonlineProvider();
  return _provider;
}
