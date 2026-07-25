/*
 * Retención de fotos del Estudio (Ley 1581, art. 4 lit. f — temporalidad/minimización).
 *
 * El bucket privado `customer-uploads` guarda las fotos crudas del cliente (a veces rostros, subidas
 * también por el flujo ANÓNIMO sin cuenta). La supresión por cuenta (delete-service.ts) solo alcanza
 * datos con customerId; los diseños DRAFT ANÓNIMOS abandonados (customerId=null) no los cubre nadie
 * y se acumulan indefinidamente → PII sensible retenida sin finalidad + costo de Storage creciente.
 *
 * Este job PURGA de forma segura y conservadora:
 *   1) Diseños DRAFT anónimos, viejos (updatedAt < corte) y que ya nadie reclama → borra sus fotos
 *      del bucket + sus DesignAsset + el Design.
 *   2) Diseños READY anónimos que pasaron por una COTIZACIÓN ya vencida (ver ciclo de vida abajo).
 *   3) DesignAsset anónimos HUÉRFANOS (nunca ligados a un diseño), viejos → borra bytes + fila.
 *
 * ── Qué significa "ya nadie lo reclama" (auditoría 2026-07-21 · C-gap2, Ley 1581 art. 5) ──
 * Antes bastaba con existir UN CartItem para blindar el diseño: `cartItems: { none: {} }`. Pero
 * `clearCartAfterPaid` (features/orders) SOFT-borra el Cart y deja vivos sus CartItem, y la
 * cotización de Etapa 1 vacía el carrito justo con esa función. Resultado: toda foto de invitado que
 * llegó a una cotización conservaba un CartItem para siempre → retención indefinida de imágenes de
 * personas (a veces menores). Por eso un CartItem solo protege mientras su Cart siga VIVO
 * (deletedAt = null); el carrito soft-borrado es un carrito muerto (el siguiente lookup crea uno
 * nuevo — features/cart/service.ts).
 *
 * ── Ciclo de vida de las fotos cotizadas ──
 * La finalidad de la foto es producir el pedido si la cotización se concreta, así que mientras la
 * cotización esté VIVA se conserva; cuando se apaga, se conserva un tiempo más y luego se purga:
 *   - PENDING / CONTACTED (no borrada): en curso → se conserva. Techo de un año sin movimiento
 *     (Quote.updatedAt) para que una cotización que nadie volvió a tocar no retenga fotos por
 *     siempre.
 *   - CLOSED (venta concretada fuera de la tienda) / DISCARDED / cotización borrada: terminal → se
 *     conservan PURGE_AFTER_QUOTE_CLOSED_DAYS días desde el último movimiento, ventana para
 *     producir, reimprimir o reponer, y después se purgan.
 * Los plazos son decisión de negocio revisable: la norma no fija un número, exige conservar solo por
 * el tiempo razonable y necesario a la finalidad (principio de finalidad, Ley 1581 art. 4 lit. b;
 * el desarrollo reglamentario de la vigencia de las bases de datos está en el Decreto 1377 de 2013
 * [pendiente verificación del artículo exacto]). Al purgar se limpia también QuoteItem.previewUrl:
 * ese preview muestra la misma cara y sus bytes ya no existen.
 *
 * NO toca: diseños de clientes logueados (los rige el ciclo de vida de la cuenta), USED_IN_ORDER /
 * ARCHIVED, READY nunca cotizados, ni nada referenciado por un carrito vivo o un pedido. Política
 * documentada en docs/COMPLIANCE.md. Se agenda por pg_cron (mandato #11) — ver docs/OPERATIONS.md.
 */

import "server-only";
import type { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { listStagedSlotPaths } from "./staged-slots";

const CUSTOMER_UPLOADS_BUCKET = "customer-uploads";
export const PREVIEWS_BUCKET = "design-previews";
const PRODUCTION_BUCKET = "production-assets";

/** Un diseño DRAFT anónimo sin actividad por este tiempo se considera abandonado y se purga. */
export const PURGE_ANON_DESIGN_AFTER_DAYS = 30;

/**
 * Gracia tras apagarse la cotización (CLOSED / DISCARDED / borrada) antes de purgar sus fotos.
 * Cubre producir y reponer una venta cerrada por WhatsApp sin retener la imagen indefinidamente.
 */
export const PURGE_AFTER_QUOTE_CLOSED_DAYS = 90;

/**
 * Techo para cotizaciones que nunca se resolvieron (PENDING / CONTACTED sin movimiento): pasado
 * este tiempo la finalidad ya no está vigente y las fotos se purgan aunque el estado siga abierto.
 */
export const PURGE_STALE_QUOTE_AFTER_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Extrae el path de storage de una URL pública (previews). Si ya es un path, lo devuelve tal cual. */
export function pathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i >= 0) return url.slice(i + marker.length);
  return url.startsWith("http") ? null : url;
}

