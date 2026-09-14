/*
 * Helpers PUROS del monitor de uptime por VM (decisión Lucy 2026-09-13: sin SaaS
 * y sin minutos de GitHub Actions). El entry (uptime-monitor.mjs) hace la red,
 * el email y el estado; acá solo lógica testeable: qué endpoints, cómo se evalúa
 * un resultado, cuándo corresponde alertar (dedup) y cómo se compone el correo.
 */

/** Endpoints de PRD que el monitor polea. Cada uno prueba algo distinto. */
export const MONITORED_ENDPOINTS = [
  { path: "/api/health/all", why: "agregador: db + storage + probes (503 solo si cae db/storage)" },
  {
    path: "/api/health/crons",
    why: "dead-man de los 9 jobs pg_cron (503 si alguno venció 2× su intervalo)",
  },
  { path: "/api/health/resend", why: "canal de email transaccional (dominio verificado)" },
  { path: "/api/health/wompi", why: "pasarela de pagos (probe real de llaves+ambiente)" },
  { path: "/api/health/aveonline", why: "logística (probe real de autenticación)" },
];

/** Timeout por intento (ms) y espera antes del retry (ms). */
export const PROBE_TIMEOUT_MS = 20_000;
export const RETRY_DELAY_MS = 60_000;

/** Anti-spam: no re-enviar la alerta dentro de esta ventana (ms). */
export const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Evalúa el resultado de UN probe. 2xx = ok. Cualquier otra cosa (no-2xx,
 * timeout, error de red, JSON inválido) = failure candidata a retry.
 */
export function isProbeOk(httpStatus) {
  return httpStatus >= 200 && httpStatus < 300;
}

/**
 * Decide si corresponde enviar alerta AHORA dado el último envío.
 * `lastAlertAt` null (nunca) → siempre alerta.
 */
export function shouldAlert(now, lastAlertAt, cooldownMs = ALERT_COOLDOWN_MS) {
  if (!lastAlertAt) return true;
  return now.getTime() - new Date(lastAlertAt).getTime() >= cooldownMs;
}

/**
 * Construye subject y cuerpo (texto plano) del correo de alerta.
 * `failures`: [{ path, detail }] — solo las que fallaron tras el retry.
 */
export function buildAlertEmail({ baseUrl, failures, at }) {
  const listado = failures.map((f) => `  ✗ ${f.path} — ${f.detail}`).join("\n");
  const subject = `🔴 Uptime monitor: ${failures.length} healthcheck(s) caídos en PRD`;
  const text = [
    `El monitor de la VM detectó ${failures.length} healthcheck(s) sin responder 2xx (tras retry a los 60 s) en ${baseUrl}:`,
    "",
    listado,
    "",
    `Cuándo: ${at.toISOString()}`,
    "",
    "Qué mirar:",
    "  - /api/health/all caído → Vercel, Postgres o Storage de PRD.",
    "  - /api/health/crons caído → un job pg_cron lleva 2× su intervalo sin latido (revisa cron.job y el Vault).",
    "  - /api/health/wompi|aveonline|resend → llaves/ambiente del proveedor (o el proveedor caído).",
    "",
    "Este correo no se repite dentro de 30 min aunque la falla persista (anti-spam).",
  ].join("\n");
  return { subject, text };
}

/**
 * Resume la corrida para el log: una línea por endpoint con su veredicto.
 */
export function summarizeResults(results) {
  return results
    .map(
      (r) =>
        `${r.ok ? "✓" : "✗"} ${r.path} (${r.attempts} intento${r.attempts > 1 ? "s" : ""}, ${r.latencyMs} ms${r.detail ? `, ${r.detail}` : ""})`,
    )
    .join("\n");
}
