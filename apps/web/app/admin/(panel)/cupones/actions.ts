"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import {
  CouponValidationError,
  archiveCoupon,
  createCoupon,
  pauseCoupon,
  resumeCoupon,
  updateCoupon,
} from "@/features/coupons/service";
import { CouponCreateSchema, CouponUpdateSchema } from "@/features/coupons/schemas";
import { cotStartOfDay, cotEndOfDay } from "@/features/coupons/dates";
import { logger } from "@/lib/logger";

export type CouponActionState = {
  error?: string;
  fieldErrors?: Partial<
    Record<"code" | "type" | "value" | "validFrom" | "validTo" | "minOrder", string[]>
  >;
};

function parsePayload(formData: FormData) {
  const minOrderRaw = formData.get("minOrder");
  const maxUsesRaw = formData.get("maxUses");
  const maxUsesPerCustomerRaw = formData.get("maxUsesPerCustomer");
  const requiresMinQuantityRaw = formData.get("requiresMinQuantity");

  return {
    code: String(formData.get("code") ?? "")
      .trim()
      .toUpperCase(),
    type: String(formData.get("type") ?? "PERCENT") as "PERCENT" | "FIXED" | "FREE_SHIPPING",
    value: Number(formData.get("value") ?? 0),
    description: (formData.get("description") as string | null) || null,
    isPublic: formData.get("isPublic") === "on",
    isActive: formData.get("isActive") === "on",
    validFrom: cotStartOfDay(String(formData.get("validFrom") ?? "")),
    validTo: cotEndOfDay(String(formData.get("validTo") ?? "")),
    minOrder: minOrderRaw ? Number(minOrderRaw) : null,
    maxUses: maxUsesRaw ? Number(maxUsesRaw) : null,
    maxUsesPerCustomer: maxUsesPerCustomerRaw ? Number(maxUsesPerCustomerRaw) : null,
    requiresMinQuantity: requiresMinQuantityRaw ? Number(requiresMinQuantityRaw) : null,
    appliesToCategories: String(formData.get("appliesToCategories") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    appliesToProductSlugs: String(formData.get("appliesToProductSlugs") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export async function createCouponAction(
  _prev: CouponActionState | null,
  formData: FormData,
): Promise<CouponActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const parsed = CouponCreateSchema.safeParse(parsePayload(formData));
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as CouponActionState["fieldErrors"],
    };
  }

  try {
    const coupon = await createCoupon(parsed.data, session.admin.id);
    logger.info({
      event: "admin.coupon.created",
      adminId: session.admin.id,
      code: parsed.data.code,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "coupon.create",
      entityType: "Coupon",
      entityId: coupon.id,
      metadata: { code: coupon.code, type: coupon.type, value: coupon.value },
    });
    revalidatePath("/admin/cupones");
    revalidatePath("/carrito"); // cupones afectan totales en cart
    redirect("/admin/cupones?created=1");
  } catch (err) {
    if (err instanceof CouponValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as CouponActionState["fieldErrors"],
      };
    }
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error(
      {
        event: "admin.coupon.create_fail",
        adminId: session.admin.id,
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to create coupon",
    );
    return { error: "Error al crear cupón. Reintenta." };
  }
}

export async function updateCouponAction(
  _prev: CouponActionState | null,
  formData: FormData,
): Promise<CouponActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const id = String(formData.get("id") ?? "");
  const payload = parsePayload(formData);
  const parsed = CouponUpdateSchema.safeParse({ id, ...payload });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as CouponActionState["fieldErrors"],
    };
  }

  try {
    await updateCoupon(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "coupon.update",
      entityType: "Coupon",
      entityId: id,
    });
    revalidatePath("/admin/cupones");
    revalidatePath("/carrito");
    redirect("/admin/cupones?updated=1");
  } catch (err) {
    if (err instanceof CouponValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as CouponActionState["fieldErrors"],
      };
    }
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error(
      {
        event: "admin.coupon.update_fail",
        adminId: session.admin.id,
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to update coupon",
    );
    return { error: "Error al actualizar cupón. Reintenta." };
  }
}

export async function pauseCouponAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  const id = String(formData.get("id") ?? "");
  await pauseCoupon(id, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "coupon.pause",
    entityType: "Coupon",
    entityId: id,
  });
  revalidatePath("/admin/cupones");
  revalidatePath("/carrito");
  redirect("/admin/cupones?paused=1");
}

export async function resumeCouponAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  const id = String(formData.get("id") ?? "");
  await resumeCoupon(id, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "coupon.resume",
    entityType: "Coupon",
    entityId: id,
  });
  revalidatePath("/admin/cupones");
  revalidatePath("/carrito");
  redirect("/admin/cupones?resumed=1");
}

export async function archiveCouponAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  const id = String(formData.get("id") ?? "");
  await archiveCoupon(id, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "coupon.archive",
    entityType: "Coupon",
    entityId: id,
  });
  revalidatePath("/admin/cupones");
  revalidatePath("/carrito");
  redirect("/admin/cupones?archived=1");
}
