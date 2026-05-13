"use server";

/*
 * Server actions del Visual In-Place Editor (sub-bloque K).
 *
 * Permiten editar y publicar bloques/settings directamente desde el
 * sitio público en modo edición, sin necesidad de navegar a
 * /admin/contenido/bloques/[id]. Reusan los services de
 * features/cms/service.ts.
 *
 * - inlineEditBlockAction({ key, body, title?, publish }):
 *     Si publish=true, save draft + publish atómico → cambio visible.
 *     Si publish=false, solo guarda borrador (no se ve en sitio aún).
 *
 * - inlineEditSettingAction({ key, value }):
 *     Settings se publican siempre (no tienen drafts).
 *
 * Ambas:
 *   - Validan que el caller sea admin (devuelven { error } si no)
 *   - Registran AdminActionLog con action="cms.*.inline_publish"
 *   - Invalidan cache via updateTag("cms")
 *   - Devuelven { ok: true } | { error: string } — client renderea toast
 */

import { updateTag } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  getCmsBlockByKey,
  getSiteSettingByKey,
  saveCmsBlockDraft,
  publishCmsBlockVersion,
  updateSiteSetting,
} from "@/features/cms/service";

export type InlineEditResult = { ok: true } | { ok: false; error: string };

export async function inlineEditBlockAction(input: {
  key: string;
  body: string;
  title?: string | null;
  publish: boolean;
}): Promise<InlineEditResult> {
  const session = await getCurrentAdmin();
  if (!session) {
    return { ok: false, error: "Tu sesión de admin expiró." };
  }

  const block = await getCmsBlockByKey(input.key);
  if (!block) {
    return { ok: false, error: `Bloque "${input.key}" no existe.` };
  }

  try {
    const version = await saveCmsBlockDraft(
      {
        id: block.id,
        body: input.body,
        title: input.title ?? block.title,
      },
      session.admin.id,
    );

    await recordAdminAction({
      actorId: session.admin.id,
      action: input.publish ? "cms.block.inline_publish" : "cms.block.inline_draft",
      entityType: "CmsBlock",
      entityId: block.id,
      metadata: { key: block.key, version: version.version },
    });

    if (input.publish) {
      await publishCmsBlockVersion(block.id, version.id, session.admin.id);
    }

    updateTag("cms");
    return { ok: true };
  } catch (err) {
    logger.error({
      event: "admin.cms.inline_edit.fail",
      adminId: session.admin.id,
      key: input.key,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "No pudimos guardar el cambio. Intenta de nuevo." };
  }
}

export async function inlineEditSettingAction(input: {
  key: string;
  value: string;
}): Promise<InlineEditResult> {
  const session = await getCurrentAdmin();
  if (!session) {
    return { ok: false, error: "Tu sesión de admin expiró." };
  }

  const setting = await getSiteSettingByKey(input.key);
  if (!setting) {
    return { ok: false, error: `Configuración "${input.key}" no existe.` };
  }

  try {
    await updateSiteSetting({ id: setting.id, value: input.value }, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.setting.inline_update",
      entityType: "SiteSetting",
      entityId: setting.id,
      metadata: { key: setting.key },
    });
    updateTag("cms");
    return { ok: true };
  } catch (err) {
    logger.error({
      event: "admin.cms.setting.inline_update.fail",
      adminId: session.admin.id,
      key: input.key,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "No pudimos guardar el cambio. Intenta de nuevo." };
  }
}
