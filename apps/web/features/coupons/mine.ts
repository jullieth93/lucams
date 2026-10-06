/*
 * "Mis cupones" (referidos v2, 2026-10-05) — lectura para /mi-cuenta/cupones.
 *
 * Lista los cupones PERSONALES del cliente (Coupon.customerId = él) con su
 * estado derivado y las restricciones legibles. Los cupones públicos vigentes
 * los aporta listPublicCoupons (lib/catalog) directamente a la página.
 *
 * El estado se deriva con la misma semántica de redemption.ts: un cupón está
 * USADO cuando agotó sus usos (usedCount >= maxUses) y VENCIDO cuando pasó
 * validTo; no es una columna, se calcula al leer.
 */

import "server-only";
import { prisma } from "@/lib/db";
import type { CouponType } from "@lucams/db";

export type MyCouponStatus = "AVAILABLE" | "USED" | "EXPIRED";

export type MyCoupon = {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minOrder: number | null;
  requiresMinQuantity: number | null;
  appliesToCategories: string[];
  appliesToProductSlugs: string[];
  validFrom: Date;
  validTo: Date;
  status: MyCouponStatus;
};

/** Estado visible del cupón: USADO gana sobre VENCIDO (ya se aprovechó). */
export function myCouponStatus(
  coupon: { maxUses: number | null; usedCount: number; validTo: Date },
  now: Date = new Date(),
): MyCouponStatus {
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return "USED";
  if (now > coupon.validTo) return "EXPIRED";
  return "AVAILABLE";
}

/** Cupones personales del cliente, más recientes primero. */
export async function listMyCoupons(customerId: string): Promise<MyCoupon[]> {
  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: { customerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      type: true,
      value: true,
      minOrder: true,
      requiresMinQuantity: true,
      appliesToCategories: true,
      appliesToProductSlugs: true,
      validFrom: true,
      validTo: true,
      maxUses: true,
      usedCount: true,
    },
  });
  return coupons.map(({ maxUses, usedCount, ...c }) => ({
    ...c,
    status: myCouponStatus({ maxUses, usedCount, validTo: c.validTo }, now),
  }));
}
