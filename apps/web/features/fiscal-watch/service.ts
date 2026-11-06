/*
 * Vigilancia fiscal proactiva (ADR-196) — cálculo y despacho de alertas.
 *
 * Piezas:
 *   - getFiscalYearSnapshot: agrega el año fiscal en curso (año civil en
 *     America/Bogota — UTC-5 fijo, Colombia sin DST) sobre Order y
 *     WompiPaymentTransaction, en centavos COP.
 *   - evaluateFiscalRules: motor PURO regla → evaluación (nivel, proyección
 *     run-rate, fecha estimada de cruce). Sin DB: lo testea service.test.ts.
 *   - runFiscalWatch: persiste el estado por regla-año en AlertState
 *     (`fiscal-watch:<ruleId>:<year>` — el año en la clave reinicia solo el
 *     dedup cada 1° de enero), publica/actualiza la notificación in-app
 *     (dedupKey) y dispara email al cruzar 90 %/100 % UNA vez por cruce y año.
 *
 * Se dispara desde /api/cron/fiscal-watch (pg_cron diario 07:05 COT, antes del
 * resumen de las 08:00) y se lee en vivo desde /admin/hoy y /admin/metricas.
 */

import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { formatCOP } from "@/lib/format";
import { formatDateLongCO } from "@/lib/datetime";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import { notify, type NotificationSeverity } from "@/features/notifications/service";
import { renderFiscalThresholdAlertEmail } from "@/features/emails/registry";
import {
  FISCAL_IVA_CARD_THRESHOLD_UVT,
  FISCAL_INVOICING_THRESHOLD_UVT,
  FISCAL_LEVEL_RANK,
  FISCAL_UVT_COP_BY_YEAR,
  fiscalLevelForRatio,
  type FiscalLevel,
} from "./config";

// Colombia no tiene DST: el año fiscal es el año civil en UTC-5, así que basta
// correr 5 h el reloj UTC (sin Intl ad hoc — convención de lib/datetime.ts).
const COLOMBIA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 30;

/** Estados que implican VENTA realizada. Incluye REFUNDED a propósito (base
 * bruta conservadora — ver config.ts): el ingreso bruto se devengó aunque la
 * plata se devuelva después. */
const FISCAL_SALE_STATUSES = ["PAID", "FULFILLING", "SHIPPED", "DELIVERED", "REFUNDED"] as const;

// ── Tipos ────────────────────────────────────────────────────────────────────

export type FiscalYearSnapshot = {
  /** Año civil en America/Bogota. */
  year: number;
  /** Instante del cálculo (ancla la proyección y la fecha estimada de cruce). */
  computedAt: Date;
  /** UVT oficial del año en PESOS COP (config.FISCAL_UVT_COP_BY_YEAR). */
  uvtCop: number;
  elapsedDays: number;
  totalDaysInYear: number;
  remainingDays: number;
  /** Ingresos brutos YTD en centavos (ventas del año, incluidas reembolsadas). */
  grossIncomeYtdCop: number;
  /** Ventas YTD pagadas con TARJETA (Wompi `CARD` APPROVED), en centavos. */
  cardIncomeYtdCop: number;
  /** Pagos electrónicos YTD (CARD + PSE + Nequi + Bancolombia), en centavos — línea informativa. */
  electronicIncomeYtdCop: number;
  /** Ingresos brutos de los últimos 30 días (ritmo reciente para la proyección). */
  grossIncomeRecentCop: number;
  cardIncomeRecentCop: number;
};

export type FiscalRuleId = "invoicing-threshold" | "iva-card-condition";

