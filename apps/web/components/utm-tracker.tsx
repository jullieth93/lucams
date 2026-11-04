"use client";

/*
 * <UtmTracker /> — captura first-party de atribución UTM sin PII (`Fase 12 · S25`).
 *
 * Montado en `app/layout.tsx` dentro del mismo `<Suspense>` que `<AnalyticsGa4 />`.
 * - Respeta estrictamente `hasAnalyticsConsent()`:
 *   - Si el visitante NO consiente analíticas (o revoca su consentimiento), limpia
 *     cualquier cookie `lucams_utm` existente y no persiste nada en disco.
 *   - Si el visitante entra con `?utm_source=...` y luego acepta el banner de cookies
 *     en la misma vista, captura la atribución en ese instante gracias a la suscripción
 *     reactiva sobre `cookie-consent-changed`.
 */

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { hasAnalyticsConsent } from "@/lib/cookie-consent";
import {
  encodeUtmCookie,
  extractUtmFromSearchParams,
  UTM_COOKIE_MAX_AGE_SECONDS,
  UTM_COOKIE_NAME,
} from "@/lib/utm-attribution";

function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener("cookie-consent-changed", onChange);
  return () => window.removeEventListener("cookie-consent-changed", onChange);
}

function clearUtmCookieInBrowser(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${UTM_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
}

function writeUtmCookieInBrowser(encodedValue: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${UTM_COOKIE_NAME}=${encodedValue}; Max-Age=${UTM_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

export function UtmTracker() {
  const consented = useSyncExternalStore(subscribeConsent, hasAnalyticsConsent, () => false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!consented) {
      clearUtmCookieInBrowser();
      return;
    }
    if (pathname.startsWith("/admin")) return;

    const attribution = extractUtmFromSearchParams(pathname, searchParams);
    if (!attribution) return;

    writeUtmCookieInBrowser(encodeUtmCookie(attribution));
  }, [consented, pathname, searchParams]);

  return null;
}
