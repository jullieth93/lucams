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
import { requireCapability } from "@/lib/admin-rbac-guard";

type SearchParams = Promise<{ status?: string; q?: string }>;

const VALID_STATUS = new Set(["OPEN", "IN_PROGRESS", "CLOSED", "all"]);

export default async function MensajesLegacyRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // B-7: paridad N-21 antes del redirect para no exponer rutas internas en soft-navigation.
  await requireCapability("support:manage");
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.status && VALID_STATUS.has(sp.status)) params.set("view", sp.status);
  if (typeof sp.q === "string" && sp.q.trim()) params.set("q", sp.q.trim().slice(0, 120));
  const qs = params.size > 0 ? `?${params.toString()}` : "";
  permanentRedirect(`/admin/soporte${qs}`);
  // unreachable — Next type checker quiere un return
  redirect("/admin/soporte");
}
