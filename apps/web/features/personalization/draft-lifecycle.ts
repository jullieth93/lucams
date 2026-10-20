/*
 * Ciclo de vida de los BORRADORES (DRAFT) del Estudio — Fase 3 del plan de
 * maduración UX (2026-10-13).
 *
 * Contexto: en "Mis diseños" proliferaban los borradores (medido en STG el
 * 2026-10-13: 91 DRAFT vs 23 READY). Cada entrada al Estudio sin ?designId=
 * creaba un DRAFT nuevo aunque el cliente ya tuviera uno del mismo producto,
 * y nada acotaba cuántos se acumulaban por producto.
 *
 * Este módulo concentra la política:
 *   1. Retoma al entrar: NO vive acá. El Estudio retoma vía el marcador local
 *      "Continuar donde quedaste" (lib/draft-marker.ts, scope
 *      producto:variante, con gates de progreso real y unidades — ADR-152);
 *      el recover server-side valida ownership/estado. No hay reuso silencioso
 *      de DRAFT en el servidor (se eliminó 2026-10-19: cargaba diseños sin
 *      aviso). Los CLONES (cloneDesignForEdit / cloneDesignForReorder) son
 *      intencionales y crean un DRAFT nuevo.
 *   2. Poda «últimos N» (trimExcessDraftDesigns): tras crear un DRAFT nuevo por
 *      cualquier vía, se conservan solo los MAX_DRAFTS_PER_PRODUCT más
 *      recientes del mismo dueño + producto; los excedentes se eliminan con sus
 *      assets (deleteDesignsWithAssets — el mismo camino seguro de las purgas
 *      de retención, que preserva bytes compartidos con diseños vivos).
 *   3. Borrado manual desde "Mis diseños" (deleteCustomerDraftDesign /
 *      emptyCustomerDraftDesigns): eliminar un borrador o vaciarlos todos.
 *
 * NUNCA se toca READY ni USED_IN_ORDER: todas las consultas filtran
 * status:"DRAFT". El borrado de bytes y filas vive en retention-service.ts
 * (purgeDesignBatch vía deleteDesignsWithAssets).
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { designHasMeaningfulProgress } from "./design-progress";
import { deleteDesignsWithAssets } from "./retention-service";

/**
 * 2026-10-13 — techo de borradores CONSERVADOS por dueño + producto: tras crear
 * un DRAFT nuevo (Estudio, clon de edición, reorder, nombre, set de letras) se
 * podan los excedentes más viejos. 3 da margen para un diseño en curso + un par
 * de intentos recientes sin dejar crecer "Mis diseños" indefinidamente; los
 * finalizados (READY) nunca entran en esta cuenta.
 */
export const MAX_DRAFTS_PER_PRODUCT = 3;

const EMPTY_DRAFT_GRACE_MS = 60 * 60 * 1000;

/**
 * Un CartItem solo protege el diseño mientras su Cart siga vivo (misma regla que
 * retention-service: el carrito soft-borrado deja items colgando para siempre).
 */
const NO_LIVE_CART_ITEM = {
  none: { cart: { deletedAt: null } },
} as const;

type Owner = { customerId: string | null; sessionId: string | null };

/** Filtro de ownership: el diseño es del cliente logueado O de la sesión anónima. */
function ownerWhere(owner: Owner): { customerId: string } | { sessionId: string } | null {
  if (owner.customerId) return { customerId: owner.customerId };
  if (owner.sessionId) return { sessionId: owner.sessionId };
  return null;
}

async function claimDraftsForDeletion(owner: Owner, designIds: string[]): Promise<string[]> {
  const scope = ownerWhere(owner);
  if (!scope || designIds.length === 0) return [];
  await prisma.design.updateMany({
    where: { id: { in: designIds }, ...scope, status: "DRAFT" },
    data: { status: "ARCHIVED" },
  });
  const claimed = await prisma.design.findMany({
    where: { id: { in: designIds }, ...scope, status: "ARCHIVED" },
    select: { id: true },
  });
  return claimed.map((design) => design.id);
}

async function releaseDraftsClaim(owner: Owner, designIds: string[]): Promise<void> {
  const scope = ownerWhere(owner);
  if (!scope || designIds.length === 0) return;
  await prisma.design.updateMany({
    where: { id: { in: designIds }, ...scope, status: "ARCHIVED" },
    data: { status: "DRAFT" },
  });
}

/**
 * Poda «últimos N»: conserva los MAX_DRAFTS_PER_PRODUCT DRAFT más recientes del
 * dueño + producto y elimina los excedentes (registro + assets de Storage:
 * draftPreviewUrl y derivados, vía deleteDesignsWithAssets). Se invoca tras
 * crear un DRAFT nuevo por cualquier vía; es BEST-EFFORT por diseño del caller
 * (service.ts la envuelve en try/catch — una poda fallida nunca rompe la
 * creación). Los DRAFT referenciados por un carrito vivo o un pedido no cuentan
 * ni se borran (guarda conservadora, espejo de la retención). READY y
 * USED_IN_ORDER nunca entran: el filtro es status:"DRAFT".
 */
