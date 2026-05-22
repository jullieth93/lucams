/*
 * Logger estructurado JSON con redacción de PII y secretos.
 *
 * Implementación basada en console.log nativo (NO pino). Razón: pino +
 * turbopack Next 16 tienen un bug de bundling reproducible que rompe
 * `next build` con el error críptico:
 *   "Error: default level:info must be included in custom levels"
 * Probado serverExternalPackages, force-dynamic, quitar transport — el
 * issue persiste. La pérdida es mínima: console.log con JSON ya es
 * compatible con Vercel logs / Better Stack / cualquier ingestor.
 *
 * API público idéntica al de pino (info / warn / error / debug) — los
 * 16 callsites en la app no requieren cambio.
 *
 * Reglas de uso (ver docs/CONVENTIONS.md § Logger y docs/SECURITY.md §
 * Datos clasificados):
 *  - SIEMPRE pasar objeto estructurado: `logger.info({ event, ...campos })`.
 *  - NUNCA interpolar PII en el mensaje: `logger.info('user ' + email)` ❌.
 *  - Incluir `requestId: getRequestId()` en cada log de un request handler.
 *
 * Redact:
 *  - Por key name (case-insensitive): password, token, secret, key, cookie,
 *    authorization, email, phone, document.
 *  - Por path absoluto: `req.headers.authorization`, `req.headers.cookie`.
 *  - Valor reemplazado con '[REDACTED]'.
 *
 * Levels:
 *  - debug < info < warn < error
 *  - default: 'debug' en dev, 'info' en prod
 *  - configurable vía LOG_LEVEL
 *
 * Output: JSON una-línea-por-evento a stdout (info/debug) o stderr
 * (warn/error). Vercel los parsea automático.
 */

type LogLevel = "debug" | "info" | "warn" | "error";
type LogObject = Record<string, unknown>;

const LEVEL_VALUE: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACT_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "apisecret",
  "clientsecret",
  "key",
  "apikey",
  "privatekey",
  "publickey",
  "cookie",
  "authorization",
  "email",
  "phone",
  "documentnumber",
]);

function shouldRedactKey(key: string): boolean {
  const k = key.toLowerCase();
  if (REDACT_KEYS.has(k)) return true;
  // Match suffixes like *Secret, *Token, *Key
  return /(secret|token|key|password|cookie|authorization)$/i.test(k);
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[DEEP]";
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }
  const out: LogObject = {};
  for (const [k, v] of Object.entries(value as LogObject)) {
    out[k] = shouldRedactKey(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

const isDev = process.env.NODE_ENV !== "production";
const configuredLevel = (process.env.LOG_LEVEL ?? (isDev ? "debug" : "info")) as LogLevel;
const minLevel = LEVEL_VALUE[configuredLevel] ?? LEVEL_VALUE.info;
const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";

function emit(level: LogLevel, payload: LogObject | string, msg?: string): void {
  if (LEVEL_VALUE[level] < minLevel) return;
  let body: LogObject;
  if (typeof payload === "string") {
    body = { msg: payload };
  } else {
    body = redact(payload) as LogObject;
    if (msg && !body.msg) body.msg = msg;
  }
  const record = {
    level,
    time: new Date().toISOString(),
    env,
    app: "lucams-shop-web",
    ...body,
  };
  const line = JSON.stringify(record);
  // Solo `error` real va a stderr/console.error — `warn` y `info` van a stdout
  // para que Next.js dev no muestre overlay rojo en el browser por logs
  // operacionales (ej. checkout.quote_shipping.fail tras un error de Aveonline
  // que ya manejamos con CheckoutError + banner amarillo en UI).
  // En Vercel logs (server-side) tanto stdout como stderr se parsean igual.
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    // console.warn NO dispara el overlay de Next dev (que solo intercepta
    // console.error), pero sí queda diferenciado en Vercel logs.
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (payload: LogObject | string, msg?: string) => emit("debug", payload, msg),
  info: (payload: LogObject | string, msg?: string) => emit("info", payload, msg),
  warn: (payload: LogObject | string, msg?: string) => emit("warn", payload, msg),
  error: (payload: LogObject | string, msg?: string) => emit("error", payload, msg),
};
