/*
 * SLOs cuantitativos calculados de DATOS REALES · ADR-066 (OBSERVABILITY.md § SLOs).
 *
 * Los SLOs de infra (disponibilidad, latencia p95 por ruta) del doc se miden con el monitor externo
 * (diseño de /api/health/all) + instrumentación de tráfico post-lanzamiento. Lo que SÍ es medible hoy
 * desde la DB, sin dependencias ni tráfico externo, son tres SLIs de negocio/experiencia:
 *   - Web Vitals "good" (rendimiento real de usuario, ya capturado en WebVital)
 *   - Éxito de checkout (órdenes que llegaron a pago sobre las que lo intentaron)
 *   - Procesamiento de webhooks (procesados sobre recibidos)
 *
 * Cada SLO compara su SLI contra un objetivo y clasifica: cumplido / en riesgo / incumplido, o "sin
 * datos suficientes" si la muestra es chica (pre-lanzamiento) — para no mentir con porcentajes de 2
 * eventos. Se muestra en /admin/observability y alimenta una alerta del resumen diario.
 */

import "server-only";
import { prisma } from "@/lib/db";

export type SloStatus = "met" | "at_risk" | "breached" | "insufficient_data";

export type SloResult = {
  key: string;
  label: string;
  /** Valor actual del SLI en % (0..100), o null si no hay datos. */
  sliPct: number | null;
  targetPct: number;
  windowLabel: string;
  sampleSize: number;
  status: SloStatus;
};

// Margen "en riesgo": si el SLI está por encima del objetivo pero a menos de este colchón, avisa.
const AT_RISK_MARGIN_PCT = 2;

/**
 * Clasifica un SLO. PURA (testeable sin DB). `sliPct` = valor medido; se incumple si cae bajo el
 * objetivo, en riesgo si está dentro del margen por encima, cumplido si sobra. Muestra chica →
 * insufficient_data (no evaluamos porcentajes con < minSample eventos).
 */
export function evaluateSlo(
  sliPct: number | null,
  targetPct: number,
  sampleSize: number,
  minSample: number,
): SloStatus {
  if (sliPct === null || sampleSize < minSample) return "insufficient_data";
  if (sliPct < targetPct) return "breached";
  // En riesgo: por encima del objetivo pero dentro del margen. El 100% (tope) siempre es cumplido.
  if (sliPct < targetPct + AT_RISK_MARGIN_PCT && sliPct < 100) return "at_risk";
  return "met";
}

const pct = (num: number, den: number): number | null => (den > 0 ? (num / den) * 100 : null);
const since = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000);

/** Estados de orden que significan "el pago se completó" (llegó a PAID alguna vez). */
const CHECKOUT_SUCCEEDED = ["PAID", "FULFILLING", "SHIPPED", "DELIVERED", "REFUNDED"] as const;

/** Calcula los SLOs medibles hoy desde la DB. */
export async function getSloStatus(): Promise<SloResult[]> {
  const vitalsWindow = since(7);
  const bizWindow = since(30);
  // Los checkouts "en curso" (creados hace < 1h y aún en PENDING_PAYMENT) no cuentan como fallidos.
  const settleCutoff = new Date(Date.now() - 60 * 60 * 1000);

  const [vitalsGood, vitalsTotal, checkoutSucceeded, checkoutAttempted, wbProcessed, wbTotal] =
    await Promise.all([
      prisma.webVital.count({ where: { createdAt: { gte: vitalsWindow }, rating: "good" } }),
      prisma.webVital.count({ where: { createdAt: { gte: vitalsWindow } } }),
      prisma.order.count({
        where: {
          createdAt: { gte: bizWindow },
          deletedAt: null,
          status: { in: [...CHECKOUT_SUCCEEDED] },
        },
      }),
      prisma.order.count({
        where: {
          createdAt: { gte: bizWindow, lt: settleCutoff },
          deletedAt: null,
          status: { not: "DRAFT" },
        },
      }),
      prisma.webhookEvent.count({
        where: { createdAt: { gte: bizWindow }, processedAt: { not: null } },
      }),
      prisma.webhookEvent.count({ where: { createdAt: { gte: bizWindow } } }),
    ]);

  const results: SloResult[] = [
    {
      key: "web_vitals_good",
      label: "Rendimiento (Web Vitals buenos)",
      sliPct: pct(vitalsGood, vitalsTotal),
      targetPct: 75,
      windowLabel: "7 días",
      sampleSize: vitalsTotal,
      status: evaluateSlo(pct(vitalsGood, vitalsTotal), 75, vitalsTotal, 30),
    },
    {
      key: "checkout_success",
      label: "Éxito de checkout (llegan a pago)",
      sliPct: pct(checkoutSucceeded, checkoutAttempted),
      targetPct: 90,
      windowLabel: "30 días",
      sampleSize: checkoutAttempted,
      status: evaluateSlo(pct(checkoutSucceeded, checkoutAttempted), 90, checkoutAttempted, 20),
    },
    {
      key: "webhook_processing",
      label: "Procesamiento de webhooks",
      sliPct: pct(wbProcessed, wbTotal),
      targetPct: 99,
      windowLabel: "30 días",
      sampleSize: wbTotal,
      status: evaluateSlo(pct(wbProcessed, wbTotal), 99, wbTotal, 20),
    },
  ];
  return results;
}

/** Los SLOs incumplidos con datos suficientes (para alertar en el resumen diario). */
export async function getBreachedSlos(): Promise<SloResult[]> {
  const all = await getSloStatus();
  return all.filter((s) => s.status === "breached");
}
