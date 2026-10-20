/*
 * ADR-131 (2026-10-13) — Render de producción ASÍNCRONO (worker del RenderJob).
 *
 * Por qué existe. El render de los PNG 300 DPI corría DENTRO de la Server Action de
 * "Agregar al carrito" (finalizeDesign → tryServerRenderProduction): un set de calendario
 * ×3 son 36 páginas, cada una descarga su foto de Storage y la compone a 3240×4320 — contra
 * maxDuration=60 la Function moría (500/504) y el cliente veía "Estamos tardando más de lo
 * normal…" tras esperar a ciegas (incidente STG 2026-10). Ahora finalize sube el preview,
 * crea/resetea el RenderJob y responde de inmediato; el trabajo pesado corre acá:
 *
 *   - `processRenderJobs` es el worker: lo llama el cron HTTP /api/cron/process-render-jobs
 *     (pg_cron cada minuto, migración supabase 041) y el propio finalize como "kick" con un
 *     presupuesto de tiempo chico (RENDER_JOB_KICK_BUDGET_MS) para que diseños de pocas
 *     páginas terminen dentro del request y los grandes queden para el cron.
 *   - Progreso REAL por unidad: cada página/tira se sube apenas se renderiza y doneUnits se
 *     actualiza por unidad — el Estudio lo lee por polling (GET /api/designs/<id>/render-status)
 *     y muestra "Preparando página X de N…".
 *   - Reanudación: `paths` guarda lo ya subido; si el worker muere a la mitad (timeout/OOM),
 *     el lease de PROCESSING vence (RENDER_JOB_STALE_LEASE_MS) y otro tick retoma desde
 *     doneUnits sin repetir trabajo. `attempts` cuenta FALLOS/reclamos de lease, no ticks:
 *     un job grande procesado en varias pasadas no quema reintentos. Tras
 *     RENDER_JOB_MAX_ATTEMPTS fallos el job queda FAILED y cae en ErrorLog.
 *   - NEEDS_KONVA (diseño no reproducible server-side — filtro, marco SVG, fuente…) es
 *     PERMANENTE: no se reintenta. Si el diseño ya tiene productionUrls (PNG que subió el
 *     cliente por la ruta ADR-081 — el job solo intentaba MEJORAR calidad) el job cierra DONE
 *     y los archivos del cliente quedan vigentes; si no hay nada que imprimir, FAILED.
 *
 * Los motores de render son módulos NATIVOS (sharp / @napi-rs/canvas): import() perezoso en
 * cada punto de uso, nunca estáticos — misma razón que la nota de imports de service.ts (un
 * dlopen roto no debe tumbar rutas que nunca renderizan).
 */

import "server-only";
import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { captureServerError } from "@/lib/error-capture";
import { parsePhotoProductConfig } from "./schemas";
import { loadEffectiveProductConfig } from "./effective-variant-server";
import { calendarLayoutFromUnitTemplate } from "./calendar-layout";
import type { CanvasDataV2 } from "./schemas";
import type { LoadAssetBytes } from "./production-render";

const BUCKET_PRODUCTION = "production-assets";
const BUCKET_CUSTOMER_UPLOADS = "customer-uploads";

/** Fallos (o reclamos de lease vencido) antes de marcar el job FAILED terminal. */
export const RENDER_JOB_MAX_ATTEMPTS = 3;
/** Un PROCESSING sin latido por este tiempo se considera muerto y lo retoma otro tick. */
export const RENDER_JOB_STALE_LEASE_MS = 5 * 60 * 1000;
/** Presupuesto del tick de cron (la ruta tiene maxDuration=60). */
export const RENDER_JOB_CRON_BUDGET_MS = 45_000;
/**
 * Presupuesto del "kick" dentro del finalize: procesa las primeras páginas sin esperar al
 * cron. Chico a propósito — el finalize ya no puede acercarse al maxDuration de la Function.
 */
export const RENDER_JOB_KICK_BUDGET_MS = 8_000;
/** Máximo de jobs distintos que procesa una invocación del worker. */
const RENDER_JOB_MAX_JOBS_PER_RUN = 3;

