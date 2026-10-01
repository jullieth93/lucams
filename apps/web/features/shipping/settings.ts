/*
 * Settings operativas de envío (CmsField kind SETTING, mismo patrón que
 * COD_ENABLED / PICKUP_* — valor atómico, save = publish, invalidación vía
 * updateTag("cms") desde la Server Action):
 *
 *   SHIPPING_DISABLED_CARRIERS  JSON array de nombres de transportadora
 *                               (tal como los devuelve Aveonline, ej.
 *                               "COORDINADORA MERCANTIL") deshabilitadas en
 *                               /admin/envios. quoteShipping
 *                               filtra esas ofertas ANTES de sellar el HMAC.
 *   LUCAMS_SHIPPING_ENABLED     "true"/"false" — envío propio.
 *   LUCAMS_SHIPPING_PRICE_COP   centavos COP enteros (default 1000000 = $10.000).
 *   LUCAMS_SHIPPING_CUTOFF_HOUR 0-23, hora Colombia (default 12).
 *   LUCAMS_SHIPPING_ZONES       JSON { "<cityCode DANE>": ["<zoneId>", …] } —
 *                               zonas habilitadas por ciudad (lib/lucams-zones.ts).
 *                               Fallback de lectura: LUCAMS_SHIPPING_LOCALITIES
 *                               (V1 solo-Bogotá, array plano) migrado a { "11001": [...] }.
 *
 * Lecturas fail-safe: setting ausente o JSON inválido → fallback (transportadoras
 * todas habilitadas, envío propio apagado). Las escrituras son self-healing: si
 * el campo no existe en la DB del ambiente, se crea publicado en la sección
 * global/comercio (misma sección que agrupa las settings COMMERCE).
 */

import "server-only";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/cms";
import { createCmsField, getCmsFieldByKey, saveCmsFieldDraft } from "@/features/cms/service";

export const SETTING_KEYS = {
  disabledCarriers: "SHIPPING_DISABLED_CARRIERS",
  lucamsEnabled: "LUCAMS_SHIPPING_ENABLED",
  lucamsPriceCop: "LUCAMS_SHIPPING_PRICE_COP",
  lucamsCutoffHour: "LUCAMS_SHIPPING_CUTOFF_HOUR",
  lucamsZones: "LUCAMS_SHIPPING_ZONES",
  /** Formato V1 (solo Bogotá): JSON array de ids de localidad. Se sigue LEYENDO
   *  como fallback si LUCAMS_SHIPPING_ZONES no existe (migración suave). */
  lucamsLocalitiesLegacy: "LUCAMS_SHIPPING_LOCALITIES",
} as const;

type SettingMeta = {
  label: string;
  helpText: string;
  type: "TEXT" | "TEXTAREA" | "NUMBER" | "BOOLEAN";
};

