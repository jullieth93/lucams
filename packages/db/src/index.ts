/*
 * Cliente Prisma singleton para Lucams_shop.
 *
 * Por qué singleton:
 *   - Cada `new PrismaClient()` abre un pool de conexiones. En desarrollo con
 *     hot-reload de Next.js, sin singleton se fugan conexiones en cada
 *     re-render y rápidamente se acaban los slots de Postgres.
 *
 * Conexión:
 *   - `DATABASE_URL` apunta al pooler PgBouncer (6543) — usado por el cliente
 *     en runtime para queries normales.
 *   - `DIRECT_URL` apunta al puerto directo (5432) — usado por `prisma migrate`
 *     y `prisma db push` (no soportan pgBouncer). Configurado en schema.prisma.
 *
 * Logging:
 *   - Default: solo `error`, `warn` (señal limpia, ruido mínimo).
 *   - Para debug de queries SQL: setea `PRISMA_LOG=query` en .env.local y
 *     reinicia el dev server. Útil cuando se quiere ver qué SQL emite Prisma
 *     o medir N+1; off-by-default porque flooded el log con cientos de líneas
 *     por request.
 *
 * Pool size (F-14, audit 2026-09-04; ajuste ADR-131, 2026-10-08):
 *   - Prisma's default pool is num_cpus×2+1 PER PROCESS. On Vercel each
 *     lambda opens its own pool against the Supabase pooler (PgBouncer
 *     transaction mode, port 6543), and the pooler's upstream slots are
 *     finite — a traffic spike across N lambdas exhausts them.
 *   - We therefore pin `connection_limit` on the RUNTIME url only:
 *     `PRISMA_CONNECTION_LIMIT` (default 5 — ver nota abajo). The limit is
 *     injected as a query param via the `datasources` override, so
 *     `prisma migrate` / `prisma db push` (DIRECT_URL, port 5432) and the
 *     one-off scripts in packages/db/scripts (own PrismaClient) are untouched.
 *   - An explicit `connection_limit` already present in DATABASE_URL wins
 *     over the env var.
 *   - ADR-131 (2026-10-08): el default sube 3 → 5 y se fija `pool_timeout=20s`
 *     (default Prisma 10s; `PRISMA_POOL_TIMEOUT` lo overridea, y un
 *     `pool_timeout` explícito en DATABASE_URL gana sobre ambos). Medición del
 *     incidente de degradación STG: ráfagas de P2024 ("Timed out fetching a new
 *     connection … limit: 3, timeout: 10") bajo concurrencia MODERADA (~40
 *     req/min del E2E): una lambda Next 16 atiende varias requests a la vez en
 *     el mismo proceso (render RSC + revalidaciones de unstable_cache +
 *     actions), y 3 conexiones × 10s de espera colapsaban en timeout → 500
 *     genéricos. Lado servidor no se incrementa la presión real: Supavisor en
 *     modo transacción solo ocupa una conexión upstream mientras la query está
 *     activa, y el tope físico (max_connections=60 del compute Free) lo vigila
 *     el pooler.
 *
 * Retry transitorio (ADR-131): los errores de ADQUISICIÓN de conexión (P1001
 * "can't reach", P1017 "server closed connection", P2024 "pool timeout")
 * implican que la query NUNCA llegó a ejecutarse → reintentar es seguro incluso
 * para writes. El cliente lleva una extensión `$allOperations` que reintenta
 * hasta 2 veces con backoff (300ms/900ms). Sin esto, un flap intermitente de
 * Supavisor (observado desde Vercel Y desde la VM con el postmaster estable —
 * el que flapea es el pooler, no Postgres) se convertía directo en el 500
 * genérico del usuario.
 *   - OJO transacciones interactivas: en `$transaction(async (tx) => …)` un
 *     P1001 ya marca la transacción como muerta; el retry falla rápido y el
 *     error original se propaga — no empeora nada, pero tampoco la salva.
 *     Las operaciones SUELTAS (la gran mayoría del runtime) sí se salvan.
 *
 * Referencias:
 *   - docs/INTEGRATIONS.md § Supabase (DATABASE_URL vs DIRECT_URL)
 *   - https://www.prisma.io/docs/guides/database/supabase
 */

import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const logLevels: ("query" | "error" | "warn" | "info")[] = ["error", "warn"];
if (process.env.PRISMA_LOG === "query") logLevels.unshift("query");

/** Pool cap per process when PRISMA_CONNECTION_LIMIT is absent or invalid (ADR-131: 5). */
export const DEFAULT_CONNECTION_LIMIT = 5;

/** Seconds waiting for a pool slot before P2024 when PRISMA_POOL_TIMEOUT is absent (ADR-131: 20). */
export const DEFAULT_POOL_TIMEOUT_S = 20;

