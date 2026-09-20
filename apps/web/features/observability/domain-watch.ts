/*
 * Vigilante del dominio lucamsshop.com (FASE B auditoría 2026-09-19 — L-H3/L-N1:
 * el dominio expira 2027-07-19 sin alerta de renovación y un cambio de
 * nameservers/status era invisible → secuestro o suspensión ICANN indetectables).
 *
 * Productor: GitHub Actions (`.github/workflows/domain-watch.yml`, runners Azure —
 * la vía pg_cron+pg_net desde Supabase se descartó 2026-09-20: Verisign y rdap.org
 * RECHAZAN las conexiones HTTPS salientes de pg_net, verificado en vivo). El
 * workflow consulta RDAP (rdap.verisign.com) una vez al día y hace POST a
 * /api/cron/domain-watch con la observación; esta app guarda el baseline en
 * AlertState (sin migración nueva, mismo patrón que los heartbeats) y alerta:
 *
 *   - `domain-watch:expires-at`       → baseline: fecha de expiración ISO.
 *   - `domain-watch:nameservers`      → baseline: NS normalizados (JSON ordenado).
 *   - `domain-watch:status`           → baseline: status EPP normalizados.
 *   - `domain-watch:last-alert-bucket`→ último umbral de expiración alertado
 *                                       (lastDetail) + cuándo (lastSentAt, para
 *                                       el recordatorio ≤3 días cada >20 h).
 *   - `domain-watch:rdap-failures`    → corridas seguidas con rdapOk=false.
 *
 * Reglas:
 *   1. Primera observación: siembra el baseline SIN alertar (nada con qué comparar;
 *      el bucket de expiración queda sellado al nivel actual para no alertar
 *      retroactivamente por un dominio ya dentro de ventana).
 *   2. Nameservers o status distintos del baseline → alerta CRÍTICA (posible
 *      secuestro/suspensión — p.ej. aparece "client hold") y se actualiza el
 *      baseline: se alerta por CAMBIO, no a diario mientras el cambio persista.
 *   3. Expiración: alerta crítica al cruzar cada umbral 60/30/14/7/3/1 días, una
 *      sola vez por umbral; ya con ≤3 días, recordatorio si la última alerta tiene
 *      >20 h (el productor corre 1 vez al día → como mucho 1 recordatorio diario).
 *   4. rdapOk=false: incrementa el contador; a las 2 seguidas alerta ALTA (la
 *      vigilancia está ciega — no es secuestro en sí, así que NO crítica ni email).
 *      rdapOk=true lo resetea.
 *
 * Canal: el de siempre para alertas — Notification in-app (fuente de verdad,
 * dedupKey) + email SOLO para las críticas, vía sendAlertEmail (el mismo helper
 * del ciclo evaluateAlerts — sin duplicar la lógica de email). Si el email falla
 * no se sella el bucket de expiración → la próxima corrida reintenta (política
 * 2026-07-13); NS/status se sellan igual (su señal durable es la Notification,
 * re-alertar a diario un cambio persistente sería spam).
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendAlertEmail, type FiringAlert } from "./alerts";
import { notify } from "@/features/notifications/service";

export const DOMAIN_WATCH_KEYS = {
  expiresAt: "domain-watch:expires-at",
  nameservers: "domain-watch:nameservers",
  status: "domain-watch:status",
  lastAlertBucket: "domain-watch:last-alert-bucket",
  rdapFailures: "domain-watch:rdap-failures",
} as const;

/** Umbrales de días para la alerta de expiración (de mayor a menor). */
export const EXPIRY_THRESHOLDS_DAYS = [60, 30, 14, 7, 3, 1] as const;

/** Ventana del recordatorio cuando quedan ≤3 días (el productor corre a diario). */
const EXPIRY_REMINDER_MS = 20 * 60 * 60 * 1000;

export type DomainObservation = {
  rdapOk: boolean;
  expiresAt?: string;
  daysLeft?: number;
  nameservers?: string[];
  status?: string[];
};

/**
 * Normaliza una lista RDAP para compararla por CONTENIDO: minúsculas, trim,
 * dedup y ordenada — RDAP no garantiza orden ni capitalización y sin esto un
 * reordenamiento inocuo dispararía una alerta de secuestro en falso.
 * Devuelve null si la observación no trae el campo (no hay con qué comparar).
 */
export function normalizeList(list: string[] | undefined): string | null {
  if (!list) return null;
  const normalized = [...new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean))].sort();
  return JSON.stringify(normalized);
}

/**
 * Bucket de expiración para `daysLeft`: el umbral MÁS ESTRICTO ya cruzado
 * (p.ej. 2 días → "3"; 59 → "60"; 61 → null). La alerta dispara una vez por bucket.
 */
