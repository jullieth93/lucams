"use server";

/*
 * Server actions de /admin/fidelizacion (Puntos Lucams + Invita y gana).
 * SUPERADMIN — la config tiene impacto económico directo (descuentos y puntos
 * son plata): misma barra que Cupones y que la ruta en lib/admin-rbac.ts.
 */

import { revalidatePath, updateTag } from "next/cache";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { saveLoyaltySettings, saveReferralSettings } from "@/features/loyalty/settings";

export type LoyaltyActionState = { ok?: string; error?: string };

function parseBoundedInt(
  formData: FormData,
  field: string,
  min: number,
  max: number,
): number | null {
  const n = Number.parseInt(String(formData.get(field) ?? ""), 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** Guarda la config de Puntos Lucams (tasas, mínimo, tope, toggle, expiración). */
export async function saveLoyaltySettingsAction(
  _prev: LoyaltyActionState | null,
  formData: FormData,
): Promise<LoyaltyActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const enabled = formData.get("enabled") === "1";
  const earnCopPerPoint = parseBoundedInt(formData, "earnCopPerPoint", 100, 1_000_000);
  const redeemPointsPer1000 = parseBoundedInt(formData, "redeemPointsPer1000", 1, 100_000);
  const redeemMinPoints = parseBoundedInt(formData, "redeemMinPoints", 1, 1_000_000);
  const redeemMaxPercent = parseBoundedInt(formData, "redeemMaxPercent", 0, 100);
  const expirationEnabled = formData.get("expirationEnabled") === "1";
  const expirationDays = parseBoundedInt(formData, "expirationDays", 1, 3650);

  if (earnCopPerPoint === null) {
    return { error: "Los pesos por punto deben ser un número entre 100 y 1.000.000." };
  }
  if (redeemPointsPer1000 === null) {
    return { error: "Los puntos por $1.000 de descuento deben ser un número entre 1 y 100.000." };
  }
  if (redeemMinPoints === null) {
    return { error: "El mínimo de redención debe ser un número entre 1 y 1.000.000." };
  }
  if (redeemMaxPercent === null) {
    return { error: "El tope de redención debe ser un % entre 0 y 100." };
  }
  if (expirationDays === null) {
    return { error: "Los días de vigencia deben ser un número entre 1 y 3650." };
  }

  try {
    await saveLoyaltySettings(
      {
        enabled,
        earnCopPerPoint,
        redeemPointsPer1000,
        redeemMinPoints,
        redeemMaxPercent,
        expirationEnabled,
        expirationDays,
      },
      session.admin.id,
    );
    await recordAdminAction({
      actorId: session.admin.id,
      action: "loyalty.settings.save",
      entityType: "Setting",
      entityId: "loyalty",
      metadata: {
        enabled,
        earnCopPerPoint,
        redeemPointsPer1000,
        redeemMinPoints,
        redeemMaxPercent,
        expirationEnabled,
        expirationDays,
      },
    });
    // Las settings viajan por el tag "cms" (getSettingValue cacheado): invalidar
    // para que el storefront (earn de la saga, redención del checkout, mi-cuenta)
    // vea el cambio al instante.
    updateTag("cms");
    revalidatePath("/admin/fidelizacion");
    return {
      ok: enabled
        ? "Puntos Lucams ACTIVO: los clientes ya acumulan y pueden redimir puntos."
        : "Configuración guardada. El programa sigue APAGADO (no se acumula ni se redime).",
    };
  } catch (err) {
    logger.warn({
      event: "admin.loyalty.settings.save_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
}

/** Guarda la config de Invita y gana (%, días de vigencia, toggle). */
export async function saveReferralSettingsAction(
  _prev: LoyaltyActionState | null,
  formData: FormData,
): Promise<LoyaltyActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const enabled = formData.get("enabled") === "1";
  const rewardPercent = parseBoundedInt(formData, "rewardPercent", 1, 100);
  const rewardDays = parseBoundedInt(formData, "rewardDays", 1, 3650);

  if (rewardPercent === null) {
    return { error: "El % de recompensa debe ser un número entre 1 y 100." };
  }
  if (rewardDays === null) {
    return { error: "Los días de vigencia deben ser un número entre 1 y 3650." };
  }

  try {
    await saveReferralSettings({ enabled, rewardPercent, rewardDays }, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "referral.settings.save",
      entityType: "Setting",
      entityId: "referrals",
      metadata: { enabled, rewardPercent, rewardDays },
    });
    updateTag("cms");
    revalidatePath("/admin/fidelizacion");
    return {
      ok: `Invita y gana guardado (${rewardPercent}% OFF · ${rewardDays} días). Los cupones ya emitidos conservan sus condiciones; el cambio aplica a las próximas emisiones.`,
    };
  } catch (err) {
    logger.warn({
      event: "admin.referral.settings.save_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
}
