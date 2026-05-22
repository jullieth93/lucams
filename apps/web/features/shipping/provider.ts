/*
 * Interface ShippingProvider — PLAN_CATALOG_V2 ADR-039.
 *
 * Pattern equivalente a PaymentProvider (Wompi/Mercado Pago). Permite
 * swap entre Aveonline (multi-carrier) y Venndelo (Coordinadora) sin
 * tocar el código del checkout ni del admin.
 *
 * Implementaciones:
 *   - features/shipping/aveonline.ts (activa, decisión 4.10)
 *   - features/shipping/venndelo.ts  (dormida, Plan B documentado N5)
 *
 * Env var SHIPPING_PROVIDER controla cuál se usa. Default "aveonline".
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
};

export type PickupResult = {
  pickupId: string;
  scheduledFor: Date;
  carrier: string;
};

export interface ShippingProvider {
  /** Cotiza envío. En Aveonline retorna lista multi-carrier; en Venndelo solo Coordinadora. */
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

  /** Solicita recogida en pickup address. */
  requestPickup(params: { trackingNumbers: string[]; comments?: string }): Promise<PickupResult>;

  /** Procesa webhook entrante (verificación firma + parse). */
  handleWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent>;

  /** Nombre del proveedor para logs/telemetría. */
  readonly name: "aveonline" | "venndelo";
}

let _provider: ShippingProvider | null = null;

/**
 * Singleton del provider activo según env SHIPPING_PROVIDER.
 * Lazy load para no romper build cuando vars no están configuradas.
 */
export async function getShippingProvider(): Promise<ShippingProvider> {
  if (_provider) return _provider;
  const which = process.env.SHIPPING_PROVIDER ?? "aveonline";
  if (which === "venndelo") {
    const { VenndeloProvider } = await import("./venndelo");
    _provider = new VenndeloProvider();
  } else {
    const { AveonlineProvider } = await import("./aveonline");
    _provider = new AveonlineProvider();
  }
  return _provider;
}
