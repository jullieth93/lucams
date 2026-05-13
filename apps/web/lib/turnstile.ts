/*
 * Cloudflare Turnstile — verificación server-side del token emitido
 * por el widget client.
 *
 * Documentación oficial:
 *   https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * Flujo:
 *  1. Cliente carga script https://challenges.cloudflare.com/turnstile/v0/api.js
 *  2. Widget genera token y lo pone en input[name=cf-turnstile-response]
 *  3. Server action recibe el token y llama verifyTurnstileToken()
 *  4. Cloudflare devuelve { success: bool, error-codes: [...] }
 *
 * Modo DEV: si TURNSTILE_SECRET_KEY no está seteada (entorno local sin
 * keys), siempre devolvemos `success: true` para no bloquear desarrollo.
 * En prod si la key falta es ERROR y bloqueamos por defecto.
 */

import "server-only";
import { logger } from "@/lib/logger";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult =
  | { success: true }
  | { success: false; errorCodes: string[]; reason: string };

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Dev mode sin keys: siempre OK. NUNCA en prod sin keys → bloquea.
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.error({ event: "turnstile.no_secret_in_prod" });
      return { success: false, errorCodes: ["missing-secret"], reason: "no-config" };
    }
    return { success: true };
  }

  if (!token) {
    return { success: false, errorCodes: ["missing-token"], reason: "no-token" };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    const r = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      logger.warn({ event: "turnstile.verify.http_fail", status: r.status });
      return { success: false, errorCodes: [`http-${r.status}`], reason: "http-error" };
    }
    const data = (await r.json()) as { success: boolean; "error-codes"?: string[] };
    if (data.success) return { success: true };
    const errorCodes = data["error-codes"] ?? [];
    logger.warn({ event: "turnstile.verify.failed", errorCodes });
    return { success: false, errorCodes, reason: "rejected" };
  } catch (err) {
    logger.error({
      event: "turnstile.verify.exception",
      err: err instanceof Error ? err.message : String(err),
    });
    return { success: false, errorCodes: ["exception"], reason: "network" };
  }
}