export async function trimExcessDraftDesigns(
  owner: Owner,
  productId: string,
  opts?: { protectDesignId?: string },
): Promise<{ trimmed: number }> {
  const scope = ownerWhere(owner);
  if (!scope) return { trimmed: 0 };

  const drafts = await prisma.design.findMany({
    where: { ...scope, productId, status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      updatedAt: true,
      canvasData: true,
      metadata: true,
      cartItems: { where: { cart: { deletedAt: null } }, select: { id: true }, take: 1 },
      orderItems: { select: { id: true }, take: 1 },
    },
  });

  const trimmable = drafts.filter((d) => d.cartItems.length === 0 && d.orderItems.length === 0);
  const withProgress = trimmable.filter(
    (d) =>
      d.id === opts?.protectDesignId ||
      designHasMeaningfulProgress({ canvasData: d.canvasData, metadata: d.metadata }),
  );
  const emptyCutoff = Date.now() - EMPTY_DRAFT_GRACE_MS;
  const excess = [
    ...withProgress.slice(MAX_DRAFTS_PER_PRODUCT),
    ...trimmable.filter(
      (d) =>
        d.id !== opts?.protectDesignId &&
        d.updatedAt.getTime() < emptyCutoff &&
        !designHasMeaningfulProgress({ canvasData: d.canvasData, metadata: d.metadata }),
    ),
  ];
  if (excess.length === 0) return { trimmed: 0 };

  const claimedIds = await claimDraftsForDeletion(
    owner,
    excess.map((d) => d.id),
  );
  let result: Awaited<ReturnType<typeof deleteDesignsWithAssets>>;
  try {
    result = await deleteDesignsWithAssets(claimedIds);
  } catch (err) {
    await releaseDraftsClaim(owner, claimedIds);
    throw err;
  }
  logger.info({
    event: "design.draft_trim",
    productId,
    ownerType: owner.customerId ? "customer" : "session",
    kept: Math.min(withProgress.length, MAX_DRAFTS_PER_PRODUCT),
    trimmed: result.designsPurged,
    assetsPurged: result.assetsPurged,
  });
  return { trimmed: result.designsPurged };
}

/**
 * Elimina UN borrador del cliente desde "Mis diseños" (botón «Eliminar» de la
 * tarjeta). Solo DRAFT del dueño: un READY/USED_IN_ORDER devuelve false (su
 * retiro es el archivado, que es otra acción). Los assets de Storage se borran
 * con el registro (deleteDesignsWithAssets).
 */
export async function deleteCustomerDraftDesign(
  designId: string,
  customerId: string,
): Promise<boolean> {
  const claim = await prisma.design.updateMany({
    where: { id: designId, customerId, status: "DRAFT" },
    data: { status: "ARCHIVED" },
  });
  if (claim.count !== 1) return false;
  try {
    const result = await deleteDesignsWithAssets([designId]);
    if (result.designsPurged > 0) {
      logger.info({ event: "design.draft_delete", designId, customerId });
    }
    return result.designsPurged > 0;
  } catch (err) {
    await prisma.design.updateMany({
      where: { id: designId, customerId, status: "ARCHIVED" },
      data: { status: "DRAFT" },
    });
    throw err;
  }
}

/**
 * «Vaciar borradores» de "Mis diseños": elimina TODOS los DRAFT del cliente con
 * sus assets. Conservadora como la retención: no toca borradores referenciados
 * por un carrito vivo o un pedido (defensa — el alta al carrito exige READY, así
 * que en la práctica ninguno lo está). READY/USED_IN_ORDER jamás entran.
 */
export async function emptyCustomerDraftDesigns(
  customerId: string,
): Promise<{ deleted: number; assetsPurged: number; remaining: number }> {
  const where = {
    customerId,
    status: "DRAFT" as const,
    cartItems: NO_LIVE_CART_ITEM,
    orderItems: { none: {} },
  };
  let deleted = 0;
  let assetsPurged = 0;
  let remaining = 0;

  for (;;) {
    const drafts = await prisma.design.findMany({ where, select: { id: true }, take: 200 });
    if (drafts.length === 0) break;
    const claimedIds = await claimDraftsForDeletion(
      { customerId, sessionId: null },
      drafts.map((d) => d.id),
    );
    let result: Awaited<ReturnType<typeof deleteDesignsWithAssets>>;
    try {
      result = await deleteDesignsWithAssets(claimedIds);
    } catch (err) {
      await releaseDraftsClaim({ customerId, sessionId: null }, claimedIds);
      throw err;
    }
    deleted += result.designsPurged;
    assetsPurged += result.assetsPurged;
    if (result.designsPurged < claimedIds.length) {
      await releaseDraftsClaim({ customerId, sessionId: null }, claimedIds);
      remaining = await prisma.design.count({ where });
      break;
    }
  }

  logger.info({ event: "design.drafts_emptied", customerId, deleted, assetsPurged, remaining });
  return { deleted, assetsPurged, remaining };
}
