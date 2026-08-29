/*
 * Modo edición in-place del CMS (roadmap C1 paso 2).
 *
 * Un admin (rol de contenido) lo prende desde /admin/contenido con
 * enableCmsEditModeAction: queda la cookie `lucams_cms_edit` y, mientras
 * exista, <CmsText>/<CmsMarkdown> anotan su salida con `data-cms-key` y el
 * root layout monta el overlay (banner + click → editor del campo).
 *
 * Nota de seguridad (C-9, auditoría 2026-08-24): la cookie NO es una
 * credencial y es auto-sembrable (`document.cookie = "lucams_cms_edit=1"`),
 * así que su sola presencia ya NO basta — `isCmsEditMode()` re-verifica una
 * sesión admin real con rol de contenido antes de revelar las anotaciones.
 * Toda mutación sigue guardada server-side con requireAdminAction y la cookie
 * solo se siembra tras ese guard (route /api/admin/cms/edit-mode, B-6).
 */

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { getCurrentAdmin } from "@/lib/auth";

export const CMS_EDIT_COOKIE = "lucams_cms_edit";

// Re-verificación de sesión, deduplicada por request con React cache(): una
// página del storefront renderiza decenas de CmsText/CmsMarkdown y cada uno
// llama isCmsEditMode() — sin cache serían N queries idénticas de AdminUser.
const getContentAdminSession = cache(async () => {
  const session = await getCurrentAdmin();
  const contentRoles: readonly string[] = ADMIN_ROLE_SETS.CONTENT;
  return session && contentRoles.includes(session.admin.role) ? session : null;
});

/** ¿Está activo el modo edición in-place en esta request? */
export async function isCmsEditMode(): Promise<boolean> {
  const store = await cookies();
  // Cookie ausente (todo el tráfico público) → false SIN lookups extra.
  if (store.get(CMS_EDIT_COOKIE)?.value !== "1") return false;
  return (await getContentAdminSession()) !== null;
}
