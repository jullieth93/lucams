/*
 * Settings del programa de fidelización (CmsField kind SETTING, mismo patrón
 * que features/shipping/settings.ts — valor atómico, save = publish,
 * invalidación vía updateTag("cms") desde la Server Action; lecturas
 * fail-safe: setting ausente o valor inválido → fallback; escrituras
 * self-healing: si el campo no existe en la DB del ambiente se crea publicado
 * en la sección global/comercio):
 *
 *   Puntos Lucams:
 *   LOYALTY_ENABLED                 "true"/"false" — programa activo (default
 *                                   false, fail-closed: no se acumula ni se
 *                                   redime hasta que el negocio lo active).
 *   LOYALTY_EARN_COP_PER_POINT      pesos COP pagados por punto (default 1000 =
 *                                   1 punto por cada $1.000 del total pagado).
 *   LOYALTY_REDEEM_POINTS_PER_1000  puntos que equivalen a $1.000 COP de
 *                                   descuento (default 100).
 *   LOYALTY_REDEEM_MIN_POINTS       mínimo de puntos por redención (default 100).
 *   LOYALTY_REDEEM_MAX_PERCENT      tope: % máximo del subtotal de productos
 *                                   (tras cupón) cubrible con puntos (default 50).
 *   LOYALTY_EXPIRATION_ENABLED      "true"/"false" — expiración de puntos.
 *                                   PREPARADA pero OFF: no hay job que venza
 *                                   puntos; activarla hoy no tiene efecto.
 *   LOYALTY_EXPIRATION_DAYS         días de vigencia cuando se implemente (365).
 *
 *   Invita y gana (referidos):
 *   REFERRAL_ENABLED                "true"/"false" — programa activo (default
 *                                   true: así opera hoy en producción).
 *   REFERRAL_REWARD_PERCENT         % OFF de los cupones personales (bienvenida
 *                                   del referido + premio del referente).
 *                                   Default 10; soporta la promo del 25%.
 *   REFERRAL_REWARD_DAYS            días de vigencia del cupón emitido (90).
 *
 * OJO — los cupones de referidos YA EMITIDOS conservan sus términos (value y
 * validTo quedan persistidos en cada fila Coupon): un cambio de % o de días
 * aplica SOLO a emisiones futuras. No hay vigencias/fechas en el patrón de
 * settings (CmsField es un valor atómico, sin rangos de fecha): la promo del
 * 25% se opera cambiando REFERRAL_REWARD_PERCENT a mano y revirtiéndolo al
 * terminar la campaña.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/cms";
import { createCmsField, getCmsFieldByKey, saveCmsFieldDraft } from "@/features/cms/service";

export const LOYALTY_SETTING_KEYS = {
  enabled: "LOYALTY_ENABLED",
  earnCopPerPoint: "LOYALTY_EARN_COP_PER_POINT",
  redeemPointsPer1000: "LOYALTY_REDEEM_POINTS_PER_1000",
  redeemMinPoints: "LOYALTY_REDEEM_MIN_POINTS",
  redeemMaxPercent: "LOYALTY_REDEEM_MAX_PERCENT",
  expirationEnabled: "LOYALTY_EXPIRATION_ENABLED",
  expirationDays: "LOYALTY_EXPIRATION_DAYS",
} as const;

export const REFERRAL_SETTING_KEYS = {
  enabled: "REFERRAL_ENABLED",
  rewardPercent: "REFERRAL_REWARD_PERCENT",
  rewardDays: "REFERRAL_REWARD_DAYS",
} as const;

export type LoyaltySettings = {
  enabled: boolean;
  /** Pesos COP pagados que otorgan 1 punto (earn = floor(totalPagado / esto)). */
  earnCopPerPoint: number;
  /** Puntos que equivalen a $1.000 COP de descuento al redimir. */
  redeemPointsPer1000: number;
  /** Mínimo de puntos por redención. */
  redeemMinPoints: number;
  /** Tope de redención: % máximo del subtotal de productos (tras cupón). */
  redeemMaxPercent: number;
  /** Preparada pero sin efecto (no hay job de vencimiento). */
  expirationEnabled: boolean;
  expirationDays: number;
};

export type ReferralSettings = {
  enabled: boolean;
  rewardPercent: number;
  rewardDays: number;
};

export const LOYALTY_DEFAULTS = {
  enabled: false,
  earnCopPerPoint: 1_000,
  redeemPointsPer1000: 100,
  redeemMinPoints: 100,
  redeemMaxPercent: 50,
  expirationEnabled: false,
  expirationDays: 365,
} as const;

