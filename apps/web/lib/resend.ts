/*
 * lib/resend.ts — cliente centralizado de Resend con retry exponencial
 * y circuit breaker simple.
 *
 * Sin dependencias externas: usamos `fetch` directo contra la REST API
 * de Resend. Permite cero peso adicional en node_modules y elimina
 * acoplamiento a una versión específica del SDK.
 *
 * Patrón de uso:
 *   await sendEmail({
 *     to: "lucy@example.com",
 *     subject: "Bienvenida",
 *     html: "<h1>...</h1>",
 *     text: "...",         // siempre incluir text fallback (deliverability)
 *     idempotencyKey: "...", // opcional, Resend dedupe envíos
 *   });
 *
 * Circuit breaker (in-memory por instancia serverless):
 *   - Se "abre" si > 50% de los últimos 10 envíos fallaron
 *   - Cuando abierto, los siguientes envíos devuelven { skipped: true }
 *   - Se "cierra" automáticamente tras 30s sin tráfico (TTL del estado)
 *
 * Retry: 3 intentos con backoff exponencial 1s/2s/4s para errores
 * transient (HTTP 5xx, network). NUNCA reintenta en 4xx (bad request,
 * email inválido, etc.).
 *
 * En modo DEV sin RESEND_API_KEY → loguea el email y devuelve
 * { skipped: true, reason: "no-key" } para no bloquear desarrollo.
 */

import "server-only";
import { logger } from "@/lib/logger";

const RESEND_URL = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 15_000;

const breaker = {
  recentResults: [] as boolean[],
  openUntil: 0,
};

function recordResult(ok: boolean) {
  breaker.recentResults.push(ok);
  if (breaker.recentResults.length > 10) breaker.recentResults.shift();
  if (breaker.recentResults.length >= 6) {
    const fails = breaker.recentResults.filter((r) => !r).length;
    if (fails / breaker.recentResults.length > 0.5) {
      breaker.openUntil = Date.now() + 30_000; // open 30s
      logger.warn({ event: "resend.circuit_open", fails, total: breaker.recentResults.length });
    }
  }
}

function isCircuitOpen() {
  return breaker.openUntil > Date.now();
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  idempotencyKey?: string;
  tags?: Array<{ name: string; value: string }>;
};

export type SendEmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: string; skipped?: boolean; status?: number };

async function attemptSend(
  apiKey: string,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<SendEmailResult> {
  try {
    const r = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (r.ok) {
      const data = (await r.json()) as { id: string };
      return { sent: true, id: data.id };
    }
    let detail = `HTTP ${r.status}`;
    try {
      const errBody = (await r.json()) as { message?: string };
      if (errBody.message) detail = errBody.message;
    } catch {
      /* ignore parse error */
    }
    return { sent: false, reason: detail, status: r.status, skipped: false };
  } catch (err) {
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "network",
      skipped: false,
    };
  }
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromDefault = process.env.EMAIL_FROM ?? "Lucams_shop <onboarding@resend.dev>";
  const from = input.from ?? fromDefault;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      logger.error({ event: "email.send.no_key_in_prod", to: input.to, subject: input.subject });
      return { sent: false, reason: "no-api-key", skipped: true };
    }
    // Dev: solo log
    logger.info({
      event: "email.send.dev_stub",
      to: Array.isArray(input.to) ? input.to.join(",") : input.to,
      subject: input.subject,
    });
    return { sent: false, reason: "no-api-key", skipped: true };
  }

  if (isCircuitOpen()) {
    logger.warn({ event: "email.send.circuit_open_skip", subject: input.subject });
    return { sent: false, reason: "circuit-open", skipped: true };
  }

  const payload: Record<string, unknown> = {
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
  };

  const backoffMs = [0, 1000, 2000, 4000];
  let last: SendEmailResult = { sent: false, reason: "no-attempt" };
  for (let attempt = 0; attempt < 4; attempt++) {
    if (backoffMs[attempt] > 0) await new Promise((r) => setTimeout(r, backoffMs[attempt]));
    last = await attemptSend(apiKey, payload, input.idempotencyKey);
    if (last.sent) {
      recordResult(true);
      logger.info({
        event: "email.send.success",
        to: Array.isArray(input.to) ? input.to.join(",") : input.to,
        subject: input.subject,
        attempt: attempt + 1,
        id: last.id,
      });
      return last;
    }
    const transient = last.status === undefined || last.status >= 500 || last.status === 429;
    if (!transient) break; // 4xx no retry
  }

  recordResult(false);
  logger.error({
    event: "email.send.fail",
    to: Array.isArray(input.to) ? input.to.join(",") : input.to,
    subject: input.subject,
    reason: last.reason,
    status: last.status,
  });
  return last;
}
