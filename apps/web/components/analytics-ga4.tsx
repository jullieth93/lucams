"use client";

/*
 * <AnalyticsGa4 /> — loader de GA4 (gtag.js) con gate DURO de consentimiento.
 *
 * Montaje: root layout (app/layout.tsx), una sola vez, dentro de <Suspense>
 * (usa useSearchParams para los pageviews SPA).
 *
 * Reglas (auditoría SEO 2026-10-28, E09):
 *  - Sin NEXT_PUBLIC_GA_MEASUREMENT_ID → render null, no se carga nada.
 *  - gtag.js se carga SOLO con consentimiento explícito de "Analíticas":
 *    se revisa hasAnalyticsConsent() al montar y se suscribe al evento
 *    `cookie-consent-changed` (lo dispara writeClientCookiePreferences) por
 *    si el visitante acepta DESPUÉS de cargada la página. Nunca se carga
 *    antes del consentimiento — no hay Consent Mode v2 ni pings cookieless
 *    (decisión documentada en lib/analytics.ts).
 *  - La aceptación mid-session renderiza el <Script> en ese momento (el
 *    snapshot de useSyncExternalStore cambia con el evento) y el effect
 *    siembra dataLayer/gtag + config. La revocación no descarga el script
 *    ya inyectado (limitación documentada), pero trackEvent y los pageviews
 *    dejan de emitir (re-checqueo por evento).
 *
 * Estrategia de carga: `afterInteractive` (no lazyOnload). Los eventos de
 * ecommerce tempranos (view_item de la PDP, page_view inicial) deben salir
 * en cuanto la página es interactiva; lazyOnload espera al idle del browser
 * y en dispositivos lentos puede demorar segundos, perdiendo sesiones cortas
 * y ensuciando la atribución de los pageviews SPA. afterInteractive es la
 * estrategia estándar de analytics y NO bloquea el render ni la hidratación.
 *
 * Pageviews: `send_page_view: false` en el config (el page_view automático de
 * gtag solo cubre la carga inicial y duplicaría en navegación SPA). Emitimos
 * page_view manual: carga inicial post-consent + cada cambio de ruta
 * (usePathname + useSearchParams). Sin duplicar con el RUM propio
 * (components/web-vitals.tsx → /api/vitals): vitals ≠ analytics.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { hasAnalyticsConsent } from "@/lib/cookie-consent";
import { GA_MEASUREMENT_ID, initGa4Queue, isGa4Ready } from "@/lib/analytics";

// La cookie de consentimiento como external store: el snapshot la lee en cada
// render y la suscripción es el evento `cookie-consent-changed` (lo dispara
// writeClientCookiePreferences al guardar la decisión). Server snapshot =
// false: en SSR nunca hay consentimiento (opt-in estricto) y la hidratación
// no diverge (se re-evalúa en el cliente sin setState en effect).
function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener("cookie-consent-changed", onChange);
  return () => window.removeEventListener("cookie-consent-changed", onChange);
}

export function AnalyticsGa4() {
  const consented = useSyncExternalStore(subscribeConsent, hasAnalyticsConsent, () => false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const configuredRef = useRef(false);
  const lastPageviewRef = useRef<string | null>(null);

  // Config inicial: dataLayer + stub gtag ANTES del script (los comandos
  // quedan en cola y gtag.js los procesa al cargar — patrón oficial, pero
  // sin <script> inline para no pelear con la CSP de nonce).
  useEffect(() => {
    if (!consented || !GA_MEASUREMENT_ID || configuredRef.current) return;
    configuredRef.current = true;
    initGa4Queue();
    window.gtag!("js", new Date());
    window.gtag!("config", GA_MEASUREMENT_ID, { send_page_view: false });
  }, [consented]);

  // Pageviews: inicial (tras consent) + cada cambio de ruta SPA. El guard por
  // URL evita duplicados por re-render (StrictMode dev, re-renders del layout).
  // isGa4Ready() re-checkea el consentimiento en cada navegación: una
  // revocación mid-session detiene los pageviews aunque el script siga cargado.
  useEffect(() => {
    if (!consented || !isGa4Ready()) return;
    const qs = searchParams.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (lastPageviewRef.current === url) return;
    lastPageviewRef.current = url;
    window.gtag!("event", "page_view", {
      page_path: pathname,
      page_location: window.location.origin + url,
      page_title: document.title,
    });
  }, [consented, pathname, searchParams]);

  if (!GA_MEASUREMENT_ID || !consented) return null;
  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`}
      strategy="afterInteractive"
    />
  );
}
