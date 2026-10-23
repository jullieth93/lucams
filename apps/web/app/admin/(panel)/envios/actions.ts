"use server";

/*
 * Server actions de /admin/envios (casa de transportadoras + envío propio,
 * antes bajo /admin/integraciones/aveonline). Roles MANAGER_UP — alineados
 * con la ruta (CATALOG en lib/admin-rbac.ts). Las actions de WEBHOOKS quedaron
 * en integraciones/aveonline/actions.ts (eso sí es técnico de la integración).
 */

import { revalidatePath, updateTag } from "next/cache";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import {
  countEnabledZones,
  getCarrierRules,
  getDisabledCarriersRaw,
  getLucamsShippingSettings,
  normalizeCarrierKey,
  saveLucamsShippingSettings,
  setCarrierRules,
  setDisabledCarriers,
  setLucamsShippingEnabled,
} from "@/features/shipping/settings";
import { getZone } from "@/lib/lucams-zones";

/**
 * Habilita/deshabilita una transportadora de Aveonline en el checkout
 * (setting SHIPPING_DISABLED_CARRIERS, JSON con los nombres tal como los
 * devuelve Aveonline). quoteShipping filtra esas ofertas ANTES de sellar el
 * HMAC — el cambio aplica a la próxima cotización.
 */
export async function setCarrierDisabledAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const carrierName = String(formData.get("carrierName") ?? "").trim();
  const disable = formData.get("disable") === "1";
  if (!carrierName) return;

  const key = normalizeCarrierKey(carrierName);
  const current = await getDisabledCarriersRaw();
  const without = current.filter((n) => normalizeCarrierKey(n) !== key);
  const next = disable ? [...without, carrierName] : without;
  await setDisabledCarriers(next, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: disable ? "shipping.carrier.disable" : "shipping.carrier.enable",
    entityType: "Integration",
    entityId: "aveonline",
    metadata: { carrierName, disabledCarriers: next },
  });
  // Las settings viajan por el tag "cms" (getSettingValue cacheado): invalidar
  // para que la próxima cotización del checkout vea el cambio al instante.
  updateTag("cms");
  revalidatePath("/admin/envios");
}

export type CarrierRuleActionState = { ok?: string; error?: string };

/**
 * Guarda la regla de peso de una transportadora Aveonline (setting
 * SHIPPING_CARRIER_RULES, keyed por nombre normalizado): peso mínimo/máximo
 * en kg (1 decimal) + nota opcional. quoteShipping NO ofrece el carrier si el
 * paquete queda fuera del rango — evita guías rechazadas al despachar (ej.
 * Transprensa no opera < 11 kg). Los 3 campos vacíos = borrar la regla.
 */
export async function saveCarrierRuleAction(
  _prev: CarrierRuleActionState | null,
  formData: FormData,
): Promise<CarrierRuleActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const carrierName = String(formData.get("carrierName") ?? "").trim();
  if (!carrierName) return { error: "Falta el nombre de la transportadora." };

  // Vacío = sin límite (null); número 0–10.000 kg, redondeado a 1 decimal.
  const parseWeight = (field: string): number | null | "invalid" => {
    const raw = String(formData.get(field) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 10_000) return "invalid";
    return Math.round(n * 10) / 10;
  };
  const minWeightKg = parseWeight("minWeightKg");
  const maxWeightKg = parseWeight("maxWeightKg");
  if (minWeightKg === "invalid" || maxWeightKg === "invalid") {
    return { error: "El peso debe ser un número entre 0 y 10.000 kg." };
  }
  if (minWeightKg !== null && maxWeightKg !== null && minWeightKg > maxWeightKg) {
    return { error: "El peso mínimo no puede ser mayor que el peso máximo." };
  }
  const noteRaw = String(formData.get("note") ?? "").trim();
  const note = noteRaw ? noteRaw.slice(0, 300) : null;

  try {
    const rules = await getCarrierRules();
    const key = normalizeCarrierKey(carrierName);
    if (minWeightKg === null && maxWeightKg === null && note === null) {
      delete rules[key];
    } else {
      rules[key] = { minWeightKg, maxWeightKg, note };
    }
    await setCarrierRules(rules, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "shipping.carrier.save_rule",
      entityType: "Integration",
      entityId: "aveonline",
      metadata: { carrierName, minWeightKg, maxWeightKg, note },
    });
    // Las settings viajan por el tag "cms" (getSettingValue cacheado): invalidar
    // para que la próxima cotización del checkout vea el cambio al instante.
    updateTag("cms");
    revalidatePath("/admin/envios");
    return {
      ok:
        minWeightKg === null && maxWeightKg === null && note === null
          ? `Regla de ${carrierName} eliminada.`
          : `Regla de ${carrierName} guardada: aplica desde la próxima cotización.`,
    };
  } catch (err) {
    logger.warn({
      event: "admin.shipping.carrier_rule.save_fail",
      adminId: session.admin.id,
      carrierName,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "No se pudo guardar la regla." };
  }
}

