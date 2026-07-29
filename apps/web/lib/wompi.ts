/*
 * Wompi API client — operaciones REST + verificación de webhooks.
 *
 * Doc oficial: https://docs.wompi.co/docs/colombia/ambientes-y-llaves/
 *
 * Ambientes:
 *   - Sandbox:    https://sandbox.wompi.co/v1
 *   - Producción: https://production.wompi.co/v1
 *
 * Llaves (4):
 *   - WOMPI_PUBLIC_KEY      (pub_test_… | pub_prod_…)  → cliente, no secreta
 *   - WOMPI_PRIVATE_KEY     (prv_test_… | prv_prod_…)  → server-side
 *   - WOMPI_INTEGRITY_SECRET (test_integrity_… | prod_integrity_…) → firma de transacción al crear
 *   - WOMPI_EVENTS_SECRET    (test_events_…    | prod_events_…)    → firma de webhook recibido
 *
 * Webhooks: Wompi firma con SHA-256 plano (NO HMAC): hex( concat de los valores
 * de signature.properties en orden + timestamp + events_secret ). Doc:
 * https://docs.wompi.co/docs/colombia/eventos/ (Eventos / Verificación firma)
 */

import "server-only";
import crypto from "node:crypto";
import { CircuitBreaker } from "@/lib/circuit-breaker";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";

/**
 * Circuit breaker para la API de Wompi (CONVENTIONS §Resiliencia, threshold 5 /
 * resetMs 30 s). Protege el path de confirmación de pago: si Wompi está caído,
 * falla-rápido en vez de colgar cada consulta de estado. Per-instancia en
 * serverless (mandato #11).
 */
const wompiCB = new CircuitBreaker({ name: "wompi", threshold: 5, resetMs: 30_000 });

const SANDBOX_API = "https://sandbox.wompi.co/v1";
const PRODUCTION_API = "https://production.wompi.co/v1";
const SANDBOX_CHECKOUT = "https://checkout.wompi.co/p/";

export type WompiEnv = "sandbox" | "production";

function getEnv(): WompiEnv {
  // Defensa: si el valor viene con comentario tipo "sandbox  # ..." lo limpiamos.
  const raw = process.env.WOMPI_ENV?.trim().split(/\s+/)[0]?.toLowerCase();
  return raw === "production" ? "production" : "sandbox";
}

/**
 * #3 (certificación Bloque A) — El `environment` que esperamos en los webhooks
 * de Wompi, derivado de WOMPI_ENV (la MISMA fuente que usa el cliente API).
 *
 * Wompi manda environment="prod" en producción y "test" en sandbox. Antes el
 * webhook lo derivaba de NODE_ENV, que en Vercel preview es "production" aunque
 * WOMPI_ENV=sandbox → rechazaba webhooks sandbox legítimos con 401. Unificar la
 * fuente elimina esa inconsistencia.
 */
export function getWompiExpectedWebhookEnv(): "prod" | "test" {
  return getEnv() === "production" ? "prod" : "test";
}

export function getWompiConfig() {
  const env = getEnv();
  const publicKey = process.env.WOMPI_PUBLIC_KEY?.trim();
  const privateKey = process.env.WOMPI_PRIVATE_KEY?.trim();
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET?.trim();
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  if (!publicKey || !privateKey || !eventsSecret || !integritySecret) {
    throw new Error(
      "Wompi: faltan WOMPI_PUBLIC_KEY / WOMPI_PRIVATE_KEY / WOMPI_EVENTS_SECRET / WOMPI_INTEGRITY_SECRET en env",
    );
  }
  return {
    env,
    apiUrl: env === "production" ? PRODUCTION_API : SANDBOX_API,
    publicKey,
    privateKey,
    eventsSecret,
    integritySecret,
  };
}

/**
 * Genera la firma de integridad para una transacción (requerida por Web
 * Checkout para evitar que cliente manipule monto). Formato:
 *   SHA256(reference + amountInCents + currency + integritySecret)
 * Doc: docs.wompi.co § Generación de la firma de integridad
 */
