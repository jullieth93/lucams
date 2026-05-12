/*
 * Service layer — Newsletter (Resend Audience + Consent record).
 *
 * Estrategia single opt-in conforme Ley 1581 Colombia:
 *   1. Validamos input + checkbox de consentimiento (Zod en schema).
 *   2. Creamos contacto en Resend Audience (RESEND_AUDIENCE_ID).
 *   3. Persistimos fila en `Consent` con scope=NEWSLETTER + IP + UA +
 *      version del aviso de privacidad. Esto cumple "consentimiento
 *      verificable" requerido por la ley.
 *
 * Idempotente: si el email ya está suscrito y consentido, no duplica.
 *
 * Email de bienvenida: post-MVP (sub-bloque G — react-email templates).
 * Por ahora confiamos en el "bienvenida automática" de Resend si está
 * configurado en el Audience.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const PRIVACY_VERSION = "v1-2026-05-12";

export type NewsletterResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; code: "RESEND_FAIL" | "AUDIENCE_MISSING"; message: string };

export async function subscribeNewsletter(opts: {
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<NewsletterResult> {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const apiKey = process.env.RESEND_API_KEY;

  // Soft-fail si las env vars no están seteadas: registramos el Consent
  // de todas formas (cumple Ley 1581) y mostramos éxito al usuario, pero
  // logueamos warning. Cuando Lucy configure RESEND_AUDIENCE_ID, los
  // contactos previos se pueden re-sincronizar desde el Consent table.
  if (!audienceId || !apiKey) {
    logger.warn(
      {
        event: "newsletter.subscribe.missing_env",
        hasAudienceId: !!audienceId,
        hasApiKey: !!apiKey,
      },
      "RESEND_AUDIENCE_ID o RESEND_API_KEY no configurados — registro solo en Consent",
    );
    await persistConsent(opts);
    return { ok: true, alreadySubscribed: false };
  }

  // 1. Resend: crear contacto. Si ya existe devuelve 409.
  let alreadySubscribed = false;
  try {
    const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        email: opts.email,
        unsubscribed: false,
      }),
    });

    if (res.status === 409 || res.status === 422) {
      // Ya existe en el audience. OK, idempotente.
      alreadySubscribed = true;
    } else if (!res.ok) {
      const errorText = await res.text();
      logger.warn(
        {
          event: "newsletter.subscribe.resend_fail",
          status: res.status,
          response: errorText.slice(0, 500),
        },
        "Resend API rejected contact creation",
      );
      return {
        ok: false,
        code: "RESEND_FAIL",
        message: "No pudimos confirmar la suscripción. Reintenta en unos minutos.",
      };
    }
  } catch (err) {
    logger.warn(
      {
        event: "newsletter.subscribe.resend_error",
        err: err instanceof Error ? err.message : String(err),
      },
      "Network error talking to Resend",
    );
    return {
      ok: false,
      code: "RESEND_FAIL",
      message: "No pudimos conectar con el servicio de email. Reintenta.",
    };
  }

  // 2. Consent record (independiente de Resend — Lucams es responsable
  // del dato, Resend es procesador subcontratado).
  await persistConsent(opts);

  logger.info({
    event: "newsletter.subscribe.success",
    alreadySubscribed,
  });

  return { ok: true, alreadySubscribed };
}

async function persistConsent(opts: {
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> {
  // Check si el email ya tiene un Consent NEWSLETTER vigente; si sí,
  // no duplicamos. Si lo había revocado, creamos uno nuevo.
  const existing = await prisma.consent.findFirst({
    where: {
      email: opts.email.toLowerCase(),
      scope: "NEWSLETTER",
      accepted: true,
      version: PRIVACY_VERSION,
    },
    orderBy: { acceptedAt: "desc" },
  });
  if (existing) return;

  await prisma.consent.create({
    data: {
      email: opts.email.toLowerCase(),
      scope: "NEWSLETTER",
      accepted: true,
      version: PRIVACY_VERSION,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
    },
  });
}
