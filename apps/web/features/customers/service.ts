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
import { prisma } from "@/lib/db";

const PAGE_SIZE = 20;

export type CustomerListOpts = {
  q?: string;
  /** "all" (default) | "with-orders" (>=1 order) | "no-orders" */
  status?: "all" | "with-orders" | "no-orders";
  /** "recent" (default) | "name" | "orders" (más pedidos primero) */
  sort?: "recent" | "name" | "orders";
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

export async function listCustomers(opts: CustomerListOpts = {}): Promise<CustomerListResult> {
  const q = opts.q?.trim();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;

  const orderBy = (() => {
    switch (opts.sort) {
      case "name":
        return [{ firstName: "asc" as const }, { lastName: "asc" as const }];
      case "orders":
        // Prisma no soporta orderBy directo sobre _count, fallback a recent.
        // Si la lista crece, esto podría llevar a un raw SQL — TODO si Lucy lo pide.
        return [{ createdAt: "desc" as const }];
      case "recent":
      default:
        return [{ createdAt: "desc" as const }];
    }
  })();

  const where = {
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { documentNumber: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : {}),
    ...(opts.status === "with-orders"
      ? { orders: { some: { deletedAt: null } } }
      : opts.status === "no-orders"
        ? { orders: { none: { deletedAt: null } } }
        : {}),
  };

  const [rawItems, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        documentType: true,
        documentNumber: true,
        loyaltyPoints: true,
        createdAt: true,
        _count: { select: { orders: true, reviews: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  const items: CustomerListItem[] = rawItems.map((c) => ({
    id: c.id,
    email: c.email,
    fullName: [c.firstName, c.lastName].filter(Boolean).join(" ") || "(sin nombre)",
    phone: c.phone,
    documentType: c.documentType,
    documentNumber: c.documentNumber,
    ordersCount: c._count.orders,
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
 * orders, reviews, addresses, loyalty txns recientes, designs.
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
      loyaltyTxns: {
        orderBy: { createdAt: "desc" },
        take: 20,
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
