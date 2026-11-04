/*
 * Service layer Customers — admin Customer 360.
 *
 * Lecturas para listado + detail. No exponer mutaciones de Customer
 * desde admin (Ley 1581: el customer es dueño de sus datos; admin
 * no edita perfil ajeno). Solo lectura + soft-suspend si fuera
 * necesario (esquema actual no tiene `suspended` flag — usar
 * `deletedAt` como hard-suspend si llegara el caso de soporte).
 *
 * Patrón consistente con listProducts/listCategories: opts con q,
 * status, sort, page, pageSize → retorna { items, total, page,
 * pageSize, totalPages }.
 */

import "server-only";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 20;

/** Estados de orden efectivamente pagados/confirmados para métricas y conteos comerciales. */
export const PAID_ORDER_STATUSES = ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] as const;

export type CustomerSortOption = "recent" | "name" | "orders" | "spent";

export type CustomerListOpts = {
  q?: string;
  /** "all" (default) | "with-orders" (>=1 orden pagada activa) | "no-orders" */
  status?: "all" | "with-orders" | "no-orders";
  /** "recent" (default) | "name" | "orders" (más pedidos pagados) | "spent" (más compras $) */
  sort?: CustomerSortOption;
  page?: number;
  pageSize?: number;
};

export type CustomerListItem = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  documentType: string | null;
  documentNumber: string | null;
  ordersCount: number;
  totalSpent: number;
  reviewsCount: number;
  loyaltyPoints: number;
  createdAt: Date;
};