export type FiscalRuleEvaluation = {
  ruleId: FiscalRuleId;
  name: string;
  /** Referencia normativa corta para UI y correo. */
  legalBasis: string;
  /** Qué hacer al cruzar (accionable, mandato de alertas). */
  action: string;
  thresholdCop: number;
  currentCop: number;
  /** currentCop / thresholdCop. */
  currentRatio: number;
  /** Proyección del cierre anual (ritmo reciente) en centavos. */
  projectedYearEndCop: number;
  projectedRatio: number;
  level: FiscalLevel;
  /** Nivel que tomaría la PROYECCIÓN al cierre del año (puede superar al actual). */
  projectedLevel: FiscalLevel;
  /** Fecha estimada de cruce del 100 % al ritmo reciente; null si no se proyecta cruce. */
  estimatedCrossingAt: Date | null;
};

// ── Calendario fiscal colombiano ─────────────────────────────────────────────

/** Año civil de `now` en America/Bogota (UTC-5 fijo). */
export function fiscalYearOf(now: Date): number {
  return new Date(now.getTime() - COLOMBIA_OFFSET_MS).getUTCFullYear();
}

/** [inicio, fin) del año civil colombiano en UTC. */
export function fiscalYearBoundsUtc(year: number): { startUtc: Date; endUtc: Date } {
  return {
    startUtc: new Date(Date.UTC(year, 0, 1) + COLOMBIA_OFFSET_MS),
    endUtc: new Date(Date.UTC(year + 1, 0, 1) + COLOMBIA_OFFSET_MS),
  };
}

// ── Snapshot (DB) ────────────────────────────────────────────────────────────

export async function getFiscalYearSnapshot(now: Date = new Date()): Promise<FiscalYearSnapshot> {
  const year = fiscalYearOf(now);
  const { startUtc, endUtc } = fiscalYearBoundsUtc(year);
  const totalDaysInYear = Math.round((endUtc.getTime() - startUtc.getTime()) / DAY_MS);
  const elapsedDays = Math.min(
    totalDaysInYear,
    Math.floor((now.getTime() - startUtc.getTime()) / DAY_MS) + 1,
  );
  // Ventana del "ritmo reciente": 30 días o lo que lleve el año (enero).
  const recentDays = Math.min(RECENT_WINDOW_DAYS, elapsedDays);
  const recentStart = new Date(now.getTime() - recentDays * DAY_MS);

  const ytdSaleWhere: Prisma.OrderWhereInput = {
    deletedAt: null,
    status: { in: [...FISCAL_SALE_STATUSES] },
    createdAt: { gte: startUtc, lt: endUtc },
  };
  const recentSaleWhere: Prisma.OrderWhereInput = {
    deletedAt: null,
    status: { in: [...FISCAL_SALE_STATUSES] },
    createdAt: { gte: recentStart, lte: now },
  };
  // La tarjeta se atribuye al año de la ORDEN (la venta), no al del webhook:
  // una orden del 31-dic pagada con tarjeta cuenta al año de la venta.
  const cardWhere = (orderCreatedAt: {
    gte: Date;
    lt?: Date;
    lte?: Date;
  }): Prisma.WompiPaymentTransactionWhereInput => ({
    status: "APPROVED",
    attempt: { order: { deletedAt: null, createdAt: orderCreatedAt } },
  });

  const [grossYtd, cardYtd, electronicYtd, grossRecent, cardRecent] = await Promise.all([
    prisma.order.aggregate({ _sum: { total: true }, where: ytdSaleWhere }),
    prisma.wompiPaymentTransaction.aggregate({
      _sum: { amountInCents: true },
      where: { ...cardWhere({ gte: startUtc, lt: endUtc }), paymentMethodType: "CARD" },
    }),
    prisma.wompiPaymentTransaction.aggregate({
      _sum: { amountInCents: true },
      where: cardWhere({ gte: startUtc, lt: endUtc }),
    }),
    prisma.order.aggregate({ _sum: { total: true }, where: recentSaleWhere }),
    prisma.wompiPaymentTransaction.aggregate({
      _sum: { amountInCents: true },
      where: { ...cardWhere({ gte: recentStart, lte: now }), paymentMethodType: "CARD" },
    }),
  ]);

  const uvtCop = FISCAL_UVT_COP_BY_YEAR[year] ?? FISCAL_UVT_COP_BY_YEAR[year - 1];
  if (!FISCAL_UVT_COP_BY_YEAR[year]) {
    // No reventar el cron a las 00:00 del 1° de enero: config.test.ts obliga la
    // actualización durante enero; mientras tanto se reporta con la UVT del año
    // anterior (conservador: la UVT sube cada año, así que el tope en pesos
    // queda MÁS bajo y la alerta llega antes).
    logger.error({ event: "fiscal_watch.uvt_missing", year, fallbackYear: year - 1 });
  }

  return {
    year,
    computedAt: now,
    uvtCop,
    elapsedDays,
    totalDaysInYear,
    remainingDays: totalDaysInYear - elapsedDays,
    grossIncomeYtdCop: grossYtd._sum?.total ?? 0,
    cardIncomeYtdCop: cardYtd._sum?.amountInCents ?? 0,
    electronicIncomeYtdCop: electronicYtd._sum?.amountInCents ?? 0,
    grossIncomeRecentCop: grossRecent._sum?.total ?? 0,
    cardIncomeRecentCop: cardRecent._sum?.amountInCents ?? 0,
  };
}

