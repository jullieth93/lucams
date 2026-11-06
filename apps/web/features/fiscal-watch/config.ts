/*
 * Vigilancia fiscal proactiva (ADR-196) — alerta temprana de umbrales DIAN.
 *
 * Por qué existe: Lucams Shop opera hoy como persona natural NO responsable de IVA
 * y exenta de facturación electrónica por el tope de ingresos (docs/COMPLIANCE.md
 * § 7.1). Esa exención se pierde por SORPRESA si nadie mide el acumulado anual: el
 * tope se evalúa cada 31 de diciembre y la obligación arranca al año siguiente (o
 * de inmediato al inscribirse en el Régimen Simple). Este módulo mide el año en
 * curso, proyecta el cierre según el ritmo mensual y alerta en /admin/hoy,
 * /admin/notificaciones y correo (niveles 70/90/100 %) con meses de antelación.
 *
 * Configuración en CÓDIGO (decisión del owner 2026-11-05, no CMS): el valor UVT y
 * los umbrales son datos LEGALES — su cambio debe quedar auditado en git vía PR,
 * no editarse en caliente. El test `config.test.ts` fuerza la actualización anual
 * de la UVT cada diciembre (grace: enero del año nuevo) antes de que CI se ponga
 * rojo.
 *
 * Reglas vigiladas hoy (extensible: agregar una entrada a FISCAL_RULES):
 *   1. `invoicing-threshold` — ingresos brutos YTD vs 3 500 UVT (art. 618-1 ET /
 *      Decreto 1625 art. 1.6.1.4.3 num. 3): superarlo obliga a facturar
 *      electrónicamente (Res. DIAN 165 de 2023).
 *   2. `iva-card-condition` — ventas pagadas con TARJETA (Wompi `CARD`, débito y
 *      crédito) vs 3 500 UVT (art. 437 par. 3 ET): superarlo convierte a la
 *      titular en responsable de IVA. PSE es débito a CUENTA (no tarjeta) y Nequi
 *      es billetera: quedan fuera de la regla pero se reportan como línea
 *      informativa de pagos electrónicos para revisión con el contador.
 *
 * Base de cálculo BRUTA CONSERVADORA (decisión del owner 2026-11-05): suma
 * `Order.total` de TODA orden que llegó a venta (PAID/FULFILLING/SHIPPED/
 * DELIVERED y también REFUNDED — fiscalmente el ingreso bruto se devengó aunque
 * luego se reembolse; el ajuste formal sería nota crédito cuando ya se facture).
 * A diferencia de /admin/metricas (ingreso NETO, sin REFUNDED), acá sobreestimar
 * es deseable: la alerta llega antes, nunca tarde.
 */

// ── UVT oficial por año (pesos COP) ──────────────────────────────────────────
// 2025: Res. DIAN 000229 de 2024 → $49.799 · 2026: Res. DIAN 000238 de 2025 → $52.374.
// Cada diciembre la DIAN publica la del año siguiente: agregarla ANTES de que
// termine enero (config.test.ts lo hace cumplir).
export const FISCAL_UVT_COP_BY_YEAR: Readonly<Record<number, number>> = {
  2025: 49_799,
  2026: 52_374,
};

// ── Umbrales normativos (en UVT) ─────────────────────────────────────────────
/** Tope de ingresos brutos anuales para la exención de facturación electrónica. */
export const FISCAL_INVOICING_THRESHOLD_UVT = 3_500;
/** Tope de ventas pagadas con tarjeta para permanecer NO responsable de IVA. */
export const FISCAL_IVA_CARD_THRESHOLD_UVT = 3_500;

// ── Niveles de alerta (fracción del umbral) ──────────────────────────────────
// 70 % = watch (solo in-app) · 90 % = warning (in-app + email) · 100 % = critical
// (in-app + email). Decisión del owner 2026-11-05: email en 90 % y 100 %, una vez
// por cruce y por año (dedup en AlertState).
export const FISCAL_LEVEL_RATIOS = { watch: 0.7, warning: 0.9, critical: 1.0 } as const;

export type FiscalLevel = "ok" | keyof typeof FISCAL_LEVEL_RATIOS;

/** Rango ascendente para comparar niveles (ok < watch < warning < critical). */
export const FISCAL_LEVEL_RANK: Record<FiscalLevel, number> = {
  ok: 0,
  watch: 1,
  warning: 2,
  critical: 3,
};

export function fiscalLevelForRatio(ratio: number): FiscalLevel {
  if (ratio >= FISCAL_LEVEL_RATIOS.critical) return "critical";
  if (ratio >= FISCAL_LEVEL_RATIOS.warning) return "warning";
  if (ratio >= FISCAL_LEVEL_RATIOS.watch) return "watch";
  return "ok";
}

/**
 * Umbral en CENTAVOS COP (mandato: dinero en Int, nunca floats) para `uvt` unidades.
 * La UVT se define en pesos; el producto cabe con holgura en number seguro
 * (3 500 × 52 374 × 100 ≈ 1,8e10 « 2^53).
 */
export function fiscalThresholdCents(year: number, uvt: number): number {
  const uvtCop = FISCAL_UVT_COP_BY_YEAR[year];
  if (!uvtCop) throw new Error(`UVT no configurada para el año ${year} (FISCAL_UVT_COP_BY_YEAR)`);
  return uvtCop * uvt * 100;
}
