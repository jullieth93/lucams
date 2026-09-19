/*
 * Retención POST-ENTREGA de fotos del Estudio (feedback Lucy 2026-09-18; Ley 1581, art. 4 lit. f —
 * temporalidad/minimización). Complementa a retention-service.ts (que purga lo ANÓNIMO abandonado):
 * acá la compra SÍ se concretó, así que la finalidad de las fotos crudas y de los renders 300 DPI
 * era producir y entregar el pedido. Cumplida esa finalidad —y vencida la ventana operativa de
 * reposición— conservarlos para siempre no lo justifica nada: un pedido puede dejar ~57 MB entre
 * fotos crudas (`customer-uploads`) y renders (`production-assets`), y el plan Free de Supabase
 * tiene 1 GB de Storage.
 *
 * POLÍTICA (decisión de negocio 2026-09-18): un diseño USED_IN_ORDER cuya orden asociada está
 * DELIVERED desde ≥ PURGE_DELIVERED_DESIGN_AFTER_DAYS (default 90 días, anclado a
 * `Order.deliveredAt` — el webhook de Aveonline, no al cambio de status a mano) se depura así:
 *   - SE BORRAN los bytes: fotos crudas del bucket privado `customer-uploads` (los DesignAsset del
 *     diseño) y los renders de `production-assets` (productionUrls[] + el legacy productionUrl +
 *     el área de paso `{designId}/_client/` de ADR-081).
 *   - SE CONSERVAN previewUrl (el preview público que ve el cliente en su pedido), canvasData y la
 *     fila Design (historial). El snapshot INMUTABLE del OrderItem (customDesign + designAssetUrl +
 *     metadata.designSnapshot) NO se toca: sus productionUrls quedan como punteros muertos, lo que
 *     la UI de admin ya tolera (los signed URLs simplemente no se emiten).
 *   - Se marca `Design.purgedAt` → idempotencia: la próxima corrida no lo vuelve a tocar.
 *
 * QUÉ SE HACE CON LOS DesignAsset: se BORRAN las filas junto con sus bytes (mismo criterio que la
 * purga anónima). La fila solo existía para apuntar a los bytes y sus metadatos (dimensiones,
 * tamaño) describen la foto de una persona — minimización también del registro. La evidencia de
 * consentimiento de derechos de imagen NO se pierde: vive a nivel pedido en
 * `Order.contentRightsAcceptedAt`, que se conserva (retención fiscal DIAN).
 *
 * REIMPRESIONES / POST-VENTA (por eso las exclusiones de abajo): el ZIP de imprenta
 * (getOrderProductionBundle, features/orders) y un remedio REPLACE de garantía necesitan los
 * productionUrls. Por eso el diseño NO se purga mientras:
 *   - alguna de sus órdenes siga EN CURSO (PAID / FULFILLING / SHIPPED / etc.) o entregada hace
 *     menos del plazo (un reorder reciente todavía puede necesitar reimpresión), o
 *   - tenga un RETRACTO abierto (PENDING / APPROVED / RECEIVED — Ley 1480 art. 47) o una GARANTÍA
 *     abierta (PENDING / IN_REVIEW / APPROVED — puede terminar en cambio = reimprimir).
 * Retracto REFUNDED/REJECTED y garantía RESOLVED/REJECTED son terminales: no bloquean.
 *
 * Mismo patrón best-effort que la purga anónima, endurecido: si falla el borrado de bytes de
 * CUALQUIERA de los dos buckets (crudas o renders — ambos son PII), NO se marca purgedAt ni se
 * borran los DesignAsset → el próximo ciclo reintenta y nunca quedan bytes sin registro en DB.
 * Se agenda por pg_cron (migración supabase 00000000000035) — ver docs/OPERATIONS.md y la política
 * en docs/COMPLIANCE.md.
 */

import "server-only";
import type { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { listStagedSlotPaths } from "./staged-slots";
import { removeStorage } from "./retention-service";

const CUSTOMER_UPLOADS_BUCKET = "customer-uploads";
const PRODUCTION_BUCKET = "production-assets";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días desde la entrega efectiva tras los cuales se purgan los bytes pesados del diseño. */
export const PURGE_DELIVERED_DESIGN_AFTER_DAYS = 90;

/** Retractos que todavía pueden necesitar los bytes (devolución en curso → reposición). */
const OPEN_RETRACT_STATUSES = ["PENDING", "APPROVED", "RECEIVED"] as const;
/** Garantías abiertas: un remedio REPLACE reimprime desde productionUrls. */
const OPEN_WARRANTY_STATUSES = ["PENDING", "IN_REVIEW", "APPROVED"] as const;
/** Orden todavía en flujo: producción/entrega pendiente → los renders se necesitan. */
const IN_FLIGHT_ORDER_STATUSES = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PAID",
  "FULFILLING",
  "SHIPPED",
] as const;

/**
 * Resuelve los días de retención: override explícito (tests) > env var (ajuste operativo sin
 * redeploy de código, p.ej. subir el plazo ante un pico de reimpresiones) > default del negocio.
 */
function resolveRetentionDays(overrideDays: number | undefined): number {
  if (overrideDays !== undefined) return overrideDays;
  const raw = process.env.PURGE_DELIVERED_DESIGN_AFTER_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : PURGE_DELIVERED_DESIGN_AFTER_DAYS;
}

export type PurgeDeliveredResult = { designsPurged: number; assetsPurged: number };

