/*
 * Service Cupones — PLAN_CATALOG_V2 3.9 + Auditoría 360° Bloque 3.
 *
 * CRUD + detalle enriquecido con redenciones y trazabilidad de pedido/contacto
 * (`getCoupon` — consumido por `/admin/cupones/[id]`).
 *
 * Reglas de integridad:
 *   - Un cupón archivado (`deletedAt != null`) es terminal: no admite edición,
 *     pausa, reactivación ni re-archivado, pero conserva lectura histórica.
 *   - Un cupón personal (`customerId != null`, ej. «Invita y gana») fuerza
 *     `isPublic = false` para impedir exposición pública de códigos personales o PII.
 */

import { prisma } from "@/lib/db";
import { updateTag } from "next/cache";
import type { CouponCreateInput, CouponUpdateInput } from "./schemas";

export class CouponValidationError extends Error {
  constructor(
    public field: "code" | "validFrom" | "validTo" | "value" | "maxUsesPerCustomer",
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
  /** "campaign" = creados para tienda (customerId null); "referral" = personales (customerId != null). */
  origin?: "all" | "campaign" | "referral";
  sort?: "recent" | "expiry-asc" | "code" | "uses";
  /** Cuando es false, `q` solo consulta el código y nunca descripciones con PII de referidos. */
  allowDescriptionSearch?: boolean;
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
      ...(opts.origin === "campaign" ? { customerId: null } : {}),
      ...(opts.origin === "referral" ? { customerId: { not: null } } : {}),
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
              ...(opts.allowDescriptionSearch !== false
                ? [{ description: { contains: q, mode: "insensitive" as const } }]
                : []),
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
      customer: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          contactId: true,
        },
      },
      usages: {
        take: 50,
        orderBy: { appliedAt: "desc" },
        include: {
          customer: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              contactId: true,
            },
          },
          order: {
            select: {
              id: true,
              number: true,
              total: true,
              status: true,
              contactId: true,
            },
          },
        },
      },
      _count: { select: { usages: true } },
    },
  });
}

function validateCouponBusinessRules(input: {
  type?: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value?: number | null;
  validFrom?: Date;
  validTo?: Date;
  maxUses?: number | null;
  maxUsesPerCustomer?: number | null;
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
  if (
    input.type === "FIXED" &&
    input.value != null &&
    (input.value < 100 || input.value > 10_000_000)
  ) {
    throw new CouponValidationError(
      "value",
      "Para descuento fijo en pesos, el valor debe estar entre $1 y $100.000 COP.",
    );
  }
  if (
    input.maxUses != null &&
    input.maxUsesPerCustomer != null &&
    input.maxUsesPerCustomer > input.maxUses
  ) {
    throw new CouponValidationError(
      "maxUsesPerCustomer",
      "El límite por cliente no puede superar el límite total de usos.",
    );
  }
}

export async function createCoupon(input: CouponCreateInput, actorId: string) {
  const normalized: CouponCreateInput = {
    ...input,
    value: input.type === "FREE_SHIPPING" ? 0 : input.value,
  };
  validateCouponBusinessRules(normalized);

  const existing = await prisma.coupon.findUnique({ where: { code: normalized.code } });
  if (existing) {
    throw new CouponValidationError("code", "Ya existe un cupón con ese código.");
  }

  const created = await prisma.coupon.create({
    data: { ...normalized, createdBy: actorId },
  });
  updateTag("catalog");
  updateTag("coupons");
  return created;
}

export async function updateCoupon(input: CouponUpdateInput, actorId: string) {
  const { id, ...data } = input;
  const current = await prisma.coupon.findUnique({ where: { id } });
  if (current?.deletedAt) {
    throw new CouponValidationError("code", "No se puede modificar un cupón archivado.");
  }

  const effectiveType = data.type ?? current?.type;
  const normalizedData = {
    ...data,
    ...(effectiveType === "FREE_SHIPPING" && data.value !== undefined ? { value: 0 } : {}),
    ...(current?.customerId != null ? { isPublic: false } : {}),
  };

  validateCouponBusinessRules({
    type: effectiveType,
    value: normalizedData.value ?? current?.value,
    validFrom: normalizedData.validFrom ?? current?.validFrom,
    validTo: normalizedData.validTo ?? current?.validTo,
    maxUses: normalizedData.maxUses !== undefined ? normalizedData.maxUses : current?.maxUses,
    maxUsesPerCustomer:
      normalizedData.maxUsesPerCustomer !== undefined
        ? normalizedData.maxUsesPerCustomer
        : current?.maxUsesPerCustomer,
  });

  const updated = await prisma.coupon.update({
    where: { id },
    data: { ...normalizedData, updatedBy: actorId },
  });
  updateTag("catalog");
  updateTag("coupons");
  return updated;
}

export async function pauseCoupon(id: string, actorId: string) {
  const current = await prisma.coupon.findUnique({ where: { id } });
  if (current?.deletedAt) {
    throw new CouponValidationError("code", "No se puede pausar un cupón archivado.");
  }
  await prisma.coupon.update({
    where: { id },
    data: { isActive: false, updatedBy: actorId },
  });
  updateTag("catalog");
  updateTag("coupons");
}

export async function resumeCoupon(id: string, actorId: string) {
  const current = await prisma.coupon.findUnique({ where: { id } });
  if (current?.deletedAt) {
    throw new CouponValidationError("code", "No se puede reactivar un cupón archivado.");
  }
  await prisma.coupon.update({
    where: { id },
    data: { isActive: true, updatedBy: actorId },
  });
  updateTag("catalog");
  updateTag("coupons");
}

export async function archiveCoupon(id: string, actorId: string) {
  const current = await prisma.coupon.findUnique({ where: { id } });
  if (current?.deletedAt) {
    throw new CouponValidationError("code", "El cupón ya se encuentra archivado.");
  }
  await prisma.coupon.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: actorId, isActive: false },
  });
  updateTag("catalog");
  updateTag("coupons");
}
