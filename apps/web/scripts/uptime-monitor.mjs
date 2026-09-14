#!/usr/bin/env node
/*
 * Monitor de uptime por VM (decisión Lucy 2026-09-13: sin SaaS, sin minutos de
 * GitHub Actions). Reemplaza al workflow .github/workflows/uptime-monitor.yml.
 *
 * Qué hace: polea los 5 healthchecks de PRD (1 retry a los 60 s), y si alguno
 * sigue sin responder 2xx, envía UN email vía Resend (anti-spam 30 min, estado en
 * ~/.local/state/lucams-uptime/). Pensado para correr cada 10-15 min desde el
 * crontab de la VM (que ya está encendida 24/7 con el stack Supabase local).
 *
 * Config: ~/.config/lucams/uptime.env (NO va al repo; chmod 600):
 *   RESEND_API_KEY=…   EMAIL_FROM=…   ALERT_EMAIL=…
 * Las env vars del proceso tienen precedencia sobre el archivo.
 *
 * Uso:
 *   node apps/web/scripts/uptime-monitor.mjs            # corre y alerta si hay fallas
 *   node apps/web/scripts/uptime-monitor.mjs --dry-run  # imprime, no envía ni persiste
 *   node apps/web/scripts/uptime-monitor.mjs --test-email  # envía un correo de PRUEBA del canal
 *
 * Limitación declarada: si la VM está apagada no hay monitor externo (los
 * alertas in-app siguen cubriendo lo derivado de DB). Es el tradeoff aceptado
 * para no depender de ningún servicio externo.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ALERT_COOLDOWN_MS,
  MONITORED_ENDPOINTS,
  PROBE_TIMEOUT_MS,
  RETRY_DELAY_MS,
  buildAlertEmail,
  isProbeOk,
  shouldAlert,
  summarizeResults,
} from "./uptime-monitor-lib.mjs";

const BASE_URL = (process.env.UPTIME_BASE_URL ?? "https://lucamsshop.com").replace(/\/+$/, "");
const CONFIG_FILE = join(homedir(), ".config", "lucams", "uptime.env");
const STATE_DIR = join(homedir(), ".local", "state", "lucams-uptime");
const STATE_FILE = join(STATE_DIR, "last-alert.json");

/** Lee KEY=VALUE del archivo de config sin imprimir nada (dotenv mínimo, sin deps). */
function loadConfigFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trimStart().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const fileEnv = loadConfigFile(CONFIG_FILE);
const env = (k) => process.env[k] ?? fileEnv[k];

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function probeOnce(path) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: "manual",
    });
    return {
      ok: isProbeOk(res.status),
      detail: `HTTP ${res.status}`,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error && err.name === "TimeoutError" ? "timeout" : "sin respuesta",
      latencyMs: Date.now() - start,
    };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probeWithRetry(path) {
  const first = await probeOnce(path);
  if (first.ok) return { path, ok: true, attempts: 1, ...first };
  await sleep(RETRY_DELAY_MS);
  const second = await probeOnce(path);
  return { path, ok: second.ok, attempts: 2, ...second };
}

async function sendResendEmail({ to, from, subject, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Resend API respondió HTTP ${res.status}`);
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Reporta la corrida a la app (POST /api/cron/monitor-heartbeat) para que el
 * panel /admin/observability muestre el último sondeo y las reglas
 * uptime_monitor_stale/failing vigilen al propio monitor. BEST-EFFORT a
 * propósito: si la app no responde (deploy en curso, endpoint aún no
 * desplegado), el sondeo y el email ya hicieron su trabajo — solo se loguea.
 */
async function reportToApp(results, { dryRun = false } = {}) {
  const secret = env("CRON_SECRET");
  if (!secret) {
    log("sin CRON_SECRET en config — no se reporta a la app (el email sigue activo).");
    return;
  }
  const failures = results.filter((r) => !r.ok).map((r) => r.path);
  const detail =
    failures.length === 0
      ? `OK ${results.length}/${results.length}`
      : `FALLA ${failures.length}/${results.length}: ${failures.join(", ")}`;
  if (dryRun) {
    log(`DRY-RUN: se habría reportado "${detail}" a /api/cron/monitor-heartbeat`);
    return;
  }
  try {
    const res = await fetch(`${BASE_URL}/api/cron/monitor-heartbeat`, {
      method: "POST",
      headers: { "x-cron-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify({ detail }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    log(`reporte a la app: HTTP ${res.status} (${detail})`);
  } catch (err) {
    log(`reporte a la app falló (best-effort): ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const testEmail = process.argv.includes("--test-email");

  if (testEmail) {
    const to = env("ALERT_EMAIL");
    const from = env("EMAIL_FROM");
    if (!to || !from || !env("RESEND_API_KEY")) {
      console.error("Falta config (ALERT_EMAIL/EMAIL_FROM/RESEND_API_KEY) en", CONFIG_FILE);
      process.exit(2);
    }
    await sendResendEmail({
      to,
      from,
      subject: "✅ Prueba del uptime monitor (canal OK)",
      text: `Este correo confirma que el monitor de uptime de la VM puede alertar.\nConfig: ${CONFIG_FILE}\nNo es una alerta real.`,
    });
    log("correo de prueba enviado a", to.replace(/(^.).*(@.*$)/, "$1***$2"));
    return;
  }

  log(
    `sondeando ${MONITORED_ENDPOINTS.length} endpoints en ${BASE_URL}${dryRun ? " (dry-run)" : ""}…`,
  );
  const results = [];
  for (const ep of MONITORED_ENDPOINTS) results.push(await probeWithRetry(ep.path));
  log("\n" + summarizeResults(results));

  await reportToApp(results, { dryRun });

  const failures = results.filter((r) => !r.ok);
  if (failures.length === 0) {
    log("todo OK — sin alerta.");
    return;
  }

  const state = readState();
  const now = new Date();
  if (!shouldAlert(now, state.lastAlertAt, ALERT_COOLDOWN_MS)) {
    log(
      `${failures.length} falla(s) persistentes, pero la alerta está en cooldown (última: ${state.lastAlertAt}).`,
    );
    return;
  }

  const to = env("ALERT_EMAIL");
  const from = env("EMAIL_FROM");
  if (!to || !from || !env("RESEND_API_KEY")) {
    console.error("Hay fallas pero falta config de email en", CONFIG_FILE);
    process.exit(2);
  }
  const { subject, text } = buildAlertEmail({ baseUrl: BASE_URL, failures, at: now });
  if (dryRun) {
    log(
      `DRY-RUN: se habría enviado alerta (${subject}) a ${to.replace(/(^.).*(@.*$)/, "$1***$2")}`,
    );
    return;
  }
  await sendResendEmail({ to, from, subject, text });
  writeState({ lastAlertAt: now.toISOString(), failures: failures.map((f) => f.path) });
  log(`alerta enviada (${failures.length} falla/s).`);
}

main().catch((err) => {
  console.error(
    `[${new Date().toISOString()}] error del monitor:`,
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
