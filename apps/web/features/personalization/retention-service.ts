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
 *   2) DesignAsset anónimos HUÉRFANOS (nunca ligados a un diseño), viejos → borra bytes + fila.
 *
 * Un CartItem solo protege el diseño mientras su Cart siga VIVO (deletedAt = null); los carritos
 * soft-borrados ya no retienen fotos. Nada referenciado por un pedido se purga: USED_IN_ORDER y
 * los ARCHIVED desde USED_IN_ORDER los rige retention-delivered.ts.
 *
 * NO toca nada referenciado por un carrito vivo o un pedido. USED_IN_ORDER y los
 * ARCHIVED desde USED_IN_ORDER los rige retention-delivered.ts; los ARCHIVED desde READY
 * entran en la misma retención de un READY abandonado. Los DRAFT
 * de clientes logueados los purga purgeIdleCustomerDesigns (abajo) tras 30 días sin actividad;
 * los READY abandonados (que nunca llegaron a pedido) los purga
 * purgeIdleReadyDesigns (ADR-130, 2026-10-08) — antes quedaban retenidos para siempre con sus
 * renders 300-DPI (la fuga que infló el storage de STG sobre la cuota Free).
 * Política documentada en docs/COMPLIANCE.md. Se agenda por pg_cron (mandato #11) — ver
 * docs/OPERATIONS.md.
 *
 * Además este módulo expone el BARRIDO DE HUÉRFANOS de Storage (sweepOrphanStorageObjects,
 * 2026-10-12): las purgas borran bytes al borrar el diseño, pero objetos cuyo Design YA no
 * existe (deriva histórica — 316 MB medidos en PRD) no los ve nadie; el barrido los
 * reclasifica contra la tabla Design y los borra, acotado por batch y con doble verificación.
 */

import "server-only";
import type { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { listStagedSlotPaths } from "./staged-slots";
import { designPreviewDerivedPaths } from "./preview-artifacts";
import { PREVIEW_ROUTE_PREFIX, parsePreviewStoragePath } from "./preview-access";

const CUSTOMER_UPLOADS_BUCKET = "customer-uploads";
export const PREVIEWS_BUCKET = "design-previews";
const PRODUCTION_BUCKET = "production-assets";

/** Un diseño DRAFT anónimo sin actividad por este tiempo se considera abandonado y se purga. */
export const PURGE_ANON_DESIGN_AFTER_DAYS = 7;

/** Un diseño DRAFT de cliente logueado sin actividad por este tiempo se purga. */
export const PURGE_IDLE_DESIGN_AFTER_DAYS = 30;

/** Un diseño READY sin actividad por este tiempo se considera abandonado y se purga. */
export const PURGE_IDLE_READY_AFTER_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * En previews de Vercel los plazos de retención se acotan a este techo. Un override explícito
 * (env var PURGE_* u opts.olderThanDays) siempre manda sobre el techo.
 */
export const RETENTION_NONPROD_MAX_DAYS = 14;

export function capRetentionDaysNonProd(days: number): number {
  const vercelEnv = process.env.VERCEL_ENV;
  if (!vercelEnv || vercelEnv === "production") return days;
  return Math.min(days, RETENTION_NONPROD_MAX_DAYS);
}

export function pathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i >= 0) return url.slice(i + marker.length);
  if (bucket === "design-previews" && url.startsWith(PREVIEW_ROUTE_PREFIX)) {
    const path = url.slice(PREVIEW_ROUTE_PREFIX.length).split("?")[0]!;
    return parsePreviewStoragePath(path) ? path : null;
  }
  return url.startsWith("http") ? null : url;
}

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

/**
 * Un CartItem solo protege el diseño mientras su Cart siga vivo — ver cabecera: el carrito
 * soft-borrado tras el checkout pagado deja items colgando para siempre.
 */
const NO_LIVE_CART_ITEM = {
  none: { cart: { deletedAt: null } },
} satisfies Prisma.DesignWhereInput["cartItems"];

const CANDIDATE_SELECT = {
  id: true,
  previewUrl: true,
  // 2026-10-13 — miniatura del DRAFT (Mis diseños): mismo bucket design-previews,
  // path "<designId>/draft-preview.<ext>". Se borra con el diseño.
  draftPreviewUrl: true,
  // 2026-10-13 — páginas por unidad del preview: su conteo permite borrar
  // pages/NN.webp + wm/pages/NN.webp por convención de paths.
  previewPagesCount: true,
  productionUrls: true,
  assets: { select: { storageUrl: true, canvasPath: true } },
} satisfies Prisma.DesignSelect;

