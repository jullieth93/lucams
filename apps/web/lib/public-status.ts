/*
 * Mapeo de los health endpoints públicos → estados de la página /status
 * (auditoría 360, N-16). Módulo PURO (sin red): la página hace el fetch
 * server-side y pasa { httpStatus, body }; acá solo se decide el veredicto.
 *
 * Reglas de honestidad para una página PÚBLICA:
 *   - Mismo nivel de detalle que los endpoints (estado, no internals): nunca
 *     se muestran los `detail` del endpoint (pueden mencionar cuentas/env).
 *   - `rate_limited` (429) NO es una caída: es nuestra propia cota de tráfico
 *     — mostrarlo como "Caído" sería una falsa alarma pública.
 *   - `skipped` (Wompi sin configurar) tampoco es una caída: pagos en línea
 *     simplemente no están habilitados.
 */

export type PublicServiceState = "ok" | "down" | "pending" | "warn";

export type PublicHealthVerdict = {
  status: PublicServiceState;
  latencyMs?: number;
  detail?: string;
};

export type HealthBody = { status?: string; latencyMs?: number; detail?: string } | null;

function latencyOf(body: HealthBody): number | undefined {
  return typeof body?.latencyMs === "number" ? body.latencyMs : undefined;
}

const RATE_LIMITED: PublicHealthVerdict = {
  status: "pending",
  detail: "Verificación pausada por límite de tráfico",
};

/** /api/health/wompi → ok (200) | skipped (200) | fail (503) | rate_limited (429). */
export function wompiPublicVerdict(httpStatus: number, body: HealthBody): PublicHealthVerdict {
  if (httpStatus === 429 || body?.status === "rate_limited") return RATE_LIMITED;
  if (httpStatus === 200 && body?.status === "ok") {
    return { status: "ok", latencyMs: latencyOf(body) };
  }
  if (httpStatus === 200 && body?.status === "skipped") {
    return { status: "pending", detail: "Pagos en línea en habilitación" };
  }
  if (httpStatus !== 200) return { status: "down", detail: `HTTP ${httpStatus}` };
  return { status: "down", detail: "respuesta inesperada" };
}

/** /api/health/aveonline → ok | warn (200) | 500 | rate_limited (429). */
export function aveonlinePublicVerdict(httpStatus: number, body: HealthBody): PublicHealthVerdict {
  if (httpStatus === 429 || body?.status === "rate_limited") return RATE_LIMITED;
  if (httpStatus === 200 && body?.status === "ok") {
    return { status: "ok", latencyMs: latencyOf(body) };
  }
  // warn = el servicio responde pero está mal configurado (p.ej. cuenta demo en
  // producción). El detalle queda server-side: menciona internals de la cuenta.
  if (httpStatus === 200 && body?.status === "warn") {
    return { status: "warn", detail: "En revisión técnica" };
  }
  if (httpStatus !== 200) return { status: "down", detail: `HTTP ${httpStatus}` };
  return { status: "down", detail: "respuesta inesperada" };
}
