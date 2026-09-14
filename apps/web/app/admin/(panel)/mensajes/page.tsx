/*
 * LEGACY (N-09, 2026-09-11): /admin/mensajes era una segunda bandeja sobre el
 * MISMO servicio de tickets de soporte (features/support/admin-service) con las
 * mismas acciones, permisos y auditoría que /admin/soporte — duplicación sin
 * justificación. Se consolida todo en /admin/soporte y esta ruta queda como
 * redirect permanente (308) para que bookmarks y links viejos sigan llegando.
 *
 * Se preserva el filtro ?status= (las dos bandejas usaban la misma matriz
 * OPEN/IN_PROGRESS/CLOSED/all), igual que el redirect legacy de variants.
 */

import { redirect, permanentRedirect } from "next/navigation";

type SearchParams = Promise<{ status?: string }>;

const VALID_STATUS = new Set(["OPEN", "IN_PROGRESS", "CLOSED", "all"]);

export default async function MensajesLegacyRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const qs = sp.status && VALID_STATUS.has(sp.status) ? `?status=${sp.status}` : "";
  permanentRedirect(`/admin/soporte${qs}`);
  // unreachable — Next type checker quiere un return
  redirect("/admin/soporte");
}
