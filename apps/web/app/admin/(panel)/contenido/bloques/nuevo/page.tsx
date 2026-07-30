/*
 * LEGACY (CMS v2): crear bloque ya no existe como pantalla — los campos
 * nuevos se crean desde cada sección en el editor de página
 * (/admin/contenido/paginas/[slug], "Agregar campo").
 */

import { redirect } from "next/navigation";

export default function NuevoBloqueLegacyRedirect() {
  redirect("/admin/contenido");
}