// ── Motor de reglas (puro) ───────────────────────────────────────────────────

type FiscalRuleDef = {
  ruleId: FiscalRuleId;
  name: string;
  legalBasis: string;
  action: string;
  thresholdUvt: number;
  currentCop: (s: FiscalYearSnapshot) => number;
  recentCop: (s: FiscalYearSnapshot) => number;
};

/**
 * Reglas vigiladas. Para sumar un umbral futuro (p. ej. RNBD 100 000 UVT de
 * activos si se constituye sociedad) basta una entrada acá + su métrica en el
 * snapshot; niveles, proyección, dedup y canales se heredan.
 */
export const FISCAL_RULES: readonly FiscalRuleDef[] = [
  {
    ruleId: "invoicing-threshold",
    name: "Tope de facturación electrónica",
    legalBasis: "Art. 618-1 ET · Decreto 1625 art. 1.6.1.4.3 num. 3 · Res. DIAN 165 de 2023",
    action:
      "Agenda con el contador la habilitación como facturador electrónico (RUT responsabilidad 52 + proveedor tecnológico) y revisa la ruta de activación en docs/COMPLIANCE.md § 7.2.",
    thresholdUvt: FISCAL_INVOICING_THRESHOLD_UVT,
    currentCop: (s) => s.grossIncomeYtdCop,
    recentCop: (s) => s.grossIncomeRecentCop,
  },
  {
    ruleId: "iva-card-condition",
    name: "Condición de IVA — ventas con tarjeta",
    legalBasis: "Art. 437 par. 3 ET (ventas pagadas con tarjetas débito o crédito)",
    action:
      "Valida con el contador la condición de responsable de IVA para el año siguiente: si las ventas con tarjeta superan el tope, la titular pierde la condición de NO responsable y debe discriminar IVA 19 %.",
    thresholdUvt: FISCAL_IVA_CARD_THRESHOLD_UVT,
    currentCop: (s) => s.cardIncomeYtdCop,
    recentCop: (s) => s.cardIncomeRecentCop,
  },
];

