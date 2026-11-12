/*
 * LEGACY (2026-10-01): /admin/reclamos era una segunda bandeja sobre la MISMA
 * tabla WarrantyClaim de /admin/garantias, con una lógica de cierre divergente
 * (update directo que NUNCA notificaba al cliente — la "Nota para el cliente"
 * no llegaba a nadie). Se consolida todo en /admin/garantias (flujo largo Ley
 * 1480 que sí notifica en RESOLVED y REJECTED) y esta ruta queda como redirect
 * permanente (308) para que bookmarks y links viejos sigan llegando — mismo
 * criterio que /admin/mensajes → /admin/soporte (N-09).
 *
 * Se preserva ?status=all (ambas bandejas lo tenían). El resto de filtros no
 * mapean 1:1: el "Pendientes" de acá cubría PENDING+IN_REVIEW+APPROVED y
 * garantías filtra por un solo estado (default PENDING, con pills para los
 * demás) → cae al default.
 */

import { redirect, permanentRedirect } from "next/navigation";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";

type SearchParams = Promise<{ status?: string; q?: string }>;

export default async function ReclamosLegacyRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // B-7: paridad N-21 con ROUTE_ROLES antes de redirigir en soft-navigation.
  await requireRole(ADMIN_ROLE_SETS.GARANTIAS_READ);
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.status === "all") params.set("status", "all");
  if (typeof sp.q === "string" && sp.q.trim()) params.set("q", sp.q.trim().slice(0, 120));
  const qs = params.size > 0 ? `?${params.toString()}` : "";
  permanentRedirect(`/admin/garantias${qs}`);
  // unreachable — Next type checker quiere un return
  redirect("/admin/garantias");
}
