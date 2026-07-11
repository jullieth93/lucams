/*
 * Service layer — Newsletter (Resend Contacts API + Consent record).
 *
 * Estrategia single opt-in conforme Ley 1581 Colombia:
 *   1. Validamos input + checkbox de consentimiento (Zod en schema).
 *   2. Creamos contacto en Resend via `POST /contacts` (API actual 2026).
 *      Opcionalmente asociamos a un Segment si RESEND_NEWSLETTER_SEGMENT_ID
 *      está definido (sino el contacto queda en el pool general).
 *   3. Persistimos fila en `Consent` con scope=NEWSLETTER + IP + UA +
 *      version del aviso de privacidad. Esto cumple "consentimiento
 *      verificable" requerido por la ley.
 *
 * Idempotente: si el email ya está suscrito y consentido, no duplica
 * (Resend devuelve 409/422; Consent table se chequea con findFirst).
 *
 * Email de bienvenida: post-MVP (sub-bloque G — react-email templates).
 *
 * Nota API Resend (verificado contra docs oficiales 2026-05-13):
 *   - Endpoint actual: `POST https://api.resend.com/contacts`
 *   - Body: { email, first_name?, last_name?, unsubscribed, segments?, topics? }
 *   - "Audiences" del legacy fueron reemplazadas por "Segments". El endpoint
 *     `POST /audiences/{audience_id}/contacts` está deprecated.
 *   - Para asociar a segment: pasar `segments: [{ id: "<segment_id>" }]`.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const PRIVACY_VERSION = "v1-2026-05-12";

export type NewsletterResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; code: "RESEND_FAIL" | "RESEND_NOT_CONFIGURED"; message: string };

export async function subscribeNewsletter(opts: {
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<NewsletterResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const segmentId = process.env.RESEND_NEWSLETTER_SEGMENT_ID; // opcional

  // Soft-fail si RESEND_API_KEY no está seteada: registramos el Consent
  // de todas formas (cumple Ley 1581) y mostramos éxito al usuario, pero
  // logueamos warning. Cuando Lucy configure RESEND_API_KEY, los contactos
  // previos se pueden re-sincronizar desde el Consent table.
  if (!apiKey) {
    logger.warn(
      {
        event: "newsletter.subscribe.missing_env",
      },
      "RESEND_API_KEY no configurado — registro solo en Consent",
    );
    await persistConsent(opts);
    return { ok: true, alreadySubscribed: false };
  }

  // 1. Resend: crear contacto via `POST /contacts` (API actual).
  let alreadySubscribed = false;
  try {
    const body: Record<string, unknown> = {
      email: opts.email,
      unsubscribed: false,
    };
    if (segmentId) {
      body.segments = [{ id: segmentId }];
    }

    const res = await fetchWithTimeout("https://api.resend.com/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      // "nunca un fetch sin timeout" (CONVENTIONS §Resiliencia): sin esto un Resend
      // colgado atascaría el server action de suscripción (revisión adversarial #6).
      timeoutMs: 10_000,
    });

    if (res.status === 409 || res.status === 422) {
      // Ya existe en Resend o validación rechazó por duplicado. OK,
      // idempotente — el Consent record se persiste igual abajo.
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
    withSegment: !!segmentId,
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
