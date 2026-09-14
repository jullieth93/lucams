/*
 * Sondas de salud de integraciones para el panel admin (auditoría 360, N-03 / CF-03).
 *
 * Antes el panel mostraba Wompi y Aveonline con un "warn" HARDCODEADO: una caída
 * real era indistinguible de un servicio sano. Acá el panel consume los probes
 * REALES ya existentes — importados como funciones (sin HTTP self-fetch, sin
 * rate-limit propio) — con try/catch + timeout defensivo: si la sonda falla, el
 * card muestra fail y la página NUNCA se rompe.
 *
 * Semántica de estados (encargo de auditoría): HEALTHY, DEGRADED, DOWN,
 * NOT_CONFIGURED, DISABLED_BY_MODE, DISABLED_BY_ENVIRONMENT, SANDBOX, PRODUCTION,
 * UNKNOWN_NOT_PROBED — mapeados al contrato visual del panel
 * (ok / warn / fail / not-configured / unverified) con la MISMA lectura que el
 * agregador /api/health/all: skipped ≈ no configurado, warn ≈ responde pero mal
 * configurado, fail ≈ no responde o la sonda misma explotó.
 */

import "server-only";
import { probeAveonlineHealth, type AveonlineHealth } from "@/features/shipping/aveonline";
import { probeWompiHealth, type WompiHealth } from "@/lib/wompi";
import { probeGeminiHealth, type GeminiHealth } from "@/features/ai/gemini-provider";

/** Estados posibles del encargo de auditoría 360 (N-03). */
export type AuditHealthState =
  | "HEALTHY"
  | "DEGRADED"
  | "DOWN"
  | "NOT_CONFIGURED"
  | "DISABLED_BY_MODE"
  | "DISABLED_BY_ENVIRONMENT"
  | "SANDBOX"
  | "PRODUCTION"
  | "UNKNOWN_NOT_PROBED";

/**
 * Contrato visual del panel: los 4 estados originales + "unverified" (badge
 * "Sin verificación remota") para integraciones configuradas que NO tienen
 * probe seguro (WhatsApp wa.me, Turnstile) — UNKNOWN_NOT_PROBED no puede
 * mostrarse como "Sin configurar" (falso) ni como "Caído" (falsa alarma).
 */
export type PanelStatus = "ok" | "warn" | "fail" | "not-configured" | "unverified";

export function mapAuditState(state: AuditHealthState): PanelStatus {
  switch (state) {
    case "HEALTHY":
    case "PRODUCTION":
    case "SANDBOX":
      // SANDBOX es operativo (el ambiente se declara aparte con envLabel):
      // en dev/preview es la configuración CORRECTA y alarmar sería ruido.
      return "ok";
    case "DEGRADED":
      return "warn";
    case "DOWN":
      return "fail";
    case "UNKNOWN_NOT_PROBED":
      return "unverified";
    default:
      // NOT_CONFIGURED | DISABLED_BY_MODE | DISABLED_BY_ENVIRONMENT
      return "not-configured";
  }
}

/** Resultado ya mapeado para el card del panel. */
export type PanelProbe = {
  status: PanelStatus;
  detail: string;
  /** Ambiente declarado por la integración (sandbox/production/test), si aplica. */
  envLabel?: string;
  latencyMs?: number;
};

/**
 * Resultado de una sonda con red de seguridad: `probeFailed` distingue
 * estructuralmente "la sonda explotó/colgó" (→ DOWN) de un resultado legítimo
 * del probe (que se mapea según su propia semántica).
 */
export type SafeProbe<T> = { probeFailed: false; value: T } | { probeFailed: true; error: string };

/** Techo defensivo por sonda: la página del panel no puede colgarse por un tercero. */
const PROBE_TIMEOUT_MS = 8000;