/**
 * Parses PRISMA_CONNECTION_LIMIT. Anything missing, non-numeric or < 1
 * falls back to DEFAULT_CONNECTION_LIMIT — a misconfigured env var must
 * never silently restore the unbounded default pool.
 */
export function parseConnectionLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONNECTION_LIMIT;
}

/**
 * Parses PRISMA_POOL_TIMEOUT (seconds). Same fail-safe philosophy as
 * parseConnectionLimit: invalid → DEFAULT_POOL_TIMEOUT_S.
 */
export function parsePoolTimeout(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_TIMEOUT_S;
}

/**
 * Returns the runtime DATABASE_URL with `connection_limit` and `pool_timeout`
 * pinned. The original string is returned verbatim apart from the appended
 * params — no URL re-serialization that could normalize credentials or
 * existing params (pgbouncer=true, …). Explicit params already present win.
 */
export function withConnectionLimit(baseUrl: string, limit: number, poolTimeoutS?: number): string {
  let url = baseUrl;
  if (!/[?&]connection_limit=/.test(url)) {
    url = `${url}${url.includes("?") ? "&" : "?"}connection_limit=${limit}`;
  }
  const timeout = poolTimeoutS ?? DEFAULT_POOL_TIMEOUT_S;
  if (!/[?&]pool_timeout=/.test(url)) {
    url = `${url}&pool_timeout=${timeout}`;
  }
  return url;
}

/**
 * Errores de Prisma donde la query NUNCA se ejecutó (falla al adquirir la
 * conexión), seguros de reintentar en cualquier operación — incluso writes:
 *   P1001 can't reach the database server (flap del pooler/red)
 *   P1017 server closed the connection (idle kill de Supavisor)
 *   P2024 timed out fetching a new connection from the pool (saturación local)
 *
 * Prisma los emite con DOS clases distintas según el punto del fallo: como
 * PrismaClientKnownRequestError (con `code`) o como PrismaClientInitializationError
 * (SIN `code` — medido en PRD 2026-10-09: P2024 en cold start de lambda llegó
 * como InitializationError y el retry por código no lo reconocía). Por eso el
 * match es por código O por el texto del mensaje (los mensajes de Prisma para
 * estos tres casos son estables y específicos — no hay riesgo de confundirlos
 * con errores de ejecución, que siempre llevan código).
 */
export function isRetryableConnectionError(err: unknown): boolean {
  const code = (err as Prisma.PrismaClientKnownRequestError | null)?.code;
  if (code === "P1001" || code === "P1017" || code === "P2024") return true;
  if (code) return false; // error de ejecución con código — jamás reintentar
  const message = (err as Error | null)?.message ?? "";
  return (
    message.includes("Can't reach database server") ||
    message.includes("Server has closed the connection") ||
    message.includes("Timed out fetching a new connection from the connection pool")
  );
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Reintenta `fn` ante errores transitorios de conexión (isRetryableConnectionError):
 * hasta `maxAttempts` intentos con backoff lineal (300ms × intento). Cualquier
 * otro error se propaga inmediatamente — no se reintentan errores de constraint,
 * de sintaxis ni de lógica (la query SÍ se ejecutó en esos casos).
 */
export async function runWithDbRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number; sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const sleep = opts?.sleep ?? defaultSleep;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableConnectionError(err) || attempt === maxAttempts) throw err;
      await sleep(attempt * 300);
    }
  }
  // Inalcanzable (el loop siempre retorna o lanza); satisface a TS.
  throw new Error("unreachable");
}

/** Construye el cliente con pool pinneado + extensión de retry (ver header). */
function buildClient(): PrismaClient {
  const base = new PrismaClient({
    log: logLevels,
    // Runtime-only override (see header): never applied to DIRECT_URL.
    ...(databaseUrl
      ? {
          datasources: {
            db: {
              url: withConnectionLimit(
                databaseUrl,
                parseConnectionLimit(process.env.PRISMA_CONNECTION_LIMIT),
                parsePoolTimeout(process.env.PRISMA_POOL_TIMEOUT),
              ),
            },
          },
        }
      : {}),
  });
  // Tipada como PrismaClient: $extends preserva la superficie de modelos.
  return base.$extends({
    query: {
      $allOperations({ args, query }) {
        return runWithDbRetry(() => query(args));
      },
    },
  }) as PrismaClient;
}

const databaseUrl = process.env.DATABASE_URL;

// El singleton cachea el cliente YA EXTENDIDO: en dev con hot-reload, reusar
// el base sin extensión perdería el retry silenciosamente.
export const prisma: PrismaClient = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-exporta Prisma como namespace + valor (no solo type) para que
// consumers puedan hacer `instanceof Prisma.PrismaClientKnownRequestError`
// además de usar Prisma.Customer<...> en signaturas.
export { Prisma } from "@prisma/client";
export * from "@prisma/client";
