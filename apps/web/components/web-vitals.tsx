/*
 * <WebVitalsReporter /> — captura métricas Core Web Vitals desde el
 * cliente y las envía a /api/vitals.
 *
 * Next.js expone `useReportWebVitals` (next/web-vitals) que recibe
 * LCP/FID/CLS/INP/TTFB/FCP automáticamente. Normalizamos el path
 * (e.g. "/producto/abc-xyz" → "/producto/[slug]") para que los
 * dashboards puedan agregar por route en vez de por URL exacta.
 *
 * Además agregamos dos métricas propias por PAGEVIEW (1 fila c/u, nunca
 * por entrada cruda — Paquete C 2026-10-09):
 *   - LONGTASK: value = duración total (ms) de long tasks (>50ms,
 *     PerformanceObserver("longtask")); delta = cantidad.
 *   - PAGEWEIGHT: value = bytes transferidos totales de la página
 *     (navigation entry + PerformanceObserver("resource"), transferSize);
 *     delta = cantidad de recursos. Solo el total — WebVital no tiene
 *     columnas para el desglose por tipo. transferSize cuenta 0 en hits
 *     de caché y en recursos cross-origin sin Timing-Allow-Origin.
 * Ambas se acumulan en cliente y se envían al ocultar la página
 * (visibilitychange hidden / pagehide) y al cambiar de ruta en
 * navegación SPA (flush de la ruta anterior). En SPA los bytes/long
 * tasks se atribuyen a la ruta vigente al hacer flush — aproximación
 * documentada, el caso común (carga inicial → una ruta) es exacto.
 *
 * Privacidad: no enviamos userId ni nada que identifique al
 * visitante directamente. El userAgent ya queda en el server-side
 * (request headers). El sessionId (cookie del carrito) NO se lee acá:
 * `cart_session` es HttpOnly (lib/cart-session.ts) y el JS del cliente
 * no la ve — /api/vitals la extrae del header Cookie del beacon
 * (same-origin la incluye) cuando el payload no la trae.
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

import { useCallback, useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import { hasAnalyticsConsent } from "@/lib/cookie-consent";

// Reglas para normalizar dynamic routes: si el pathname tiene un
// segmento que matchea estos patrones, lo reemplazamos por placeholder.
const DYNAMIC_PATTERNS: Array<[RegExp, string]> = [
  [/^\/producto\/[^/]+$/, "/producto/[slug]"],
  // 2026-09-18 (alertas INP de Vercel): el Estudio es el flujo más pesado de
  // interacción — sin este patrón quedaba fragmentado por slug en el RUM.
  [/^\/estudio\/[^/]+$/, "/estudio/[slug]"],
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

type VitalsPayload = {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  delta: number;
  navType?: string;
  route: string;
  target?: string;
};

// Envío fire-and-forget; el endpoint nunca devuelve error útil al
// cliente. sendBeacon primero (no bloquea la navegación), fetch
// keepalive como fallback.
function sendVital(payload: VitalsPayload) {
  const body = JSON.stringify(payload);
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
}

/* Ratings propios para las métricas agregadas (web.dev no publica umbrales
   para estas — decisión de la casa, ADR-135):
   - LONGTASK sobre la duración TOTAL de long tasks del pageview: hasta
     200ms el hilo principal quedó poco bloqueado; 600ms+ es mala.
   - PAGEWEIGHT sobre bytes transferidos: 2MB / 5MB como bueno/pobre. */
