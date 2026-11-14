"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { isMfaReauthRequired, requireRecentMfa } from "@/lib/admin-reauth";
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
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type CouponActionState = {
  error?: string;
  fieldErrors?: Partial<
    Record<
      | "code"
      | "type"
      | "value"
      | "validFrom"
      | "validTo"
      | "minOrder"
      | "maxUses"
      | "maxUsesPerCustomer"
      | "requiresMinQuantity",
      string[]
    >
  >;
};

function isNextRedirect(err: unknown): boolean {
  return err instanceof Error && err.message === "NEXT_REDIRECT";
}

async function restrictionSlugsError(payload: {
  appliesToCategories: string[];
  appliesToProductSlugs: string[];
}): Promise<string | null> {
  const problems: string[] = [];
  if (payload.appliesToCategories.length > 0) {
    const found = await prisma.category.findMany({
      where: { slug: { in: payload.appliesToCategories }, deletedAt: null },
      select: { slug: true },
    });
    const foundSlugs = new Set(found.map((c) => c.slug));
    const missing = payload.appliesToCategories.filter((s) => !foundSlugs.has(s));
    if (missing.length > 0) {
      problems.push(
        `${missing.length === 1 ? "La categoría" : "Las categorías"} ${missing
          .map((s) => `«${s}»`)
          .join(", ")} no existe${missing.length === 1 ? "" : "n"} en el catálogo`,
      );
    }
  }
  if (payload.appliesToProductSlugs.length > 0) {
    const found = await prisma.product.findMany({
      where: { slug: { in: payload.appliesToProductSlugs }, deletedAt: null },
      select: { slug: true },
    });
    const foundSlugs = new Set(found.map((p) => p.slug));
    const missing = payload.appliesToProductSlugs.filter((s) => !foundSlugs.has(s));
    if (missing.length > 0) {
      problems.push(
        `${missing.length === 1 ? "El producto" : "Los productos"} ${missing
          .map((s) => `«${s}»`)
          .join(", ")} no existe${missing.length === 1 ? "" : "n"} en el catálogo`,
      );
    }
  }
  if (problems.length === 0) return null;
  return `${problems.join(". ")}. Elígelos desde la lista del formulario.`;
}

function parsePayload(formData: FormData) {
  const minOrderRaw = String(formData.get("minOrder") ?? "").trim();
  const maxUsesRaw = String(formData.get("maxUses") ?? "").trim();
  const maxUsesPerCustomerRaw = String(formData.get("maxUsesPerCustomer") ?? "").trim();
  const requiresMinQuantityRaw = String(formData.get("requiresMinQuantity") ?? "").trim();

  const type = String(formData.get("type") ?? "PERCENT") as "PERCENT" | "FIXED" | "FREE_SHIPPING";
  const rawValue = Number(formData.get("value") ?? 0);

  return {
    code: String(formData.get("code") ?? "")
      .trim()
      .toUpperCase(),
    type,
    value: type === "FREE_SHIPPING" ? 0 : type === "FIXED" ? Math.round(rawValue * 100) : rawValue,
    description: String(formData.get("description") ?? "").trim() || null,
    isPublic: formData.get("isPublic") === "on",
    isActive: formData.get("isActive") === "on",
    validFrom: cotStartOfDay(String(formData.get("validFrom") ?? "")),
    validTo: cotEndOfDay(String(formData.get("validTo") ?? "")),
    minOrder: minOrderRaw ? Math.round(Number(minOrderRaw) * 100) : null,
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
      error: "Revisa los campos marcados en el formulario.",
      fieldErrors: flat.fieldErrors as CouponActionState["fieldErrors"],
    };
  }

  const slugsError = await restrictionSlugsError(parsed.data);
  if (slugsError) return { error: slugsError };

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
      metadata: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        isPublic: coupon.isPublic,
      },
    });
    revalidatePath("/admin/cupones");
    revalidatePath("/checkout/pago");
    redirect("/admin/cupones?created=1");
  } catch (err) {
    if (err instanceof CouponValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as CouponActionState["fieldErrors"],
      };
    }
    if (isNextRedirect(err)) throw err;
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
      error: "Revisa los campos marcados en el formulario.",
      fieldErrors: flat.fieldErrors as CouponActionState["fieldErrors"],
    };
  }

  const slugsError = await restrictionSlugsError({
    appliesToCategories: parsed.data.appliesToCategories ?? [],
    appliesToProductSlugs: parsed.data.appliesToProductSlugs ?? [],
  });
  if (slugsError) return { error: slugsError };

  try {
    const updated = await updateCoupon(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "coupon.update",
      entityType: "Coupon",
      entityId: id,
      metadata: {
        code: updated.code,
        type: updated.type,
        value: updated.value,
        isActive: updated.isActive,
        isPublic: updated.isPublic,
      },
    });
    revalidatePath("/admin/cupones");
    revalidatePath(`/admin/cupones/${id}`);
    revalidatePath("/checkout/pago");
    redirect("/admin/cupones?updated=1");
  } catch (err) {
    if (err instanceof CouponValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as CouponActionState["fieldErrors"],
      };
    }
    if (isNextRedirect(err)) throw err;
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
  try {
    await pauseCoupon(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "coupon.pause",
      entityType: "Coupon",
      entityId: id,
    });
    revalidatePath("/admin/cupones");
    revalidatePath(`/admin/cupones/${id}`);
    revalidatePath("/checkout/pago");
    redirect("/admin/cupones?paused=1");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const msg = err instanceof CouponValidationError ? err.message : "Error al pausar el cupón.";
    logger.error({
      event: "admin.coupon.pause_fail",
      adminId: session.admin.id,
      couponId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/admin/cupones?error=${encodeURIComponent(msg)}`);
  }
}

export async function resumeCouponAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  const id = String(formData.get("id") ?? "");
  try {
    await resumeCoupon(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "coupon.resume",
      entityType: "Coupon",
      entityId: id,
    });
    revalidatePath("/admin/cupones");
    revalidatePath(`/admin/cupones/${id}`);
    revalidatePath("/checkout/pago");
    redirect("/admin/cupones?resumed=1");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const msg = err instanceof CouponValidationError ? err.message : "Error al reactivar el cupón.";
    logger.error({
      event: "admin.coupon.resume_fail",
      adminId: session.admin.id,
      couponId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/admin/cupones?error=${encodeURIComponent(msg)}`);
  }
}

export async function archiveCouponAction(
  formData: FormData,
): Promise<{ reauthRequired?: boolean } | void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  try {
    await requireRecentMfa();
  } catch (err) {
    if (isMfaReauthRequired(err)) {
      return { reauthRequired: true };
    }
    throw err;
  }

  const id = String(formData.get("id") ?? "");
  try {
    await archiveCoupon(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "coupon.archive",
      entityType: "Coupon",
      entityId: id,
    });
    revalidatePath("/admin/cupones");
    revalidatePath(`/admin/cupones/${id}`);
    revalidatePath("/checkout/pago");
    redirect("/admin/cupones?archived=1");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const msg = err instanceof CouponValidationError ? err.message : "Error al archivar el cupón.";
    logger.error({
      event: "admin.coupon.archive_fail",
      adminId: session.admin.id,
      couponId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/admin/cupones?error=${encodeURIComponent(msg)}`);
  }
}
