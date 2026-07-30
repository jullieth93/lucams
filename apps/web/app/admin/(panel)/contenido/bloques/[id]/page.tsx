/*
 * LEGACY (CMS v2): el editor de bloques fue reemplazado por el editor de
 * campos (/admin/contenido/campos/[id]). Los ids viejos son de CmsBlock
 * (modelo eliminado) y NO mapean a CmsField → se vuelve al índice.
 */

import { redirect } from "next/navigation";

export default function EditorBloqueLegacyRedirect() {
  redirect("/admin/contenido");
}