function longTaskRating(totalMs: number): VitalsPayload["rating"] {
  if (totalMs <= 200) return "good";
  if (totalMs <= 600) return "needs-improvement";
  return "poor";
}
function pageWeightRating(bytes: number): VitalsPayload["rating"] {
  if (bytes <= 2_000_000) return "good";
  if (bytes <= 5_000_000) return "needs-improvement";
  return "poor";
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
    // 2026-09-18 (alertas "Interaction Timing" de Vercel): guardamos TAMBIÉN
    // el selector del elemento del build de atribución de web-vitals. Sin
    // esto el RUM decía "/estudio tiene INP 200ms" pero no QUÉ elemento.
    // 2026-10-09 (Paquete C): mismo tratamiento para CLS
    // (attribution.largestShiftTarget — qué elemento se movió) y LCP
    // (attribution.element — qué elemento es el LCP). Es un selector CSS
    // (clases/id), no dato personal.
    const attribution = metric.attribution as
      { interactionTarget?: unknown; largestShiftTarget?: unknown; element?: unknown } | undefined;
    const rawTarget =
      metric.name === "INP"
        ? attribution?.interactionTarget
        : metric.name === "CLS"
          ? attribution?.largestShiftTarget
          : metric.name === "LCP"
            ? attribution?.element
            : undefined;
    const target = typeof rawTarget === "string" ? rawTarget.slice(0, 200) : undefined;
    sendVital({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      navType: metric.navigationType,
      route,
      ...(target ? { target } : {}),
    });
  });

  // ── Métricas agregadas por pageview (LONGTASK / PAGEWEIGHT) ──
  const pathnameRef = useRef(pathname);
  const aggRef = useRef({ longMs: 0, longCount: 0, bytes: 0, resources: 0 });
  const doneRef = useRef(false);

  // Envía el acumulado de la ruta indicada y resetea los contadores.
  const flushAggregate = useCallback((forPathname: string) => {
    const agg = aggRef.current;
    const snapshot = { ...agg };
    agg.longMs = 0;
    agg.longCount = 0;
    agg.bytes = 0;
    agg.resources = 0;
    if (!hasAnalyticsConsent()) return;
    const route = normalizeRoute(forPathname);
    sendVital({
      name: "LONGTASK",
      value: Math.round(snapshot.longMs),
      rating: longTaskRating(snapshot.longMs),
      delta: snapshot.longCount,
      route,
    });
    sendVital({
      name: "PAGEWEIGHT",
      value: snapshot.bytes,
      rating: pageWeightRating(snapshot.bytes),
      delta: snapshot.resources,
      route,
    });
  }, []);

  // Observers: se montan una vez por carga de página (el root layout no se
  // desmonta en navegación SPA). El flush final va en pagehide/visibilitychange.
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const agg = aggRef.current;

    // Bytes del documento mismo (los resources no incluyen el navigation entry).
    const nav = performance.getEntriesByType?.("navigation")?.[0] as
      PerformanceNavigationTiming | undefined;
    if (nav && typeof nav.transferSize === "number") {
      agg.bytes += nav.transferSize;
      agg.resources += 1;
    }

    let resourceObs: PerformanceObserver | undefined;
    let longtaskObs: PerformanceObserver | undefined;
    try {
      resourceObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const resource = entry as PerformanceResourceTiming;
          if (typeof resource.transferSize === "number") {
            agg.bytes += resource.transferSize;
            agg.resources += 1;
          }
        }
      });
      resourceObs.observe({ type: "resource", buffered: true });
    } catch {
      // Navegador sin soporte de resource timing observer — queda solo
      // el peso del documento.
    }
    try {
      longtaskObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          agg.longCount += 1;
          agg.longMs += entry.duration;
        }
      });
      longtaskObs.observe({ type: "longtask", buffered: true });
    } catch {
      // Sin soporte de longtask (Firefox/Safari viejos) — LONGTASK sale en 0.
    }

    const finalFlush = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (pathnameRef.current) flushAggregate(pathnameRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") finalFlush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", finalFlush);
    return () => {
      finalFlush();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", finalFlush);
      resourceObs?.disconnect();
      longtaskObs?.disconnect();
    };
  }, [flushAggregate]);

  // Navegación SPA (cambio de ruta sin recarga): flush de la ruta anterior
  // para mantener 1 fila por pageview por ruta, y seguimos acumulando.
  useEffect(() => {
    if (pathnameRef.current === pathname) return;
    const prev = pathnameRef.current;
    pathnameRef.current = pathname;
    if (prev && !doneRef.current) flushAggregate(prev);
  }, [pathname, flushAggregate]);

  return null;
}
