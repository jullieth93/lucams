"use server";

/*
 * Server actions de la cola de moderación de contenido (ADR-062 P0-2).
 * Roles autorizados: ADMIN_ROLE_SETS.PRODUCTION_MODERATE (SUPERADMIN, MANAGER,
 * OPERATIONS_MANAGER, PRINT_WORKSHOP). Aprobar/rechazar un diseño personalizado
 * antes de imprimirlo. El rechazo avisa al cliente y bloquea el despacho.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  ModerationGuardError,
  approveDesign,
  getDesignProductionPaths,
  rejectDesign,
} from "@/features/moderation/service";
import { sendDesignRejectedEmails } from "@/features/moderation/emails";
import { getProductionAssetSignedUrls } from "@/lib/storage";

export type SignedProductionPiece = { path: string; url: string };

function buildModerationRedirectUrl(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  const query = qs.toString();
  return query ? `/admin/moderacion?${query}` : "/admin/moderacion";
}

function readPreservedQueueFilters(formData: FormData) {
  const q = String(formData.get("q") ?? formData.get("pedido") ?? "").trim() || undefined;
  const rawOrigen = String(formData.get("origen") ?? "").trim();
  const origen =
    rawOrigen === "pedido" || rawOrigen === "cotizacion" || rawOrigen === "compartido"
      ? rawOrigen
      : undefined;
  const rawCalidad = String(formData.get("calidad") ?? "").trim();
  const calidad = rawCalidad === "con_aviso" ? "con_aviso" : undefined;
  return { q, origen, calidad };
}

/**
 * Firma bajo demanda las piezas reales de producción de UN diseño (T4, ADR-063 T2 revisitado).
 * Antes la página de la cola firmaba TODOS los productionUrls de la grilla al renderizar:
 * PNGs 300 DPI de 2-5 MB c/u (hasta 24 por diseño) descargados por el navegador aunque el
 * moderador solo revisara un par. Ahora la grilla muestra el previewUrl (mosaico público ~50-150 KB)
 * y el modal "Ver piezas reales" llama esta acción, que firma SOLO las rutas de ese designId.
 * TTL 1h (mismo que la firma en lote anterior); el path se devuelve para rotular cada pieza.
 */
export async function getDesignProductionSignedUrlsAction(
  designId: string,
): Promise<SignedProductionPiece[]> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.PRODUCTION_MODERATE });
  const id = designId.trim();
  if (!id) return [];
  const paths = await getDesignProductionPaths(id);
  const signed = await getProductionAssetSignedUrls(paths);
  const pieces = paths.flatMap((path) => {
    const url = signed.get(path);
    return url ? [{ path, url }] : [];
  });
  if (pieces.length > 0) {
    await recordAdminAction({
      actorId: session.admin.id,
      action: "design.production_assets_preview",
      entityType: "Design",
      entityId: id,
      metadata: { pieceCount: pieces.length },
    });
  }
  return pieces;
}

export async function approveDesignAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.PRODUCTION_MODERATE });
  const filters = readPreservedQueueFilters(formData);

  const designId = String(formData.get("designId") ?? "").trim();
  if (!designId) {
    redirect(
      buildModerationRedirectUrl({ ...filters, error: "Falta el identificador del diseño." }),
    );
  }

  let result: Awaited<ReturnType<typeof approveDesign>> | undefined;
  try {
    result = await approveDesign(designId, session.admin.id);
  } catch (err) {
    if (err instanceof ModerationGuardError) {
      redirect(buildModerationRedirectUrl({ ...filters, error: err.message }));
    }
    throw err;
  }

  const sources = result?.sources ?? [];
  const orderNumbers = result?.orderNumbers ?? [];
  await recordAdminAction({
    actorId: session.admin.id,
    action: "design.moderation.approve",
    entityType: "Design",
    entityId: designId,
    metadata: {
      productName: result?.productName ?? null,
      orderNumber: orderNumbers[0] ?? null,
      afectados: sources.map((x) => `${x.tipo} ${x.numero}`),
    },
  });

  revalidatePath("/admin/moderacion");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/pedidos");
  for (const num of orderNumbers) {
    revalidatePath(`/admin/pedidos/${num}`);
  }
  redirect(buildModerationRedirectUrl({ approved: "1", ...filters }));
}

export async function rejectDesignAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.PRODUCTION_MODERATE });
  const filters = readPreservedQueueFilters(formData);

  const designId = String(formData.get("designId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 300);
  if (!designId) {
    redirect(
      buildModerationRedirectUrl({ ...filters, error: "Falta el identificador del diseño." }),
    );
  }
  if (reason.length < 5) {
    redirect(
      buildModerationRedirectUrl({
        ...filters,
        error: "Escribe un motivo del rechazo (mínimo 5 caracteres).",
      }),
    );
  }

  let result: Awaited<ReturnType<typeof rejectDesign>>;
  try {
    result = await rejectDesign(designId, session.admin.id, reason);
  } catch (err) {
    if (err instanceof ModerationGuardError) {
      redirect(buildModerationRedirectUrl({ ...filters, error: err.message }));
    }
    throw err;
  }

  const orderNumbers = [
    ...new Set(result.sources.filter((x) => x.tipo === "pedido").map((x) => x.numero)),
  ];
  await recordAdminAction({
    actorId: session.admin.id,
    action: "design.moderation.reject",
    entityType: "Design",
    entityId: designId,
    metadata: {
      reason,
      productName: result.productName,
      orderNumber: orderNumbers[0] ?? null,
      afectados: result.sources.map((x) => `${x.tipo} ${x.numero}`),
    },
  });
  // Avisar al cliente (best-effort: no rompe la acción si el correo falla).
  await sendDesignRejectedEmails(designId, result, reason);

  revalidatePath("/admin/moderacion");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/pedidos");
  for (const num of orderNumbers) {
    revalidatePath(`/admin/pedidos/${num}`);
  }
  redirect(buildModerationRedirectUrl({ rejected: "1", ...filters }));
}