type PurgeCandidate = {
  id: string;
  previewUrl: string | null;
  draftPreviewUrl: string | null;
  previewPagesCount: number | null;
  productionUrls: string[];
  assets: Array<{ storageUrl: string; canvasPath: string | null }>;
};

/**
 * Borra los bytes y luego las filas de un lote de diseños. Si falla la remoción de las fotos crudas
 * NO borra nada (devuelve ceros) → el próximo ciclo reintenta y nunca quedan bytes sin registro.
 *
 * 2026-10-14 — EXCEPTO con `opts.bestEffortBytes: true` (borrado de BORRADORES de
 * draft-lifecycle: poda «últimos N» y vaciado/eliminación manual desde "Mis diseños"):
 * ahí las filas se borran AUNQUE la remoción de bytes falle o no haya credenciales de
 * Storage (CI de tests corre con las env de Supabase vacías a propósito — "supabaseUrl
 * is required" — y la poda no ejecutaba NUNCA, fallo CI 2026-10-13). Los bytes que
 * queden huérfanos sin fila Design los reclama el barrido sweepOrphanStorageObjects,
 * que existe exactamente para eso (corre en el mismo cron). La invariante estricta de
 * arriba se conserva para las purgas de retención (ver
 * retention-service.storage-failure.test.ts).
 */
async function purgeDesignBatch(
  designs: PurgeCandidate[],
  opts?: { bestEffortBytes?: boolean },
): Promise<PurgeResult> {
  if (designs.length === 0) return { designsPurged: 0, assetsPurged: 0 };

  const designIds = designs.map((d) => d.id);
  // Los derivados de lienzo (canvasPath, ADR-166) se purgan junto a su master:
  // mismo bucket, misma regla de bytes compartidos de abajo.
  let uploadPaths = designs
    .flatMap((d) => d.assets.flatMap((a) => [a.storageUrl, a.canvasPath]))
    .filter((p): p is string => Boolean(p));
  // 2026-10-13 — no borrar bytes COMPARTIDOS con diseños vivos: cloneDesignForEdit
  // (READY→DRAFT) crea filas DesignAsset NUEVAS con el MISMO storageUrl del original.
  // Si el clon se borra (poda «últimos N» de draft-lifecycle o una purga idle) mientras
  // el original READY sigue vivo (carrito, "Mis diseños"), remover esos bytes dejaría
  // al original sin sus fotos. Solo se remueven los bytes que NINGÚN otro DesignAsset
  // referencia; las filas del lote se borran igual (son del diseño condenado).
  if (uploadPaths.length > 0) {
    const shared = await prisma.designAsset.findMany({
      where: {
        OR: [{ storageUrl: { in: uploadPaths } }, { canvasPath: { in: uploadPaths } }],
        designId: { notIn: designIds },
      },
      select: { storageUrl: true, canvasPath: true },
    });
    if (shared.length > 0) {
      const sharedUrls = new Set(
        shared.flatMap((s) => [s.storageUrl, s.canvasPath]).filter((p): p is string => !!p),
      );
      uploadPaths = uploadPaths.filter((p) => !sharedUrls.has(p));
    }
  }
  const previewPaths = [
    ...designs
      .flatMap((d) => [d.previewUrl, d.draftPreviewUrl])
      .map((url) => (url ? pathFromPublicUrl(url, PREVIEWS_BUCKET) : null))
      .filter((p): p is string => !!p),
    // 2026-10-13 — artefactos watermark por convención de paths (preview-wm.webp,
    // thumb.webp, pages/NN.webp, wm/pages/NN.webp): no viven en ninguna columna,
    // se derivan del designId (+ previewPagesCount). Los que nunca se generaron
    // son no-op en el remove; si alguno queda por fuera (p.ej. count stale), lo
    // reclama el barrido de huérfanos una vez borrada la fila Design.
    ...designs.flatMap((d) => designPreviewDerivedPaths(d.id, d.previewPagesCount)),
  ];
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
  if (!uploadsOk && !opts?.bestEffortBytes) return { designsPurged: 0, assetsPurged: 0 };

  // DesignAsset.design es onDelete:SetNull → hay que borrar las filas explícitamente para no
  // dejar assets huérfanos. Atómico con el borrado del Design.
  // RenderJob.design es onDelete:Cascade (ADR-131): si el diseño se purga con un render
  // pendiente/en curso, la fila del job muere con él — el worker nunca procesa un diseño
  // purgado (buildRenderContext no lo encuentra → error, y la fila ya no existe para reintentar).
  await prisma.$transaction([
    prisma.designAsset.deleteMany({ where: { designId: { in: designIds } } }),
    prisma.design.deleteMany({ where: { id: { in: designIds } } }),
  ]);

  return { designsPurged: designs.length, assetsPurged: uploadPaths.length };
}

