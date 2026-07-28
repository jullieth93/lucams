/*
 * WompiPaymentProvider — implementación de PaymentProvider para Wompi.
 *
 * Wompi flow para Web Checkout hosted:
 *  1. createCheckout: construimos URL de https://checkout.wompi.co/p/?...
 *     con firma de integridad (HMAC SHA256). El cliente paga ahí.
 *  2. Wompi redirige a redirectUrl con ?id=TX_ID&env=…&status=…
 *  3. Tras redirect, llamamos getPaymentDetails(TX_ID) para confirmar
 *     status real (no confiar en query params).
 *  4. En paralelo, Wompi manda webhook firmado con HMAC SHA256(events_secret).
 *     verifyWebhook valida + normaliza.
 */

import "server-only";
import {
  buildCheckoutUrl,
  getTransaction,
  verifyWebhookSignature,
  type WompiTransactionStatus,
} from "@/lib/wompi";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentDetails,
  PaymentProvider,
  PaymentStatus,
  WebhookVerificationResult,
} from "./provider";

function mapStatus(s: WompiTransactionStatus): PaymentStatus {
  switch (s) {
    case "APPROVED":
      return "APPROVED";
    case "DECLINED":
      return "DECLINED";
    case "VOIDED":
      return "VOIDED";
    case "ERROR":
      return "ERROR";
    case "PENDING":
    default:
      return "PENDING";
  }
}

export class WompiPaymentProvider implements PaymentProvider {
  readonly name = "wompi" as const;

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const checkoutUrl = buildCheckoutUrl({
      reference: input.reference,
      amountInCents: input.amountInCents,
      currency: input.currency,
      customerEmail: input.customerEmail,
      redirectUrl: input.redirectUrl,
      customer: input.customer,
    });
    return { checkoutUrl, reference: input.reference };
  }

  async getPaymentDetails(providerTransactionId: string): Promise<PaymentDetails> {
    const tx = await getTransaction(providerTransactionId);
    return {
      providerTransactionId: tx.id,
      reference: tx.reference,
      status: mapStatus(tx.status),
      amountInCents: tx.amount_in_cents,
      currency: tx.currency,
      customerEmail: tx.customer_email,
      paymentMethodType: tx.payment_method_type,
      createdAt: new Date(tx.created_at),
      finalizedAt: tx.finalized_at ? new Date(tx.finalized_at) : null,
      statusMessage: tx.status_message,
    };
  }

  verifyWebhook(rawBody: string, _headers: Record<string, string>): WebhookVerificationResult {
    const result = verifyWebhookSignature(rawBody);
    if (!result.valid || !result.event) {
      return { valid: false, reason: result.reason ?? "firma inválida" };
    }
    const tx = result.event.data?.transaction;
    if (!tx) {
      return { valid: false, reason: "webhook sin transaction.data" };
    }
    return {
      valid: true,
      providerTransactionId: tx.id,
      reference: tx.reference,
      status: mapStatus(tx.status),
      amountInCents: tx.amount_in_cents,
    };
  }
}
