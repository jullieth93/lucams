/*
 * <WebVitalsReporter /> — captura métricas Core Web Vitals desde el
 * cliente y las envía a /api/vitals.
 *
 * Next.js expone `useReportWebVitals` (next/web-vitals) que recibe
 * LCP/FID/CLS/INP/TTFB/FCP automáticamente. Normalizamos el path
 * (e.g. "/producto/abc-xyz" → "/producto/[slug]") para que los
 * dashboards puedan agregar por route en vez de por URL exacta.
 *
 * Privacidad: no enviamos userId ni nada que identifique al
 * visitante directamente. El userAgent ya queda en el server-side
 * (request headers). sessionId solo si está disponible (cart cookie),
 * para correlacionar páginas dentro de una visita sin identificar.
 *
 * Consent gate (F-19, audit 2026-09-04): the beacon only fires when the
 * visitor accepted the "Analíticas" category in the cookie banner.
 * No answer yet → nothing is sent either: optional categories are opt-in
 * (legal.cookies.md states they stay off until accepted), so sending
 * telemetry before an affirmative answer would contradict the published
 * policy. The consent cookie is re-read lazily on every metric instead of
 * gating the subscription: a mid-session acceptance then takes effect on
 * its own, and we never pass a new callback reference to
 * useReportWebVitals on consent change (Next re-reports every metric
 * buffered so far to any new callback, which would duplicate beacons).
 */

"use client";

import { useReportWebVitals } from "next/web-vitals";
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import { hasAnalyticsConsent } from "@/lib/cookie-consent";

// Reglas para normalizar dynamic routes: si el pathname tiene un
// segmento que matchea estos patrones, lo reemplazamos por placeholder.
const DYNAMIC_PATTERNS: Array<[RegExp, string]> = [
  [/^\/producto\/[^/]+$/, "/producto/[slug]"],
  [/^\/admin\/productos\/[^/]+$/, "/admin/productos/[id]"],
  [/^\/admin\/categorias\/[^/]+$/, "/admin/categorias/[id]"],
];

function normalizeRoute(pathname: string): string {
  for (const [pattern, normalized] of DYNAMIC_PATTERNS) {
    if (pattern.test(pathname)) return normalized;
  }
  // Strip query string + trailing slash.
  return pathname.split("?")[0].replace(/\/$/, "") || "/";
}

export function WebVitalsReporter() {
  const pathname = usePathname();
  // useSelectedLayoutSegments fuerza re-render al cambiar de route.
  useSelectedLayoutSegments();

  useReportWebVitals((metric) => {
    if (!pathname) return;
    // Opt-in gate: skip silently until "Analíticas" is explicitly accepted.
    if (!hasAnalyticsConsent()) return;
    const route = normalizeRoute(pathname);
    // Envío fire-and-forget; el endpoint nunca devuelve error útil
    // al cliente. Usamos sendBeacon si está disponible para no
    // bloquear la navegación.
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      navType: metric.navigationType,
      route,
    });
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      try {
        navigator.sendBeacon("/api/vitals", new Blob([body], { type: "application/json" }));
        return;
      } catch {
        // fallthrough a fetch
      }
    }
    fetch("/api/vitals", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {
      // Silencioso — no queremos llenar consola del usuario por un
      // beacon de telemetría fallido.
    });
  });

  return null;
}