/** Sección global/comercio del CMS v2 (donde viven las settings COMMERCE). */
async function resolveSettingsSectionId(): Promise<string> {
  const page = await prisma.cmsPage.findUnique({
    where: { slug: "global" },
    select: { id: true },
  });
  if (page) {
    const section = await prisma.cmsSection.findUnique({
      where: { pageId_key: { pageId: page.id, key: "comercio" } },
      select: { id: true },
    });
    if (section) return section.id;
    const anySection = await prisma.cmsSection.findFirst({
      where: { pageId: page.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    if (anySection) return anySection.id;
  }
  throw new Error(
    "No existe la sección de ajustes globales (global/comercio) en el CMS. " +
      "Corre la migración de contenido (make migrate-cms-v2) y reintenta.",
  );
}

/**
 * Crea o actualiza una setting de envío. Las settings son kind SETTING →
 * saveCmsFieldDraft publica al guardar. El caller (Server Action) hace el
 * updateTag("cms") para que el storefront la vea de inmediato.
 */
export async function upsertShippingSetting(
  key: string,
  body: string,
  meta: SettingMeta,
  adminId: string | null,
): Promise<void> {
  const existing = await getCmsFieldByKey(key);
  if (existing) {
    if (existing.kind !== "SETTING") {
      throw new Error(
        `El campo ${key} no es un ajuste (kind SETTING). Corrígelo desde Contenido › Ajustes del sitio.`,
      );
    }
    await saveCmsFieldDraft({ id: existing.id, body }, adminId);
    return;
  }
  const sectionId = await resolveSettingsSectionId();
  await createCmsField(
    {
      sectionId,
      key,
      kind: "SETTING",
      label: meta.label,
      helpText: meta.helpText,
      type: meta.type,
      category: "COMMERCE",
      body,
    },
    adminId,
  );
}

/** Parse defensivo de una setting JSON array de strings. Cualquier problema → fallback. */
function parseStringArray(raw: string, fallback: string[]): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  } catch {
    return fallback;
  }
}

// ─── Transportadoras Aveonline deshabilitadas ───

/**
 * Nombres (normalizados) de transportadoras deshabilitadas. Normalización
 * idéntica a la del provider (lowercase, sin tildes, solo alfanumérico) para
 * comparar contra `carrierName` de las cotizaciones sin depender del formato.
 */
export async function getDisabledCarriersNormalized(): Promise<string[]> {
  return (await getDisabledCarriersRaw()).map(normalizeCarrierKey);
}

/** Nombres tal como quedaron guardados (para editarlos sin perder el formato). */
export async function getDisabledCarriersRaw(): Promise<string[]> {
  const raw = await getSettingValue(SETTING_KEYS.disabledCarriers, "[]");
  return parseStringArray(raw, []);
}

export function normalizeCarrierKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export async function setDisabledCarriers(names: string[], adminId: string | null): Promise<void> {
  await upsertShippingSetting(
    SETTING_KEYS.disabledCarriers,
    JSON.stringify(names),
    {
      label: "Transportadoras deshabilitadas",
      helpText:
        "Transportadoras de Aveonline que NO se ofrecen al cliente en el checkout (JSON con los nombres). Se gestiona desde Envíos (/admin/envios).",
      type: "TEXTAREA",
    },
    adminId,
  );
}

// ─── Envío propio Lucam's (multi-ciudad) ───

export type LucamsShippingSettings = {
  enabled: boolean;
  /** Precio fijo en centavos COP. */
  priceCop: number;
  /** Hora límite (0-23, America/Bogota) para entrega el mismo día. */
  cutoffHour: number;
  /** Zonas habilitadas por ciudad: { "<cityCode DANE>": ["<zoneId>", …] }. */
  zones: Record<string, string[]>;
};

export const LUCAMS_SHIPPING_DEFAULTS = {
  priceCop: 1_000_000, // $10.000 COP
  cutoffHour: 12,
} as const;

/** Parse defensivo de LUCAMS_SHIPPING_ZONES ({ cityCode: string[] }). Problema → {}. */
function parseZonesByCity(raw: string): Record<string, string[]> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [cityCode, ids] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^\d{5}$/.test(cityCode) || !Array.isArray(ids)) continue;
      const clean = ids.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      if (clean.length > 0) out[cityCode] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

/** Total de zonas habilitadas en todas las ciudades (para validar el toggle ON). */
export function countEnabledZones(zones: Record<string, string[]>): number {
  return Object.values(zones).reduce((acc, ids) => acc + ids.length, 0);
}

/**
 * Lee la config del envío propio con defaults fail-closed (apagado si falta todo).
 * Migración suave V1→V2: si LUCAMS_SHIPPING_ZONES no existe aún, lee el formato
 * viejo LUCAMS_SHIPPING_LOCALITIES (array plano, implícitamente Bogotá "11001").
 */
