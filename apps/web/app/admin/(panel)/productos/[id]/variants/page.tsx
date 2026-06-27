/*
 * Legacy redirect — Lucy 2026-06-26 Opción C Sprint 2.
 *
 * Antes esta ruta era una página completa para gestionar variantes. Ahora
 * el contenido vive en /admin/productos/[id]?section=opciones para que el
 * sub-nav del producto sea siempre visible y las opciones no estén
 * escondidas.
 *
 * Mantenemos el redirect aquí para que bookmarks antiguos de Lucy sigan
 * funcionando. Preservamos los searchParams (?new=1 / ?edit=ID) para no
 * romper flujos en curso.
 *
 * Cuándo eliminar este redirect: cuando hayan pasado 3-6 meses sin uso
 * detectado en logs (o al hacer un mantenimiento general de redirects
 * legacy admin).
 */

import { redirect, permanentRedirect } from "next/navigation";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function VariantsLegacyRedirect({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  // Preservar searchParams (new=1, edit=ID) para que flujos en curso
  // (form de creación abierto, edición de una variante) no se interrumpan.
  const qs = new URLSearchParams();
  qs.set("section", "opciones");
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
  }
  // permanentRedirect (HTTP 308) — bookmarkeable bien, cacheable agresivo.
  permanentRedirect(`/admin/productos/${id}?${qs.toString()}`);
  // unreachable — Next type checker quiere un return
  redirect(`/admin/productos/${id}`);
}
