/*
 * Settings del módulo de recuperación de carritos abandonados (Fase 4,
 * 2026-10-13) — CmsField kind SETTING, mismo patrón que
 * features/loyalty/settings.ts y features/shipping/settings.ts: valor atómico,
 * save = publish, invalidación vía updateTag("cms") desde la Server Action;
 * lecturas fail-safe (setting ausente o valor inválido → fallback); escrituras
 * self-healing (si el campo no existe en la DB del ambiente se crea publicado
 * en la sección global/comercio).
 *
 *   CART_RECOVERY_ENABLED         "true"/"false" — módulo activo. Default
 *                                 "true": reproduce el comportamiento histórico
 *                                 (el cron ya enviaba recordatorios). Apagarlo
 *                                 es kill-switch total: ni cron ni envíos
 *                                 manuales salen.
 *   CART_RECOVERY_MODE            "automatic" | "manual". Default "automatic"
 *                                 (el cron decide solo). En "manual" el cron NO
 *                                 envía nada: los recordatorios salen solo a
 *                                 voluntad desde /admin/carritos.
 *   CART_RECOVERY_IDLE_HOURS      horas de inactividad antes de considerar el
 *                                 carrito abandonado (default 4 — el valor
 *                                 quemado histórico).
 *   CART_RECOVERY_MAX_REMINDERS   nº máximo de recordatorios por carrito
 *                                 (default 1 — el comportamiento histórico de
 *                                 "un solo recordatorio").
 *   CART_RECOVERY_INTERVAL_HOURS  horas mínimas entre recordatorios al mismo
 *                                 carrito cuando maxReminders > 1 (default 24).
 *                                 También es el anti-duplicación del envío
 *                                 manual (no reenviar antes de este lapso).
 *
 * Los defaults reproducen EXACTAMENTE el comportamiento previo a la Fase 4:
 * desplegar sin tocar nada no cambia la conducta; el admin lo ajusta después
 * desde /admin/carritos/configuracion.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/cms";
import { createCmsField, getCmsFieldByKey, saveCmsFieldDraft } from "@/features/cms/service";

export const CART_RECOVERY_SETTING_KEYS = {
  enabled: "CART_RECOVERY_ENABLED",
  mode: "CART_RECOVERY_MODE",
  idleHours: "CART_RECOVERY_IDLE_HOURS",
  maxReminders: "CART_RECOVERY_MAX_REMINDERS",
  intervalHours: "CART_RECOVERY_INTERVAL_HOURS",
} as const;

export type CartRecoveryMode = "automatic" | "manual";

export type CartRecoverySettings = {
  /** Kill-switch del módulo (cron + manual). */
  enabled: boolean;
  /** automatic = el cron envía solo; manual = solo a voluntad desde el admin. */
  mode: CartRecoveryMode;
  /** Horas de inactividad antes de considerar el carrito abandonado. */
  idleHours: number;
  /** Recordatorios máximos por carrito. */
  maxReminders: number;
  /** Horas mínimas entre recordatorios al mismo carrito. */
  intervalHours: number;
};

/** Defaults = comportamiento histórico (un recordatorio a las 4h). */
export const CART_RECOVERY_DEFAULTS = {
  enabled: true,
  mode: "automatic",
  idleHours: 4,
  maxReminders: 1,
  intervalHours: 24,
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
 * Crea o actualiza una setting del módulo. Las settings son kind SETTING →
 * saveCmsFieldDraft publica al guardar. El caller (Server Action) hace el
 * updateTag("cms") para que el cron la vea de inmediato.
 */
async function upsertRecoverySetting(
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

/**
 * Lee la config del módulo con defaults fail-safe hacia el STATUS QUO (módulo
 * activo en automático — así operaba antes de la Fase 4; apagarlo o pasarlo a
 * manual es una decisión explícita del admin).
 */
export async function getCartRecoverySettings(): Promise<CartRecoverySettings> {
  const [enabled, mode, idleHours, maxReminders, intervalHours] = await Promise.all([
    getSettingValue(CART_RECOVERY_SETTING_KEYS.enabled, "true"),
    getSettingValue(CART_RECOVERY_SETTING_KEYS.mode, CART_RECOVERY_DEFAULTS.mode),
    getSettingValue(CART_RECOVERY_SETTING_KEYS.idleHours, String(CART_RECOVERY_DEFAULTS.idleHours)),
    getSettingValue(
      CART_RECOVERY_SETTING_KEYS.maxReminders,
      String(CART_RECOVERY_DEFAULTS.maxReminders),
    ),
    getSettingValue(
      CART_RECOVERY_SETTING_KEYS.intervalHours,
      String(CART_RECOVERY_DEFAULTS.intervalHours),
    ),
  ]);
  return {
    enabled: enabled.trim() !== "false", // fail-open hacia el status quo (solo "false" apaga)
    mode: mode.trim() === "manual" ? "manual" : "automatic",
    idleHours: parsePositiveInt(idleHours, CART_RECOVERY_DEFAULTS.idleHours),
    maxReminders: parsePositiveInt(maxReminders, CART_RECOVERY_DEFAULTS.maxReminders),
    intervalHours: parsePositiveInt(intervalHours, CART_RECOVERY_DEFAULTS.intervalHours),
  };
}

/** Escribe la config del módulo (desde /admin/carritos/configuracion). */
export async function saveCartRecoverySettings(
  input: CartRecoverySettings,
  adminId: string | null,
): Promise<void> {
  await upsertRecoverySetting(
    CART_RECOVERY_SETTING_KEYS.enabled,
    input.enabled ? "true" : "false",
    {
      label: "Recuperación de carritos activa",
      helpText:
        "Kill-switch del módulo: apagado no se envía NADA (ni cron ni manual). Se gestiona desde Carritos abandonados › Configuración (/admin/carritos/configuracion).",
      type: "BOOLEAN",
    },
    adminId,
  );
  await upsertRecoverySetting(
    CART_RECOVERY_SETTING_KEYS.mode,
    input.mode,
    {
      label: "Recuperación de carritos: modo",
      helpText:
        '"automatic" = el cron envía recordatorios solo; "manual" = el cron no envía nada, los recordatorios salen solo a voluntad desde /admin/carritos. Se gestiona desde Carritos abandonados › Configuración.',
      type: "TEXT",
    },
    adminId,
  );
  await upsertRecoverySetting(
    CART_RECOVERY_SETTING_KEYS.idleHours,
    String(input.idleHours),
    {
      label: "Recuperación de carritos: horas de inactividad",
      helpText:
        "Horas sin actividad antes de considerar el carrito abandonado y enviar el primer recordatorio (modo automático). Se gestiona desde Carritos abandonados › Configuración.",
      type: "NUMBER",
    },
    adminId,
  );
  await upsertRecoverySetting(
    CART_RECOVERY_SETTING_KEYS.maxReminders,
    String(input.maxReminders),
    {
      label: "Recuperación de carritos: recordatorios máximos",
      helpText:
        "Número máximo de recordatorios automáticos por carrito (1 = un solo recordatorio, el comportamiento histórico). Se gestiona desde Carritos abandonados › Configuración.",
      type: "NUMBER",
    },
    adminId,
  );
  await upsertRecoverySetting(
    CART_RECOVERY_SETTING_KEYS.intervalHours,
    String(input.intervalHours),
    {
      label: "Recuperación de carritos: horas entre recordatorios",
      helpText:
        "Horas mínimas entre recordatorios al mismo carrito (cuando hay más de uno). También es la anti-duplicación del envío manual. Se gestiona desde Carritos abandonados › Configuración.",
      type: "NUMBER",
    },
    adminId,
  );
}