export function expiryBucket(daysLeft: number): number | null {
  const crossed = EXPIRY_THRESHOLDS_DAYS.filter((t) => daysLeft <= t);
  return crossed.length > 0 ? crossed[crossed.length - 1] : null;
}

async function readState(key: string) {
  return prisma.alertState.findUnique({
    where: { key },
    select: { lastDetail: true, lastSentAt: true },
  });
}

async function writeState(key: string, detail: string | null, now: Date) {
  await prisma.alertState.upsert({
    where: { key },
    create: { key, lastSentAt: now, lastDetail: detail },
    update: { lastSentAt: now, lastDetail: detail },
  });
}

/**
 * Registra la alerta por el canal estándar: Notification in-app SIEMPRE (fuente
 * de verdad; dedupKey actualiza la no leída) + email solo si es crítica (mismo
 * helper del ciclo de alertas). Devuelve false si el email de una crítica falló
 * (el caller NO sella su dedup en ese caso → reintento en la próxima corrida).
 */
async function dispatchDomainAlert(a: FiringAlert): Promise<boolean> {
  await notify({
    type: "ALERT",
    severity: a.severity === "crítica" ? "critical" : "warning",
    title: a.title,
    detail: `${a.detail} Qué hacer: ${a.action}`,
    actionUrl: "/admin/observability",
    actionLabel: "Revisar",
    dedupKey: a.key,
  });
  if (a.severity !== "crítica") return true;
  return sendAlertEmail([a]);
}

/**
 * Procesa la observación diaria del workflow. Devuelve las keys de las alertas
 * disparadas (para el detalle del heartbeat y la respuesta del endpoint).
 * LANZA si la DB falla — la route responde 500 a propósito para que el job de
 * GitHub salga rojo el mismo día (patrón backup-heartbeat), en vez de fingir
 * que la vigilancia sigue viva.
 */
