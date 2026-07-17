/*
 * Retención de fotos del Estudio (Ley 1581, art. 4 lit. f — temporalidad/minimización).
 *
 * El bucket privado `customer-uploads` guarda las fotos crudas del cliente (a veces rostros, subidas
 * también por el flujo ANÓNIMO sin cuenta). La supresión por cuenta (delete-service.ts) solo alcanza
 * datos con customerId; los diseños DRAFT ANÓNIMOS abandonados (customerId=null) no los cubre nadie
 * y se acumulan indefinidamente → PII sensible retenida sin finalidad + costo de Storage creciente.
 *
 * Este job PURGA de forma segura y conservadora:
 *   1) Diseños DRAFT anónimos, viejos (updatedAt < corte) y SIN cart/pedido vivo → borra sus fotos
 *      del bucket + sus DesignAsset + el Design.
 *   2) DesignAsset anónimos HUÉRFANOS (nunca ligados a un diseño), viejos → borra bytes + fila.
 *
 * NO toca: diseños de clientes logueados (los rige el ciclo de vida de la cuenta), READY /
 * USED_IN_ORDER / ARCHIVED, ni nada referenciado por un carrito o pedido. Política documentada en
 * docs/COMPLIANCE.md. Se agenda por pg_cron (mandato #11) — ver docs/OPERATIONS.md.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

const CUSTOMER_UPLOADS_BUCKET = "customer-uploads";
const PREVIEWS_BUCKET = "design-previews";
const PRODUCTION_BUCKET = "production-assets";

/** Un diseño DRAFT anónimo sin actividad por este tiempo se considera abandonado y se purga. */
export const PURGE_ANON_DESIGN_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Extrae el path de storage de una URL pública (previews). Si ya es un path, lo devuelve tal cual. */
function pathFromPublicUrl(url: string, bucket: string): string | null {
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
async function removeStorage(bucket: string, paths: string[]): Promise<boolean> {
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

/**
 * Purga los diseños DRAFT anónimos abandonados y los assets anónimos huérfanos.
 * @param opts.olderThanDays antigüedad mínima (default PURGE_ANON_DESIGN_AFTER_DAYS).
 * @param opts.batchSize máximo de filas por corrida (default 500) — el cron corre periódicamente.
 * @param opts.sessionIdPrefix si se pasa, ACOTA la purga a sesiones cuyo sessionId empieza con este
 *   prefijo (útil para purgas dirigidas y para aislar tests en la Supabase de dev compartida). En
 *   producción el cron lo omite → barrido global de todos los anónimos abandonados.
 */
export async function purgeAbandonedAnonymousDesigns(opts?: {
  olderThanDays?: number;
  batchSize?: number;
  sessionIdPrefix?: string;
}): Promise<PurgeResult> {
  const days = opts?.olderThanDays ?? PURGE_ANON_DESIGN_AFTER_DAYS;
  const batchSize = opts?.batchSize ?? 500;
  const cutoff = new Date(Date.now() - days * DAY_MS);
  const sessionScope = opts?.sessionIdPrefix
    ? { sessionId: { startsWith: opts.sessionIdPrefix } }
    : {};

  let designsPurged = 0;
  let assetsPurged = 0;

  // 1) Diseños DRAFT anónimos abandonados, sin carrito ni pedido vivos.
  const designs = await prisma.design.findMany({
    where: {
      status: "DRAFT",
      customerId: null,
      updatedAt: { lt: cutoff },
      cartItems: { none: {} },
      orderItems: { none: {} },
      ...sessionScope,
    },
    select: {
      id: true,
      previewUrl: true,
      productionUrls: true,
      assets: { select: { storageUrl: true } },
    },
    take: batchSize,
  });

  if (designs.length > 0) {
    const designIds = designs.map((d) => d.id);
    const uploadPaths = designs.flatMap((d) => d.assets.map((a) => a.storageUrl)).filter(Boolean);
    const previewPaths = designs
      .map((d) => (d.previewUrl ? pathFromPublicUrl(d.previewUrl, PREVIEWS_BUCKET) : null))
      .filter((p): p is string => !!p);
    const productionPaths = designs.flatMap((d) => d.productionUrls).filter(Boolean);

    // Bytes PRIMERO (best-effort). Si la remoción de las fotos crudas falla, NO borramos las filas
    // → el próximo ciclo reintenta y no dejamos bytes sin registro. Previews/producción son
    // secundarios (públicos/derivados); su fallo no bloquea.
    const uploadsOk = await removeStorage(CUSTOMER_UPLOADS_BUCKET, uploadPaths);
    await removeStorage(PREVIEWS_BUCKET, previewPaths);
    await removeStorage(PRODUCTION_BUCKET, productionPaths);

    if (uploadsOk) {
      // DesignAsset.design es onDelete:SetNull → hay que borrar las filas explícitamente para no
      // dejar assets huérfanos. Atómico con el borrado del Design.
      await prisma.$transaction([
        prisma.designAsset.deleteMany({ where: { designId: { in: designIds } } }),
        prisma.design.deleteMany({ where: { id: { in: designIds } } }),
      ]);
      designsPurged = designs.length;
      assetsPurged += uploadPaths.length;
    }
  }

  // 2) DesignAsset anónimos huérfanos (subidos pero nunca ligados a un diseño), viejos.
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
    assetsPurged,
    olderThanDays: days,
  });
  return { designsPurged, assetsPurged };
}
