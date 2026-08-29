/*
 * Rate limiting basado en Postgres (ADR-016).
 *
 * Llama a la función SQL `rate_limit_check(key, limit, window_seconds)` que
 * vive en `supabase/migrations/00000000000003_rate_limit.sql`. La función
 * hace el increment + check atómico — no hay race condition entre lecturas
 * y escrituras.
 *
 * Convención para `key`:
 *   - Login por IP:      `login:<ip>`
 *   - Signup por IP:     `signup:<ip>`
 *   - API por cliente:   `api:<customerId>` o `api:<sessionId>` para anon
 *   - Webhook por src:   `webhook:<source>` (sanity, no por IP que rota)
 *
 * Buckets recomendados (revisar contra métricas reales tras el lanzamiento):
 *   - login:    5 intentos / 15 min  (mitiga brute force).
 *   - signup:   3 cuentas / 1 hora    (mitiga abuso).
 *   - api:      60 req / minuto       (límite suave para clientes legítimos).
 *   - webhook:  100 req / minuto      (genera de partners, lo más alto).
 *
 * Referencias:
 *   - ADR-016 Rate limit en Postgres.
 *   - docs/SECURITY.md § Rate limiting.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  resetAt: Date;
};

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  // Casts explícitos: Prisma serializa `number` JS como `bigint` (int8) por
  // defecto. La función rate_limit_check tiene firma (text, int, int) — sin
  // los ::int, Postgres no encuentra overload y tira 42883
  // "function rate_limit_check(text, bigint, bigint) does not exist".
  const rows = await prisma.$queryRaw<
    Array<{ allowed: boolean; count: number; reset_at: Date }>
  >`SELECT * FROM rate_limit_check(${key}::text, ${limit}::int, ${windowSeconds}::int)`;

  const row = rows[0];
  if (!row) {
    // No debería pasar: la función SIEMPRE devuelve una fila. Si pasa,
    // somos permisivos por defecto (fail-open). Se loguea para que el
    // fail-open sea detectable (auditoría 2026-08-24, C-8) — sin este
    // warn el bucket quedaría sin protección de forma silenciosa.
    logger.warn({ event: "rate_limit.empty_row", key });
    return {
      allowed: true,
      count: 0,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
    };
  }

  return {
    allowed: row.allowed,
    count: row.count,
    resetAt: row.reset_at,
  };
}