/**
 * Borra diseños POR ID con todos sus assets (bytes de Storage + filas), reusando el
 * mismo camino seguro de las purgas de retención (purgeDesignBatch: bytes primero,
 * bytes compartidos con diseños vivos preservados — 2026-10-13). Es la primitiva de
 * borrado que usan la poda «últimos N borradores» y el vaciado/eliminación manual de
 * borradores de "Mis diseños" (draft-lifecycle.ts) — el caller es responsable de
 * haber verificado ownership y estado (DRAFT) antes de llamarla.
 *
 * 2026-10-14 — los bytes son BEST-EFFORT (bestEffortBytes): un fallo de Storage o la
 * ausencia de credenciales NO impide borrar las filas (a diferencia de las purgas de
 * retención, que reintentan en el próximo ciclo). Un borrador condenado por la poda o
 * eliminado por el cliente debe desaparecer igual; los bytes huérfanos resultantes
 * los reclama sweepOrphanStorageObjects (mismo cron de retención).
 */
export async function deleteDesignsWithAssets(designIds: string[]): Promise<PurgeResult> {
  if (designIds.length === 0) return { designsPurged: 0, assetsPurged: 0 };
  const designs = await prisma.design.findMany({
    where: { id: { in: designIds } },
    select: CANDIDATE_SELECT,
  });
  return purgeDesignBatch(designs, { bestEffortBytes: true });
}