/** El motor declaró el diseño no reproducible server-side (marca estable, cross-module). */
function isNeedsKonva(err: unknown): boolean {
  return err instanceof Error && err.name === "RenderNeedsKonvaError";
}

/** Los binarios nativos no cargaron en este runtime — se trata como NEEDS_KONVA (permanente). */
class RenderEnginesUnavailableError extends Error {
  constructor(message: string) {
    super(`NEEDS_KONVA: ${message}`);
    this.name = "RenderNeedsKonvaError";
  }
}

/**
 * Guard ESTÁTICO previo a encolar el job (finalize): los motivos de fallback al cliente que se
 * deciden por slot SIN renderizar nada. Los dos motores rechazan estos casos (fidelidad → el
 * PNG del cliente es el exacto de Konva); detectarlos acá preserva la ruta NEEDS_CLIENT_SLOTS
 * síncrona sin esperar al primer render. Lo que es a nivel PLANTILLA (capas raras, marco SVG,
 * fuentes, texto base) lo descubre el probe: la primera unidad del kick se renderiza con el
 * motor real ANTES de marcar el diseño READY (ver finalizeDesign).
 */
export function staticClientFallbackReason(canvasData: CanvasDataV2): string | null {
  for (const s of canvasData.slots) {
    if (s.filter) return `slot ${s.slotIndex} con filtro`;
    const rotation = s.photoTransform?.rotation ?? 0;
    if (rotation % 360 !== 0) return `slot ${s.slotIndex} con foto rotada`;
    for (const override of Object.values(s.textOverrides ?? {})) {
      if (typeof override?.text === "string" && override.text.includes("\n")) {
        return `slot ${s.slotIndex} con texto multilínea`;
      }
    }
  }
  return null;
}

/**
 * Unidades de salida del job = archivos finales de imprenta: una por slot, salvo separadores
 * de 2 caras, donde la unidad es la TIRA desplegada (cara A + cara B compuestas).
 */
export function renderJobTotalUnits(
  productConfig: { facesPerUnit?: number | null },
  slotCount: number,
): number {
  return productConfig.facesPerUnit === 2 && slotCount % 2 === 0
    ? Math.max(1, slotCount / 2)
    : slotCount;
}

/**
 * Crea o RESETEA el job de un diseño (único por designId). El reseteo es la semántica del
 * re-finalize (reopen → editar → finalizar de nuevo): el canvas cambió y el render anterior,
 * completado o no, queda obsoleto — se vuelve a PENDING desde cero.
 */
export async function createOrResetRenderJob(opts: {
  designId: string;
  productId: string;
  slotCount: number;
  calendarYear?: number;
}) {
  const design = await prisma.design.findUnique({
    where: { id: opts.designId },
    select: { productId: true, metadata: true, canvasData: true },
  });
  if (!design || design.productId !== opts.productId) {
    throw new Error(`RenderJob inválido para el diseño ${opts.designId}`);
  }
  const { productConfig } = await loadEffectiveProductConfig(design);
  const totalUnits = renderJobTotalUnits(productConfig, opts.slotCount);
  return prisma.renderJob.upsert({
    where: { designId: opts.designId },
    create: {
      designId: opts.designId,
      totalUnits,
      calendarYear: opts.calendarYear ?? null,
    },
    update: {
      status: "PENDING",
      totalUnits,
      doneUnits: 0,
      paths: [],
      attempts: 0,
      error: null,
      calendarYear: opts.calendarYear ?? null,
      startedAt: null,
      finishedAt: null,
    },
  });
}

/** Progreso para el polling del Estudio (GET /api/designs/<id>/render-status). */
export async function getRenderJobProgress(designId: string) {
  return prisma.renderJob.findUnique({
    where: { designId },
    select: { status: true, totalUnits: true, doneUnits: true, updatedAt: true },
  });
}

// ─────────────────────────── Contexto de render ───────────────────────────

