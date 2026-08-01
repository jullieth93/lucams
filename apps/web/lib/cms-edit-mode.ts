/*
 * Modo edición in-place del CMS (roadmap C1 paso 2).
 *
 * Un admin (rol de contenido) lo prende desde /admin/contenido con
 * enableCmsEditModeAction: queda la cookie `lucams_cms_edit` y, mientras
 * exista, <CmsText>/<CmsMarkdown> anotan su salida con `data-cms-key` y el
 * root layout monta el overlay (banner + click → editor del campo).
 *
 * Nota de seguridad (deliberado): la cookie NO es una credencial — solo
 * revela anotaciones con las keys de campos CMS en el HTML (las keys son
 * estructurales y el contenido es público). Toda mutación sigue guardada
 * server-side con requireAdminAction; la cookie solo se siembra tras el
 * guard de contenido.
 */

import "server-only";
import { cookies } from "next/headers";

export const CMS_EDIT_COOKIE = "lucams_cms_edit";

/** ¿Está activo el modo edición in-place en esta request? */
export async function isCmsEditMode(): Promise<boolean> {
  const store = await cookies();
  return store.get(CMS_EDIT_COOKIE)?.value === "1";
}
