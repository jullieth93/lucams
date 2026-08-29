"use server";

/*
 * Server action para persistir consentimiento de cookies en DB.
 *
 * El cookie ya está siendo seteado client-side (en CookiesBanner via
 * writeClientCookiePreferences) porque necesita estar disponible
 * inmediatamente para que el script no espere round-trip al server.
 *
 * Esta action AGREGA el registro en DB (audit) sin bloquear UX.
 * El cliente la invoca fire-and-forget tras setear la cookie.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getCurrentCustomer } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { recordCookieConsent } from "./service";
import type { CookiePreferences } from "@/lib/cookie-consent";

// Auditoría experto 2026-07-26 (P0): era el ÚNICO endpoint público que escribe en DB
// sin auth, sin rate-limit y sin validación runtime → la tabla Consent (audit trail
// Ley 1581) se podía inflar arbitrariamente. Validación de shape + rl por IP; la
// semántica de insert (una fila por evento de consentimiento) se conserva porque
// el audit trail la exige.
const prefsSchema = z.object({
  v: z.number(),
  necessary: z.literal(true), // siempre true (locked) — el shape del banner lo fija
  functional: z.boolean(),
  analytics: z.boolean(),
  marketing: z.boolean(),
  savedAt: z.string(),
});

export async function persistCookieConsentAction(prefs: CookiePreferences): Promise<void> {
  try {
    const parsed = prefsSchema.safeParse(prefs);
    if (!parsed.success) {
      logger.warn({ event: "consent.cookies.invalid_prefs" });
      return;
    }
    const hdrs = await headers();
    // getClientIp prefiere x-vercel-forwarded-for (no spoofeable) — la IP es prueba de
    // consentimiento (Ley 1581), no puede depender de un header que el cliente falsea (ADR-062 P1).
    const ip = getClientIp(hdrs);
    // Rate-limit por IP: fire-and-forget legítimo re-consiente rara vez; 30/min frena el
    // bulk-insert malicioso sin afectar UX (la cookie client-side ya quedó seteada).
    // IP hasheada en la key (auditoría 2026-08-24, C-8): no queda en claro en rate_limit_buckets.
    const { allowed } = await rateLimit(ipKey("consent_cookies", ip), 30, 60);
    if (!allowed) {
      logger.warn({ event: "consent.cookies.rate_limited" });
      return;
    }
    const userAgent = hdrs.get("user-agent") ?? null;
    const session = await getCurrentCustomer();

    await recordCookieConsent({
      prefs: parsed.data,
      customerId: session?.customer.id ?? null,
      email: session?.customer.email ?? null,
      ip,
      userAgent,
    });

    logger.info({
      event: "consent.cookies.recorded",
      functional: prefs.functional,
      analytics: prefs.analytics,
      marketing: prefs.marketing,
      hasCustomer: !!session?.customer.id,
    });
  } catch (err) {
    // Audit trail no debe romper UX — solo log
    logger.warn({
      event: "consent.cookies.record_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
