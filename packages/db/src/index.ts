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
 * Pool size (F-14, audit 2026-09-04):
 *   - Prisma's default pool is num_cpus×2+1 PER PROCESS. On Vercel each
 *     lambda opens its own pool against the Supabase pooler (PgBouncer
 *     transaction mode, port 6543), and the pooler's upstream slots are
 *     finite — a traffic spike across N lambdas exhausts them.
 *   - We therefore pin `connection_limit` on the RUNTIME url only:
 *     `PRISMA_CONNECTION_LIMIT` (default 3). The limit is injected as a
 *     query param via the `datasources` override, so `prisma migrate` /
 *     `prisma db push` (DIRECT_URL, port 5432) and the one-off scripts in
 *     packages/db/scripts (own PrismaClient) are untouched.
 *   - An explicit `connection_limit` already present in DATABASE_URL wins
 *     over the env var.
 *
 * Referencias:
 *   - docs/INTEGRATIONS.md § Supabase (DATABASE_URL vs DIRECT_URL)
 *   - https://www.prisma.io/docs/guides/database/supabase
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const logLevels: ("query" | "error" | "warn" | "info")[] = ["error", "warn"];
if (process.env.PRISMA_LOG === "query") logLevels.unshift("query");

/** Pool cap per process when PRISMA_CONNECTION_LIMIT is absent or invalid. */
export const DEFAULT_CONNECTION_LIMIT = 3;

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
 * Returns the runtime DATABASE_URL with `connection_limit` pinned. The
 * original string is returned verbatim apart from the appended param — no
 * URL re-serialization that could normalize credentials or existing params
 * (pgbouncer=true, …). An explicit connection_limit already present wins.
 */
export function withConnectionLimit(baseUrl: string, limit: number): string {
  if (/[?&]connection_limit=/.test(baseUrl)) return baseUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}connection_limit=${limit}`;
}

const databaseUrl = process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logLevels,
    // Runtime-only override (see header): never applied to DIRECT_URL.
    ...(databaseUrl
      ? {
          datasources: {
            db: {
              url: withConnectionLimit(
                databaseUrl,
                parseConnectionLimit(process.env.PRISMA_CONNECTION_LIMIT),
              ),
            },
          },
        }
      : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-exporta Prisma como namespace + valor (no solo type) para que
// consumers puedan hacer `instanceof Prisma.PrismaClientKnownRequestError`
// además de usar Prisma.Customer<...> en signaturas.
export { Prisma } from "@prisma/client";
export * from "@prisma/client";
