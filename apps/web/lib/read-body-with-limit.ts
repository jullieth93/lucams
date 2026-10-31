/*
 * Lectura acotada de request bodies (LUC-SEC-007, auditoría 2026-10-30).
 *
 * Los webhooks y sumideros públicos llamaban req.text()/request.json() sin
 * techo de aplicación: el body se leía y parseaba entero antes de cualquier
 * rechazo. La firma de un webhook exige el body crudo; NO exige aceptarlo
 * ilimitado.
 *
 * readBodyWithLimit(request, maxBytes):
 *   - Content-Length declarado por encima del máximo → 413 sin leer el stream;
 *   - NO confía solo en Content-Length (puede mentir hacia abajo): lee el
 *     stream y aborta al sobrepasar el presupuesto REAL;
 *   - el límite es por RUTA y pequeño. El límite de plataforma (Vercel) queda
 *     como segunda capa, no como la única.
 *
 * Uso en la ruta:
 *   let rawBody: string;
 *   try {
 *     rawBody = await readBodyWithLimit(req, WEBHOOK_MAX_BODY_BYTES);
 *   } catch (err) {
 *     if (err instanceof BodyTooLargeError) return 413;
 *     throw err;
 *   }
 */

import "server-only";

export class BodyTooLargeError extends Error {
  readonly status = 413;
  constructor(
    public readonly limit: number,
    detail: "content-length" | "stream",
  ) {
    super(`body excede ${limit} bytes (${detail})`);
    this.name = "BodyTooLargeError";
  }
}

export async function readBodyWithLimit(req: Request, maxBytes: number): Promise<string> {
  // Capa 1: rechazo temprano por Content-Length declarado (barato).
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) throw new BodyTooLargeError(maxBytes, "content-length");
  }

  // Capa 2: lectura real con aborto al sobrepasar el presupuesto (chunked o
  // Content-Length mentiroso quedan cubiertos acá).
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel("body too large").catch(() => {});
        throw new BodyTooLargeError(maxBytes, "stream");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  // Un solo TextDecoder sobre el stream completo (UTF-8 multibyte a salvo).
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(out);
}
