/*
 * Instrumentación Next 16 (Bloque D — observabilidad).
 *
 * onRequestError es el hook oficial de Next para trackear TODOS los errores del
 * servidor (RSC, route handlers, server actions) a un proveedor de observabilidad.
 * Como el mandato #7 excluye Sentry, los persistimos en ErrorLog (DB) para verlos
 * en /admin/observability y (futuro) alertar por email.
 *
 * Doc: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
 */

import type { Instrumentation } from "next";
import { captureServerError } from "@/lib/error-capture";
import { logger } from "@/lib/logger";

/**
 * register() corre UNA vez al iniciar el servidor. Validamos las variables de entorno
 * acá (fail-fast) para no descubrir en una request que faltó un secreto en producción.
 * Solo en runtime Node: el edge no necesita estos secretos y no soporta pino/zod igual.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as { digest?: string } & Error;
  logger.error({
    event: "server.error",
    message: e.message,
    digest: e.digest ?? null,
    requestPath: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
  });
  await captureServerError({
    message: e.message,
    digest: e.digest,
    stack: e.stack,
    requestPath: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
