/*
 * Declaración ambiental para el build CON ATRIBUCIÓN de web-vitals v5 que
 * Next shippea compilado en `next/dist/compiled/web-vitals-attribution`
 * (sin tipos publicados — lo mismo pasa con el build estándar, que Next
 * solo tipa a través del wrapper `next/web-vitals`).
 *
 * Lo usa components/web-vitals.tsx (2026-10-20): `useReportWebVitals` usa
 * siempre el build estándar (sin attribution) y el config
 * `experimental.webVitalsAttribution` es un flag muerto en Next 16.3
 * (se define __NEXT_HAS_WEB_VITALS_ATTRIBUTION pero nada lo consume), así
 * que registramos los handlers de este build directamente.
 */
declare module "next/dist/compiled/web-vitals-attribution" {
  export interface MetricWithAttribution {
    name: "CLS" | "FCP" | "FID" | "INP" | "LCP" | "TTFB";
    value: number;
    delta: number;
    rating: "good" | "needs-improvement" | "poor";
    navigationType: string;
    attribution: Record<string, unknown>;
  }
  type ReportCallback = (metric: MetricWithAttribution) => void;
  export function onCLS(cb: ReportCallback): void;
  export function onFCP(cb: ReportCallback): void;
  export function onINP(cb: ReportCallback): void;
  export function onLCP(cb: ReportCallback): void;
  export function onTTFB(cb: ReportCallback): void;
}
