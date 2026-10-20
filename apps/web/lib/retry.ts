/*
 * withRetry — reintenta con backoff exponencial + jitter (CONVENTIONS §Resiliencia).
 * Solo reintenta errores REINTENTABLES (5xx, red, timeouts, 408, 429). Los 4xx
 * (excepto 408/429) NO se reintentan — reintentar un "datos inválidos" es inútil.
 */

/**
 * Decide si un error amerita reintento. Reconoce:
 *  - TimeoutError / AbortError (timeouts) → sí
 *  - Errores de red de fetch (TypeError "fetch failed") → sí
 *  - Errores con `.status` numérico: 5xx, 408, 429 → sí; otros 4xx → no
 *  - Cualquier otro → no (conservador: no reintentar lo desconocido).
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return true;
    // fetch lanza TypeError en fallo de red (DNS, conexión rechazada, etc.).
    if (err.name === "TypeError") return true;
  }
  const status = Number(
    (err as { status?: unknown; statusCode?: unknown } | null)?.status ??
      (err as { statusCode?: unknown } | null)?.statusCode,
  );
  if (Number.isFinite(status) && status > 0) {
    return status >= 500 || status === 408 || status === 429;
  }
  const message =
    err instanceof Error
      ? err.message
      : typeof (err as { message?: unknown } | null)?.message === "string"
        ? (err as { message: string }).message
        : "";
  if (
    /\b(EMAXCONN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN)\b|fetch failed|socket hang up/i.test(
      message,
    )
  ) {
    return true;
  }
  // Marca explícita opcional para errores custom del proyecto.
  return (err as { retryable?: unknown } | null)?.retryable === true;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    attempts?: number;
    baseMs?: number;
    maxMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  const { attempts = 3, baseMs = 200, maxMs = 5000 } = opts;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isRetryable(err)) throw err;
      const delay = Math.min(baseMs * 2 ** i + Math.random() * 100, maxMs);
      await sleep(delay);
    }
  }
  throw lastErr; // inalcanzable (el loop lanza), pero satisface el tipo
}