type RenderContext = {
  designId: string;
  canvasData: CanvasDataV2;
  /** Slots ordenados por slotIndex, con las caras B vacías YA resueltas como copia de la A. */
  slots: CanvasDataV2["slots"];
  emptyBackSlots: Set<number>;
  isCalendar: boolean;
  faces2: boolean;
  productConfig: ReturnType<typeof parsePhotoProductConfig>;
  productSchema: Record<string, unknown> | undefined;
  calendarYear?: number;
  loadAsset: LoadAssetBytes;
  engines: {
    renderProductionSlots: typeof import("./production-render").renderProductionSlots;
    renderProductionSlotsCanvas: typeof import("./production-render-canvas").renderProductionSlotsCanvas;
    renderCalendarMonthPagesCanvas: typeof import("./production-render-canvas").renderCalendarMonthPagesCanvas;
  };
  shape: string | undefined;
  borderColor: string | null;
  includeText: boolean;
  frameFullBleed: boolean;
};

/**
 * Carga todo lo que el render necesita (diseño + producto + assets + motores). Misma selección
 * de motor que el tryServerRenderProduction histórico de service.ts — al mover el render al
 * worker, la fuente de verdad de "qué tier reproduce este diseño" vive acá.
 */
async function buildRenderContext(designId: string): Promise<RenderContext> {
  const design = await prisma.design.findUnique({
    where: { id: designId },
    select: { productId: true, metadata: true, canvasData: true },
  });
  if (!design) throw new Error(`RenderJob huérfano: el diseño ${designId} ya no existe`);
  const canvasData = design.canvasData as unknown as CanvasDataV2;
  if (canvasData?.version !== 2) {
    throw new Error(`El diseño ${designId} no tiene canvasData V2 renderizable`);
  }
  const { product, productSchema, productConfig } = await loadEffectiveProductConfig(design);
  const shape = (productSchema as { shape?: string }).shape;
  const isCalendar = product.personalizationKind === "CALENDAR_PHOTO_MONTH";

  const assets = await prisma.designAsset.findMany({
    where: { designId },
    select: { id: true, storageUrl: true },
  });
  const assetPaths = new Map(assets.map((a) => [a.id, a.storageUrl]));
  const loadAsset: LoadAssetBytes = async (assetId) => {
    const path = assetPaths.get(assetId);
    if (!path) return null;
    const { data, error } = await supabaseService.storage
      .from(BUCKET_CUSTOMER_UPLOADS)
      .download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  };

  let engines: RenderContext["engines"];
  try {
    const [sharpEngine, canvasEngine] = await Promise.all([
      import("./production-render"),
      import("./production-render-canvas"),
    ]);
    engines = {
      renderProductionSlots: sharpEngine.renderProductionSlots,
      renderProductionSlotsCanvas: canvasEngine.renderProductionSlotsCanvas,
      renderCalendarMonthPagesCanvas: canvasEngine.renderCalendarMonthPagesCanvas,
    };
  } catch (err) {
    throw new RenderEnginesUnavailableError(
      `motores nativos no cargaron: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Caras B vacías (backOptional): se renderizan como copia de trabajo de la cara A y el
  // upload las reemplaza por la cara EN BLANCO real (blankBackFacePng) — regla owner
  // 2026-10-07, la misma que aplica el finalize síncrono.
  const emptyBackSlots = new Set<number>(
    productConfig.facesPerUnit === 2 && productConfig.backOptional === true
      ? canvasData.slots.filter((s) => s.slotIndex % 2 === 1 && !s.assetUrl).map((s) => s.slotIndex)
      : [],
  );
  const slots = [...canvasData.slots]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((s) => {
      if (!emptyBackSlots.has(s.slotIndex)) return s;
      const faceA = canvasData.slots.find((x) => x.slotIndex === s.slotIndex - 1);
      return faceA ? { ...faceA, slotIndex: s.slotIndex } : s;
    });

  const borderColor =
    typeof (canvasData as { borderColor?: unknown }).borderColor === "string"
      ? ((canvasData as { borderColor?: string }).borderColor ?? null)
      : null;
  const includeText = productSchema ? productConfig.allowText === true : true;
  const frameFullBleed = productSchema ? (productConfig.frameOptions?.length ?? 0) > 0 : false;

  return {
    designId,
    canvasData,
    slots,
    emptyBackSlots,
    isCalendar,
    faces2: productConfig.facesPerUnit === 2 && canvasData.slotCount % 2 === 0,
    productConfig,
    productSchema,
    calendarYear: undefined, // lo fija processOneJob desde el job (fallback: schema/metadata)
    loadAsset,
    engines,
    shape,
    borderColor,
    includeText,
    frameFullBleed,
  };
}

/** Renderiza UN slot con el tier correcto (sharp primero cuando aplica; canvas con marco). */
async function renderOneSlot(ctx: RenderContext, slot: CanvasDataV2["slots"][number]) {
  const { engines } = ctx;
  if (ctx.isCalendar) {
    // ADR-063 CAL1 — la PÁGINA del mes (foto + mes + año + grilla). Sin fallback al cliente:
    // el PNG del cliente no trae la grilla. Una sola página por llamada (progreso real).
    const yearRaw = ctx.calendarYear ?? ctx.productSchema?.year;
    const year =
      typeof yearRaw === "number" && yearRaw >= 2020 && yearRaw <= 2100
        ? yearRaw
        : new Date().getFullYear() + 1;
    const startRaw = ctx.productSchema?.startMonth;
    const startMonth = typeof startRaw === "number" ? startRaw : 0;
    const [buf] = await engines.renderCalendarMonthPagesCanvas({
      slots: [
        { slotIndex: slot.slotIndex, assetId: slot.assetId, photoTransform: slot.photoTransform },
      ],
      loadAsset: ctx.loadAsset,
      year,
      startMonth,
      templateStageWidth: ctx.canvasData.unitTemplate?.stage?.width,
      layout: calendarLayoutFromUnitTemplate(ctx.canvasData.unitTemplate),
      calendarFont: ctx.canvasData.calendarFont,
    });
    return buf;
  }

  const args = {
    unitTemplate: ctx.canvasData.unitTemplate as never,
    slots: [slot] as never,
    shape: ctx.shape,
    loadAsset: ctx.loadAsset,
    borderColor: ctx.borderColor,
    includeText: ctx.includeText,
    frameFullBleed: ctx.frameFullBleed,
  };
  // Tier 1 sharp solo sin marco y sin frameOptions (Ola 4); si declara NEEDS_KONVA, tier canvas.
  if (!ctx.borderColor && !ctx.frameFullBleed) {
    try {
      const [buf] = await engines.renderProductionSlots(args);
      return buf;
    } catch (err) {
      if (!isNeedsKonva(err)) throw err;
    }
  }
  const [buf] = await engines.renderProductionSlotsCanvas(args);
  return buf;
}

function productionFileName(faces2: boolean, unitIndex: number): string {
  const n = String(unitIndex + 1).padStart(2, "0");
  return faces2 ? `tira-${n}.png` : `slot-${n}.png`;
}

/** Renderiza y sube la unidad `unitIndex` (página de calendario, slot o tira 2-caras). */
async function renderAndUploadUnit(ctx: RenderContext, unitIndex: number): Promise<string> {
  let buffer: Buffer;
  if (ctx.faces2) {
    const slotA = ctx.slots[unitIndex * 2];
    const slotB = ctx.slots[unitIndex * 2 + 1];
    if (!slotA || !slotB) throw new Error(`par de caras incompleto en la unidad ${unitIndex + 1}`);
    const bufA = await renderOneSlot(ctx, slotA);
    const bufB = ctx.emptyBackSlots.has(slotB.slotIndex)
      ? await (await import("./blank-back-face")).blankBackFacePng(bufA)
      : await renderOneSlot(ctx, slotB);
    const { composeFaceStrips } = await import("./bookmark-strips");
    const [strip] = await composeFaceStrips([bufA, bufB], {
      cornerRadiusPx: (ctx.productConfig.cornerRadiusPx ?? 0) * 3,
      noFold: ctx.productConfig.noFold === true,
    });
    buffer = strip;
  } else {
    const slot = ctx.slots[unitIndex];
    if (!slot) throw new Error(`slot faltante en la unidad ${unitIndex + 1}`);
    buffer = await renderOneSlot(ctx, slot);
  }

  const path = `${ctx.designId}/${productionFileName(ctx.faces2, unitIndex)}`;
  const { error } = await supabaseService.storage.from(BUCKET_PRODUCTION).upload(path, buffer, {
    contentType: "image/png",
    // Mismo cache-control que el upload del finalize: el bucket es privado y los signed URLs
    // rotan — 1h alineado con su TTL.
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return path;
}

// ─────────────────────────── Worker ───────────────────────────

type ClaimedJob = {
  id: string;
  designId: string;
  totalUnits: number;
  doneUnits: number;
  paths: string[];
  attempts: number;
  calendarYear: number | null;
};

/** Toma el siguiente job elegible y lo marca PROCESSING (claim atómico: updateMany condicional). */
async function claimNextRenderJob(onlyDesignId?: string): Promise<ClaimedJob | null> {
  const staleBefore = new Date(Date.now() - RENDER_JOB_STALE_LEASE_MS);
  const eligible: import("@lucams/db").Prisma.RenderJobWhereInput = onlyDesignId
    ? { designId: onlyDesignId, status: { in: ["PENDING", "PROCESSING"] } }
    : {
        OR: [
          { status: "PENDING" },
          // Lease vencido: el worker anterior murió a la mitad (timeout/OOM) — se retoma
          // desde doneUnits. El reclamo SÍ cuenta como intento (algo mató la pasada previa).
          { status: "PROCESSING", updatedAt: { lt: staleBefore } },
        ],
      };
  const candidate = await prisma.renderJob.findFirst({
    where: eligible,
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true },
  });
  if (!candidate) return null;
  const reclaimed = candidate.status === "PROCESSING";
  const res = await prisma.renderJob.updateMany({
    // Claim atómico: solo gana si el estado sigue siendo el que vimos al leerlo.
    where: { id: candidate.id, status: candidate.status },
    data: {
      status: "PROCESSING",
      startedAt: new Date(),
      ...(reclaimed ? { attempts: { increment: 1 } } : {}),
    },
  });
  if (res.count === 0) return null; // otro worker ganó el claim
  return prisma.renderJob.findUnique({
    where: { id: candidate.id },
    select: {
      id: true,
      designId: true,
      totalUnits: true,
      doneUnits: true,
      paths: true,
      attempts: true,
      calendarYear: true,
    },
  });
}

type JobOutcome = "done" | "pending" | "failed";

async function processOneJob(job: ClaimedJob, deadline: number): Promise<JobOutcome> {
  const t0 = Date.now();
  const close = (data: Record<string, unknown>) =>
    prisma.renderJob.updateMany({ where: { id: job.id }, data });
  try {
    const ctx = await buildRenderContext(job.designId);
    ctx.calendarYear = job.calendarYear ?? undefined;

    let doneUnits = job.doneUnits;
    const paths = [...job.paths];
    while (doneUnits < job.totalUnits) {
      if (Date.now() > deadline) {
        // Presupuesto agotado: vuelve a PENDING SIN quemar intento — el próximo tick continúa.
        await close({ status: "PENDING" });
        return "pending";
      }
      const path = await renderAndUploadUnit(ctx, doneUnits);
      doneUnits += 1;
      paths.push(path);
      const res = await close({ doneUnits, paths });
      if (res.count === 0) return "pending"; // el job desapareció a la mitad (diseño purgado)
    }

    // Terminal: el diseño recibe la lista COMPLETA de una vez — productionUrls parciales
    // harían que el ZIP de producción bajara piezas a medias sin aviso.
    await prisma.design.update({
      where: { id: job.designId },
      data: { productionUrls: paths },
    });
    await close({ status: "DONE", doneUnits, paths, error: null, finishedAt: new Date() });
    logger.info(
      {
        event: "design.render_job.done",
        designId: job.designId,
        units: doneUnits,
        attempts: job.attempts,
        durationMs: Date.now() - t0,
      },
      "RenderJob completado",
    );
    return "done";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isNeedsKonva(err)) {
      // Permanente. Si el diseño ya tiene los PNG del cliente (ADR-081), el job solo
      // intentaba mejorarlos: cierra DONE y los archivos del cliente quedan vigentes.
      const design = await prisma.design.findUnique({
        where: { id: job.designId },
        select: { productionUrls: true },
      });
      const hasClientFiles = (design?.productionUrls.length ?? 0) > 0;
      await close({
        status: hasClientFiles ? "DONE" : "FAILED",
        error: msg,
        finishedAt: new Date(),
      });
      logger[hasClientFiles ? "info" : "warn"](
        { event: "design.render_job.needs_konva", designId: job.designId, err: msg },
        hasClientFiles
          ? "Render server-side no disponible — quedan los PNG del cliente"
          : "Render server-side no disponible y no hay PNG del cliente — job FAILED",
      );
      return hasClientFiles ? "done" : "failed";
    }
    const attempts = job.attempts + 1;
    const terminal = attempts >= RENDER_JOB_MAX_ATTEMPTS;
    await close({
      status: terminal ? "FAILED" : "PENDING",
      attempts,
      error: msg,
      ...(terminal ? { finishedAt: new Date() } : {}),
    });
    logger[terminal ? "error" : "warn"](
      {
        event: terminal ? "design.render_job.failed" : "design.render_job.retry",
        designId: job.designId,
        attempts,
        doneUnits: job.doneUnits,
        totalUnits: job.totalUnits,
        err: msg,
      },
      terminal
        ? `RenderJob FAILED tras ${attempts} intentos`
        : "RenderJob falló — reintenta en el próximo tick",
    );
    if (terminal) {
      // ErrorLog (alimenta errors_spike + panel admin). Best-effort: nunca lanza.
      await captureServerError({
        message: `render-job ${job.designId}: ${msg}`,
        stack: err instanceof Error ? err.stack : undefined,
        routePath: "/api/cron/process-render-jobs",
        routeType: "cron",
      }).catch(() => undefined);
      return "failed";
    }
    return "pending";
  }
}

export type ProcessRenderJobsResult = {
  claimed: number;
  done: number;
  failed: number;
  /** Jobs devueltos a PENDING por agotar el presupuesto de esta invocación. */
  requeued: number;
};

/**
 * Procesa jobs PENDING (y PROCESSING con lease vencido) en lotes, unidad por unidad, hasta
 * agotar el presupuesto de tiempo. Lo llaman el cron HTTP (presupuesto grande) y el finalize
 * como kick (presupuesto chico, `onlyDesignId` = el diseño recién finalizado).
 */
export async function processRenderJobs(opts?: {
  onlyDesignId?: string;
  budgetMs?: number;
  maxJobs?: number;
}): Promise<ProcessRenderJobsResult> {
  const budgetMs = opts?.budgetMs ?? RENDER_JOB_CRON_BUDGET_MS;
  const maxJobs = opts?.maxJobs ?? RENDER_JOB_MAX_JOBS_PER_RUN;
  const deadline = Date.now() + budgetMs;
  const result: ProcessRenderJobsResult = { claimed: 0, done: 0, failed: 0, requeued: 0 };

  // El presupuesto se controla DENTRO del job (antes de cada unidad), no antes del claim:
  // un presupuesto agotado reclama y re-encola sin quemar intento — y un job que cabe
  // justo no se queda sin reclamar por un milisegundo de diferencia al entrar.
  while (result.claimed < maxJobs) {
    const job = await claimNextRenderJob(opts?.onlyDesignId);
    if (!job) break;
    result.claimed += 1;
    const outcome = await processOneJob(job, deadline);
    if (outcome === "done") result.done += 1;
    else if (outcome === "failed") result.failed += 1;
    else result.requeued += 1;
    if (opts?.onlyDesignId) break;
    if (Date.now() >= deadline) break;
  }
  return result;
}
