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
import { logger } from "@/lib/logger";
import { getCurrentCustomer } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
import { recordCookieConsent } from "./service";
import type { CookiePreferences } from "@/lib/cookie-consent";

export async function persistCookieConsentAction(prefs: CookiePreferences): Promise<void> {
  try {
    const hdrs = await headers();
    // getClientIp prefiere x-vercel-forwarded-for (no spoofeable) — la IP es prueba de
    // consentimiento (Ley 1581), no puede depender de un header que el cliente falsea (ADR-062 P1).
    const ip = getClientIp(hdrs);
    const userAgent = hdrs.get("user-agent") ?? null;
    const session = await getCurrentCustomer();

    await recordCookieConsent({
      prefs,
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
