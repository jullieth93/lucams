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

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logLevels,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-exporta Prisma como namespace + valor (no solo type) para que
// consumers puedan hacer `instanceof Prisma.PrismaClientKnownRequestError`
// además de usar Prisma.Customer<...> en signaturas.
export { Prisma } from "@prisma/client";
export * from "@prisma/client";
