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
import type { BlockCategory } from "@lucams/db";
import { getCurrentAdmin } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  createCmsBlock,
  createSiteSetting,
  getCmsBlockByKey,
  getSiteSettingByKey,
  saveCmsBlockDraft,
  publishCmsBlockVersion,
  updateSiteSetting,
} from "@/features/cms/service";

export type InlineEditResult = { ok: true } | { ok: false; error: string };

/**
 * Deriva categoría a partir del prefijo del key. Si no matchea, usa
 * MARKETING como catch-all editable. Lucy puede reasignar desde el
 * admin form-based si quiere.
 */
function deriveCategoryFromKey(key: string): BlockCategory {
  const prefix = key.split(".")[0]?.toLowerCase();
  switch (prefix) {
    case "legal":
      return "LEGAL";
    case "home":
      return "HOME";
    case "footer":
      return "FOOTER";
    case "cart":
    case "error":
    case "empty_state":
      return "EMPTY_STATE";
    case "cookies":
      return "COOKIES";
    case "faq":
      return "FAQ";
    case "support":
    case "contact":
      return "SUPPORT";
    case "maintenance":
      return "MAINTENANCE";
    case "email":
      return "EMAIL";
    default:
      return "MARKETING";
  }
}

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

  try {
    let block = await getCmsBlockByKey(input.key);

    // Auto-create: si el wrapper renderizó esta key pero nunca se creó
    // un CmsBlock para ella, lo creamos al primer save. Permite que
    // cualquier <CmsText> nuevo sea editable sin tener que seedear
    // manualmente. Categoría derivada del prefix del key.
    if (!block) {
      const newBlock = await createCmsBlock(
        {
          key: input.key,
          body: input.body,
          format: "MARKDOWN",
          category: deriveCategoryFromKey(input.key),
          title: input.title ?? null,
          description: null,
        },
        session.admin.id,
      );
      await recordAdminAction({
        actorId: session.admin.id,
        action: "cms.block.inline_auto_create",
        entityType: "CmsBlock",
        entityId: newBlock.id,
        metadata: { key: newBlock.key },
      });
      // createCmsBlock ya creó version 1 — para publicar necesitamos
      // re-leer con la version asociada.
      block = await getCmsBlockByKey(input.key);
      if (!block) {
        return { ok: false, error: "Bloque creado pero no se pudo cargar para publicar." };
      }
    }

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

/** Categoría defalut para settings nuevos creados desde inline editor. */
function deriveSettingCategoryFromKey(
  key: string,
):
  | "CONTACT"
  | "BUSINESS"
  | "LEGAL"
  | "COMMERCE"
  | "SOCIAL"
  | "EXTERNAL"
  | "WHATSAPP"
  | "COPYRIGHT"
  | "SEO" {
  const upper = key.toUpperCase();
  if (upper.startsWith("CONTACT_") || upper.endsWith("_EMAIL")) return "CONTACT";
  if (upper.startsWith("BUSINESS_")) return "BUSINESS";
  if (upper.includes("LEGAL_") || upper.includes("POLICY")) return "LEGAL";
  if (upper.startsWith("SOCIAL_")) return "SOCIAL";
  if (upper.includes("WHATSAPP") || upper.startsWith("WA_")) return "WHATSAPP";
  if (upper.startsWith("COPYRIGHT_")) return "COPYRIGHT";
  if (upper.startsWith("SEO_")) return "SEO";
  return "BUSINESS";
}

export async function inlineEditSettingAction(input: {
  key: string;
  value: string;
}): Promise<InlineEditResult> {
  const session = await getCurrentAdmin();
  if (!session) {
    return { ok: false, error: "Tu sesión de admin expiró." };
  }

  try {
    const setting = await getSiteSettingByKey(input.key);

    // Auto-create si no existe: label y category derivados del key.
    if (!setting) {
      const newSetting = await createSiteSetting(
        {
          key: input.key,
          value: input.value,
          valueType: "TEXT",
          label: input.key,
          description: null,
          category: deriveSettingCategoryFromKey(input.key),
        },
        session.admin.id,
      );
      await recordAdminAction({
        actorId: session.admin.id,
        action: "cms.setting.inline_auto_create",
        entityType: "SiteSetting",
        entityId: newSetting.id,
        metadata: { key: newSetting.key },
      });
      updateTag("cms");
      return { ok: true };
    }

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
