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
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";

export default async function ReclamoDetalleLegacyRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // B-7: paridad N-21 con ROUTE_ROLES y preservación del id vía búsqueda server-side (?q=).
  await requireRole(ADMIN_ROLE_SETS.GARANTIAS_READ);
  const { id } = await params;
  const cleanId = id.trim().slice(0, 80);
  const target = cleanId
    ? `/admin/garantias?status=all&q=${encodeURIComponent(cleanId)}`
    : "/admin/garantias";
  permanentRedirect(target);
  // unreachable — Next type checker quiere un return
  redirect(target);
}
