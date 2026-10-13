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
 *   1. REUSO al entrar (findReusableDraftDesign): la página del Estudio retoma
 *      el DRAFT más reciente del mismo dueño + producto (+ variante, si la URL
 *      la fija explícitamente) en vez de crear uno nuevo. Los CLONES
 *      (cloneDesignForEdit / cloneDesignForReorder) NO pasan por acá: son
 *      intencionales y siguen creando un DRAFT nuevo.
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
import {
  deleteDesignsWithAssets,
  PURGE_ANON_DESIGN_AFTER_DAYS,
  PURGE_IDLE_DESIGN_AFTER_DAYS,
} from "./retention-service";

/**
 * 2026-10-13 — techo de borradores CONSERVADOS por dueño + producto: tras crear
 * un DRAFT nuevo (Estudio, clon de edición, reorder, nombre, set de letras) se
 * podan los excedentes más viejos. 3 da margen para un diseño en curso + un par
 * de intentos recientes sin dejar crecer "Mis diseños" indefinidamente; los
 * finalizados (READY) nunca entran en esta cuenta.
 */
export const MAX_DRAFTS_PER_PRODUCT = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

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

/**
 * Ventana de actividad para considerar un DRAFT "activo": la misma que aplica la
 * retención a su dueño (30 d anónimo / 90 d logueado, por updatedAt). Un borrador
 * fuera de ventana puede desaparecer en la próxima purga: retomarlo sería
 * prometer un avance que revienta a mitad de edición.
 */
function draftActiveCutoff(owner: Owner, now: Date): Date {
  const days = owner.customerId ? PURGE_IDLE_DESIGN_AFTER_DAYS : PURGE_ANON_DESIGN_AFTER_DAYS;
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * DRAFT reutilizable más reciente del dueño para el producto, o null si no hay.
 *
 * Guardas (un borrador "sigue activo" solo si cumple TODAS): status DRAFT, del
 * mismo producto, con actividad dentro de la ventana de retención de su dueño,
 * sin carrito vivo ni pedido que lo referencie. La variante se evalúa en JS
 * sobre metadata.variantId: si el caller la fija (la URL traía ?variant=
 * explícita) solo reusa un borrador de ESA variante o uno legacy sin variante
 * persistida; si no la fija (entrada pelada a /estudio/<slug>), cualquier
 * variante sirve — el recover reabre el Estudio con la variante guardada en el
 * propio diseño (resolveRecoverVariantId).
 */
export async function findReusableDraftDesign(
  opts: Owner & {
    productId: string;
    /** Variante explícita de la URL; null/undefined = cualquier variante. */
    variantId?: string | null;
    /** Reloj inyectable (tests). */
    now?: Date;
  },
): Promise<{ id: string } | null> {
  const scope = ownerWhere(opts);
  if (!scope) return null;
  const now = opts.now ?? new Date();

  const candidates = await prisma.design.findMany({
    where: {
      ...scope,
      productId: opts.productId,
      status: "DRAFT",
      updatedAt: { gte: draftActiveCutoff(opts, now) },
      cartItems: NO_LIVE_CART_ITEM,
      orderItems: { none: {} },
    },
    orderBy: { updatedAt: "desc" },
    // Tras la poda «últimos N» el universo por dueño+producto es chico; el take
    // acota cuentas legacy con acumulados históricos.
    take: 20,
    select: { id: true, metadata: true },
  });

  const requestedVariant = opts.variantId ?? null;
  for (const c of candidates) {
    if (!requestedVariant) return { id: c.id };
    const meta = c.metadata as Record<string, unknown> | null;
    const draftVariant = typeof meta?.variantId === "string" ? meta.variantId : null;
    // Legacy sin variante persistida: elegible (el recover deriva la variante del
    // canvasData, igual que al retomarlo desde "Mis diseños").
    if (draftVariant === null || draftVariant === requestedVariant) return { id: c.id };
  }
  return null;
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
): Promise<{ trimmed: number }> {
  const scope = ownerWhere(owner);
  if (!scope) return { trimmed: 0 };

  const drafts = await prisma.design.findMany({
    where: { ...scope, productId, status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      cartItems: { where: { cart: { deletedAt: null } }, select: { id: true }, take: 1 },
      orderItems: { select: { id: true }, take: 1 },
    },
  });

  // Los referenciados por carrito vivo/pedido quedan FUERA de la cuenta y del
  // borrado: un borrador blindado no desplaza ni se poda.
  const trimmable = drafts.filter((d) => d.cartItems.length === 0 && d.orderItems.length === 0);
  const excess = trimmable.slice(MAX_DRAFTS_PER_PRODUCT);
  if (excess.length === 0) return { trimmed: 0 };

  const result = await deleteDesignsWithAssets(excess.map((d) => d.id));
  logger.info({
    event: "design.draft_trim",
    productId,
    ownerType: owner.customerId ? "customer" : "session",
    kept: Math.min(trimmable.length, MAX_DRAFTS_PER_PRODUCT),
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
  const design = await prisma.design.findFirst({
    where: { id: designId, customerId, status: "DRAFT" },
    select: { id: true },
  });
  if (!design) return false;
  const result = await deleteDesignsWithAssets([design.id]);
  if (result.designsPurged > 0) {
    logger.info({ event: "design.draft_delete", designId, customerId });
  }
  return result.designsPurged > 0;
}

/**
 * «Vaciar borradores» de "Mis diseños": elimina TODOS los DRAFT del cliente con
 * sus assets. Conservadora como la retención: no toca borradores referenciados
 * por un carrito vivo o un pedido (defensa — el alta al carrito exige READY, así
 * que en la práctica ninguno lo está). READY/USED_IN_ORDER jamás entran.
 */
export async function emptyCustomerDraftDesigns(customerId: string): Promise<{ deleted: number }> {
  const drafts = await prisma.design.findMany({
    where: {
      customerId,
      status: "DRAFT",
      cartItems: NO_LIVE_CART_ITEM,
      orderItems: { none: {} },
    },
    select: { id: true },
    take: 200,
  });
  const result = await deleteDesignsWithAssets(drafts.map((d) => d.id));
  logger.info({
    event: "design.drafts_emptied",
    customerId,
    deleted: result.designsPurged,
    assetsPurged: result.assetsPurged,
  });
  return { deleted: result.designsPurged };
}