/**
 * Borra bytes de un bucket. Best-effort: devuelve `false` si falló (para que el caller NO borre las
 * filas y el próximo ciclo reintente → evita huérfanos de bytes sin registro en DB). Resiliente a que
 * el service client no esté disponible (no revienta el job).
 */
export async function removeStorage(bucket: string, paths: string[]): Promise<boolean> {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return true;
  try {
    const { error } = await supabaseService.storage.from(bucket).remove(clean);
    if (error) {
      logger.error({ event: "retention.storage_remove_fail", bucket, err: error.message });
      return false;
    }
    return true;
  } catch (err) {
    logger.error({
      event: "retention.storage_remove_throw",
      bucket,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export type PurgeResult = { designsPurged: number; assetsPurged: number };

export type QuoteRetentionOptions = {
  /** Días de gracia tras el cierre de la cotización (default PURGE_AFTER_QUOTE_CLOSED_DAYS). */
  quoteClosedGraceDays?: number;
  /** Techo para cotizaciones abiertas sin movimiento (default PURGE_STALE_QUOTE_AFTER_DAYS). */
  staleQuoteDays?: number;
  /** Reloj inyectable (tests). */
  now?: Date;
};

/**
 * Cotizaciones cuya finalidad SIGUE vigente → sus fotos no se purgan. Se usa en negativo
 * (`quoteItems: { none: { quote: ... } }`): el diseño solo es purgable si NINGUNA de sus
 * cotizaciones cae aquí.
 */
export function activeQuoteWhere(opts?: QuoteRetentionOptions): Prisma.QuoteWhereInput {
  const now = opts?.now ?? new Date();
  const graceDays = opts?.quoteClosedGraceDays ?? PURGE_AFTER_QUOTE_CLOSED_DAYS;
  const staleDays = opts?.staleQuoteDays ?? PURGE_STALE_QUOTE_AFTER_DAYS;
  return {
    OR: [
      // Abierta y con movimiento dentro del techo: Lucy todavía puede concretarla.
      {
        deletedAt: null,
        status: { in: ["PENDING", "CONTACTED"] },
        updatedAt: { gte: new Date(now.getTime() - staleDays * DAY_MS) },
      },
      // Cualquier cotización (también la cerrada, descartada o borrada) dentro de la gracia.
      { updatedAt: { gte: new Date(now.getTime() - graceDays * DAY_MS) } },
    ],
  };
}

/**
 * Un CartItem solo protege el diseño mientras su Cart siga vivo — ver cabecera: el carrito
 * soft-borrado (checkout pagado o cotización creada) deja items colgando para siempre.
 */
const NO_LIVE_CART_ITEM = {
  none: { cart: { deletedAt: null } },
} satisfies Prisma.DesignWhereInput["cartItems"];

const CANDIDATE_SELECT = {
  id: true,
  previewUrl: true,
  productionUrls: true,
  assets: { select: { storageUrl: true } },
} satisfies Prisma.DesignSelect;

type PurgeCandidate = {
  id: string;
  previewUrl: string | null;
  productionUrls: string[];
  assets: Array<{ storageUrl: string }>;
};

/**
 * Borra los bytes y luego las filas de un lote de diseños. Si falla la remoción de las fotos crudas
 * NO borra nada (devuelve ceros) → el próximo ciclo reintenta y nunca quedan bytes sin registro.
 */
async function purgeDesignBatch(designs: PurgeCandidate[]): Promise<PurgeResult> {
  if (designs.length === 0) return { designsPurged: 0, assetsPurged: 0 };

  const designIds = designs.map((d) => d.id);
  const uploadPaths = designs.flatMap((d) => d.assets.map((a) => a.storageUrl)).filter(Boolean);
  const previewPaths = designs
    .map((d) => (d.previewUrl ? pathFromPublicUrl(d.previewUrl, PREVIEWS_BUCKET) : null))
    .filter((p): p is string => !!p);
  const productionPaths = designs.flatMap((d) => d.productionUrls).filter(Boolean);
  // ADR-081 — el área de paso `{designId}/_client/` no se persiste en ninguna columna, así que sin
  // esto los snapshots de un diseño ABANDONADO tras subirlos se quedaban en el bucket para siempre.
  // Son el render de las fotos del cliente: conservarlos contradice el principio de temporalidad.
  const stagedPaths = await listStagedSlotPaths(PRODUCTION_BUCKET, designIds);

  // Bytes PRIMERO (best-effort). Si la remoción de las fotos crudas falla, NO borramos las filas
  // → el próximo ciclo reintenta y no dejamos bytes sin registro. Previews/producción son
  // secundarios (públicos/derivados); su fallo no bloquea.
  const uploadsOk = await removeStorage(CUSTOMER_UPLOADS_BUCKET, uploadPaths);
  await removeStorage(PREVIEWS_BUCKET, previewPaths);
  await removeStorage(PRODUCTION_BUCKET, [...productionPaths, ...stagedPaths]);
  if (!uploadsOk) return { designsPurged: 0, assetsPurged: 0 };

  // DesignAsset.design es onDelete:SetNull → hay que borrar las filas explícitamente para no
  // dejar assets huérfanos. Atómico con el borrado del Design.
  await prisma.$transaction([
    // El preview snapshoteado en la cotización apunta a los bytes que acabamos de borrar y muestra
    // la misma cara: dejar la URL colgada rompería /cotizacion/<token> y conservaría el puntero.
    prisma.quoteItem.updateMany({
      where: { designId: { in: designIds }, previewUrl: { not: null } },
      data: { previewUrl: null },
    }),
    prisma.designAsset.deleteMany({ where: { designId: { in: designIds } } }),
    prisma.design.deleteMany({ where: { id: { in: designIds } } }),
  ]);

  return { designsPurged: designs.length, assetsPurged: uploadPaths.length };
}

/**
 * Purga los diseños anónimos que ya nadie reclama y los assets anónimos huérfanos.
 * @param opts.olderThanDays antigüedad mínima del diseño (default PURGE_ANON_DESIGN_AFTER_DAYS).
 * @param opts.batchSize máximo de filas por corrida y por pasada (default 500) — el cron corre
 *   periódicamente.
 * @param opts.sessionIdPrefix si se pasa, ACOTA la purga a sesiones cuyo sessionId empieza con este
 *   prefijo (útil para purgas dirigidas y para aislar tests en la Supabase de dev compartida). En
 *   producción el cron lo omite → barrido global de todos los anónimos abandonados.
 * @param opts.quoteClosedGraceDays / opts.staleQuoteDays / opts.now ver QuoteRetentionOptions.
 */
export async function purgeAbandonedAnonymousDesigns(
  opts?: {
    olderThanDays?: number;
    batchSize?: number;
    sessionIdPrefix?: string;
  } & QuoteRetentionOptions,
): Promise<PurgeResult> {
  const now = opts?.now ?? new Date();
  const days = opts?.olderThanDays ?? PURGE_ANON_DESIGN_AFTER_DAYS;
  const batchSize = opts?.batchSize ?? 500;
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const sessionScope = opts?.sessionIdPrefix
    ? { sessionId: { startsWith: opts.sessionIdPrefix } }
    : {};
  const stillNeeded = activeQuoteWhere(opts);

  let designsPurged = 0;
  let assetsPurged = 0;

  // 1) Diseños DRAFT anónimos abandonados: sin carrito vivo, sin pedido y sin cotización vigente.
  const drafts = await prisma.design.findMany({
    where: {
      status: "DRAFT",
      customerId: null,
      updatedAt: { lt: cutoff },
      cartItems: NO_LIVE_CART_ITEM,
      orderItems: { none: {} },
      quoteItems: { none: { quote: stillNeeded } },
      ...sessionScope,
    },
    select: CANDIDATE_SELECT,
    take: batchSize,
  });
  const draftResult = await purgeDesignBatch(drafts);
  designsPurged += draftResult.designsPurged;
  assetsPurged += draftResult.assetsPurged;

  // 2) Diseños READY anónimos que SÍ pasaron por una cotización y cuyas cotizaciones ya se
  //    apagaron. El READY nunca cotizado no se toca (sigue la política anterior): esta pasada
  //    existe solo para cerrar la retención indefinida de las fotos cotizadas.
  const quoted = await prisma.design.findMany({
    where: {
      status: "READY",
      customerId: null,
      updatedAt: { lt: cutoff },
      cartItems: NO_LIVE_CART_ITEM,
      orderItems: { none: {} },
      ...sessionScope,
      AND: [{ quoteItems: { some: {} } }, { quoteItems: { none: { quote: stillNeeded } } }],
    },
    select: CANDIDATE_SELECT,
    take: batchSize,
  });
  const quotedResult = await purgeDesignBatch(quoted);
  designsPurged += quotedResult.designsPurged;
  assetsPurged += quotedResult.assetsPurged;

  // 3) DesignAsset anónimos huérfanos (subidos pero nunca ligados a un diseño), viejos.
  const orphans = await prisma.designAsset.findMany({
    where: { designId: null, customerId: null, createdAt: { lt: cutoff }, ...sessionScope },
    select: { id: true, storageUrl: true },
    take: batchSize,
  });
  if (orphans.length > 0) {
    const ok = await removeStorage(
      CUSTOMER_UPLOADS_BUCKET,
      orphans.map((a) => a.storageUrl),
    );
    if (ok) {
      await prisma.designAsset.deleteMany({ where: { id: { in: orphans.map((a) => a.id) } } });
      assetsPurged += orphans.length;
    }
  }

  logger.info({
    event: "retention.purge_anon_designs",
    designsPurged,
    quotedDesignsPurged: quotedResult.designsPurged,
    assetsPurged,
    olderThanDays: days,
  });
  return { designsPurged, assetsPurged };
}
