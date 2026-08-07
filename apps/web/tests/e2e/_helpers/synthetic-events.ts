/*
 * Eventos sintéticos firmados para los webhooks (suite E2E full-mode §7.5 y
 * homolog-webhooks §8). Mismo esquema de firma que el emisor real, con los
 * secrets DEL AMBIENTE (cargados por _setup/env — nunca hardcodeados):
 *
 *  - Wompi: sha256_hex(concat de `signature.properties` en orden + timestamp +
 *    WOMPI_EVENTS_SECRET). La firma NO cubre `environment`.
 *  - Aveonline: secret estático por header `x-aveonline-secret` (timing-safe).
 *
 * Referencias: app/api/webhooks/wompi/route.ts, lib/wompi.ts
 * (verifyWebhookSignature), features/shipping/aveonline.ts (handleWebhook).
 */
import { createHash } from "node:crypto";

/** Body de evento Wompi transaction.updated con firma oficial. */
export function wompiEvent(opts: {
  secret: string;
  txId: string;
  status: string;
  /** amount_in_cents (centavos COP). */
  amount: number;
  reference: string;
  environment: "test" | "prod";
  timestamp: number;
  badSignature?: boolean;
}): string {
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const concat =
    String(opts.txId) +
    String(opts.status) +
    String(opts.amount) +
    String(opts.timestamp) +
    opts.secret;
  const checksum = opts.badSignature
    ? "0".repeat(64)
    : createHash("sha256").update(concat).digest("hex");
  return JSON.stringify({
    event: "transaction.updated",
    data: {
      transaction: {
        id: opts.txId,
        reference: opts.reference,
        status: opts.status,
        amount_in_cents: opts.amount,
        currency: "COP",
        payment_method_type: "CARD",
      },
    },
    environment: opts.environment,
    signature: { properties, checksum },
    timestamp: opts.timestamp,
  });
}

/**
 * POST al webhook Wompi descubriendo el environment que el ambiente acepta
 * (test↔sandbox / prod): la firma no cubre `environment`, así que el mismo
 * checksum sirve para ambos; si el primero da 401 mismatch se reenvía con el
 * otro. Devuelve { status, json } del intento aceptado.
 */
export async function postWompiEvent(
  request: {
    post: (
      url: string,
      opts: { headers: Record<string, string>; data: string },
    ) => Promise<{ status: () => number; json: () => Promise<unknown> }>;
  },
  opts: Omit<Parameters<typeof wompiEvent>[0], "environment">,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const post = (environment: "test" | "prod") =>
    request.post("/api/webhooks/wompi", {
      headers: { "Content-Type": "application/json" },
      data: wompiEvent({ ...opts, environment }),
    });
  let res = await post("test");
  if (res.status() === 401) res = await post("prod");
  return { status: res.status(), json: (await res.json()) as Record<string, unknown> };
}

/** Body de webhook Aveonline (shape plugin legacy: guia numérica + estado[]). */
export function aveonlineEvent(guia: string, nombreEstado: string, fecha: string): string {
  return JSON.stringify({
    // La doc de Aveonline envía `guia` como NÚMERO — se ejerce la coerción.
    guia: Number(guia),
    estado: [{ nombre_estado: nombreEstado, fecha }],
  });
}
