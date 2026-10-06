"use server";

/*
 * Server actions de la cola de moderación de contenido (ADR-062 P0-2). SUPERADMIN o MANAGER.
 * Aprobar/rechazar un diseño personalizado antes de imprimirlo. El rechazo avisa al cliente.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  approveDesign,
  getDesignProductionPaths,
  rejectDesign,
} from "@/features/moderation/service";
import { sendDesignRejectedEmails } from "@/features/moderation/emails";
import { getProductionAssetSignedUrls } from "@/lib/storage";

export type SignedProductionPiece = { path: string; url: string };

/**
 * Firma bajo demanda las piezas reales de producción de UN diseño (T4, ADR-063 T2 revisitado).
 * Antes la página de la cola firmaba TODOS los productionUrls de la grilla al renderizar:
 * PNGs 300 DPI de 2-5 MB c/u (hasta 24 por diseño) descargados por el navegador aunque Lucy
 * solo revisara un par. Ahora la grilla muestra el previewUrl (mosaico público ~50-150 KB) y
 * el modal "Ver piezas reales" llama esta acción, que firma SOLO las rutas de ese designId.
 * TTL 1h (mismo que la firma en lote anterior); el path se devuelve para rotular cada pieza.
 */
export async function getDesignProductionSignedUrlsAction(
  designId: string,
): Promise<SignedProductionPiece[]> {
  await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
  const id = designId.trim();
  if (!id) return [];
  const paths = await getDesignProductionPaths(id);
  const signed = await getProductionAssetSignedUrls(paths);
  return paths.flatMap((path) => {
    const url = signed.get(path);
    return url ? [{ path, url }] : [];
  });
}

export async function approveDesignAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const designId = String(formData.get("designId") ?? "").trim();
  if (!designId) redirect("/admin/moderacion?error=" + encodeURIComponent("Falta el diseño."));
  // Conserva el filtro ?pedido= de la cola tras el redirect (2026-10-05).
  const pedido = String(formData.get("pedido") ?? "").trim();

  await approveDesign(designId, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "design.moderation.approve",
    entityType: "Design",
    entityId: designId,
  });
  revalidatePath("/admin/moderacion");
  revalidatePath("/admin/dashboard");
  redirect(`/admin/moderacion?approved=1${pedido ? `&pedido=${encodeURIComponent(pedido)}` : ""}`);
}

export async function rejectDesignAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const designId = String(formData.get("designId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 300);
  if (!designId) redirect("/admin/moderacion?error=" + encodeURIComponent("Falta el diseño."));
  if (reason.length < 5) {
    redirect(
      "/admin/moderacion?error=" +
        encodeURIComponent("Escribe un motivo del rechazo (mínimo 5 caracteres)."),
    );
  }
  // Conserva el filtro ?pedido= de la cola tras el redirect (2026-10-05).
  const pedido = String(formData.get("pedido") ?? "").trim();

  const result = await rejectDesign(designId, session.admin.id, reason);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "design.moderation.reject",
    entityType: "Design",
    entityId: designId,
    metadata: { reason, afectados: result.sources.map((x) => `${x.tipo} ${x.numero}`) },
  });
  // Avisar al cliente (best-effort: no rompe la acción si el correo falla).
  await sendDesignRejectedEmails(designId, result, reason);

  revalidatePath("/admin/moderacion");
  revalidatePath("/admin/dashboard");
  redirect(`/admin/moderacion?rejected=1${pedido ? `&pedido=${encodeURIComponent(pedido)}` : ""}`);
}
