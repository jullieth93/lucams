/*
 * Unit tests — invalidación de caché del SERVICE de CUPONES (B-7).
 *
 * Regresión B-7 (auditoría cableado cliente↔admin 2026-10-02): pause/resume/
 * archive solo emitían updateTag("coupons") — CF-06 lo documentaba como
 * deliberado porque el único consumer cacheado (listPublicCoupons,
 * lib/catalog.ts) lleva ambos tags. El fix emite TAMBIÉN updateTag("catalog")
 * para que un futuro consumer cacheado solo con "catalog" no quede stale.
 *
 * Estrategia: prisma y next/cache mockeados; se ejerce el service real y se
 * aserta el par de tags en cada mutación (mismo harness que
 * app/admin/(panel)/ocasiones/actions.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, updateTagSpy } = vi.hoisted(() => ({
  mockPrisma: {
    coupon: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  updateTagSpy: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ updateTag: updateTagSpy }));

import { archiveCoupon, createCoupon, pauseCoupon, resumeCoupon, updateCoupon } from "./service";
import type { CouponCreateInput } from "./schemas";

const ACTOR = "admin-1";

function baseInput(over: Partial<CouponCreateInput> = {}): CouponCreateInput {
  return {
    code: "B7-TEST",
    type: "PERCENT",
    value: 10,
    description: null,
    isPublic: false,
    isActive: true,
    validFrom: new Date(Date.now() - 86_400_000),
    validTo: new Date(Date.now() + 86_400_000),
    minOrder: null,
    maxUses: null,
    maxUsesPerCustomer: null,
    requiresMinQuantity: null,
    appliesToCategories: [],
    appliesToProductSlugs: [],
    ...over,
  };
}

// B-7: toda mutación de cupón invalida AMBOS tags ("coupons" + "catalog").
function expectBothTags() {
  expect(updateTagSpy).toHaveBeenCalledWith("coupons");
  expect(updateTagSpy).toHaveBeenCalledWith("catalog");
  expect(updateTagSpy).toHaveBeenCalledTimes(2);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.coupon.findUnique.mockResolvedValue(null);
  mockPrisma.coupon.create.mockResolvedValue({ id: "c1", code: "B7-TEST" });
  mockPrisma.coupon.update.mockResolvedValue({ id: "c1" });
});

describe("coupons/service — invalidación de caché (B-7)", () => {
  it("pauseCoupon emite updateTag('coupons') Y updateTag('catalog')", async () => {
    await pauseCoupon("c1", ACTOR);
    expect(mockPrisma.coupon.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { isActive: false, updatedBy: ACTOR },
    });
    expectBothTags();
  });

  it("resumeCoupon emite updateTag('coupons') Y updateTag('catalog')", async () => {
    await resumeCoupon("c1", ACTOR);
    expect(mockPrisma.coupon.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { isActive: true, updatedBy: ACTOR },
    });
    expectBothTags();
  });

  it("archiveCoupon emite updateTag('coupons') Y updateTag('catalog')", async () => {
    await archiveCoupon("c1", ACTOR);
    expect(mockPrisma.coupon.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: {
        deletedAt: expect.any(Date),
        deletedBy: ACTOR,
        isActive: false,
      },
    });
    expectBothTags();
  });

  it("createCoupon mantiene ambos tags (comportamiento previo, regresión)", async () => {
    await createCoupon(baseInput(), ACTOR);
    expectBothTags();
  });

  it("updateCoupon mantiene ambos tags (comportamiento previo, regresión)", async () => {
    await updateCoupon({ id: "c1", value: 20 }, ACTOR);
    expectBothTags();
  });

  it("si la escritura falla NO se invalida (updateTag solo tras persistir)", async () => {
    mockPrisma.coupon.update.mockRejectedValue(new Error("db down"));
    await expect(pauseCoupon("c1", ACTOR)).rejects.toThrow("db down");
    expect(updateTagSpy).not.toHaveBeenCalled();
  });
});
