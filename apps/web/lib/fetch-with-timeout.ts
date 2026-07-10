/*
 * fetch con timeout (mandato CONVENTIONS §Resiliencia: nunca un fetch sin timeout).
 * Aborta la petición a los `timeoutMs` (default 5s). Si el caller pasa su propia
 * `signal`, se combina (aborta por cualquiera de las dos). El abort por timeout
 * produce un TimeoutError (retryable — ver lib/retry.ts).
 */

export class FetchTimeoutError extends Error {
  constructor(public readonly url: string, public readonly timeoutMs: number) {
    super(`Timeout tras ${timeoutMs}ms: ${url}`);
    this.name = "TimeoutError"; // isRetryable lo reconoce como reintentable
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 5000, signal: callerSignal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new FetchTimeoutError(url, timeoutMs)), timeoutMs);
  // Combinar con la señal del caller si la hay (aborta por timeout O por el caller).
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, controller.signal])
    : controller.signal;
  try {
    return await fetch(url, { ...rest, signal });
  } catch (err) {
    // Normalizar el abort por timeout a un TimeoutError explícito.
    if (controller.signal.aborted && controller.signal.reason instanceof FetchTimeoutError) {
      throw controller.signal.reason;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