export type CustomerListResult = {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function listCustomers(opts: CustomerListOpts = {}): Promise<CustomerListResult> {
  const q = opts.q?.trim();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;

  const paidOrdersWhere: Prisma.OrderWhereInput = {
    deletedAt: null,
    status: { in: [...PAID_ORDER_STATUSES] },
  };

  const where: Prisma.CustomerWhereInput = {
    deletedAt: null,
    ...(tokens.length > 0
      ? {
          AND: tokens.map((token) => ({
            OR: [
              { email: { contains: token, mode: "insensitive" as const } },
              { firstName: { contains: token, mode: "insensitive" as const } },
              { lastName: { contains: token, mode: "insensitive" as const } },
              { documentNumber: { contains: token } },
              { phone: { contains: token } },
            ],
          })),
        }
      : {}),
    ...(opts.status === "with-orders"
      ? { orders: { some: paidOrdersWhere } }
      : opts.status === "no-orders"
        ? { orders: { none: paidOrdersWhere } }
        : {}),
  };

  const selectFields = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    phone: true,
    documentType: true,
    documentNumber: true,
    loyaltyPoints: true,
    createdAt: true,
    _count: {
      select: {
        orders: { where: paidOrdersWhere },
        reviews: true,
      },
    },
  } satisfies Prisma.CustomerSelect;

  let rawItems: Array<Prisma.CustomerGetPayload<{ select: typeof selectFields }>>;
  let total: number;

  if (opts.sort === "orders" || opts.sort === "spent") {
    const sqlConditions: Prisma.Sql[] = [Prisma.sql`c."deletedAt" IS NULL`];
    for (const token of tokens) {
      const pattern = `%${escapeLikePattern(token)}%`;
      sqlConditions.push(
        Prisma.sql`(
          c."email" ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(c."firstName", '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(c."lastName", '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(c."documentNumber", '') LIKE ${pattern} ESCAPE '\\'
          OR COALESCE(c."phone", '') LIKE ${pattern} ESCAPE '\\'
        )`,
      );
    }
    if (opts.status === "with-orders") {
      sqlConditions.push(Prisma.sql`COALESCE(ord.paid_orders, 0) > 0`);
    } else if (opts.status === "no-orders") {
      sqlConditions.push(Prisma.sql`COALESCE(ord.paid_orders, 0) = 0`);
    }

    const orderClause =
      opts.sort === "orders"
        ? Prisma.sql`COALESCE(ord.paid_orders, 0) DESC, c."createdAt" DESC, c."id" ASC`
        : Prisma.sql`COALESCE(ord.total_spent, 0) DESC, c."createdAt" DESC, c."id" ASC`;

    const [orderedIds, countRes] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT c."id"
        FROM "Customer" c
        LEFT JOIN (
          SELECT
            "customerId",
            COUNT(*)::int AS paid_orders,
            COALESCE(SUM("total"), 0)::bigint AS total_spent
          FROM "Order"
          WHERE "deletedAt" IS NULL
            AND "status"::text IN ('PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED')
            AND "customerId" IS NOT NULL
          GROUP BY "customerId"
        ) ord ON ord."customerId" = c."id"
        WHERE ${Prisma.join(sqlConditions, " AND ")}
        ORDER BY ${orderClause}
        LIMIT ${pageSize}
        OFFSET ${(page - 1) * pageSize}
      `,
      prisma.customer.count({ where }),
    ]);

    total = countRes;
    if (orderedIds.length === 0) {
      rawItems = [];
    } else {
      const pageIds = orderedIds.map((r) => r.id);
      const fetched = await prisma.customer.findMany({
        where: { id: { in: pageIds } },
        select: selectFields,
      });
      const byId = new Map(fetched.map((row) => [row.id, row]));
      rawItems = pageIds
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
    }
  } else {
    const orderBy =
      opts.sort === "name"
        ? [{ firstName: "asc" as const }, { lastName: "asc" as const }]
        : [{ createdAt: "desc" as const }];

    [rawItems, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: selectFields,
      }),
      prisma.customer.count({ where }),
    ]);
  }

  const spentByCustomer = new Map<string, number>();
  if (rawItems.length > 0) {
    const sums = await prisma.order.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: rawItems.map((c) => c.id) },
        ...paidOrdersWhere,
      },
      _sum: { total: true },
    });
    for (const row of sums) {
      if (row.customerId) {
        spentByCustomer.set(row.customerId, row._sum.total ?? 0);
      }
    }
  }

  const items: CustomerListItem[] = rawItems.map((c) => ({
    id: c.id,
    email: c.email,
    fullName: [c.firstName, c.lastName].filter(Boolean).join(" ") || "(sin nombre)",
    phone: c.phone,
    documentType: c.documentType,
    documentNumber: c.documentNumber,
    ordersCount: c._count.orders,
    totalSpent: spentByCustomer.get(c.id) ?? 0,
    reviewsCount: c._count.reviews,
    loyaltyPoints: c.loyaltyPoints,
    createdAt: c.createdAt,
  }));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Detail completo para Customer 360 — incluye relaciones críticas:
 * orders, reviews, addresses, designs.
 *
 * (El include de `loyaltyTxns` se retiró en T7 2026-10-01: era un fetch muerto
 * en el hot path del admin. Con el programa "Puntos Lucams" activo
 * (2026-10-12) el balance ya lo trae el campo escalar `loyaltyPoints`; el
 * historial de movimientos lo vería el cliente en /mi-cuenta.)
 *
 * Limita orders/reviews a últimas 50 para no traer payloads enormes
 * de customers VIP. Si se necesita histórico completo se hace en pages
 * dedicadas con paginación propia.
 */
export async function getCustomerDetail(id: string) {
  return prisma.customer.findFirst({
    where: { id, deletedAt: null },
    include: {
      addresses: {
        orderBy: { createdAt: "desc" },
      },
      orders: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          currency: true,
          createdAt: true,
        },
      },
      reviews: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          product: { select: { id: true, slug: true, name: true } },
        },
      },
      designs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          productId: true,
          status: true,
          createdAt: true,
        },
      },
      referrals: {
        where: { deletedAt: null },
        select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
      },
      _count: {
        select: {
          orders: true,
          reviews: true,
          designs: true,
          referrals: true,
          couponUsages: true,
          supportTickets: true,
        },
      },
    },
  });
}

/**
 * Filas del modelo `Referral` hechas por este customer (referrerId = id):
 * email del referido + status PENDING/REWARDED/EXPIRED + fechas. El Customer
 * 360 las muestra para que el admin vea si la recompensa (cupón 10%) se
 * entregó — la relación `Customer.referrals` solo lista customers referidos,
 * sin estado de recompensa (T7 2026-10-01). Referral no tiene @relation en el
 * schema v1, por eso es query aparte y no include de getCustomerDetail.
 */
export async function getCustomerReferralRows(referrerId: string) {
  return prisma.referral.findMany({
    where: { referrerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, referredEmail: true, status: true, createdAt: true, rewardedAt: true },
  });
}

/**
 * Total gastado por el customer (sum de orders.totalAmount con status
 * "PAID" o posterior). Útil para el header del Customer 360.
 */
export async function getCustomerTotalSpent(customerId: string): Promise<number> {
  const result = await prisma.order.aggregate({
    where: {
      customerId,
      deletedAt: null,
      status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] },
    },
    _sum: { total: true },
  });
  return result._sum?.total ?? 0;
}