export function evaluateFiscalRules(snapshot: FiscalYearSnapshot): FiscalRuleEvaluation[] {
  return FISCAL_RULES.map((rule) => {
    // Del snapshot (ya con fallback de enero), no de la tabla: el motor nunca revienta.
    const thresholdCop = snapshot.uvtCop * rule.thresholdUvt * 100;
    const currentCop = rule.currentCop(snapshot);
    const currentRatio = thresholdCop > 0 ? currentCop / thresholdCop : 0;

    // Proyección run-rate: el ritmo de los últimos ≤30 días es mejor predictor
    // del cierre que el promedio del año (captura temporadas y crecimiento).
    const recentDays = Math.min(RECENT_WINDOW_DAYS, snapshot.elapsedDays);
    const dailyRate = recentDays > 0 ? rule.recentCop(snapshot) / recentDays : 0;
    const projectedYearEndCop = currentCop + dailyRate * snapshot.remainingDays;
    const projectedRatio = thresholdCop > 0 ? projectedYearEndCop / thresholdCop : 0;

    let estimatedCrossingAt: Date | null = null;
    if (currentRatio < 1 && dailyRate > 0 && projectedRatio >= 1) {
      const daysToCross = Math.ceil((thresholdCop - currentCop) / dailyRate);
      const crossingMs = snapshot.computedAt.getTime() + daysToCross * DAY_MS;
      const { endUtc } = fiscalYearBoundsUtc(snapshot.year);
      estimatedCrossingAt = new Date(Math.min(crossingMs, endUtc.getTime()));
    }

    return {
      ruleId: rule.ruleId,
      name: rule.name,
      legalBasis: rule.legalBasis,
      action: rule.action,
      thresholdCop,
      currentCop,
      currentRatio,
      projectedYearEndCop: Math.round(projectedYearEndCop),
      projectedRatio,
      level: fiscalLevelForRatio(currentRatio),
      projectedLevel: fiscalLevelForRatio(projectedRatio),
      estimatedCrossingAt,
    };
  });
}

// ── Despacho (notificación + email + AlertState) ─────────────────────────────

const LEVEL_TO_NOTIFICATION: Record<Exclude<FiscalLevel, "ok">, NotificationSeverity> = {
  watch: "info",
  warning: "warning",
  critical: "critical",
};

type FiscalRuleState = { level?: FiscalLevel; emailedLevel?: FiscalLevel };

