/*
 * Request ID propagado vía AsyncLocalStorage.
 *
 * Cada request entrante recibe un UUID v4 generado en `proxy.ts` (Next.js 16
 * renombró `middleware.ts` → `proxy.ts`). Se propaga:
 *  - Header de respuesta `X-Request-Id`.
 *  - `als.run(id, ...)` envuelve el handler para que cualquier código aguas
 *    abajo (servicios, repos, logger) pueda leerlo sin pasarlo explícito.
 *
 * Lectura: `getRequestId()` devuelve el ID del request actual o
 * `'no-request-id'` si se llama fuera de un contexto request (ej. job pgmq
 * que tiene su propio mecanismo de correlación).
 *
 * Referencias:
 *  - docs/CONVENTIONS.md § Request ID
 *  - Node AsyncLocalStorage: https://nodejs.org/api/async_context.html
 */

import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<string>();

export function withRequestId<T>(id: string, fn: () => T): T {
  return als.run(id, fn);
}

export function getRequestId(): string {
  return als.getStore() ?? "no-request-id";
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
