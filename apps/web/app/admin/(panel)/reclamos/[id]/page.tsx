/*
 * LEGACY (2026-10-01): detalle del reclamo en la bandeja divergente
 * /admin/reclamos, fusionada en /admin/garantias (ver ../page.tsx).
 *
 * Garantías NO tiene ruta de detalle [id]: la lista inline ES el detalle
 * (contexto completo + acciones por tarjeta), así que un deep-link viejo a un
 * reclamo específico no tiene destino equivalente — redirige a la bandeja,
 * donde el reclamo aparece con su estado y su pedido linkeado.
 */

import { redirect, permanentRedirect } from "next/navigation";

export default async function ReclamoDetalleLegacyRedirect() {
  permanentRedirect("/admin/garantias");
  // unreachable — Next type checker quiere un return
  redirect("/admin/garantias");
}