export async function getLucamsShippingSettings(): Promise<LucamsShippingSettings> {
  const [enabledRaw, priceRaw, cutoffRaw, zonesRaw, legacyRaw] = await Promise.all([
    getSettingValue(SETTING_KEYS.lucamsEnabled, "false"),
    getSettingValue(SETTING_KEYS.lucamsPriceCop, String(LUCAMS_SHIPPING_DEFAULTS.priceCop)),
    getSettingValue(SETTING_KEYS.lucamsCutoffHour, String(LUCAMS_SHIPPING_DEFAULTS.cutoffHour)),
    getSettingValue(SETTING_KEYS.lucamsZones, ""),
    getSettingValue(SETTING_KEYS.lucamsLocalitiesLegacy, ""),
  ]);
  const priceCop = Number.parseInt(priceRaw, 10);
  const cutoffHour = Number.parseInt(cutoffRaw, 10);
  let zones = zonesRaw ? parseZonesByCity(zonesRaw) : {};
  if (Object.keys(zones).length === 0 && legacyRaw) {
    const legacy = parseStringArray(legacyRaw, []);
    if (legacy.length > 0) zones = { "11001": legacy };
  }
  return {
    enabled: enabledRaw.trim() === "true",
    priceCop:
      Number.isFinite(priceCop) && priceCop >= 0 ? priceCop : LUCAMS_SHIPPING_DEFAULTS.priceCop,
    cutoffHour:
      Number.isFinite(cutoffHour) && cutoffHour >= 0 && cutoffHour <= 23
        ? cutoffHour
        : LUCAMS_SHIPPING_DEFAULTS.cutoffHour,
    zones,
  };
}

/** Escribe la config del envío propio (las 4 settings en una pasada, desde el admin). */
export async function saveLucamsShippingSettings(
  input: LucamsShippingSettings,
  adminId: string | null,
): Promise<void> {
  await upsertShippingSetting(
    SETTING_KEYS.lucamsEnabled,
    input.enabled ? "true" : "false",
    {
      label: "Envío propio Lucam's activo",
      helpText:
        "Activa la opción «Envío Lucam's» (mensajería propia, por zonas de entrega) en el checkout. Se gestiona desde Envíos (/admin/envios).",
      type: "BOOLEAN",
    },
    adminId,
  );
  await upsertShippingSetting(
    SETTING_KEYS.lucamsPriceCop,
    String(input.priceCop),
    {
      label: "Precio envío propio Lucam's (centavos)",
      helpText:
        "Precio fijo del envío propio, en centavos COP (1000000 = $10.000). Se gestiona desde Envíos (/admin/envios).",
      type: "NUMBER",
    },
    adminId,
  );
  await upsertShippingSetting(
    SETTING_KEYS.lucamsCutoffHour,
    String(input.cutoffHour),
    {
      label: "Hora límite envío mismo día",
      helpText:
        "Hora de Colombia (0-23) hasta la cual el pedido entra a producción el mismo día; después, arranca el siguiente día hábil. La promesa «Entrega hoy» solo aplica a productos listos (sin fabricación pendiente). Se gestiona desde Envíos (/admin/envios).",
      type: "NUMBER",
    },
    adminId,
  );
  await upsertShippingSetting(
    SETTING_KEYS.lucamsZones,
    JSON.stringify(input.zones),
    {
      label: "Zonas con envío propio (por ciudad)",
      helpText:
        "Zonas de entrega habilitadas por ciudad (JSON { cityCode DANE: [ids de zona] }). Se gestiona desde Envíos (/admin/envios).",
      type: "TEXTAREA",
    },
    adminId,
  );
}

/**
 * Toggle on/off del envío propio desde la lista unificada de transportadoras.
 * Conserva precio/cutoff/zonas; activar sin ninguna zona habilitada es un error
 * operativo (el checkout nunca podría ofrecerlo) → se rechaza con mensaje claro.
 */
export async function setLucamsShippingEnabled(
  enabled: boolean,
  adminId: string | null,
): Promise<void> {
  const current = await getLucamsShippingSettings();
  if (enabled && countEnabledZones(current.zones) === 0) {
    throw new Error(
      "Para activar el envío propio, primero marca al menos una zona de entrega en la configuración de abajo.",
    );
  }
  await saveLucamsShippingSettings({ ...current, enabled }, adminId);
}
