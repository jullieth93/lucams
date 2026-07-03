/*
 * Interface PaymentProvider — ADR-004 + extensión pre-Fase 2.
 *
 * Pattern equivalente a ShippingProvider. Permite swap entre Wompi y
 * Mercado Pago (futuro) sin tocar el código del checkout, webhooks ni
 * /admin/pedidos. El provider activo se controla por env PAYMENT_PROVIDER
 * (default "wompi").
 *
 * Implementaciones:
 *   - features/payments/wompi.ts (activa, sandbox + producción)
 *   - features/payments/mercadopago.ts (futuro, ADR-004)
 */

import "server-only";

export type PaymentStatus =
  | "PENDING" // creada, esperando que cliente complete
  | "APPROVED" // pagada
  | "DECLINED" // banco rechazó / fondos insuficientes / fraude
  | "VOIDED" // cancelada antes de capturar
  | "ERROR"; // falla técnica (timeout, gateway down)

export type CreateCheckoutInput = {
  /** Identificador de la Order en nuestra DB — usamos Order.number. */
  reference: string;
  amountInCents: number;
  currency: "COP";
  customerEmail: string;
  /** URL absoluta a la que el gateway redirige tras pago (success o failure). */
  redirectUrl: string;
};

export type CreateCheckoutResult = {
  /** URL hosted del gateway donde el cliente paga (redirect inmediato). */
  checkoutUrl: string;
  /** Referencia que después matchea en webhook. */
  reference: string;
};

export type PaymentDetails = {
  providerTransactionId: string;
  reference: string;
  status: PaymentStatus;
  amountInCents: number;
  currency: string;
  customerEmail: string | null;
  paymentMethodType: string | null; // "CARD" | "PSE" | "NEQUI" | "BANCOLOMBIA_TRANSFER" | etc.
  createdAt: Date;
  finalizedAt: Date | null;
  statusMessage: string | null;
};

export type WebhookVerificationResult =
  | {
      valid: true;
      providerTransactionId: string;
      reference: string;
      status: PaymentStatus;
      amountInCents: number;
    }
  | { valid: false; reason: string };

export interface PaymentProvider {
  readonly name: "wompi" | "mercadopago";

  /**
   * Crea un "checkout" — URL hosted donde el cliente paga. NO es un cargo
   * todavía; solo la URL. El cliente es redirigido, paga, y el gateway
   * redirige de vuelta a redirectUrl.
   */
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;

  /**
   * Lookup de transacción por ID que da el gateway. Usado tras el redirect
   * para confirmar estado real (NO confiar en query params del redirect).
   */
  getPaymentDetails(providerTransactionId: string): Promise<PaymentDetails>;

  /**
   * Verifica firma del webhook (HMAC u otro mecanismo). Devuelve datos
   * normalizados que el handler puede usar para actualizar la Order.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string>): WebhookVerificationResult;
}

let provider: PaymentProvider | null = null;

/**
 * Singleton del provider activo. Lazy init para que tests puedan mockear.
 */
export function getPaymentProvider(): PaymentProvider {
  if (provider) return provider;
  const choice = (process.env.PAYMENT_PROVIDER ?? "wompi").trim().toLowerCase();
  // El check va ANTES del require: así un provider no soportado falla con el
  // error claro sin cargar el SDK de Wompi (honra el "import dinámico" del intent).
  if (choice !== "wompi") {
    throw new Error(`PAYMENT_PROVIDER="${choice}" no soportado todavía. Solo "wompi" en Fase 2.`);
  }
  // Import dinámico para evitar cargar SDK del provider no activo.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("./wompi") as { WompiPaymentProvider: new () => PaymentProvider };
  provider = new mod.WompiPaymentProvider();
  return provider;
}

/**
 * Reset del singleton — solo para tests. NO usar en código productivo.
 */
export function __resetPaymentProvider() {
  provider = null;
}