export function generateIntegritySignature(input: {
  reference: string;
  amountInCents: number;
  currency: string;
}): string {
  const { integritySecret } = getWompiConfig();
  const concat = `${input.reference}${input.amountInCents}${input.currency}${integritySecret}`;
  return crypto.createHash("sha256").update(concat).digest("hex");
}

/**
 * Construye la URL del Web Checkout hosted (cliente paga en wompi.co).
 *
 * El cliente es redirigido a esta URL. Tras pago Wompi redirige de vuelta
 * a redirectUrl con `?id=TX_ID&env=…&status=…` como query params (NO
 * confiar en esos params para confirmar estado — siempre verificar con
 * getTransaction(id) o esperar webhook).
 */
export function buildCheckoutUrl(input: {
  reference: string;
  amountInCents: number;
  currency: string;
  customerEmail: string;
  redirectUrl: string;
  taxes?: { type: "VAT" | "CONSUMPTION"; amountInCents: number }[];
  customer?: {
    fullName?: string;
    phone?: string;
    legalIdType?: "CC" | "CE" | "NIT" | "PP" | "TI" | "DNI" | "RG" | "OTHER";
    legalId?: string;
  };
}): string {
  const { publicKey } = getWompiConfig();
  const signature = generateIntegritySignature({
    reference: input.reference,
    amountInCents: input.amountInCents,
    currency: input.currency,
  });
  const params = new URLSearchParams({
    "public-key": publicKey,
    currency: input.currency,
    "amount-in-cents": String(input.amountInCents),
    reference: input.reference,
    "signature:integrity": signature,
    "customer-data:email": input.customerEmail,
  });

  // Prefill del comprador (doc widget-checkout-web paso 5): el checkout YA
  // recolectó nombre/teléfono/documento — sin esto el cliente redigitaba todo
  // dentro de Wompi (fricción → abandono; auditoría doc 2026-07-28).
  const c = input.customer;
  if (c?.fullName?.trim()) params.set("customer-data:full-name", c.fullName.trim());
  if (c?.phone?.trim()) {
    // Tienda solo Colombia: prefijo +57; el form guarda formato local (3XX…).
    const digits = c.phone.replace(/\D/g, "");
    const national = digits.length === 12 && digits.startsWith("57") ? digits.slice(2) : digits;
    if (national.length >= 10) {
      params.set("customer-data:phone-number-prefix", "57");
      params.set("customer-data:phone-number", national.slice(-10));
    }
  }
  if (c?.legalId?.trim() && c?.legalIdType) {
    params.set("customer-data:legal-id", c.legalId.replace(/\D/g, ""));
    params.set("customer-data:legal-id-type", c.legalIdType);
  }

  // CloudFront WAF de Wompi bloquea (403) redirect-url que apunta a
  // localhost/127.0.0.1 (open-redirect protection). Verificado 2026-05-21
  // con probe progresivo: ese param dispara el block. Solución: omitirlo en
  // dev (Wompi muestra su página propia de "gracias") y solo enviarlo en
  // producción con dominio público real.
  const isLocalRedirect = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(input.redirectUrl);
  if (!isLocalRedirect) {
    params.set("redirect-url", input.redirectUrl);
  } else {
    logger.warn({
      event: "wompi.checkout_url.redirect_omitted",
      reason: "localhost-in-redirect-url (Wompi WAF would 403)",
      redirectUrl: input.redirectUrl,
    });
  }

  if (input.taxes) {
    input.taxes.forEach((t) => {
      params.set(`tax-in-cents:${t.type.toLowerCase()}`, String(t.amountInCents));
    });
  }
  return `${SANDBOX_CHECKOUT}?${params.toString()}`;
}

/**
 * Lookup de transacción por ID. Usado tras el redirect del checkout
 * para confirmar estado antes de marcar la Order como pagada (no se
 * confía en query params del redirect — pueden ser manipulados).
 */
export type WompiTransactionStatus = "PENDING" | "APPROVED" | "DECLINED" | "VOIDED" | "ERROR";