export async function processDomainObservation(
  obs: DomainObservation,
  now: Date = new Date(),
): Promise<{ alerts: string[] }> {
  // ─── RDAP caído: contar y alertar a la 2ª corrida seguida ───
  if (!obs.rdapOk) {
    const prev = await readState(DOMAIN_WATCH_KEYS.rdapFailures);
    const failures = (Number.parseInt(prev?.lastDetail ?? "0", 10) || 0) + 1;
    await writeState(DOMAIN_WATCH_KEYS.rdapFailures, String(failures), now);
    if (failures < 2) return { alerts: [] };
    await dispatchDomainAlert({
      key: "domain_rdap_failing",
      severity: "alta",
      title: `El vigilante del dominio lleva ${failures} corridas sin poder consultar RDAP`,
      detail:
        "GitHub Actions no logra leer el RDAP de Verisign para lucamsshop.com. Mientras tanto NO hay detección de expiración ni de cambios de nameservers/status.",
      action:
        "Revisa el workflow domain-watch.yml en GitHub Actions: si RDAP rechaza las conexiones de los runners, cambia la fuente (p.ej. otro bootstrap RDAP) o pausa el vigilante a propósito. Verifica manualmente el dominio en el registrador (mi.com.co).",
    });
    return { alerts: ["domain_rdap_failing"] };
  }

  // rdapOk=true: resetea el contador de fallos si venía contando.
  const prevFailures = await readState(DOMAIN_WATCH_KEYS.rdapFailures);
  if (prevFailures && prevFailures.lastDetail !== "0") {
    await writeState(DOMAIN_WATCH_KEYS.rdapFailures, "0", now);
  }

  const ns = normalizeList(obs.nameservers);
  const status = normalizeList(obs.status);
  const [expiresBase, nsBase, statusBase] = await Promise.all([
    readState(DOMAIN_WATCH_KEYS.expiresAt),
    readState(DOMAIN_WATCH_KEYS.nameservers),
    readState(DOMAIN_WATCH_KEYS.status),
  ]);

  // ─── Primera observación: siembra el baseline SIN alertar ───
  if (!expiresBase) {
    await Promise.all([
      writeState(DOMAIN_WATCH_KEYS.expiresAt, obs.expiresAt ?? null, now),
      writeState(DOMAIN_WATCH_KEYS.nameservers, ns, now),
      writeState(DOMAIN_WATCH_KEYS.status, status, now),
      // Sella el bucket actual: sin esto, sembrar con 25 días restantes
      // dispararía la alerta "30" en la SEGUNDA corrida como si fuera cruce.
      writeState(
        DOMAIN_WATCH_KEYS.lastAlertBucket,
        obs.daysLeft != null ? String(expiryBucket(obs.daysLeft) ?? "") : "",
        now,
      ),
    ]);
    logger.info({ event: "domain_watch.baseline_seeded", expiresAt: obs.expiresAt ?? null });
    return { alerts: [] };
  }

  const alerts: string[] = [];

  // ─── Cambio de nameservers (secuestro) o de status (suspensión ICANN) ───
  // Baseline ausente (p.ej. sembrado antes de que el workflow enviara el campo)
  // → se siembra en silencio, nunca alerta por "apareció el dato".
  if (ns !== null) {
    if (nsBase?.lastDetail == null) {
      await writeState(DOMAIN_WATCH_KEYS.nameservers, ns, now);
    } else if (ns !== nsBase.lastDetail) {
      await dispatchDomainAlert({
        key: "domain_nameservers_changed",
        severity: "crítica",
        title: "Los nameservers de lucamsshop.com CAMBIARON",
        detail: `Baseline: ${nsBase.lastDetail}. Ahora: ${ns}. Un cambio de NS no autorizado es la señal clásica de secuestro de dominio.`,
        action:
          "Verifica AHORA en el registrador (mi.com.co) que el cambio lo hiciste tú. Si no: cambia la clave de la cuenta, activa MFA y transfer-lock, y contacta soporte del registrador para revertir (posible secuestro en curso).",
      });
      await writeState(DOMAIN_WATCH_KEYS.nameservers, ns, now);
      alerts.push("domain_nameservers_changed");
    }
  }
  if (status !== null) {
    if (statusBase?.lastDetail == null) {
      await writeState(DOMAIN_WATCH_KEYS.status, status, now);
    } else if (status !== statusBase.lastDetail) {
      await dispatchDomainAlert({
        key: "domain_status_changed",
        severity: "crítica",
        title: "El status del dominio lucamsshop.com CAMBIÓ",
        detail: `Baseline: ${statusBase.lastDetail}. Ahora: ${status}. Ojo si aparece "client hold"/"server hold" (suspensión ICANN: el dominio deja de resolver), "redemptionPeriod" o "pendingDelete".`,
        action:
          "Revisa el status en el registrador (mi.com.co): un hold suele ser suspensión por verificación de contacto o impago — contáctalo hoy mismo; si el cambio fue esperado (p.ej. transfer-lock nuevo), ignora esta alerta.",
      });
      await writeState(DOMAIN_WATCH_KEYS.status, status, now);
      alerts.push("domain_status_changed");
    }
  }

  // ─── Expiración: una alerta por umbral + recordatorio ≤3 días (>20 h) ───
  if (obs.expiresAt) {
    // El baseline de fecha se refresca en cada corrida OK (es informativo; los
    // umbrales se rearman solos si el dominio se renueva — ver abajo).
    await writeState(DOMAIN_WATCH_KEYS.expiresAt, obs.expiresAt, now);
  }
  if (obs.daysLeft != null) {
    const bucket = expiryBucket(obs.daysLeft);
    const last = await readState(DOMAIN_WATCH_KEYS.lastAlertBucket);
    const lastBucket = last?.lastDetail ? Number(last.lastDetail) : null;
    if (bucket === null) {
      // Fuera de ventana (o renovado): rearma los umbrales para la próxima vez.
      if (lastBucket !== null) await writeState(DOMAIN_WATCH_KEYS.lastAlertBucket, "", now);
    } else {
      const isReminder =
        obs.daysLeft <= 3 &&
        bucket === lastBucket &&
        last !== null &&
        now.getTime() - last.lastSentAt.getTime() > EXPIRY_REMINDER_MS;
      if (bucket !== lastBucket || isReminder) {
        const emailed = await dispatchDomainAlert({
          key: "domain_expiry",
          severity: "crítica",
          title: `El dominio lucamsshop.com expira en ${obs.daysLeft} día(s)`,
          detail: `Según RDAP, la expiración es ${obs.expiresAt ?? "fecha desconocida"} (umbral ${bucket} días). Si el dominio expira, el sitio y el correo quedan fuera de servicio y el dominio puede ser registrado por terceros.`,
          action:
            "Renueva el dominio en mi.com.co HOY y activa la auto-renovación con un método de pago vigente. Tras renovar, la próxima corrida del vigilante rearma los umbrales sola.",
        });
        // Política 2026-07-13: si el email falló NO se sella el bucket → la
        // próxima corrida reintenta (la Notification ya quedó en el centro).
        if (emailed) await writeState(DOMAIN_WATCH_KEYS.lastAlertBucket, String(bucket), now);
        alerts.push("domain_expiry");
      }
    }
  }

  return { alerts };
}
