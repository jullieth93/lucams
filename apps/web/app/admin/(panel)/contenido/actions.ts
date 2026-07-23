/*
 * Server Actions — Admin Contenido (CMS).
 *
 * Patrón Lucams: actions delgadas, validación Zod aquí + delegación
 * al service. getCurrentAdmin defensivo. AdminActionLog en cada
 * mutación. updateTag("cms") invalida el cache público al
 * publicar/despublicar/editar/borrar.
 */

"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { logger } from "@/lib/logger";
import {
  CmsBlockCreateSchema,
  CmsBlockUpdateSchema,
  SiteSettingCreateSchema,
  SiteSettingUpdateSchema,
} from "@/features/cms/schemas";
import {
  CmsValidationError,
  createCmsBlock,
  createSiteSetting,
  publishCmsBlockVersion,
  saveCmsBlockDraft,
  softDeleteCmsBlock,
  unpublishCmsBlock,
  updateSiteSetting,
} from "@/features/cms/service";

export type CmsActionState = {
  error?: string;
  fieldErrors?: Partial<
    Record<"key" | "title" | "body" | "format" | "category" | "description", string[]>
  >;
};

// ─────────────────── CmsBlock ───────────────────

export async function createCmsBlockAction(
  _prev: CmsActionState | null,
  formData: FormData,
): Promise<CmsActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const parsed = CmsBlockCreateSchema.safeParse({
    key: String(formData.get("key") ?? "").trim(),
    title: ((formData.get("title") as string) || "").trim() || null,
    body: String(formData.get("body") ?? ""),
    format: formData.get("format") ?? "MARKDOWN",
    category: formData.get("category"),
    description: ((formData.get("description") as string) || "").trim() || null,
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Te faltan algunos datos.",
      fieldErrors: flat.fieldErrors as CmsActionState["fieldErrors"],
    };
  }

  try {
    const block = await createCmsBlock(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.block.create",
      entityType: "CmsBlock",
      entityId: block.id,
      metadata: { key: block.key, category: block.category },
    });
    revalidatePath("/admin/contenido");
    redirect(`/admin/contenido/bloques/${block.id}?created=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (err instanceof CmsValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as CmsActionState["fieldErrors"],
      };
    }
    logger.error({
      event: "admin.cms.block.create_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos crear el bloque. Intenta de nuevo." };
  }
}

export async function saveCmsBlockDraftAction(
  _prev: CmsActionState | null,
  formData: FormData,
): Promise<CmsActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const parsed = CmsBlockUpdateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    title: ((formData.get("title") as string) || "").trim() || null,
    body: String(formData.get("body") ?? ""),
    format: formData.get("format") || undefined,
    category: formData.get("category") || undefined,
    description: ((formData.get("description") as string) || "").trim() || null,
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Te faltan algunos datos.",
      fieldErrors: flat.fieldErrors as CmsActionState["fieldErrors"],
    };
  }

  try {
    const version = await saveCmsBlockDraft(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.block.save_draft",
      entityType: "CmsBlock",
      entityId: parsed.data.id,
      metadata: { version: version.version },
    });
    revalidatePath(`/admin/contenido/bloques/${parsed.data.id}`);
    return {};
  } catch (err) {
    if (err instanceof CmsValidationError) {
      return { error: err.message };
    }
    logger.error({
      event: "admin.cms.block.save_draft_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos guardar el borrador." };
  }
}

export async function publishCmsBlockVersionAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const blockId = String(formData.get("blockId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  if (!blockId || !versionId) redirect("/admin/contenido");

  try {
    await publishCmsBlockVersion(blockId, versionId, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.block.publish",
      entityType: "CmsBlock",
      entityId: blockId,
      metadata: { versionId },
    });
    updateTag("cms");
    revalidatePath(`/admin/contenido/bloques/${blockId}`);
    redirect(`/admin/contenido/bloques/${blockId}?published=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.cms.block.publish_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(
      `/admin/contenido/bloques/${blockId}?error=${encodeURIComponent("No pudimos publicar la versión.")}`,
    );
  }
}

