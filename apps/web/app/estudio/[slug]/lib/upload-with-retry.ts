/*
 * Subida de archivos a signed URLs de Supabase Storage con concurrencia
 * limitada, retry con backoff y timeout (fix STG 2026-10-05).
 *
 * Los PUT del finalize (`NEEDS_CLIENT_SLOTS` en studio-editor) eran
 * SECUENCIALES, sin retry ni timeout, y el error crudo del navegador
 * ("NetworkError when attempting to fetch resource") llegaba tal cual a la
 * pantalla. Con N slots (hasta 50) un micro-corte de red tumbaba todo el
 * confirmar. Ahora:
 *   - concurrencia tope 3 (`mapWithConcurrency`) — un calendario de 24 PNG
 *     ya no tarda 24 × RTT en serie ni satura la conexión del celular;
 *   - retry con backoff exponencial (`putWithRetry`) solo para errores de
 *     red y 5xx — un 4xx (firma vencida) no se reintenta, falla de inmediato;
 *   - timeout por intento vía AbortController (un PUT colgado ya no congela
 *     el flujo para siempre);
 *   - el caller traduce cualquier fallo a un mensaje amigable en español
 *     (texts.exportar.errorSubidaArchivos), nunca el texto crudo del motor.
 */

/** Cuerpo de un PUT directo a Storage. */
export type StoragePutRequest = {
  url: string;
  body: Blob;
  contentType: string;
};

export type UploadRetryOptions = {
  /** Reintentos ADICIONALES al primer intento (2 = 3 intentos totales). */
  retries?: number;
  /** Timeout por intento, en ms. */
  timeoutMs?: number;
  /** Base del backoff exponencial en ms (600 → 600, 1200, 2400…). */
  retryBaseMs?: number;
  /** Inyectable para tests. */
  fetchImpl?: typeof fetch;
};

const DEFAULT_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_BASE_MS = 600;

/** Backoff exponencial: 600, 1200, 2400… (attempt 0-based). */
export function retryDelayMs(attempt: number, baseMs = DEFAULT_RETRY_BASE_MS): number {
  return baseMs * 2 ** attempt;
}

/**
 * ¿El error viene de la capa de red (y no de la app)? TypeError cubre
 * "Failed to fetch" (Chrome) y "NetworkError when attempting to fetch
 * resource" (Firefox); AbortError es nuestro propio timeout. Estos errores
 * jamás se muestran crudos al cliente.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return err.name === "AbortError" || err.name === "TimeoutError";
  }
  return false;
}

class NonRetryableUploadError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * PUT a una signed URL con retry + timeout. Reintenta errores de red y 5xx;
 * un 4xx (firma vencida o bucket misconfigurado) es definitivo y no se
 * reintenta. Lanza el último error si se agotan los intentos.
 */
export async function putWithRetry(
  req: StoragePutRequest,
  opts: UploadRetryOptions = {},
): Promise<void> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryBaseMs = opts.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs(attempt - 1, retryBaseMs));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(req.url, {
        method: "PUT",
        headers: { "content-type": req.contentType, "cache-control": "max-age=3600" },
        body: req.body,
        signal: controller.signal,
      });
      if (res.ok) return;
      if (res.status < 500) {
        throw new NonRetryableUploadError(`HTTP ${res.status}`);
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (err instanceof NonRetryableUploadError) throw err;
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Corre `worker` sobre todos los items con a lo sumo `concurrency` en vuelo.
 * Fail-fast: el primer error frena el despacho de tareas nuevas y se
 * re-lanza al final (las ya en vuelo terminan — abortar un PUT a medias
 * dejaría basura en Storage, que el finalize marca como subida).
 */
export async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  let firstError: unknown = null;
  const lanes = Math.max(1, Math.min(concurrency, items.length));
  async function runner() {
    while (next < items.length && firstError === null) {
      const index = next++;
      try {
        await worker(items[index], index);
      } catch (err) {
        firstError = err;
        return;
      }
    }
  }
  await Promise.all(Array.from({ length: lanes }, runner));
  if (firstError !== null) throw firstError;
}

/** Sube todos los PUTs con concurrencia tope 3; lanza el primer fallo. */
export async function uploadAllWithRetry(
  requests: StoragePutRequest[],
  opts: UploadRetryOptions & { concurrency?: number } = {},
): Promise<void> {
  await mapWithConcurrency(requests, opts.concurrency ?? 3, (req) => putWithRetry(req, opts));
}
