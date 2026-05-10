/*
 * Logger estructurado JSON con redacción de PII y secretos.
 *
 * Patrón: pino con `redact.paths` y `censor: '[REDACTED]'`. Todos los logs
 * salen como JSON una-línea-por-evento — formato apto para Vercel logs y
 * cualquier ingestor (Better Stack, Logtail, futuro pipeline).
 *
 * Reglas de uso (ver docs/CONVENTIONS.md § Logger y docs/SECURITY.md §
 * Datos clasificados):
 *  - SIEMPRE pasar objeto estructurado: `logger.info({ event, ...campos })`.
 *  - NUNCA interpolar PII en el mensaje: `logger.info('user ' + email)` ❌.
 *  - Incluir `requestId: getRequestId()` en cada log de un request handler.
 *
 * Niveles:
 *  - dev: 'debug' por defecto, output bonito vía pino-pretty
 *  - prod: 'info' por defecto, JSON crudo (Vercel los parsea)
 *  - configurable vía LOG_LEVEL
 *
 * Redact paths cubren: secretos por patrón (*Key, *Secret, *Token), headers
 * sensibles (auth, cookies), y PII directa (email, phone, password).
 */

import pino from "pino";

const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.email",
  "*.phone",
  "*.password",
  "*.*Secret",
  "*.*Key",
  "*.*Token",
];

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  formatters: {
    bindings: () => ({
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      app: "lucams-shop-web",
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss.l" },
    },
  }),
});