async function withTimeout<T>(probe: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      probe,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`sonda superó ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runSafely<T>(probe: Promise<T>, timeoutMs: number): Promise<SafeProbe<T>> {
  try {
    return { probeFailed: false, value: await withTimeout(probe, timeoutMs) };
  } catch (err) {
    return {
      probeFailed: true,
      error: err instanceof Error ? err.message.slice(0, 80) : "error desconocido",
    };
  }
}

/**
 * probeWompiHealth con red de seguridad: el probe ya atrapa sus errores de red,
 * esto cubre lo inesperado (throw fuera del probe, hang sin timeout propio).
 */
export function probeWompiSafely(timeoutMs = PROBE_TIMEOUT_MS): Promise<SafeProbe<WompiHealth>> {
  return runSafely(probeWompiHealth(), timeoutMs);
}

/** probeAveonlineHealth con la misma red de seguridad que probeWompiSafely. */
export function probeAveonlineSafely(
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<SafeProbe<AveonlineHealth>> {
  return runSafely(probeAveonlineHealth(), timeoutMs);
}

/** probeGeminiHealth con la misma red de seguridad que probeWompiSafely. */
export function probeGeminiSafely(timeoutMs = PROBE_TIMEOUT_MS): Promise<SafeProbe<GeminiHealth>> {
  return runSafely(probeGeminiHealth(), timeoutMs);
}

function probeFailure(service: string, error: string): PanelProbe {
  return {
    status: mapAuditState("DOWN"),
    detail: `La sonda de ${service} falló (${error}).`,
  };
}

/**
 * Wompi → card del panel. `probe === null` = la página ni siquiera llamó la
 * sonda porque falta alguna de las 4 llaves (NOT_CONFIGURED: nunca alarma).
 * Sandbox/production se muestran EXPLÍCITOS (envLabel + detalle): sandbox nunca
 * puede hacerse pasar por production. Sandbox en un deployment de producción
 * es DEGRADED (el checkout "funciona" pero no procesa pagos reales).
 */
export function mapWompiHealth(
  probe: SafeProbe<WompiHealth> | null,
  opts: { productionDeployment: boolean },
): PanelProbe {
  if (!probe) {
    return {
      status: mapAuditState("NOT_CONFIGURED"),
      detail: "Sin configurar: faltan llaves WOMPI_* (se listan abajo).",
    };
  }
  if (probe.probeFailed) return probeFailure("Wompi", probe.error);
  const health = probe.value;
  if (health.status === "skipped") {
    return {
      status: mapAuditState("NOT_CONFIGURED"),
      detail: "Sin configurar: faltan llaves WOMPI_* (se listan abajo).",
    };
  }
  if (health.status === "fail") {
    return {
      status: mapAuditState("DOWN"),
      envLabel: health.env,
      detail: health.detail ?? "Wompi no responde.",
      latencyMs: health.latencyMs,
    };
  }
  if (health.env === "sandbox") {
    if (opts.productionDeployment) {
      return {
        status: mapAuditState("DEGRADED"),
        envLabel: "sandbox",
        detail:
          "WOMPI_ENV=sandbox en un deployment de producción: el checkout responde pero NO procesa pagos reales.",
        latencyMs: health.latencyMs,
      };
    }
    return {
      status: mapAuditState("SANDBOX"),
      envLabel: "sandbox",
      detail: `Ambiente sandbox: pagos de prueba, no reales · ${health.latencyMs}ms`,
      latencyMs: health.latencyMs,
    };
  }
  return {
    status: mapAuditState("PRODUCTION"),
    envLabel: "production",
    detail: `Ambiente production: pagos reales · ${health.latencyMs}ms`,
    latencyMs: health.latencyMs,
  };
}

/**
 * Aveonline → card del panel, coherente con /api/health/aveonline +
 * /api/health/all: el probe distingue test+demo → ok, production+demo → warn
 * (con el detalle explícito), production+real → ok; todo lo demás que responde
 * pero no autentica es warn (misma lectura del agregador). Sin credenciales es
 * NOT_CONFIGURED, nunca una falsa alarma. `probe === null` = la página no llamó
 * la sonda porque faltan AVEONLINE_USUARIO / AVEONLINE_CLAVE.
 */
export function mapAveonlineHealth(
  probe: SafeProbe<AveonlineHealth> | null,
  opts: { productionDeployment: boolean },
): PanelProbe {
  if (!probe) {
    return {
      status: mapAuditState("NOT_CONFIGURED"),
      detail: "Sin configurar: faltan AVEONLINE_USUARIO / AVEONLINE_CLAVE.",
    };
  }
  if (probe.probeFailed) return probeFailure("Aveonline", probe.error);
  const health = probe.value;
  if (!health.ok) {
    // El probe reporta credenciales faltantes con estos textos (early return
    // "Modo production sin credenciales…" / throw de auth "…no configurados").
    if (health.detail?.includes("sin credenciales") || health.detail?.includes("no configurados")) {
      return { status: mapAuditState("NOT_CONFIGURED"), detail: health.detail };
    }
    // production + cuenta demo llega por acá con el detalle explícito del probe.
    return {
      status: mapAuditState("DEGRADED"),
      envLabel: health.mode,
      detail: health.detail ?? "Aveonline responde pero no autentica.",
    };
  }
  if (health.mode === "test") {
    if (opts.productionDeployment) {
      return {
        status: mapAuditState("DEGRADED"),
        envLabel: "test",
        detail:
          "AVEONLINE_ENV=test en un deployment de producción: cotiza contra la cuenta demo, no genera guías reales.",
      };
    }
    return {
      status: mapAuditState("SANDBOX"),
      envLabel: "test",
      detail:
        "Ambiente test con la cuenta demo pública: no genera guías reales (correcto fuera de producción).",
    };
  }
  return {
    status: mapAuditState("PRODUCTION"),
    envLabel: "production",
    detail: `Ambiente production con cuenta real (idempresa ${health.idempresa ?? "?"}).`,
  };
}

/**
 * Gemini → card del panel (N-19c, 2026-09-11). El probe es REAL pero acotado:
 * listado de modelos (GET /v1beta/models) — valida que GEMINI_API_KEY autentica
 * SIN generar contenido (nada de generateContent: cero cuota consumida, cero
 * efectos laterales). `probe === null` = la página no llamó la sonda porque
 * falta GEMINI_API_KEY → NOT_CONFIGURED, nunca falsa alarma. Coherente con la
 * semántica del agregador: ok↔ok, skipped↔no configurado, fail↔no responde.
 */
export function mapGeminiHealth(probe: SafeProbe<GeminiHealth> | null): PanelProbe {
  if (!probe) {
    return {
      status: mapAuditState("NOT_CONFIGURED"),
      detail: "Sin configurar: falta GEMINI_API_KEY.",
    };
  }
  if (probe.probeFailed) return probeFailure("Gemini", probe.error);
  const health = probe.value;
  if (health.status === "skipped") {
    return {
      status: mapAuditState("NOT_CONFIGURED"),
      detail: "Sin configurar: falta GEMINI_API_KEY.",
    };
  }
  if (health.status === "fail") {
    return {
      status: mapAuditState("DOWN"),
      detail: health.detail ?? "Gemini no responde.",
      latencyMs: health.latencyMs,
    };
  }
  return {
    status: mapAuditState("HEALTHY"),
    detail: health.detail ?? `Gemini responde · ${health.latencyMs}ms`,
    latencyMs: health.latencyMs,
  };
}