export async function unpublishCmsBlockAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const blockId = String(formData.get("blockId") ?? "");
  if (!blockId) redirect("/admin/contenido");

  await unpublishCmsBlock(blockId, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "cms.block.unpublish",
    entityType: "CmsBlock",
    entityId: blockId,
  });
  updateTag("cms");
  revalidatePath(`/admin/contenido/bloques/${blockId}`);
  redirect(`/admin/contenido/bloques/${blockId}?unpublished=1`);
}

export async function deleteCmsBlockAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const blockId = String(formData.get("blockId") ?? "");
  if (!blockId) redirect("/admin/contenido");

  await softDeleteCmsBlock(blockId, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "cms.block.archive",
    entityType: "CmsBlock",
    entityId: blockId,
  });
  updateTag("cms");
  revalidatePath("/admin/contenido");
  redirect("/admin/contenido?archived=1");
}

// ─────────────────── SiteSetting ───────────────────

/**
 * "Actualizar caché de contenido" (feedback Lucy 2026-07-23): las páginas públicas leen
 * CMS con unstable_cache tag "cms" (lib/cms.ts). Cuando el contenido se edita DIRECTO en
 * la DB con un script de packages/db/scripts (seed-cms, update-legal-*, fix-voseo-cms…),
 * nadie invalida el tag y el sitio sirve la versión vieja hasta 1h (revalidate 3600).
 * `updateTag` solo puede llamarse dentro de un Server Action (Next 16) → este botón es
 * el mecanismo manual de invalidación tras correr esos scripts. No toca la DB.
 */
export async function refreshCmsCacheAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const from = String(formData.get("from") ?? "");
  await recordAdminAction({
    actorId: session.admin.id,
    action: "cms.cache.refresh",
    entityType: "SiteSetting",
    entityId: "cms-cache",
    metadata: { reason: "manual refresh tras edición directa en DB" },
  });
  updateTag("cms");
  revalidatePath("/admin/contenido");
  const back =
    from === "configuracion" ? "/admin/contenido/configuracion" : "/admin/contenido/bloques";
  redirect(`${back}?cache=refreshed`);
}

// ─────────────────── SiteSetting ───────────────────

export type SiteSettingActionState = {
  error?: string;
  ok?: boolean;
};

export async function createSiteSettingAction(
  _prev: SiteSettingActionState | null,
  formData: FormData,
): Promise<SiteSettingActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const parsed = SiteSettingCreateSchema.safeParse({
    key: String(formData.get("key") ?? "")
      .trim()
      .toUpperCase(),
    value: String(formData.get("value") ?? "").trim(),
    valueType: formData.get("valueType") ?? "TEXT",
    label: String(formData.get("label") ?? "").trim(),
    description: ((formData.get("description") as string) || "").trim() || null,
    category: formData.get("category"),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    const firstError = Object.values(flat.fieldErrors)[0]?.[0] ?? "Datos inválidos.";
    return { error: firstError };
  }

  try {
    const setting = await createSiteSetting(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.setting.create",
      entityType: "SiteSetting",
      entityId: setting.id,
      metadata: { key: setting.key, category: setting.category },
    });
    updateTag("cms");
    revalidatePath("/admin/contenido/configuracion");
    return { ok: true };
  } catch (err) {
    if (err instanceof CmsValidationError) return { error: err.message };
    return { error: "No pudimos crear la configuración." };
  }
}

export async function updateSiteSettingAction(
  _prev: SiteSettingActionState | null,
  formData: FormData,
): Promise<SiteSettingActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const parsed = SiteSettingUpdateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    value: String(formData.get("value") ?? "").trim(),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    const firstError = Object.values(flat.fieldErrors)[0]?.[0] ?? "Datos inválidos.";
    return { error: firstError };
  }

  try {
    await updateSiteSetting(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.setting.update",
      entityType: "SiteSetting",
      entityId: parsed.data.id,
    });
    updateTag("cms");
    revalidatePath("/admin/contenido/configuracion");
    return { ok: true };
  } catch (err) {
    logger.error({
      event: "admin.cms.setting.update_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos guardar el cambio." };
  }
}
