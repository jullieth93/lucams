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
 * NO toca: USED_IN_ORDER (lo rige la retención post-entrega de retention-delivered.ts) /
 * ARCHIVED, ni nada referenciado por un carrito vivo o un pedido. Los DRAFT
 * de clientes logueados los purga purgeIdleCustomerDesigns (abajo) tras 90 días sin actividad
 * (feedback Lucy 2026-09-18); los READY abandonados (que nunca llegaron a pedido) los purga
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

const CUSTOMER_UPLOADS_BUCKET = "customer-uploads";
export const PREVIEWS_BUCKET = "design-previews";
const PRODUCTION_BUCKET = "production-assets";

/** Un diseño DRAFT anónimo sin actividad por este tiempo se considera abandonado y se purga. */
export const PURGE_ANON_DESIGN_AFTER_DAYS = 30;

/**
 * Un diseño DRAFT de cliente LOGUEADO sin actividad por este tiempo se purga igual que el anónimo
 * (feedback Lucy 2026-09-18): la cuenta viva no es finalidad para conservar fotos crudas de un
 * boceto que nadie tocó en 3 meses. Más laxo que el anónimo (30d) porque el cliente puede volver.
 */
export const PURGE_IDLE_DESIGN_AFTER_DAYS = 90;

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

/**
 * Un diseño READY que NUNCA llegó a pedido (ni cotización vigente, ni carrito vivo) y lleva este
 * tiempo sin actividad se considera abandonado y se purga (ADR-130, 2026-10-08). READY es el
 * estado más pesado: tiene renders 300-DPI en production-assets (~2.6 MB c/u). Antes de ADR-130
 * estos diseños NO los cubría ninguna retención y acumulaban bytes para siempre (fuga medida en
 * STG: 1.5 GB en renders de diseños nunca ordenados). Mismo plazo que el DRAFT de logueado (90d):
 * el "Volver a pedir" se rehace desde cero con las fotos nuevas; conservar renders de un diseño
 * que nadie compró ni tocó en 3 meses no tiene finalidad (Ley 1581 art. 4 lit. f).
 */
export const PURGE_IDLE_READY_AFTER_DAYS = 90;

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
  // 2026-10-13 — miniatura del DRAFT (Mis diseños): mismo bucket design-previews,
  // path "<designId>/draft-preview.<ext>". Se borra con el diseño.
  draftPreviewUrl: true,
  // 2026-10-13 — páginas por unidad del preview: su conteo permite borrar
  // pages/NN.webp + wm/pages/NN.webp por convención de paths.
  previewPagesCount: true,
  productionUrls: true,
  assets: { select: { storageUrl: true } },
} satisfies Prisma.DesignSelect;

