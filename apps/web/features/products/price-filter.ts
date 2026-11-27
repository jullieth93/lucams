/*
 * Filtro canónico de rango de precio en SQL/Prisma sobre variantes activas (Fase 5 · #10).
 *
 * Compartido entre el stack SSR (`features/products/public-service.ts`) y el
 * stack AI-ready/API (`lib/catalog.ts`) para garantizar paridad 1:1 y paginación
 * exacta ANTES de `take`/`skip` y `count`:
 *
 *   Un producto coincide con `[minPrice, maxPrice]` (en centavos COP `Int`) si y solo si:
 *   1. Tiene al menos una variante activa (`isActive = true`, `deletedAt IS NULL`) con
 *      `price` explícito dentro del rango `[minPrice, maxPrice]`; O
 *   2. Su `basePrice` está dentro de `[minPrice, maxPrice]` Y:
 *      - tiene al menos una variante activa que hereda `basePrice` (`price IS NULL`), O
 *      - el producto no tiene filas en `ProductVariant` (`none: {}`).
 *
 *   Invariante fail-closed: las variantes inactivas o archivadas (`isActive = false` o
 *   `deletedAt IS NOT NULL`) NUNCA hacen coincidir un producto en el rango de precio.
 */

import { Prisma } from "@lucams/db";

/** Techo PostgreSQL INT4 (centavos COP = ~$21.47 M). */
export const MAX_PRICE_CENTS = 2_147_483_647;

/**
 * Sanitiza un límite de precio en centavos COP al rango entero seguro de INT4
 * `[0, MAX_PRICE_CENTS]`. Previene `PrismaClientValidationError` (HTTP 500)
 * cuando llegan enteros negativos o > INT4 desde query params públicos.
 */
export function normalizePriceBound(value?: number | null): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const int = Math.trunc(value);
  if (int < 0) return 0;
  if (int > MAX_PRICE_CENTS) return MAX_PRICE_CENTS;
  return int;
}

export function buildActiveVariantPriceWhere(
  minPrice?: number | null,
  maxPrice?: number | null,
): Prisma.ProductWhereInput | null {
  const min = normalizePriceBound(minPrice);
  const max = normalizePriceBound(maxPrice);
  if (min === undefined && max === undefined) return null;

  const priceBounds: Prisma.IntFilter = {
    ...(min !== undefined ? { gte: min } : {}),
    ...(max !== undefined ? { lte: max } : {}),
  };

  const nullablePriceBounds: Prisma.IntNullableFilter = {
    not: null,
    ...(min !== undefined ? { gte: min } : {}),
    ...(max !== undefined ? { lte: max } : {}),
  };

  return {
    OR: [
      {
        variants: {
          some: {
            isActive: true,
            deletedAt: null,
            price: nullablePriceBounds,
          },
        },
      },
      {
        AND: [
          { basePrice: priceBounds },
          {
            OR: [
              {
                variants: {
                  some: {
                    isActive: true,
                    deletedAt: null,
                    price: null,
                  },
                },
              },
              {
                variants: {
                  none: {},
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Equivalente SQL crudo de `buildActiveVariantPriceWhere` para las queries
 * `$queryRaw` de búsqueda (`searchStorefrontProducts`), asumiendo alias `p`
 * para `"Product"`.
 */
export function buildActiveVariantPriceSqlClause(
  minPrice?: number | null,
  maxPrice?: number | null,
): Prisma.Sql {
  const min = normalizePriceBound(minPrice);
  const max = normalizePriceBound(maxPrice);
  if (min === undefined && max === undefined) return Prisma.empty;

  const variantMin = min !== undefined ? Prisma.sql`AND pv.price >= ${min}` : Prisma.empty;
  const variantMax = max !== undefined ? Prisma.sql`AND pv.price <= ${max}` : Prisma.empty;
  const baseMin = min !== undefined ? Prisma.sql`AND p."basePrice" >= ${min}` : Prisma.empty;
  const baseMax = max !== undefined ? Prisma.sql`AND p."basePrice" <= ${max}` : Prisma.empty;

  return Prisma.sql`AND (
    EXISTS (
      SELECT 1 FROM "ProductVariant" pv
      WHERE pv."productId" = p.id
        AND pv."isActive" = true
        AND pv."deletedAt" IS NULL
        AND pv.price IS NOT NULL
        ${variantMin}
        ${variantMax}
    )
    OR (
      true
      ${baseMin}
      ${baseMax}
      AND (
        EXISTS (
          SELECT 1 FROM "ProductVariant" pv
          WHERE pv."productId" = p.id
            AND pv."isActive" = true
            AND pv."deletedAt" IS NULL
            AND pv.price IS NULL
        )
        OR NOT EXISTS (
          SELECT 1 FROM "ProductVariant" pv
          WHERE pv."productId" = p.id
        )
      )
    )
  )`;
}