export type WompiTransaction = {
  id: string;
  reference: string;
  status: WompiTransactionStatus;
  amount_in_cents: number;
  currency: string;
  customer_email: string | null;
  payment_method_type: string | null;
  created_at: string;
  finalized_at: string | null;
  status_message: string | null;
};

export async function getTransaction(id: string): Promise<WompiTransaction> {
  const cfg = getWompiConfig();
  const url = `${cfg.apiUrl}/transactions/${encodeURIComponent(id)}`;
  // GET idempotente (consulta de estado) → seguro reintentar. Retry por fuera del
  // breaker: cada intento cuenta para el CB y, abierto, corta de una. Timeout 5 s
  // (CONVENTIONS §Resiliencia) — con reintentos+backoff es más robusto que un
  // único 10 s sin retry. 5xx se marca `.status` para que `isRetryable` reintente.
  return withRetry(() =>
    wompiCB.exec(async () => {
      const res = await fetchWithTimeout(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${cfg.privateKey}` },
        cache: "no-store",
        timeoutMs: 5000,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        logger.warn({
          event: "wompi.get_transaction.fail",
          status: res.status,
          id,
          body: body.slice(0, 200),
        });
        throw Object.assign(new Error(`Wompi getTransaction HTTP ${res.status}`), {
          status: res.status,
        });
      }
      const json = (await res.json()) as { data: WompiTransaction };
      return json.data;
    }),
  );
}

/**
 * Verifica firma del webhook. Wompi calcula:
 *   SHA256(propiedades_ordenadas + timestamp + events_secret)
 * Doc: docs.wompi.co § Verificación de la firma de eventos
 *
 * El body del webhook tiene shape:
 *   { event, data: { transaction: {...} }, sent_at, timestamp,
 *     signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
 *                  checksum: "<sha256>" } }
 *
 * El checksum se calcula concatenando los VALORES de cada property
 * (en el orden listado) + timestamp + events_secret, todo en string, luego SHA256.
 */
export function verifyWebhookSignature(rawBody: string): {
  valid: boolean;
  event: WompiWebhookEvent | null;
  reason?: string;
} {
  let parsed: WompiWebhookEvent;
  try {
    parsed = JSON.parse(rawBody) as WompiWebhookEvent;
  } catch {
    return { valid: false, event: null, reason: "JSON inválido" };
  }
  if (!parsed?.signature?.checksum || !parsed.signature.properties || !parsed.timestamp) {
    return { valid: false, event: null, reason: "signature/timestamp ausentes" };
  }

  const { eventsSecret } = getWompiConfig();
  const concat =
    parsed.signature.properties.map((prop) => extractValueByPath(parsed.data, prop)).join("") +
    String(parsed.timestamp) +
    eventsSecret;

  const expected = crypto.createHash("sha256").update(concat).digest("hex");
  // timingSafeEqual: previene timing-attacks que infieren bytes correctos
  // por diferencias de microsegundos en `!==`. Requiere mismo length —
  // ambos son hex SHA-256 de 64 chars, pero defendemos length-mismatch
  // primero (timingSafeEqual lanza si difieren).
  const received = parsed.signature.checksum;
  if (expected.length !== received.length) {
    return { valid: false, event: parsed, reason: "checksum mismatch" };
  }
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");
  if (
    expectedBuf.length !== receivedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    return { valid: false, event: parsed, reason: "checksum mismatch" };
  }
  return { valid: true, event: parsed };
}

function extractValueByPath(obj: unknown, path: string): string {
  // path "transaction.id" → obj.transaction.id
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return "";
    }
  }
  return cur === null || cur === undefined ? "" : String(cur);
}

export type WompiWebhookEvent = {
  event: "transaction.updated" | "nequi_token.updated";
  data: {
    transaction?: WompiTransaction;
  };
  environment: "test" | "prod";
  signature: {
    properties: string[];
    checksum: string;
  };
  timestamp: number;
  sent_at: string;
};
