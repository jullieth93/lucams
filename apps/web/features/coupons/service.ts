/*
 * Service Cupones — PLAN_CATALOG_V2 3.9.
 *
 * CRUD + métricas básicas (usage count, total descontado, top clientes).
 */

import { prisma } from "@/lib/db";
import { updateTag } from "next/cache";
import type { CouponCreateInput, CouponUpdateInput } from "./schemas";

export class CouponValidationError extends Error {
  constructor(
    public field: "code" | "validFrom" | "validTo" | "value",
    message: string,
  ) {
    super(message);
    this.name = "CouponValidationError";
  }
}

export type CouponListOpts = {
  q?: string;
  /** "active" = isActive + vigente hoy. "inactive" = pausado/expirado/programado. */
  status?: "all" | "active" | "inactive";
  sort?: "recent" | "expiry-asc" | "code" | "uses";
};

export async function listCoupons(opts: CouponListOpts = {}) {
  const q = opts.q?.trim();
  const now = new Date();
  const orderBy = (() => {
    switch (opts.sort) {
      case "expiry-asc":
        return [{ validTo: "asc" as const }];
      case "code":
        return [{ code: "asc" as const }];
      case "uses":
        return [{ usedCount: "desc" as const }];
      case "recent":
      default:
        return [{ validTo: "desc" as const }];
    }
  })();
  return prisma.coupon.findMany({
    where: {
      deletedAt: null,
      ...(opts.status === "active"
        ? { isActive: true, validFrom: { lte: now }, validTo: { gte: now } }
        : {}),
      ...(opts.status === "inactive"
        ? {
            OR: [{ isActive: false }, { validTo: { lt: now } }, { validFrom: { gt: now } }],
          }
        : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy,
    include: { _count: { select: { usages: true } } },
  });
}

export async function getCoupon(id: string) {
  return prisma.coupon.findUnique({
    where: { id },
    include: {
      usages: {
        take: 50,
        orderBy: { appliedAt: "desc" },
        include: {
          customer: { select: { email: true, firstName: true, lastName: true } },
        },
      },
      _count: { select: { usages: true } },
    },
  });
}

export async function createCoupon(input: CouponCreateInput, actorId: string) {
  if (input.validTo <= input.validFrom) {
    throw new CouponValidationError(
      "validTo",
      "La fecha de fin debe ser posterior a la de inicio.",
    );
  }
  if (input.type === "PERCENT" && (input.value < 1 || input.value > 100)) {
    throw new CouponValidationError(
      "value",
      "Para descuento %, el valor debe estar entre 1 y 100.",
    );
  }

  const existing = await prisma.coupon.findUnique({ where: { code: input.code } });
  if (existing) {
    throw new CouponValidationError("code", "Ya existe un cupón con ese código.");
  }

  const created = await prisma.coupon.create({
    data: { ...input, createdBy: actorId },
  });
  updateTag("catalog");
  updateTag("coupons");
  return created;
}

export async function updateCoupon(input: CouponUpdateInput, actorId: string) {
  const { id, ...data } = input;
  const updated = await prisma.coupon.update({
    where: { id },
    data: { ...data, updatedBy: actorId },
  });
  updateTag("catalog");
  updateTag("coupons");
  return updated;
}

export async function pauseCoupon(id: string, actorId: string) {
  await prisma.coupon.update({
    where: { id },
    data: { isActive: false, updatedBy: actorId },
  });
  updateTag("coupons");
}

export async function resumeCoupon(id: string, actorId: string) {
  await prisma.coupon.update({
    where: { id },
    data: { isActive: true, updatedBy: actorId },
  });
  updateTag("coupons");
}

export async function archiveCoupon(id: string, actorId: string) {
  await prisma.coupon.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: actorId, isActive: false },
  });
  updateTag("coupons");
}

/**
 * Métricas básicas por cupón:
 *   - usedCount: contador denormalizado en Coupon.
 *   - totalDiscounted: suma de CouponUsage.amount.
 *   - uniqueCustomers: count distinct customerId.
 */
export async function getCouponMetrics(id: string) {
  const [coupon, totalSum, uniqueCust] = await Promise.all([
    prisma.coupon.findUnique({
      where: { id },
      select: { usedCount: true, maxUses: true },
    }),
    prisma.couponUsage.aggregate({
      where: { couponId: id },
      _sum: { amount: true },
    }),
    prisma.couponUsage.findMany({
      where: { couponId: id, customerId: { not: null } },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
  ]);
  return {
    usedCount: coupon?.usedCount ?? 0,
    maxUses: coupon?.maxUses ?? null,
    totalDiscounted: totalSum._sum.amount ?? 0,
    uniqueCustomers: uniqueCust.length,
  };
}
