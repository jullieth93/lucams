/*
 * Retención de carritos y registros de abandono (2026-10-12 — punto ciego detectado tras la
 * fuga de ~316 MB de huérfanos en PRD).
 *
 * Hasta hoy Cart y AbandonedCart NUNCA expiraban. Dos problemas:
 *   1) Un Cart VIVO blinda indefinidamente los diseños que referencia: el guard
 *      `NO_LIVE_CART_ITEM` de features/personalization/retention-service.ts excluye de la
 *      purga cualquier diseño con un CartItem cuyo Cart tenga deletedAt=null — un carrito
 *      abandonado hace 2 años retenía para siempre las fotos crudas de sus diseños (Ley 1581,
 *      art. 4 lit. f: sin finalidad vigente no hay retención).
 *   2) Filas efímeras se acumulan sin tope (Cart es data efímera — ver mergeAnonCartIntoCustomer).
 *
 * Política:
 *   - Cart VIVO (deletedAt=null) sin actividad ≥ 60 días → HARD-DELETE. Es el patrón del repo
 *     para carts (mergeAnonCartIntoCustomer: "Cart es data efímera sin valor de auditoría —
 *     además sessionId @unique no respeta deletedAt, así que un soft-delete bloquearía reusar
 *     ese sessionId"). CartItem cae por CASCADE.
 *   - Cart vacío sin actividad ≥ 7 días → HARD-DELETE igual (no contiene nada; el próximo add
 *     recrea el carrito con la misma cookie — invisible para el cliente).
 *   - Guard de recuperación: NO se toca un cart con registro en AbandonedCart — el link del
 *     email de recuperación podría seguir vivo. Como AbandonedCart se purga a los 90 días
 *     (abajo), un cart abandonado queda libre para esta purga cuando su link ya no es útil.
 *   - AbandonedCart con ≥ 90 días → se borra la fila (recuperado o no: el email deja de ser
 *     útil — los recordatorios solo se envían dentro de los primeros 7 días, ver
 *     recovery-service.ts). Borrar la fila NO toca el cart.
 *
 * Coordinación con la purga de diseños: acá NO se borran diseños. Al caer el cart, sus
 * Designs quedan libres del guard del carrito vivo y los purga la pasada normal
 * (purgeAbandonedAnonymousDesigns / purgeIdleCustomerDesigns / purgeIdleReadyDesigns) si
 * cumplen su propio TTL. Por eso en el cron esta pasada corre ANTES que las de diseños.
 *
 * Corre desde el cron existente `/api/cron/purge-anon-designs`. Política documentada en
 * docs/COMPLIANCE.md.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Cart vivo sin actividad por este tiempo se considera abandonado y se purga. */
export const PURGE_STALE_CART_AFTER_DAYS = 60;

/** Cart VACÍO sin actividad por este tiempo se purga (no contiene nada que conservar). */
export const PURGE_EMPTY_CART_AFTER_DAYS = 7;

/** Registro de carrito abandonado más viejo que esto ya no sirve (el email expiró su utilidad). */
export const PURGE_ABANDONED_CART_AFTER_DAYS = 90;

/** Purga registros AbandonedCart viejos (recuperados o no). Acotado por batch. */
export async function purgeAbandonedCarts(opts?: {
  olderThanDays?: number;
  batchSize?: number;
  now?: Date;
}): Promise<{ abandonedPurged: number }> {
  const now = opts?.now ?? new Date();
  const days = opts?.olderThanDays ?? PURGE_ABANDONED_CART_AFTER_DAYS;
  const batchSize = opts?.batchSize ?? 500;
  const cutoff = new Date(now.getTime() - days * DAY_MS);

  const rows = await prisma.abandonedCart.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    take: batchSize,
  });
  if (rows.length === 0) return { abandonedPurged: 0 };

  await prisma.abandonedCart.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  logger.info({
    event: "retention.purge_abandoned_carts",
    abandonedPurged: rows.length,
    olderThanDays: days,
  });
  return { abandonedPurged: rows.length };
}

/**
 * Purga carts VIVOS abandonados: sin actividad ≥ staleDays, o vacíos sin actividad ≥
 * emptyDays. Hard-delete (CartItem en cascada). NO toca carts soft-borrados (ya están fuera
 * de todo guard) ni carts con registro AbandonedCart (link de recuperación potencialmente
 * vivo — purgeAbandonedCarts los libera a los 90 días). Tampoco borra los Designs
 * referenciados: quedan libres para la purga normal de diseños.
 */
export async function purgeStaleCarts(opts?: {
  staleDays?: number;
  emptyDays?: number;
  batchSize?: number;
  now?: Date;
}): Promise<{ cartsPurged: number }> {
  const now = opts?.now ?? new Date();
  const staleDays = opts?.staleDays ?? PURGE_STALE_CART_AFTER_DAYS;
  const emptyDays = opts?.emptyDays ?? PURGE_EMPTY_CART_AFTER_DAYS;
  const batchSize = opts?.batchSize ?? 500;
  const staleCutoff = new Date(now.getTime() - staleDays * DAY_MS);
  const emptyCutoff = new Date(now.getTime() - emptyDays * DAY_MS);

  const carts = await prisma.cart.findMany({
    where: {
      deletedAt: null,
      abandoned: null, // sin link de recuperación vigente (ya purgado o nunca existió)
      OR: [
        { updatedAt: { lt: staleCutoff } },
        { items: { none: {} }, updatedAt: { lt: emptyCutoff } },
      ],
    },
    select: { id: true },
    take: batchSize,
  });
  if (carts.length === 0) return { cartsPurged: 0 };

  await prisma.cart.deleteMany({ where: { id: { in: carts.map((c) => c.id) } } });
  logger.info({
    event: "retention.purge_stale_carts",
    cartsPurged: carts.length,
    staleDays,
    emptyDays,
  });
  return { cartsPurged: carts.length };
}
