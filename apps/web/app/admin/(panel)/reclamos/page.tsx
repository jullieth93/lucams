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

type SearchParams = Promise<{ status?: string }>;

export default async function ReclamosLegacyRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  permanentRedirect(sp.status === "all" ? "/admin/garantias?status=all" : "/admin/garantias");
  // unreachable — Next type checker quiere un return
  redirect("/admin/garantias");
}
