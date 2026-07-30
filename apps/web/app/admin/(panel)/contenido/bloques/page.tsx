/*
 * LEGACY (CMS v2): la lista de bloques fue reemplazada por el índice de
 * páginas del sitio. Se conserva la ruta como redirect para no romper
 * enlaces viejos (emails, docs, marcadores).
 */

import { redirect } from "next/navigation";

export default function BloquesLegacyRedirect() {
  redirect("/admin/contenido");
}
