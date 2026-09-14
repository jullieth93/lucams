/*
 * Service Cupones — PLAN_CATALOG_V2 3.9.
 *
 * CRUD + detalle con usos (getCoupon — lo consume la página de edición
 * /admin/cupones/[id]).
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
  /**
   * "active" = isActive + vigente hoy. "inactive" = pausado/expirado/programado.
   * "archived" = SOLO archivados (soft-delete, deletedAt set): vista separada,
   * nunca mezclados con los vigentes (los demás estados siempre excluyen archivados).
   */
  status?: "all" | "active" | "inactive" | "archived";
  sort?: "recent" | "expiry-asc" | "code" | "uses";
};

export async function listCoupons(opts: CouponListOpts = {}) {
  const q = opts.q?.trim();
  const now = new Date();
  const archivedOnly = opts.status === "archived";
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
      deletedAt: archivedOnly ? { not: null } : null,
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

/**
 * Reglas de negocio comunes a crear y editar (fuente única, auditoría flujo de cupones · #7).
 * Tolera entrada parcial (update): cada regla solo dispara si sus campos están presentes. Así el
 * tope 1-100 del PERCENT y el orden de fechas se validan IGUAL en creación y en edición.
 */
function validateCouponBusinessRules(input: {
  type?: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value?: number | null;
  validFrom?: Date;
  validTo?: Date;
}) {
  if (input.validFrom && input.validTo && input.validTo <= input.validFrom) {
    throw new CouponValidationError(
      "validTo",
      "La fecha de fin debe ser posterior a la de inicio.",
    );
  }
  if (input.type === "PERCENT" && input.value != null && (input.value < 1 || input.value > 100)) {
    throw new CouponValidationError(
      "value",
      "Para descuento %, el valor debe estar entre 1 y 100.",
    );
  }
}

export async function createCoupon(input: CouponCreateInput, actorId: string) {
  validateCouponBusinessRules(input);

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
  validateCouponBusinessRules(data);
  const updated = await prisma.coupon.update({
    where: { id },
    data: { ...data, updatedBy: actorId },
  });
  updateTag("catalog");
  updateTag("coupons");
  return updated;
}

/*
 * Invalidación de caché en pause/resume/archive: SOLO updateTag("coupons"), a
 * diferencia de create/update que también tocan "catalog". Es deliberado y
 * suficiente (CF-06): el único consumidor cacheado de cupones (listPublicCoupons
 * en lib/catalog.ts) lleva AMBOS tags, así que "coupons" ya lo invalida; marcar
 * además "catalog" barrería toda la caché de productos/categorías (1h TTL) en
 * cada pausa o archivo de cupón — innecesariamente amplio.
 */
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