function parseRuleState(raw: string | null): FiscalRuleState {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as FiscalRuleState;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function formatRatio(ratio: number): string {
  return `${Math.floor(ratio * 100)} %`;
}

/**
 * Evalúa el año fiscal y despacha alertas. Idempotente por regla-año:
 *   - In-app: una notificación VIVA por regla (dedupKey) que se actualiza con el
 *     ratio vigente mientras esté en 70 %+; al bajar de 70 % no se renueva.
 *   - Email: UNA vez por cruce de nivel (90 % y 100 %) por regla y año
 *     (`emailedLevel` en AlertState — si el envío falla no se sella y reintenta).
 *   - Proyección: si el ritmo reciente proyecta cruzar el 100 % estando el
 *     acumulado por debajo del 70 %, avisa in-app con severidad info (dedupKey
 *     `…:projection`) — es la alerta temprana pedida por el owner.
 */
export async function runFiscalWatch(
  now: Date = new Date(),
): Promise<{ snapshot: FiscalYearSnapshot; evaluations: FiscalRuleEvaluation[] }> {
  const snapshot = await getFiscalYearSnapshot(now);
  const evaluations = evaluateFiscalRules(snapshot);

  for (const ev of evaluations) {
    const stateKey = `fiscal-watch:${ev.ruleId}:${snapshot.year}`;
    const previous = parseRuleState(
      (await prisma.alertState.findUnique({ where: { key: stateKey } }))?.lastDetail ?? null,
    );
    const nextState: Required<FiscalRuleState> = {
      level: ev.level,
      emailedLevel: previous.emailedLevel ?? "ok",
    };

    if (ev.level !== "ok") {
      await notify({
        type: "ALERT",
        severity: LEVEL_TO_NOTIFICATION[ev.level],
        title: `Vigilancia fiscal: ${ev.name} al ${formatRatio(ev.currentRatio)} del tope ${snapshot.year}`,
        detail:
          `${ev.legalBasis}. Acumulado del año: ${formatCOP(ev.currentCop)} de ${formatCOP(ev.thresholdCop)} ` +
          `(${snapshot.year}). Proyección de cierre al ritmo reciente: ${formatCOP(ev.projectedYearEndCop)} ` +
          `(${formatRatio(ev.projectedRatio)}). Qué hacer: ${ev.action}`,
        actionUrl: "/admin/metricas",
        actionLabel: "Ver vigilancia fiscal",
        dedupKey: stateKey,
      });
    }

    // Email una vez por cruce de nivel (90 % / 100 %) por regla-año.
    if (
      FISCAL_LEVEL_RANK[ev.level] >= FISCAL_LEVEL_RANK.warning &&
      FISCAL_LEVEL_RANK[ev.level] > FISCAL_LEVEL_RANK[nextState.emailedLevel]
    ) {
      const rule = FISCAL_RULES.find((r) => r.ruleId === ev.ruleId);
      const email = await renderFiscalThresholdAlertEmail({
        ruleName: ev.name,
        legalBasis: ev.legalBasis,
        action: ev.action,
        year: snapshot.year,
        levelLabel: ev.level === "critical" ? "100 %" : "90 %",
        thresholdUvt: rule?.thresholdUvt ?? 0,
        currentCop: ev.currentCop,
        thresholdCop: ev.thresholdCop,
        currentPct: Math.floor(ev.currentRatio * 100),
        projectedCop: ev.projectedYearEndCop,
        projectedPct: Math.floor(ev.projectedRatio * 100),
        uvtCop: snapshot.uvtCop,
      });
      const to = await getSettingValue("ALERT_EMAIL", "hola@lucamsshop.com");
      const result = await sendEmail({
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (result.sent) {
        nextState.emailedLevel = ev.level;
        logger.info({
          event: "fiscal_watch.email_sent",
          ruleId: ev.ruleId,
          level: ev.level,
          year: snapshot.year,
        });
      } else {
        // Mismo criterio que alerts.ts: sin envío no hay sello → reintenta mañana.
        logger.error({
          event: "fiscal_watch.email_failed",
          ruleId: ev.ruleId,
          level: ev.level,
          reason: result.reason ?? "unknown",
        });
      }
    }

    // Alerta temprana por PROYECCIÓN (el ejemplo del owner: "que estoy cerca de
    // superar el tope y el pronóstico mensual lo refleje"): in-app sola, sin email.
    if (
      ev.level === "ok" &&
      FISCAL_LEVEL_RANK[ev.projectedLevel] >= FISCAL_LEVEL_RANK.warning &&
      ev.estimatedCrossingAt
    ) {
      await notify({
        type: "ALERT",
        severity: "info",
        title: `Vigilancia fiscal: el ritmo de ventas proyecta superar «${ev.name}» este año`,
        detail:
          `${ev.legalBasis}. Acumulado: ${formatCOP(ev.currentCop)} de ${formatCOP(ev.thresholdCop)} ` +
          `(${formatRatio(ev.currentRatio)}), pero la proyección de cierre es ${formatCOP(ev.projectedYearEndCop)} ` +
          `(${formatRatio(ev.projectedRatio)}), con cruce estimado hacia el ` +
          `${formatDateLongCO(ev.estimatedCrossingAt)}. ` +
          `Qué hacer: ${ev.action}`,
        actionUrl: "/admin/metricas",
        actionLabel: "Ver vigilancia fiscal",
        dedupKey: `${stateKey}:projection`,
      });
    }

    await prisma.alertState.upsert({
      where: { key: stateKey },
      create: { key: stateKey, lastSentAt: now, lastDetail: JSON.stringify(nextState) },
      update: { lastSentAt: now, lastDetail: JSON.stringify(nextState) },
    });
  }

  logger.info({
    event: "fiscal_watch.checked",
    year: snapshot.year,
    grossIncomeYtdCop: snapshot.grossIncomeYtdCop,
    levels: evaluations.map((e) => `${e.ruleId}:${e.level}`),
  });
  return { snapshot, evaluations };
}
