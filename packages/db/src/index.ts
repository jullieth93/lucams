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
 *   - En dev: `query`, `error`, `warn` para debug rápido.
 *   - En prod: solo `error`, `warn` (queries se ven en Vercel logs si pino las
 *     loggea explícitamente).
 *
 * Referencias:
 *   - docs/INTEGRATIONS.md § Supabase (DATABASE_URL vs DIRECT_URL)
 *   - https://www.prisma.io/docs/guides/database/supabase
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type { Prisma } from "@prisma/client";
export * from "@prisma/client";