const CANDIDATE_SELECT = {
  id: true,
  productionUrl: true,
  productionUrls: true,
  assets: { select: { storageUrl: true } },
} satisfies Prisma.DesignSelect;

/**
 * Diseños USED_IN_ORDER purgables: al menos UNA orden entregada hace ≥ `days` (el gatillo) y
 * NINGUNA orden/item que todavía necesite los bytes (en curso, entregada reciente, retracto o
 * garantía abierta). `purgedAt: null` hace la selección idempotente.
 */
export function deliveredPurgeCandidateWhere(cutoff: Date): Prisma.DesignWhereInput {
  return {
    status: "USED_IN_ORDER",
    purgedAt: null,
    // Gatillo: existe una orden viva (no soft-borrada) entregada hace ≥ el plazo.
    orderItems: {
      some: { order: { deletedAt: null, status: "DELIVERED", deliveredAt: { lte: cutoff } } },
    },
    AND: [
      // Ninguna orden en curso ni entregada DENTRO del plazo (reorder reciente).
      {
        orderItems: {
          none: {
            order: {
              deletedAt: null,
              OR: [
                { status: { in: [...IN_FLIGHT_ORDER_STATUSES] } },
                {
                  status: "DELIVERED",
                  OR: [{ deliveredAt: null }, { deliveredAt: { gt: cutoff } }],
                },
              ],
            },
          },
        },
      },
      // Ningún retracto abierto en los items del diseño.
      { orderItems: { none: { retractRequest: { status: { in: [...OPEN_RETRACT_STATUSES] } } } } },
      // Ninguna garantía abierta (un REPLACE reimprime desde productionUrls).
      {
        orderItems: {
          none: { warrantyClaims: { some: { status: { in: [...OPEN_WARRANTY_STATUSES] } } } },
        },
      },
    ],
  };
}

/**
 * Purga los bytes pesados de los diseños de pedidos ya entregados hace ≥ `opts.olderThanDays`
 * (default PURGE_DELIVERED_DESIGN_AFTER_DAYS, sobreescribible por la env var homónima).
 * Conserva preview/canvas/fila y el snapshot del pedido; marca `purgedAt` solo si TODOS los bytes
 * quedaron borrados (idempotente, reintento seguro). `opts.batchSize` acota filas por corrida
 * (default 200 — cada diseño puede arrastrar decenas de MB).
 */
export async function purgeDeliveredDesignAssets(opts?: {
  olderThanDays?: number;
  batchSize?: number;
  /** Reloj inyectable (tests). */
  now?: Date;
}): Promise<PurgeDeliveredResult> {
  const now = opts?.now ?? new Date();
  const days = resolveRetentionDays(opts?.olderThanDays);
  const batchSize = opts?.batchSize ?? 200;
  const cutoff = new Date(now.getTime() - days * DAY_MS);

  const candidates = await prisma.design.findMany({
    where: deliveredPurgeCandidateWhere(cutoff),
    select: CANDIDATE_SELECT,
    take: batchSize,
  });
  if (candidates.length === 0) {
    logger.info({
      event: "retention.purge_delivered_designs",
      designsPurged: 0,
      assetsPurged: 0,
      days,
    });
    return { designsPurged: 0, assetsPurged: 0 };
  }

  const designIds = candidates.map((d) => d.id);
  const uploadPaths = candidates.flatMap((d) => d.assets.map((a) => a.storageUrl)).filter(Boolean);
  const productionPaths = candidates
    .flatMap((d) => [d.productionUrl, ...d.productionUrls])
    .filter((p): p is string => !!p);
  // Área de paso `{designId}/_client/` (ADR-081): si quedaron snapshots huérfanos de un finalize
  // interrumpido, también son renders de las fotos del cliente → fuera.
  const stagedPaths = await listStagedSlotPaths(PRODUCTION_BUCKET, designIds);

  // Bytes PRIMERO. A diferencia de la purga anónima (donde solo las crudas bloquean), acá AMBOS
  // buckets bloquean: los renders de producción también son PII (las fotos del cliente compuestas)
  // y marcar purgedAt con bytes vivos los dejaría retenidos para siempre sin registro que los
  // vuelva a candidatar.
  const uploadsOk = await removeStorage(CUSTOMER_UPLOADS_BUCKET, uploadPaths);
  const productionOk = await removeStorage(PRODUCTION_BUCKET, [...productionPaths, ...stagedPaths]);
  if (!uploadsOk || !productionOk) {
    logger.warn({
      event: "retention.purge_delivered_designs.storage_incomplete",
      uploadsOk,
      productionOk,
      candidates: designIds.length,
    });
    return { designsPurged: 0, assetsPurged: 0 };
  }

  // Transacción: marca de idempotencia + limpieza de punteros muertos + filas DesignAsset (sus
  // bytes ya no existen — ver cabecera). El snapshot del OrderItem NO se toca (inmutable).
  await prisma.$transaction([
    prisma.design.updateMany({
      where: { id: { in: designIds } },
      data: { purgedAt: now, productionUrl: null, productionUrls: [] },
    }),
    prisma.designAsset.deleteMany({ where: { designId: { in: designIds } } }),
  ]);

  logger.info({
    event: "retention.purge_delivered_designs",
    designsPurged: candidates.length,
    assetsPurged: uploadPaths.length,
    productionFilesPurged: productionPaths.length + stagedPaths.length,
    olderThanDays: days,
  });
  return { designsPurged: candidates.length, assetsPurged: uploadPaths.length };
}