export async function purgeAbandonedAnonymousDesigns(opts?: {
  olderThanDays?: number;
  batchSize?: number;
  sessionIdPrefix?: string;
  now?: Date;
}): Promise<PurgeResult> {
  const now = opts?.now ?? new Date();
  const days = opts?.olderThanDays ?? PURGE_ANON_DESIGN_AFTER_DAYS;
  const batchSize = opts?.batchSize ?? 500;
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const sessionScope = opts?.sessionIdPrefix
    ? { sessionId: { startsWith: opts.sessionIdPrefix } }
    : {};

  let designsPurged = 0;
  let assetsPurged = 0;

  const drafts = await prisma.design.findMany({
    where: {
      status: "DRAFT",
      customerId: null,
      updatedAt: { lt: cutoff },
      cartItems: NO_LIVE_CART_ITEM,
      orderItems: { none: {} },
      ...sessionScope,
    },
    select: CANDIDATE_SELECT,
    take: batchSize,
  });
  const draftResult = await purgeDesignBatch(drafts);
  designsPurged += draftResult.designsPurged;
  assetsPurged += draftResult.assetsPurged;

  const orphans = await prisma.designAsset.findMany({
    where: { designId: null, customerId: null, createdAt: { lt: cutoff }, ...sessionScope },
    select: { id: true, storageUrl: true, canvasPath: true },
    take: batchSize,
  });
  if (orphans.length > 0) {
    const ok = await removeStorage(
      CUSTOMER_UPLOADS_BUCKET,
      orphans.flatMap((a) => [a.storageUrl, a.canvasPath]).filter((p): p is string => !!p),
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

/**
 * Resuelve los días de la purga de DRAFTs idle de logueados: override explícito (tests) > env var
 * PURGE_IDLE_DESIGN_AFTER_DAYS (ajuste operativo) > default PURGE_IDLE_DESIGN_AFTER_DAYS.
 */
function resolveIdleDays(overrideDays: number | undefined): number {
  if (overrideDays !== undefined) return overrideDays;
  const raw = process.env.PURGE_IDLE_DESIGN_AFTER_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : PURGE_IDLE_DESIGN_AFTER_DAYS;
  return capRetentionDaysNonProd(days);
}

/**
 * Purga los diseños DRAFT de clientes LOGUEADOS abandonados (feedback Lucy 2026-09-18): la cuenta
 * viva blindaba estos bocetos para siempre (la política original excluía todo lo con customerId),
 * acumulando fotos crudas sin finalidad vigente — mismo principio de temporalidad que la purga
 * anónima. Mismas guardas: sin carrito vivo y sin pedido. NO toca READY,
 * USED_IN_ORDER (lo rige retention-delivered.ts) ni ARCHIVED (decisión explícita
 * del cliente; lo cubre la supresión de cuenta). Corre desde el mismo cron purge-anon-designs.
 * @param opts.olderThanDays días sin actividad (default PURGE_IDLE_DESIGN_AFTER_DAYS / env var).
 */
export async function purgeIdleCustomerDesigns(opts?: {
  olderThanDays?: number;
  batchSize?: number;
  customerIdPrefix?: string;
  now?: Date;
}): Promise<PurgeResult> {
  const now = opts?.now ?? new Date();
  const days = resolveIdleDays(opts?.olderThanDays);
  const batchSize = opts?.batchSize ?? 500;
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const customerScope = opts?.customerIdPrefix
    ? { customerId: { startsWith: opts?.customerIdPrefix } }
    : {};

  const drafts = await prisma.design.findMany({
    where: {
      status: "DRAFT",
      customerId: { not: null, ...customerScope.customerId },
      updatedAt: { lt: cutoff },
      cartItems: NO_LIVE_CART_ITEM,
      orderItems: { none: {} },
    },
    select: CANDIDATE_SELECT,
    take: batchSize,
  });
  const result = await purgeDesignBatch(drafts);

  logger.info({
    event: "retention.purge_idle_customer_designs",
    designsPurged: result.designsPurged,
    assetsPurged: result.assetsPurged,
    olderThanDays: days,
  });
  return result;
}

/**
 * Resuelve los días de la purga de READYs abandonados: override explícito (tests) > env var
 * PURGE_IDLE_READY_AFTER_DAYS (ajuste operativo) > default PURGE_IDLE_READY_AFTER_DAYS.
 */
function resolveIdleReadyDays(overrideDays: number | undefined): number {
  if (overrideDays !== undefined) return overrideDays;
  const raw = process.env.PURGE_IDLE_READY_AFTER_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : PURGE_IDLE_READY_AFTER_DAYS;
  return capRetentionDaysNonProd(days);
}

/**
 * Purga los diseños READY ABANDONADOS — nunca llegaron a pedido y nadie los toca
 * (ADR-130, 2026-10-08). Hasta esta fecha los READY no los cubría NINGUNA retención: el
 * cliente que llegaba a «Ver diseño» generaba renders 300-DPI en production-assets
 * (~2.6 MB por unidad física) y, si nunca ordenaba, esos bytes quedaban para siempre
 * (fuga medida: 575 renders / 1.5 GB en STG, 2× la cuota Free).
 *
 * Mismas guardas conservadoras que las pasadas hermanas: sin carrito VIVO, sin pedido
 * (orderItems: none — un diseño ordenado pasa a USED_IN_ORDER y lo rige
 * retention-delivered.ts). Aplica a anónimos y logueados
 * (customerId indistinto): el plazo de 90d ya es la versión laxa; endurecer anónimos a
 * 30d quedó deliberadamente fuera para no bifurcar la política (ver ADR-130).
 * Un ARCHIVED desde READY entra con la misma guarda (archivedFrom conserva el origen).
 * Corre desde el mismo cron purge-anon-designs.
 * @param opts.olderThanDays días sin actividad (default PURGE_IDLE_READY_AFTER_DAYS / env var).
 */
export async function purgeIdleReadyDesigns(opts?: {
  olderThanDays?: number;
  batchSize?: number;
  now?: Date;
}): Promise<PurgeResult> {
  const now = opts?.now ?? new Date();
  const days = resolveIdleReadyDays(opts?.olderThanDays);
  const batchSize = opts?.batchSize ?? 500;
  const cutoff = new Date(now.getTime() - days * DAY_MS);

  const readys = await prisma.design.findMany({
    where: {
      OR: [{ status: "READY" }, { status: "ARCHIVED", archivedFrom: "READY" }],
      updatedAt: { lt: cutoff },
      cartItems: NO_LIVE_CART_ITEM,
      orderItems: { none: {} },
    },
    select: CANDIDATE_SELECT,
    take: batchSize,
  });
  const result = await purgeDesignBatch(readys);

  logger.info({
    event: "retention.purge_idle_ready_designs",
    designsPurged: result.designsPurged,
    assetsPurged: result.assetsPurged,
    olderThanDays: days,
  });
  return result;
}

// ─────────────────── Barrido de huérfanos de Storage (2026-10-12) ───────────────────

/**
 * Las pasadas de arriba borran bytes CUANDO purgan el diseño, pero nada limpia objetos cuyo
 * Design ya no existe (borrados anteriores a ADR-130, borrados a medias, deriva histórica).
 * Medida en PRD el 2026-10-12: ~316 MB huérfanos (217 MB production-assets, 99 MB
 * customer-uploads) que inflaron la cuota sin que ninguna métrica los viera. Este barrido
 * corre en el mismo cron y es la red de fondo: reclasifica contra la tabla Design y borra
 * (bytes + fila de storage.objects, vía Storage API).
 *
 * Reglas de orfandad — MISMAS del one-shot `packages/db/scripts/one-shot/
 * purge-orphan-storage-20261012.mjs` (convención de paths de apps/web/lib/storage.ts):
 *   - production-assets:  <designId>/…           → huérfano si designId ∉ Design
 *                         _bundles/…             → NUNCA huérfano (2026-11-08: ZIPs de
 *                                                  taller regenerables por descarga; su
 *                                                  limpieza la hace el propio re-upload)
 *   - design-previews:    <designId>/…           → huérfano si designId ∉ Design
 *   - customer-uploads:   <ownerId>/<designId>/… → huérfano si designId ∉ Design
 *                         <ownerId>/pending/…    → huérfano solo si tiene > 7 días
 *                                                  (upload temporal aún asociable)
 *                         <ownerId>/_staging/…   → idem pending (2026-11-08: área de paso
 *                                                  de la subida directa HEIC — el ingest
 *                                                  corre segundos después del PUT; sin la
 *                                                  gracia el barrido podría borrarla a
 *                                                  mitad de camino)
 */

/** Gracia para uploads `pending/` y `_staging/` de customer-uploads antes de huérfanos. */
export const ORPHAN_PENDING_AFTER_DAYS = 7;

/** Techo de objetos procesados por corrida — el cron corre a diario y barre el resto después. */
export const ORPHAN_SWEEP_BATCH_SIZE = 500;

/** La Storage API acota el remove por lote (mismo DELETE_BATCH del one-shot). */
const STORAGE_REMOVE_BATCH = 100;

export type OrphanReason = "design-inexistente" | "pending-vencido";

/**
 * Clasifica un objeto de Storage como huérfano (o no). Función pura — la misma regla del
 * one-shot, exportada para tests y para la doble verificación del barrido.
 * `designIds` es el set de Designs EXISTENTES.
 */
export function classifyStorageOrphan(
  bucket: string,
  name: string,
  createdAt: Date,
  designIds: ReadonlySet<string>,
  now: Date,
): OrphanReason | null {
  const parts = name.split("/");
  if (bucket === PRODUCTION_BUCKET || bucket === PREVIEWS_BUCKET) {
    // `_bundles/` (ZIPs de taller, 2026-11-08) y `b2b-proofs/` (muestras digitales de
    // OpportunityProposal, ADR-210) no anclan a ningún Design.
    if (bucket === PRODUCTION_BUCKET && parts[0] === "_bundles") return null;
    if (bucket === PREVIEWS_BUCKET && parts[0] === "b2b-proofs") return null;
    return !designIds.has(parts[0]) ? "design-inexistente" : null;
  }
  if (bucket === CUSTOMER_UPLOADS_BUCKET) {
    // `b2b-receipts/` (soportes de transferencia / Bre-B en Order.directPaymentReceiptPath,
    // ADR-210) son evidencia contable y no anclan a Design.
    if (parts[0] === "b2b-receipts") return null;
    const designPart = parts[1] ?? "";
    // `pending/` (upload temporal aún asociable) y `_staging/` (área de paso
    // de la subida directa, 2026-11-08) tienen gracia de 7 días.
    if (designPart === "pending" || designPart === "_staging") {
      return now.getTime() - createdAt.getTime() > ORPHAN_PENDING_AFTER_DAYS * DAY_MS
        ? "pending-vencido"
        : null;
    }
    return !designIds.has(designPart) ? "design-inexistente" : null;
  }
  return null;
}

export type OrphanSweepResult = {
  /** Candidatos devueltos por el pre-filtro SQL (acotado por batchSize). */
  scanned: number;
  orphansDeleted: number;
  orphansFailed: number;
};

/**
 * Barrido acotado de objetos huérfanos en production-assets / design-previews /
 * customer-uploads. Doble verificación fail-safe: el SQL hace el anti-join contra Design
 * (candidatos acotados a batchSize, más viejos primero) y luego JS RELEE esos Design y solo
 * borra lo que classifyStorageOrphan confirma — un bug en el SQL nunca borra bytes de un
 * diseño vivo. Borrado por bucket en lotes de 100, best-effort con conteo de fallos (el
 * próximo ciclo reintenta: el objeto sigue en storage.objects).
 */
export async function sweepOrphanStorageObjects(opts?: {
  batchSize?: number;
  now?: Date;
}): Promise<OrphanSweepResult> {
  const now = opts?.now ?? new Date();
  const batchSize = opts?.batchSize ?? ORPHAN_SWEEP_BATCH_SIZE;
  const pendingCutoff = new Date(now.getTime() - ORPHAN_PENDING_AFTER_DAYS * DAY_MS);

  const candidates = await prisma.$queryRaw<
    Array<{ bucket: string; name: string; createdAt: Date }>
  >`
    SELECT o.bucket_id AS "bucket", o.name, o.created_at AS "createdAt"
    FROM storage.objects o
      WHERE (
        o.bucket_id IN ('production-assets', 'design-previews')
        AND (o.bucket_id <> 'production-assets' OR split_part(o.name, '/', 1) <> '_bundles')
        AND (o.bucket_id <> 'design-previews' OR split_part(o.name, '/', 1) <> 'b2b-proofs')
        AND NOT EXISTS (SELECT 1 FROM "Design" d WHERE d.id = split_part(o.name, '/', 1))
      ) OR (
        o.bucket_id = 'customer-uploads'
        AND split_part(o.name, '/', 1) <> 'b2b-receipts'
        AND (
          (split_part(o.name, '/', 2) IN ('pending', '_staging') AND o.created_at < ${pendingCutoff})
          OR (
            split_part(o.name, '/', 2) NOT IN ('pending', '_staging')
            AND NOT EXISTS (SELECT 1 FROM "Design" d WHERE d.id = split_part(o.name, '/', 2))
          )
        )
      )
    ORDER BY o.created_at ASC
    LIMIT ${batchSize}
  `;

  // Confirmación en JS: solo se borra lo que la clasificación pura confirma como huérfano.
  const referencedIds = [
    ...new Set(
      candidates
        .map((c) => {
          const parts = c.name.split("/");
          return c.bucket === CUSTOMER_UPLOADS_BUCKET ? (parts[1] ?? "") : parts[0];
        })
        .filter((id) => id !== "" && id !== "pending" && id !== "_staging"),
    ),
  ];
  const existing = referencedIds.length
    ? await prisma.design.findMany({ where: { id: { in: referencedIds } }, select: { id: true } })
    : [];
  const designIds = new Set(existing.map((d) => d.id));

  const orphans = candidates.filter((c) =>
    classifyStorageOrphan(c.bucket, c.name, c.createdAt, designIds, now),
  );

  let orphansDeleted = 0;
  let orphansFailed = 0;
  for (const bucket of [PRODUCTION_BUCKET, PREVIEWS_BUCKET, CUSTOMER_UPLOADS_BUCKET]) {
    const paths = orphans.filter((o) => o.bucket === bucket).map((o) => o.name);
    for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH) {
      const chunk = paths.slice(i, i + STORAGE_REMOVE_BATCH);
      const ok = await removeStorage(bucket, chunk);
      if (ok) orphansDeleted += chunk.length;
      else orphansFailed += chunk.length;
    }
  }

  logger.info({
    event: "retention.orphan_sweep",
    scanned: candidates.length,
    orphansDeleted,
    orphansFailed,
  });
  return { scanned: candidates.length, orphansDeleted, orphansFailed };
}