export const REFERRAL_DEFAULTS = {
  enabled: true,
  rewardPercent: 10,
  rewardDays: 90,
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
 * Crea o actualiza una setting de fidelización. Las settings son kind SETTING →
 * saveCmsFieldDraft publica al guardar. El caller (Server Action) hace el
 * updateTag("cms") para que el storefront la vea de inmediato.
 */
async function upsertLoyaltySetting(
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

/** Entero positivo con fallback (cualquier problema → default fail-safe). */
function parsePositiveInt(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Entero no-negativo con fallback (admite 0). */
function parseNonNegativeInt(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Lee la config de Puntos Lucams con defaults fail-closed (programa apagado si falta todo). */
export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const [enabled, earnCop, redeemPer1000, minPoints, maxPercent, expEnabled, expDays] =
    await Promise.all([
      getSettingValue(LOYALTY_SETTING_KEYS.enabled, "false"),
      getSettingValue(
        LOYALTY_SETTING_KEYS.earnCopPerPoint,
        String(LOYALTY_DEFAULTS.earnCopPerPoint),
      ),
      getSettingValue(
        LOYALTY_SETTING_KEYS.redeemPointsPer1000,
        String(LOYALTY_DEFAULTS.redeemPointsPer1000),
      ),
      getSettingValue(
        LOYALTY_SETTING_KEYS.redeemMinPoints,
        String(LOYALTY_DEFAULTS.redeemMinPoints),
      ),
      getSettingValue(
        LOYALTY_SETTING_KEYS.redeemMaxPercent,
        String(LOYALTY_DEFAULTS.redeemMaxPercent),
      ),
      getSettingValue(LOYALTY_SETTING_KEYS.expirationEnabled, "false"),
      getSettingValue(LOYALTY_SETTING_KEYS.expirationDays, String(LOYALTY_DEFAULTS.expirationDays)),
    ]);
  return {
    enabled: enabled.trim() === "true",
    earnCopPerPoint: parsePositiveInt(earnCop, LOYALTY_DEFAULTS.earnCopPerPoint),
    redeemPointsPer1000: parsePositiveInt(redeemPer1000, LOYALTY_DEFAULTS.redeemPointsPer1000),
    redeemMinPoints: parsePositiveInt(minPoints, LOYALTY_DEFAULTS.redeemMinPoints),
    redeemMaxPercent: parseNonNegativeInt(maxPercent, LOYALTY_DEFAULTS.redeemMaxPercent),
    expirationEnabled: expEnabled.trim() === "true",
    expirationDays: parsePositiveInt(expDays, LOYALTY_DEFAULTS.expirationDays),
  };
}

/** Escribe la config de Puntos Lucams (desde /admin/fidelizacion). */
export async function saveLoyaltySettings(
  input: LoyaltySettings,
  adminId: string | null,
): Promise<void> {
  await upsertLoyaltySetting(
    LOYALTY_SETTING_KEYS.enabled,
    input.enabled ? "true" : "false",
    {
      label: "Programa Puntos Lucams activo",
      helpText:
        "Activa la acumulación (puntos al pagar) y la redención (descuento en el checkout). Se gestiona desde Fidelización (/admin/fidelizacion).",
      type: "BOOLEAN",
    },
    adminId,
  );
  await upsertLoyaltySetting(
    LOYALTY_SETTING_KEYS.earnCopPerPoint,
    String(input.earnCopPerPoint),
    {
      label: "Puntos Lucams: pesos por punto",
      helpText:
        "Pesos COP pagados que otorgan 1 punto (1000 = 1 punto por cada $1.000 del total pagado). Se gestiona desde Fidelización (/admin/fidelizacion).",
      type: "NUMBER",
    },
    adminId,
  );
  await upsertLoyaltySetting(
    LOYALTY_SETTING_KEYS.redeemPointsPer1000,
    String(input.redeemPointsPer1000),
    {
      label: "Puntos Lucams: puntos por $1.000 de descuento",
      helpText:
        "Equivalencia al redimir (100 = 100 puntos valen $1.000 COP de descuento). Se gestiona desde Fidelización (/admin/fidelizacion).",
      type: "NUMBER",
    },
    adminId,
  );
  await upsertLoyaltySetting(
    LOYALTY_SETTING_KEYS.redeemMinPoints,
    String(input.redeemMinPoints),
    {
      label: "Puntos Lucams: mínimo de redención",
      helpText:
        "Mínimo de puntos que el cliente puede redimir por compra. Se gestiona desde Fidelización (/admin/fidelizacion).",
      type: "NUMBER",
    },
    adminId,
  );
  await upsertLoyaltySetting(
    LOYALTY_SETTING_KEYS.redeemMaxPercent,
    String(input.redeemMaxPercent),
    {
      label: "Puntos Lucams: tope de redención (%)",
      helpText:
        "% máximo del subtotal de productos (después del cupón) que se puede pagar con puntos. Se gestiona desde Fidelización (/admin/fidelizacion).",
      type: "NUMBER",
    },
    adminId,
  );
  await upsertLoyaltySetting(
    LOYALTY_SETTING_KEYS.expirationEnabled,
    input.expirationEnabled ? "true" : "false",
    {
      label: "Puntos Lucams: expiración activa",
      helpText:
        "PREPARADA PERO SIN EFECTO: todavía no hay proceso que venza puntos. Activarla hoy no cambia nada. Se gestiona desde Fidelización (/admin/fidelizacion).",
      type: "BOOLEAN",
    },
    adminId,
  );
  await upsertLoyaltySetting(
    LOYALTY_SETTING_KEYS.expirationDays,
    String(input.expirationDays),
    {
      label: "Puntos Lucams: días de vigencia",
      helpText:
        "Días de vigencia de los puntos cuando se implemente la expiración (hoy sin efecto). Se gestiona desde Fidelización (/admin/fidelizacion).",
      type: "NUMBER",
    },
    adminId,
  );
}

/**
 * Lee la config de Invita y gana. Default enabled=true: el programa ya opera en
 * producción con los valores quemados históricos (10% / 90 días), así que una
 * setting ausente reproduce el comportamiento previo (fail-safe hacia el status
 * quo, NO hacia apagar el programa — apagarlo es una decisión explícita del admin).
 */
export async function getReferralSettings(): Promise<ReferralSettings> {
  const [enabled, percent, days] = await Promise.all([
    getSettingValue(REFERRAL_SETTING_KEYS.enabled, "true"),
    getSettingValue(REFERRAL_SETTING_KEYS.rewardPercent, String(REFERRAL_DEFAULTS.rewardPercent)),
    getSettingValue(REFERRAL_SETTING_KEYS.rewardDays, String(REFERRAL_DEFAULTS.rewardDays)),
  ]);
  return {
    enabled: enabled.trim() === "true",
    // % acotado a (0, 100]: un cupón PERCENT > 100 o <= 0 no tiene sentido de negocio.
    rewardPercent: Math.min(100, parsePositiveInt(percent, REFERRAL_DEFAULTS.rewardPercent)),
    rewardDays: parsePositiveInt(days, REFERRAL_DEFAULTS.rewardDays),
  };
}

/**
 * Escribe la config de Invita y gana (desde /admin/fidelizacion). Los cupones YA
 * EMITIDOS conservan sus términos (cada Coupon guarda su value/validTo): el nuevo
 * % y la nueva vigencia aplican solo a emisiones futuras.
 */
export async function saveReferralSettings(
  input: ReferralSettings,
  adminId: string | null,
): Promise<void> {
  await upsertLoyaltySetting(
    REFERRAL_SETTING_KEYS.enabled,
    input.enabled ? "true" : "false",
    {
      label: "Programa Invita y gana activo",
      helpText:
        "Apagado: el registro sigue aceptando códigos pero NO emite cupones de bienvenida ni premios (las referencias pendientes quedan en espera). Se gestiona desde Fidelización (/admin/fidelizacion).",
      type: "BOOLEAN",
    },
    adminId,
  );
  await upsertLoyaltySetting(
    REFERRAL_SETTING_KEYS.rewardPercent,
    String(input.rewardPercent),
    {
      label: "Invita y gana: % de recompensa",
      helpText:
        "% OFF de los cupones personales (bienvenida del referido + premio del referente). Aplica SOLO a cupones emitidos después del cambio — los ya emitidos conservan su % original. Se gestiona desde Fidelización (/admin/fidelizacion).",
      type: "NUMBER",
    },
    adminId,
  );
  await upsertLoyaltySetting(
    REFERRAL_SETTING_KEYS.rewardDays,
    String(input.rewardDays),
    {
      label: "Invita y gana: días de vigencia del cupón",
      helpText:
        "Días de vigencia de los cupones que se emitan desde ahora. Los ya emitidos conservan su fecha de vencimiento original. Se gestiona desde Fidelización (/admin/fidelizacion).",
      type: "NUMBER",
    },
    adminId,
  );
}
