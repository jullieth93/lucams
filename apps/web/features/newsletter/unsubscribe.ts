/*
 * Newsletter unsubscribe — Ley 1581 (revocación del consentimiento).
 *
 * P0-005 (Bloque B 2026-06-27). El consentimiento al newsletter se registra en
 * la tabla Consent (scope=NEWSLETTER, accepted=true). Revocar = crear un Consent
 * nuevo accepted=false que apunta al original (revokesId), + marcar el contacto
 * como unsubscribed en Resend.
 *
 * El link en el correo lleva email + token. El token es SHA-256(email:secret) —
 * NO es reversible, así que el email DEBE venir en el URL y el token solo
 * VERIFICA que quien tiene el link es el legítimo dueño del email (evita que
 * cualquiera dé de baja a otro poniendo el email crudo). Comparación timing-safe.
 */

import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

/**
 * Token de unsubscribe = SHA-256(email:CSRF_SECRET) truncado a 32 hex.
 * Compartido entre la generación (newsletter/actions al suscribir) y la
 * verificación (endpoint /unsubscribe). NO es secreto criptográfico fuerte;
 * solo evita el abuso de dar de baja a terceros con su email crudo.
 */
export function computeUnsubscribeToken(email: string): string {
  return createHash("sha256")
    .update(`${email.trim().toLowerCase()}:${process.env.CSRF_SECRET ?? "dev"}`)
    .digest("hex")
    .slice(0, 32);
}

/** Verificación timing-safe del token contra el email. */
export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = computeUnsubscribeToken(email);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export type UnsubscribeResult =
  | { ok: true; alreadyUnsubscribed: boolean }
  | { ok: false; reason: "invalid_token" };

/**
 * Revoca el consentimiento de newsletter para un email.
 *
 *  1. Verifica el token contra el email (rechaza si no coincide).
 *  2. Marca el contacto como unsubscribed=true en Resend (si está configurado).
 *  3. Registra un Consent accepted=false (revocación) apuntando al último
 *     consentimiento aceptado, si existe.
 *
 * Idempotente: si ya estaba revocado (no hay consent aceptado vigente), retorna
 * alreadyUnsubscribed=true sin duplicar la revocación.
 */
export async function unsubscribeNewsletter(
  email: string,
  token: string,
): Promise<UnsubscribeResult> {
  const normalized = email.trim().toLowerCase();
  if (!verifyUnsubscribeToken(normalized, token)) {
    logger.warn({ event: "newsletter.unsubscribe.invalid_token", emailHash: hashEmail(normalized) });
    return { ok: false, reason: "invalid_token" };
  }

  // Último consentimiento ACEPTADO vigente (lo que vamos a revocar).
  const lastAccepted = await prisma.consent.findFirst({
    where: { email: normalized, scope: "NEWSLETTER", accepted: true },
    orderBy: { acceptedAt: "desc" },
  });

  // ¿Ya hay una revocación posterior al último accepted? → ya dado de baja.
  if (lastAccepted) {
    const laterRevocation = await prisma.consent.findFirst({
      where: {
        email: normalized,
        scope: "NEWSLETTER",
        accepted: false,
        acceptedAt: { gt: lastAccepted.acceptedAt },
      },
    });
    if (laterRevocation) {
      await updateResendUnsubscribed(normalized); // re-asegura el estado en Resend
      return { ok: true, alreadyUnsubscribed: true };
    }
  } else {
    // No hay consentimiento aceptado → nada que revocar, pero confirmamos baja
    // en Resend igual (idempotente, cubre el caso de import externo).
    await updateResendUnsubscribed(normalized);
    return { ok: true, alreadyUnsubscribed: true };
  }

  // Registrar la revocación (Consent accepted=false → revokesId).
  await prisma.consent.create({
    data: {
      email: normalized,
      scope: "NEWSLETTER",
      accepted: false,
      version: lastAccepted.version,
      revokesId: lastAccepted.id,
    },
  });

  await updateResendUnsubscribed(normalized);

  logger.info({ event: "newsletter.unsubscribe.success", emailHash: hashEmail(normalized) });
  return { ok: true, alreadyUnsubscribed: false };
}

/** Marca el contacto como unsubscribed=true en Resend (best-effort). */
async function updateResendUnsubscribed(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn({ event: "newsletter.unsubscribe.missing_resend_env" });
    return;
  }
  try {
    // PATCH por email (la API de Resend acepta el email como identificador).
    const res = await fetchWithTimeout(
      `https://api.resend.com/contacts/${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ unsubscribed: true }),
        // "nunca un fetch sin timeout" — evita colgar el flujo de baja (revisión #6).
        timeoutMs: 10_000,
      },
    );
    if (!res.ok && res.status !== 404) {
      logger.warn({
        event: "newsletter.unsubscribe.resend_fail",
        status: res.status,
      });
    }
  } catch (err) {
    logger.warn({
      event: "newsletter.unsubscribe.resend_error",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Hash corto del email para logs (no exponer PII en texto plano). */
function hashEmail(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 12);
}