type PurgeCandidate = {
  id: string;
  previewUrl: string | null;
  draftPreviewUrl: string | null;
  previewPagesCount: number | null;
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
  if (!uploadsOk) return { designsPurged: 0, assetsPurged: 0 };

  // DesignAsset.design es onDelete:SetNull → hay que borrar las filas explícitamente para no
  // dejar assets huérfanos. Atómico con el borrado del Design.
  // RenderJob.design es onDelete:Cascade (ADR-131): si el diseño se purga con un render
  // pendiente/en curso, la fila del job muere con él — el worker nunca procesa un diseño
  // purgado (buildRenderContext no lo encuentra → error, y la fila ya no existe para reintentar).
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

/**
 * Resuelve los días de la purga de DRAFTs idle de logueados: override explícito (tests) > env var
 * PURGE_IDLE_DESIGN_AFTER_DAYS (ajuste operativo) > default PURGE_IDLE_DESIGN_AFTER_DAYS.
 */
function resolveIdleDays(overrideDays: number | undefined): number {
  if (overrideDays !== undefined) return overrideDays;
  const raw = process.env.PURGE_IDLE_DESIGN_AFTER_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : PURGE_IDLE_DESIGN_AFTER_DAYS;
}

/**
 * Purga los diseños DRAFT de clientes LOGUEADOS abandonados (feedback Lucy 2026-09-18): la cuenta
 * viva blindaba estos bocetos para siempre (la política original excluía todo lo con customerId),
 * acumulando fotos crudas sin finalidad vigente — mismo principio de temporalidad que la purga
 * anónima. Mismas guardas: sin carrito vivo, sin pedido y sin cotización vigente. NO toca READY
 * (cotizado o no), USED_IN_ORDER (lo rige retention-delivered.ts) ni ARCHIVED (decisión explícita
 * del cliente; lo cubre la supresión de cuenta). Corre desde el mismo cron purge-anon-designs.
 * @param opts.olderThanDays días sin actividad (default PURGE_IDLE_DESIGN_AFTER_DAYS / env var).
 */
export async function purgeIdleCustomerDesigns(
  opts?: {
    olderThanDays?: number;
    batchSize?: number;
    /** Acota por prefijo de customerId (tests/purgas dirigidas; el cron lo omite). */
    customerIdPrefix?: string;
  } & QuoteRetentionOptions,
): Promise<PurgeResult> {
  const now = opts?.now ?? new Date();
  const days = resolveIdleDays(opts?.olderThanDays);
  const batchSize = opts?.batchSize ?? 500;
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const customerScope = opts?.customerIdPrefix
    ? { customerId: { startsWith: opts?.customerIdPrefix } }
    : {};
  const stillNeeded = activeQuoteWhere(opts);

  const drafts = await prisma.design.findMany({
    where: {
      status: "DRAFT",
      customerId: { not: null, ...customerScope.customerId },
      updatedAt: { lt: cutoff },
      cartItems: NO_LIVE_CART_ITEM,
      orderItems: { none: {} },
      quoteItems: { none: { quote: stillNeeded } },
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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : PURGE_IDLE_READY_AFTER_DAYS;
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
 * retention-delivered.ts) y sin cotización vigente. Aplica a anónimos y logueados
 * (customerId indistinto): el plazo de 90d ya es la versión laxa; endurecer anónimos a
 * 30d quedó deliberadamente fuera para no bifurcar la política (ver ADR-130).
 * ARCHIVED nunca entra (decisión explícita del cliente). Corre desde el mismo cron
 * purge-anon-designs.
 * @param opts.olderThanDays días sin actividad (default PURGE_IDLE_READY_AFTER_DAYS / env var).
 */
export async function purgeIdleReadyDesigns(
  opts?: {
    olderThanDays?: number;
    batchSize?: number;
  } & QuoteRetentionOptions,
): Promise<PurgeResult> {
  const now = opts?.now ?? new Date();
  const days = resolveIdleReadyDays(opts?.olderThanDays);
  const batchSize = opts?.batchSize ?? 500;
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const stillNeeded = activeQuoteWhere(opts);

  const readys = await prisma.design.findMany({
    where: {
      status: "READY",
      updatedAt: { lt: cutoff },
      cartItems: NO_LIVE_CART_ITEM,
      orderItems: { none: {} },
      quoteItems: { none: { quote: stillNeeded } },
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
 *   - design-previews:    <designId>/…           → huérfano si designId ∉ Design
 *   - customer-uploads:   <ownerId>/<designId>/… → huérfano si designId ∉ Design
 *                         <ownerId>/pending/…    → huérfano solo si tiene > 7 días
 *                                                  (upload temporal aún asociable)
 */

/** Gracia para uploads `pending/` de customer-uploads antes de tratarlos como huérfanos. */
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
    return !designIds.has(parts[0]) ? "design-inexistente" : null;
  }
  if (bucket === CUSTOMER_UPLOADS_BUCKET) {
    const designPart = parts[1] ?? "";
    if (designPart === "pending") {
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
        AND NOT EXISTS (SELECT 1 FROM "Design" d WHERE d.id = split_part(o.name, '/', 1))
      ) OR (
        o.bucket_id = 'customer-uploads'
        AND (
          (split_part(o.name, '/', 2) = 'pending' AND o.created_at < ${pendingCutoff})
          OR (
            split_part(o.name, '/', 2) <> 'pending'
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
        .filter((id) => id !== "" && id !== "pending"),
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
