import "server-only";

import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/cms";
import { createCmsField, getCmsFieldByKey, saveCmsFieldDraft } from "@/features/cms/service";

export const LIFECYCLE_SETTING_KEYS = {
  enabled: "LIFECYCLE_ENABLED",
  maxMessagesPerDay: "LIFECYCLE_MAX_MESSAGES_PER_DAY",
} as const;

export const LIFECYCLE_DEFAULTS = {
  enabled: true,
  maxMessagesPerDay: 2,
} as const;

export type LifecycleSettings = {
  enabled: boolean;
  maxMessagesPerDay: number;
  dryRun: boolean;
};

export function isLifecycleDryRun(): boolean {
  const explicit = process.env.LIFECYCLE_DRY_RUN?.trim().toLowerCase();
  return process.env.VERCEL_ENV === "preview" || explicit === "1" || explicit === "true";
}

export async function getLifecycleSettings(): Promise<LifecycleSettings> {
  const [enabled, maxMessages] = await Promise.all([
    getSettingValue(LIFECYCLE_SETTING_KEYS.enabled, String(LIFECYCLE_DEFAULTS.enabled)),
    getSettingValue(
      LIFECYCLE_SETTING_KEYS.maxMessagesPerDay,
      String(LIFECYCLE_DEFAULTS.maxMessagesPerDay),
    ),
  ]);
  const parsedMax = Number.parseInt(maxMessages, 10);
  return {
    enabled: enabled.trim() === "true",
    maxMessagesPerDay:
      Number.isFinite(parsedMax) && parsedMax >= 1 && parsedMax <= 20
        ? parsedMax
        : LIFECYCLE_DEFAULTS.maxMessagesPerDay,
    dryRun: isLifecycleDryRun(),
  };
}

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

async function upsertLifecycleSetting(input: {
  key: string;
  body: string;
  label: string;
  helpText: string;
  type: "NUMBER" | "BOOLEAN";
  adminId: string;
}): Promise<void> {
  const existing = await getCmsFieldByKey(input.key);
  if (existing) {
    if (existing.kind !== "SETTING") {
      throw new Error(`El campo ${input.key} no es un ajuste (kind SETTING).`);
    }
    await saveCmsFieldDraft({ id: existing.id, body: input.body }, input.adminId);
    return;
  }
  await createCmsField(
    {
      sectionId: await resolveSettingsSectionId(),
      key: input.key,
      kind: "SETTING",
      label: input.label,
      helpText: input.helpText,
      type: input.type,
      category: "COMMERCE",
      body: input.body,
    },
    input.adminId,
  );
}

export async function saveLifecycleSettings(
  input: Omit<LifecycleSettings, "dryRun">,
  adminId: string,
): Promise<void> {
  await upsertLifecycleSetting({
    key: LIFECYCLE_SETTING_KEYS.enabled,
    body: String(input.enabled),
    label: "Motor Lifecycle activo",
    helpText:
      "Interruptor general de Lifecycle Journeys. Al apagarlo se detienen inscripciones, ejecuciones y atribución sin borrar el historial.",
    type: "BOOLEAN",
    adminId,
  });
  await upsertLifecycleSetting({
    key: LIFECYCLE_SETTING_KEYS.maxMessagesPerDay,
    body: String(input.maxMessagesPerDay),
    label: "Límite diario global Lifecycle",
    helpText:
      "Máximo combinado de mensajes Lifecycle por contacto y día en hora Colombia. También se respeta el límite individual de cada recorrido.",
    type: "NUMBER",
    adminId,
  });
}