export type LucamsShippingActionState = { ok?: string; error?: string };

/**
 * Toggle on/off del envío propio desde la lista unificada de transportadoras
 * (setting LUCAMS_SHIPPING_ENABLED). Devuelve estado porque el toggle lo
 * muestra inline (activar sin zonas habilitadas se rechaza).
 */
export async function setLucamsShippingEnabledAction(
  _prev: LucamsShippingActionState | null,
  formData: FormData,
): Promise<LucamsShippingActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
  const enable = formData.get("enable") === "1";
  try {
    await setLucamsShippingEnabled(enable, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: enable ? "shipping.lucams.enable" : "shipping.lucams.disable",
      entityType: "Integration",
      entityId: "lucams-shipping",
      metadata: { enabled: enable },
    });
    updateTag("cms");
    revalidatePath("/admin/envios");
    return {
      ok: enable
        ? "Envío propio ACTIVO: ya se ofrece en el checkout para las zonas habilitadas."
        : "Envío propio desactivado.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo cambiar el estado." };
  }
}

/**
 * Guarda la config del envío propio "Envío Lucams" (precio, hora límite y
 * zonas por ciudad). El on/off NO se edita acá: vive en la lista unificada de
 * transportadoras (setLucamsShippingEnabledAction); esta acción lo conserva.
 */
export async function saveLucamsShippingAction(
  _prev: LucamsShippingActionState | null,
  formData: FormData,
): Promise<LucamsShippingActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const pricePesos = Number.parseInt(String(formData.get("pricePesos") ?? ""), 10);
  const cutoffHour = Number.parseInt(String(formData.get("cutoffHour") ?? ""), 10);
  // Zonas: cada checkbox viaja como "zone=<cityCode>:<zoneId>"; se valida contra
  // el catálogo (lib/lucams-zones.ts) y se agrupa por ciudad.
  const zones: Record<string, string[]> = {};
  for (const raw of formData.getAll("zone")) {
    const [cityCode, zoneId] = String(raw).split(":");
    if (!cityCode || !zoneId || !getZone(cityCode, zoneId)) continue;
    (zones[cityCode] ??= []).push(zoneId);
  }

  if (!Number.isFinite(pricePesos) || pricePesos < 0 || pricePesos > 100_000) {
    return { error: "El precio debe ser un valor en pesos entre 0 y 100.000." };
  }
  if (!Number.isFinite(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) {
    return { error: "La hora límite debe ser un número entre 0 y 23." };
  }

  try {
    const current = await getLucamsShippingSettings();
    if (current.enabled && countEnabledZones(zones) === 0) {
      return {
        error:
          "El envío propio está ACTIVO: no puedes dejarlo sin zonas. Desactívalo primero en la lista de transportadoras o marca al menos una zona.",
      };
    }
    await saveLucamsShippingSettings(
      { enabled: current.enabled, priceCop: pricePesos * 100, cutoffHour, zones },
      session.admin.id,
    );
    await recordAdminAction({
      actorId: session.admin.id,
      action: "shipping.lucams.save",
      entityType: "Integration",
      entityId: "lucams-shipping",
      metadata: { priceCop: pricePesos * 100, cutoffHour, zones },
    });
    updateTag("cms");
    revalidatePath("/admin/envios");
    return { ok: "Configuración del envío propio guardada." };
  } catch (err) {
    logger.warn({
      event: "admin.shipping.lucams.save_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
}
