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
 *  - Para correlacionar, el proxy setea el header `X-Request-Id`; un handler puede
 *    loguearlo leyéndolo de los headers del request.
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
  // #7 — 'to' es el destinatario de un email (dato personal); varios logger.info({to}) lo dejaban en
  // claro en los logs de Vercel (Ley 1581). Tradeoff: un 'to' que fuera una URL también se enmascara.
  "to",
  // Auditoría experto 2026-07-26 (P1-PII): la IP y el WhatsApp (teléfono) SON datos personales
  // (Ley 1581/GDPR) y quedaban en claro en logs de acciones públicas. Hasheados
  // en rate-limit-keys; acá se enmascaran. NO se redactan 'address' ni 'name' sueltos: son
  // claves demasiado comunes (nombres de producto/categoría) y ocultarlas rompería la
  // observabilidad; la PII embebida en strings se cubre con la redacción de Error.message.
  "ip",
  "ipaddress",
  "whatsapp",
]);

function shouldRedactKey(key: string): boolean {
  const k = key.toLowerCase();
  if (REDACT_KEYS.has(k)) return true;
  // Match suffixes like *Secret, *Token, *Key — y *Email/*Phone (#12: targetEmail, customerEmail,
  // customerPhone esquivaban la redacción por no estar en la lista exacta).
  return /(secret|token|key|password|cookie|authorization|email|phone)$/i.test(k);
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Teléfono colombiano (+57 opcional, 3XX XXX XXXX) y genérico de 7-12 dígitos con espacios/guiones.
const PHONE_RE = /(\+?57[\s-]?)?3\d{2}[\s-]?\d{3}[\s-]?\d{4}|\b\d{3}[\s-]\d{3}[\s-]\d{4}\b/g;
// Credenciales embebidas en strings libres (headers Bearer, query/hash tokens y prefijos de llaves).
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const SENSITIVE_QUERY_RE =
  /([?&#](?:token|access_token|refresh_token|id_token|secret|code|key|api_key|apikey|password|sig|signature|x-amz-signature|x-amz-credential|email|phone)=)[^&#\s'")]+/gi;
const SECRET_PREFIX_RE =
  /\b(?:sb_secret_[A-Za-z0-9_-]{12,}|sbp_[A-Za-z0-9]{16,}|re_[A-Za-z0-9_]{16,}|prv_(?:prod|test)_[A-Za-z0-9]{16,})\b/g;

/**
 * Redacción de PII y secretos DENTRO de strings (F-6 + SEC-05): la redacción por key no
 * alcanza strings libres, mensajes directos (`logger.info("...")`) ni valores dentro de
 * objetos cuya clave sea genérica (`message`, `detail`, `err`). Se enmascaran emails,
 * teléfonos, tokens Bearer, parámetros sensibles en URL y prefijos de llaves conocidas.
 */
export function scrubPii(text: string): string {
  return text
    .replace(SENSITIVE_QUERY_RE, "$1[REDACTED]")
    .replace(BEARER_RE, "Bearer [REDACTED]")
    .replace(SECRET_PREFIX_RE, "[REDACTED]")
    .replace(EMAIL_RE, "[EMAIL]")
    .replace(PHONE_RE, "[PHONE]");
}

/**
 * Normaliza una URL o ruta potencialmente sensible a únicamente su `pathname` limpio
 * (sin esquema, host, query string ni fragmento `#`) y le aplica `scrubPii` por si algún
 * segmento dinámico contuviera un email o teléfono (SEC-05).
 */
export function sanitizeLoggedPath(rawUrlOrPath: string | null | undefined): string | null {
  if (!rawUrlOrPath) return null;
  const trimmed = rawUrlOrPath.trim();
  if (!trimmed) return null;

  let pathname: string;
  try {
    const parsed = new URL(trimmed, "http://placeholder.local");
    pathname = parsed.pathname || "/";
  } catch {
    pathname = trimmed.split(/[?#]/)[0]?.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "") || "/";
  }

  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }

  return scrubPii(decoded).slice(0, 500);
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[DEEP]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubPii(value);
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubPii(value.message),
      stack: value.stack ? scrubPii(value.stack) : value.stack,
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
    body = { msg: scrubPii(payload) };
  } else {
    body = redact(payload) as LogObject;
    if (msg && !body.msg) body.msg = scrubPii(msg);
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
