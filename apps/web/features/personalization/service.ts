/*
 * Service layer — Estudio de Personalización (M.3.b v2).
 *
 * Cambios vs M.3:
 *   - `createDraftDesign` lee `product.personalizationSchema.photoSlots` y
 *     construye un canvasData V2 multi-slot con N slots vacíos + plantilla
 *     unitaria embedida.
 *   - `saveCanvas` acepta tanto V1 (legacy migration on-the-fly) como V2.
 *   - `finalizeDesign` acepta N productionDataUrls (uno por imán físico)
 *     en lugar de 1 monolítico. Sube N PNGs a bucket production-assets y
 *     persiste paths en Design.productionUrls[].
 *   - ADR-131 (2026-10-13): el render server-side de esos PNG corre ASÍNCRONO
 *     (RenderJob + worker en render-job-service.ts), fuera del request.
 *     finalizeDesign solo decide (guard estático + probe de la 1ª unidad vía
 *     kick acotado), sube el preview y marca READY.
 *
 * Reglas críticas (sin cambios vs M.3):
 *   1. Ownership de Design: customerId (logueado) o sessionId (anon). Server
 *      NUNCA acepta una mutation sin verificar primero que el caller posee
 *      el Design.
 *   2. Design.status state machine:
 *        DRAFT → READY (snapshot ok) → USED_IN_ORDER (cart confirmed)
 *        DRAFT/READY → ARCHIVED (Lucy admin, futuro)
 */

import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import {
  pathFromPublicUrl,
  removeStorage,
  PREVIEWS_BUCKET,
  PURGE_IDLE_DESIGN_AFTER_DAYS,
} from "@/features/personalization/retention-service";
import { trimExcessDraftDesigns } from "./draft-lifecycle";
import { designHasMeaningfulProgress } from "./design-progress";
import { effectivePersonalizationSchema, resolveEffectiveVariant } from "./effective-variant";
import { loadEffectiveProductConfig } from "./effective-variant-server";
import { supabaseService } from "@/lib/supabase/service";
import { hashBearerToken } from "@/lib/token-hash";
import { parsePhotoProductConfig } from "./schemas";
import { listStagedSlotPaths, stagedSlotPath } from "./staged-slots";
import { resolvePersonalizationSurface } from "./surface";
import { unitCountOf, letterSetUnitCount, MAX_LETTER_SET_UNITS } from "./design-units";
import { PREVIEW_ALLOWED_MIME, previewExtensionForMime, type PreviewMime } from "./sharp-safe";
import {
  filterTemplatesByAspectRatio,
  filterTemplatesByPhotoSlots,
  preferProductSpecific,
} from "./template-visibility";
import { normalizeName } from "./name-input";
import { remapCanvasAssetIds } from "./canvas-remap";
import {
  createOrResetRenderJob,
  processRenderJobs,
  staticClientFallbackReason,
  RENDER_JOB_KICK_BUDGET_MS,
} from "./render-job-service";
import { ALPHABET } from "./letter-tiles";
import {
  ensurePreviewWatermarkGlobal,
  uploadPreviewPages,
  uploadPreviewWatermarkArtifacts,
} from "./preview-artifacts-server";
import { PREVIEW_PAGES_MAX, designPreviewDerivedPaths } from "./preview-artifacts";
import {
  mergeVariantOverProduct,
  parseVariantAttributes,
} from "@/features/products/variant-schemas";
// Los motores de render son módulos NATIVOS (production-render y bookmark-strips → sharp;
// production-render-canvas → @napi-rs/canvas): se cargan con import() perezoso en cada punto
// de uso, nunca estáticamente. Un import estático acá haría que TODA ruta que toque este
// service (la PDP vía carrito/actions, estudio, carrito) cargue los binarios nativos al
// arrancar la lambda — y si dlopen falla en el runtime serverless, la página entera devuelve
// 500 aunque nunca renderice nada (caso real 2026-07-28: ERR_DLOPEN_FAILED libvips-cpp.so
// tumbó /producto/* en Vercel). Mismo patrón que lib/photo-validation.ts y lib/storage.ts.
import type { CanvasData, CanvasDataV1, CanvasDataV2 } from "./schemas";
import type { z } from "zod";
import type { SlotStateSchema } from "./schemas";
type SlotState = z.infer<typeof SlotStateSchema>;

const BUCKET_PREVIEWS = "design-previews";
const BUCKET_PRODUCTION = "production-assets";
const BUCKET_CUSTOMER_UPLOADS = "customer-uploads";

/**
 * ADR-057 A1a / ADR-131 (2026-10-13) — el render server-side de producción YA NO corre en
 * este módulo ni en el request del finalize: se movió al worker de RenderJob
 * (render-job-service.ts), que procesa página por página con progreso real y reintentos.
 * Acá quedan solo la decisión síncrona (guard estático + kick acotado) en finalizeDesign.
 */

// ──────────────────────────────────────────────────────────────────
//  Ownership check
// ──────────────────────────────────────────────────────────────────

/**
 * 2026-10-13 — poda «últimos N borradores» (draft-lifecycle.ts) tras crear un
 * DRAFT nuevo. BEST-EFFORT: una poda fallida se loguea y NUNCA rompe el flujo
 * principal (creación/clon de diseño); los excedentes los recoge la próxima
 * creación o la purga de retención.
 */
async function trimDraftsBestEffort(
  owner: { customerId: string | null; sessionId: string | null },
  productId: string,
  protectDesignId?: string,
): Promise<void> {
  try {
    await trimExcessDraftDesigns(owner, productId, { protectDesignId });
  } catch (err) {
    logger.warn(
      {
        event: "design.draft_trim.fail",
        productId,
        err: err instanceof Error ? err.message : String(err),
      },
      "Poda de borradores falló (best-effort)",
    );
  }
}

export async function getOwnedDesign(
  designId: string,
  owner: { customerId: string | null; sessionId: string | null },
) {
  const design = await prisma.design.findUnique({
    where: { id: designId },
  });
  if (!design) return null;
  if (design.customerId && design.customerId === owner.customerId) return design;
  if (design.sessionId && design.sessionId === owner.sessionId) return design;
  return null;
}

/**
 * Clona un diseño READY a un DRAFT editable (edición desde el carrito, auditoría 2026-07-13).
 * Copia canvasData + metadata + assets (filas NUEVAS con mismo storageUrl) y remapea los assetId
 * del canvas a los ids nuevos. El diseño ORIGINAL queda INTACTO → si el cliente abandona la
 * edición, el item del carrito (que apunta al original READY) sigue válido. Devuelve el id del
 * clon, o null si el diseño no es del owner o no está READY.
 *
 * 2026-10-13 — el clon NO hereda previewUrl ni draftPreviewUrl (quedan null):
 * el preview final es del ORIGINAL y el clon regenera su miniatura de borrador
 * en el primer auto-save del Estudio. Esto habilita el CTA «Editar» de
 * /mi-cuenta/disenos sobre diseños READY (ver design-grid.tsx): el recover de
 * /estudio/<slug>?designId= llama acá y pasa replacesCartDesignId al editor;
 * si el original está en el carrito la línea se reemplaza en sitio al agregar
 * (cart/service.ts), y si NO está (flujo Mis diseños) el alta es una línea
 * nueva — el original READY sigue listado y coherente (nunca se toca).
 */
export async function cloneDesignForEdit(
  originalId: string,
  owner: { customerId: string | null; sessionId: string | null },
): Promise<{ id: string } | null> {
  const original = await getOwnedDesign(originalId, owner);
  if (!original || original.status !== "READY") return null;
  const assets = await prisma.designAsset.findMany({ where: { designId: original.id } });

  const clone = await prisma.$transaction(async (tx) => {
    const clone = await tx.design.create({
      data: {
        productId: original.productId,
        templateId: original.templateId,
        customerId: original.customerId,
        sessionId: original.sessionId,
        status: "DRAFT",
        canvasData: (original.canvasData ?? {}) as Prisma.InputJsonValue,
        metadata: (original.metadata ?? {}) as Prisma.InputJsonValue,
        createdBy: owner.customerId ?? owner.sessionId ?? null,
      },
      select: { id: true },
    });

    const idMap = new Map<string, string>();
    for (const a of assets) {
      const copy = await tx.designAsset.create({
        data: {
          designId: clone.id,
          customerId: a.customerId,
          sessionId: a.sessionId,
          storageUrl: a.storageUrl,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          width: a.width,
          height: a.height,
          exifStripped: a.exifStripped,
          malwareScanned: a.malwareScanned,
        },
        select: { id: true },
      });
      idMap.set(a.id, copy.id);
    }

    if (idMap.size > 0) {
      const remapped = remapCanvasAssetIds(original.canvasData, idMap);
      await tx.design.update({
        where: { id: clone.id },
        data: { canvasData: remapped as Prisma.InputJsonValue },
      });
    }
    return { id: clone.id };
  });

  // 2026-10-13 — el clon es un DRAFT nuevo INTENCIONAL (edición): no pasa por el
  // reuso, pero sí por la poda «últimos N» del mismo dueño+producto.
  await trimDraftsBestEffort(owner, original.productId, clone.id);
  return clone;
}

/**
 * Reabre un diseño READY a DRAFT para seguir editándolo EN LA MISMA SESIÓN del Estudio
 * (fix F1.1, plan maduración 2026-10). Contexto: el Estudio finaliza al confirmar la Vista
 * Previa; si después el cliente siguió editando en la misma sesión (p.ej. el add-to-cart
 * falló y reintentó), el save forzado pre-finalize chocaba con "only DRAFT can be edited" y
 * la pantalla mostraba el error genérico de guardado sin salida. Con la reapertura, el save
 * funciona y el finalize siguiente (idempotente por diseño, ver finalizeDesign) re-renderiza
 * producción desde el canvasData nuevo — WYSIWYG intacto.
 *
 * Solo es seguro si NINGÚN CartItem/OrderItem referencia el diseño (un item de carrito exige
 * que su diseño esté READY). Si está referenciado se rechaza: el camino correcto ahí es
 * clonar (cloneDesignForEdit). Un DRAFT se devuelve tal cual (no-op).
 */
export async function reopenDesignForEdit(
  designId: string,
  owner: { customerId: string | null; sessionId: string | null },
) {
  const design = await getOwnedDesign(designId, owner);
  if (!design) {
    throw new Error("Design not found or not owned by caller");
  }
  if (design.status === "DRAFT") return design;
  if (design.status !== "READY") {
    throw new Error(`Design is ${design.status} — only READY can be reopened`);
  }
  const [cartRefs, orderRefs] = await Promise.all([
    prisma.cartItem.count({ where: { designId } }),
    prisma.orderItem.count({ where: { designId } }),
  ]);
  if (cartRefs > 0 || orderRefs > 0) {
    throw new Error("Design is referenced by a cart/order item — clone instead of reopen");
  }
  return prisma.design.update({ where: { id: design.id }, data: { status: "DRAFT" } });
}

/**
 * Reorder "Volver a pedir" (Paquete I, 2026-10-02) — clona un diseño USED_IN_ORDER a un
 * diseño NUEVO en estado READY, listo para `addPersonalizedToCart`.
 *
 * A diferencia de cloneDesignForEdit (que comparte los storageUrl de los assets entre original
 * y clon), acá los BYTES SE COPIAN a paths propios del clon — tanto las fotos crudas
 * (customer-uploads) como los renders de imprenta (production-assets). Motivo: el original está
 * en la ventana de retención post-entrega (retention-delivered.ts) y cuando su pedido cumpla 90
 * días de entregado la purga borrará esos bytes y las filas DesignAsset originales. Si el clon
 * los referenciara, el reorder quedaría roto a mitad de camino (su propio pedido aún en
 * producción). Con bytes propios, el clon tiene su ciclo de retención independiente (se purgará
 * 90 días después de entregado el NUEVO pedido).
 *
 * Por eso el clon tampoco RE-FINALIZA (no re-renderiza producción desde el canvas): el render
 * server-side no reproduce todos los diseños (el marco SVG de la Polaroid exige los PNG que
 * subió el cliente, ADR-081) y los renders vivos del original ya son el archivo de imprenta
 * correcto — copiarlos es fiel y determinista.
 *
 * Ownership: la autorización la hizo el caller (el pedido es del cliente / token público válido),
 * así que NO se exige que el original pertenezca al nuevo dueño — el clon nace con el
 * customerId/sessionId ACTUALES para que el flujo de carrito del caller lo vea como suyo (un
 * invitado que reordena meses después tiene otra sesión).
 *
 * El clon hereda moderationStatus del original (el contenido es byte-idéntico a uno ya moderado:
 * no se vuelve a encolar) y qualityAcknowledgedAt (la aceptación de calidad es del mismo diseño).
 * El previewUrl se REUSA sin copiar: el bucket design-previews nunca se purga.
 *
 * Devuelve null si el original no existe, no está USED_IN_ORDER, ya fue purgado (`purgedAt`) o
 * no tiene renders vivos que copiar (nada que reimprimir). Ante un fallo de Storage a mitad de
 * la copia se hace cleanup best-effort (bytes copiados + filas del clon) y devuelve null — el
 * caller lo reporta como "no disponible" y no queda basura.
 */
export async function cloneDesignForReorder(
  originalId: string,
  newOwner: { customerId: string | null; sessionId: string | null },
): Promise<{ id: string } | null> {
  const ownerId = newOwner.customerId ?? newOwner.sessionId;
  if (!ownerId) return null;

  const original = await prisma.design.findUnique({ where: { id: originalId } });
  if (!original || original.status !== "USED_IN_ORDER" || original.purgedAt) return null;
  const assets = await prisma.designAsset.findMany({ where: { designId: original.id } });

  // Renders vivos: el array V2 + el legacy V1 (designs M.3 con productionUrl single).
  const renderPaths = [
    ...original.productionUrls,
    ...(original.productionUrl ? [original.productionUrl] : []),
  ];
  if (renderPaths.length === 0) return null;

  // La fila se crea ANTES de copiar bytes (el path de destino lleva el id del clon) y se
  // promueve a READY solo cuando TODAS las copias salieron — un clon a medias nunca es
  // agregable al carrito.
  const clone = await prisma.design.create({
    data: {
      productId: original.productId,
      templateId: original.templateId,
      customerId: newOwner.customerId,
      sessionId: newOwner.sessionId,
      status: "DRAFT",
      canvasData: (original.canvasData ?? {}) as Prisma.InputJsonValue,
      metadata: (original.metadata ?? {}) as Prisma.InputJsonValue,
      previewUrl: original.previewUrl,
      moderationStatus: original.moderationStatus,
      qualityAcknowledgedAt: original.qualityAcknowledgedAt,
      createdBy: ownerId,
    },
    select: { id: true },
  });

  const copiedUploads: string[] = [];
  const copiedRenders: string[] = [];
  try {
    // 1) Fotos crudas: copia de bytes + fila NUEVA por asset (remap de ids en el canvas).
    const idMap = new Map<string, string>();
    for (const a of assets) {
      const filename = a.storageUrl.split("/").pop() ?? "foto.webp";
      const destPath = `${ownerId}/${clone.id}/${crypto.randomUUID()}-${filename}`;
      const { error } = await supabaseService.storage
        .from(BUCKET_CUSTOMER_UPLOADS)
        .copy(a.storageUrl, destPath);
      if (error) throw new Error(`copy asset ${a.id}: ${error.message}`);
      copiedUploads.push(destPath);
      const copy = await prisma.designAsset.create({
        data: {
          designId: clone.id,
          customerId: newOwner.customerId,
          sessionId: newOwner.sessionId,
          storageUrl: destPath,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          width: a.width,
          height: a.height,
          exifStripped: a.exifStripped,
          malwareScanned: a.malwareScanned,
          rightsAcceptedAt: a.rightsAcceptedAt,
          rightsPolicyVersion: a.rightsPolicyVersion,
        },
        select: { id: true },
      });
      idMap.set(a.id, copy.id);
    }

    // 2) Renders de imprenta: copia a `<cloneId>/<nombre-original>` (mismo esquema que finalize).
    const newRenderPaths: string[] = [];
    for (const p of renderPaths) {
      const dest = `${clone.id}/${p.split("/").pop()}`;
      const { error } = await supabaseService.storage.from(BUCKET_PRODUCTION).copy(p, dest);
      if (error) throw new Error(`copy render ${p}: ${error.message}`);
      copiedRenders.push(dest);
      newRenderPaths.push(dest);
    }

    // 3) Promoción a READY con canvas remapeado y los paths propios de producción.
    const remapped =
      idMap.size > 0 ? remapCanvasAssetIds(original.canvasData, idMap) : original.canvasData;
    await prisma.design.update({
      where: { id: clone.id },
      data: {
        status: "READY",
        canvasData: remapped as Prisma.InputJsonValue,
        productionUrls: newRenderPaths,
        // Legacy V1: el campo single apunta a SU copia (es el último path copiado).
        productionUrl: original.productionUrl
          ? (newRenderPaths[renderPaths.indexOf(original.productionUrl)] ?? null)
          : null,
      },
    });
    logger.info(
      {
        event: "design.reorder_clone.success",
        originalId: original.id,
        cloneId: clone.id,
        assets: idMap.size,
        renders: newRenderPaths.length,
      },
      "Diseño clonado para reorder (bytes copiados, READY)",
    );
    // 2026-10-13 — el reorder nace DRAFT (y se promueve a READY arriba): es una
    // creación intencional, no pasa por el reuso, pero sí dispara la poda
    // «últimos N» de los DRAFT del mismo dueño+producto.
    await trimDraftsBestEffort(newOwner, original.productId, clone.id);
    return { id: clone.id };
  } catch (err) {
    logger.warn({
      event: "design.reorder_clone.fail",
      originalId: original.id,
      cloneId: clone.id,
      err: err instanceof Error ? err.message : String(err),
    });
    // Cleanup best-effort: bytes ya copiados (ambos buckets) + filas del clon.
    await removeStorage(BUCKET_CUSTOMER_UPLOADS, copiedUploads);
    await removeStorage(BUCKET_PRODUCTION, copiedRenders);
    await prisma.designAsset.deleteMany({ where: { designId: clone.id } }).catch(() => {});
    await prisma.design.delete({ where: { id: clone.id } }).catch(() => {});
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
//  Grid layout helper (mirror del cliente, server-side)
// ──────────────────────────────────────────────────────────────────
//
// Replicación del helper del cliente acá para evitar import cross-boundary
// (server no puede import desde app/estudio que es client-tree).

const PRESET_LAYOUTS: Record<number, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 2, rows: 1 },
  3: { cols: 3, rows: 1 },
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 2 },
  8: { cols: 4, rows: 2 },
  9: { cols: 3, rows: 3 },
  10: { cols: 5, rows: 2 },
  // 12 → 3×4: tarjetas más grandes (calendario mes a mes); réplica server-side
  // de lib/grid-layout.ts. Mantener alineadas las 4 copias.
  12: { cols: 3, rows: 4 },
  15: { cols: 5, rows: 3 },
  16: { cols: 4, rows: 4 },
  20: { cols: 5, rows: 4 },
};

function gapForSlotCount(n: number): number {
  if (n <= 4) return 24;
  if (n <= 9) return 16;
  if (n <= 12) return 12;
  return 8;
}

function generateGridLayout(
  slotCount: number,
  stage: { width: number; height: number },
  forcedCols?: number,
) {
  const preset = PRESET_LAYOUTS[slotCount];
  let cols = preset?.cols ?? Math.ceil(Math.sqrt(slotCount));
  let rows = preset?.rows ?? Math.ceil(slotCount / cols);
  const aspect = stage.width / stage.height;
  if (aspect > 2.0 && cols > rows) [cols, rows] = [rows, cols];
  if (aspect < 0.5 && rows > cols) [cols, rows] = [rows, cols];
  // Ola 2A — la plantilla puede fijar las columnas (ej. tira fotobooth: gridCols=1 →
  // las 3 fotos se apilan en vertical, como la tira física 5×15).
  if (typeof forcedCols === "number" && forcedCols >= 1) {
    cols = Math.min(forcedCols, slotCount);
    rows = Math.ceil(slotCount / cols);
  }
  return { cols, rows, gap: gapForSlotCount(slotCount) };
}

// ──────────────────────────────────────────────────────────────────
//  Create draft (V2 directamente)
// ──────────────────────────────────────────────────────────────────

/**
 * N-08 (2026-09-11) — validación COMPLETA de una plantilla elegida explícitamente
 * (deep-link `?template=` resuelto en la página, o templateId del boot del editor):
 * activa, no borrada, `mode = EDITABLE`, del KIND del producto y del propio producto
 * o global. Antes solo se revisaba isActive/deletedAt y una plantilla de otro kind /
 * otro producto / PREMADE podía terminar de unitTemplate de un diseño.
 * Misma regla para diseños anónimos y autenticados (el ownership no cambia qué
 * plantillas están a la vista).
 */
async function findUsableEditableTemplate(opts: {
  templateId: string;
  productId: string;
  kind: string;
}) {
  return prisma.personalizationTemplate.findFirst({
    where: {
      id: opts.templateId,
      kind: opts.kind as never,
      mode: "EDITABLE",
      isActive: true,
      deletedAt: null,
      OR: [{ productId: opts.productId }, { productId: null }],
    },
    select: { id: true, canvasData: true },
  });
}

export async function createDraftDesign(opts: {
  productId: string;
  templateId?: string;
  /**
   * Variante elegida en la PDP (superficie foto NO-pack). Se persiste en
   * metadata.variantId para que el recover (?designId=, «Editar» desde el carrito)
   * reabra el Estudio con la variante correcta (el link solo trae designId).
   * Los packs de foto NO la mandan: su variante exacta se deriva del canvasData.
   */
  variantId?: string;
  customerId: string | null;
  sessionId: string | null;
}) {
  if (!opts.customerId && !opts.sessionId) {
    throw new Error("createDraftDesign: requires customerId or sessionId");
  }

  const product = await prisma.product.findUnique({
    where: { id: opts.productId },
    select: {
      id: true,
      personalizationKind: true,
      personalizationSchema: true,
      variants: opts.variantId
        ? {
            where: { id: opts.variantId, isActive: true, deletedAt: null },
            select: { id: true, attributes: true },
          }
        : undefined,
    },
  });
  if (!product) {
    throw new Error(`createDraftDesign: product ${opts.productId} not found`);
  }
  if (opts.variantId && (product.variants?.length ?? 0) === 0) {
    throw new Error("createDraftDesign: variant not found");
  }

  const photoConfig = parsePhotoProductConfig(
    effectivePersonalizationSchema(
      product.personalizationSchema as Record<string, unknown> | null,
      product.variants?.[0] ?? null,
    ),
  );
  const slotCount = photoConfig.photoSlots;

  // Cargar unitTemplate desde PersonalizationTemplate (si se pasó templateId
  // explícito) o el primer template VISIBLE del kind del producto.
  let unitTemplate: CanvasDataV1;
  const templateIdToUse: string | null = opts.templateId ?? null;

  if (opts.templateId) {
    const tpl = await findUsableEditableTemplate({
      templateId: opts.templateId,
      productId: product.id,
      kind: product.personalizationKind,
    });
    if (!tpl) {
      throw new Error(`createDraftDesign: template ${opts.templateId} not available`);
    }
    unitTemplate = tpl.canvasData as unknown as CanvasDataV1;
  } else {
    // Sin elección explícita: la primera plantilla VISIBLE presta solo su
    // GEOMETRÍA al canvas del draft (específicas > globales + filtro de aspect,
    // la MISMA que vería primera el cliente — N-08) pero NO queda seleccionada:
    // 5.1 (owner 2026-10-22) — ninguna plantilla se elige por defecto, así
    // Design.templateId queda null y el checklist «Tu diseño» pide la elección
    // (el recover ya no la "hereda" sin que el cliente la haya tocado).
    const tpl = (
      await listTemplatesForKind(product.personalizationKind, {
        productId: product.id,
        productAspectRatio: photoConfig.aspectRatio,
        take: 1,
      })
    )[0];
    if (tpl) {
      unitTemplate = tpl.canvasData as unknown as CanvasDataV1;
    } else {
      // Fallback (ADR-063 T4): stage 1080×1080 con placeholder de foto full-stage. Antes solo
      // traía `background` (sin image-placeholder) → la foto no tenía dónde ubicarse. Con el
      // placeholder el editor bootea funcional aunque el producto no tenga plantillas curadas.
      unitTemplate = {
        version: 1,
        stage: { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 },
        layers: [
          { id: "background", type: "background", color: "#FFF8F0" },
          {
            id: "photo",
            type: "image-placeholder",
            x: 0,
            y: 0,
            width: 1080,
            height: 1080,
            cornerRadius: 0,
          },
        ],
      };
    }
  }

  const slots: SlotState[] = Array.from({ length: slotCount }, (_, idx) => ({
    slotIndex: idx,
    assetId: null,
    assetUrl: null,
  }));

  const canvasData: CanvasDataV2 = {
    version: 2,
    unitTemplate,
    slotCount,
    slots,
    // Ola 2A — la plantilla puede fijar las columnas del grid (tira fotobooth: gridCols=1).
    gridLayout: generateGridLayout(
      slotCount,
      unitTemplate.stage,
      typeof (unitTemplate as { gridCols?: unknown }).gridCols === "number"
        ? ((unitTemplate as { gridCols?: number }).gridCols as number)
        : undefined,
    ),
  };

  const design = await prisma.design.create({
    data: {
      productId: opts.productId,
      templateId: templateIdToUse,
      customerId: opts.customerId,
      sessionId: opts.sessionId,
      status: "DRAFT",
      canvasData: canvasData as unknown as Prisma.InputJsonValue,
      metadata: {
        kind: product.personalizationKind,
        schemaVersion: 2,
        // Recover (?designId=): el Estudio reabre con ESTA variante (ver page.tsx).
        ...(opts.variantId ? { variantId: opts.variantId } : {}),
      },
    },
  });

  logger.info(
    {
      event: "design.create_draft.success",
      designId: design.id,
      productId: opts.productId,
      templateId: templateIdToUse,
      kind: product.personalizationKind,
      slotCount,
      ownerType: opts.customerId ? "customer" : "session",
    },
    "Draft design created (V2)",
  );

  await trimDraftsBestEffort(
    { customerId: opts.customerId, sessionId: opts.sessionId },
    opts.productId,
    design.id,
  );

  return design;
}

// ──────────────────────────────────────────────────────────────────
//  Draft de NOMBRE (superficie "name" del abecedario — ADR-057, Fase 0)
// ──────────────────────────────────────────────────────────────────
//
// El nombre NO es una foto: se guarda la lista ordenada de fichas en `metadata`.
// El canvasData es V1 (stage + fondo), así que finalizeDesign espera 1 production
// PNG (la tira renderizada) y NO valida slots de foto → reutiliza la ruta del dinero
// sin cambios. La validación del nombre corre EN EL SERVIDOR (no confiar en cliente).

export async function createNameDesign(opts: {
  productId: string;
  variantId: string;
  name: string;
  /** Tema de color de las fichas (arcoiris/nina/nino/neutro). Se guarda en metadata. */
  themeId?: string;
  /** Color efectivo por letra (hex), validado por el caller. Ej. ["#7C6AAD", ...]. */
  colors?: string[];
  /** ADR-057 — estilo ilustrado elegido (LetterTileSet.id) o null = "Solo letra". */
  styleSetId?: string | null;
  /** Lucy 2026-09-09 — opción de diseño "Con borde / Sin borde" (mismo precio), espejo del
   *  set de letras (Lucy 2026-09-05). Default true (retrocompatible): los diseños guardados
   *  antes de la opción no traen la clave y se tratan como con borde. */
  withBorder?: boolean;
  customerId: string | null;
  sessionId: string | null;
}): Promise<{ id: string; display: string; letters: string[] }> {
  if (!opts.customerId && !opts.sessionId) {
    throw new Error("createNameDesign: requires customerId or sessionId");
  }

  const product = await prisma.product.findUnique({
    where: { id: opts.productId },
    select: {
      id: true,
      personalizationKind: true,
      personalizationSchema: true,
      variants: {
        where: { id: opts.variantId, isActive: true, deletedAt: null },
        select: { id: true, attributes: true },
      },
    },
  });
  if (!product) throw new Error(`createNameDesign: product ${opts.productId} not found`);
  const variant = product.variants[0];
  if (!variant) throw new Error("createNameDesign: variant not found");

  // La superficie correcta debe ser "name" (defensa: no crear un name design
  // sobre una variante de foto o un set fijo).
  const merged = mergeVariantOverProduct(
    (product.personalizationSchema ?? {}) as Record<string, unknown>,
    parseVariantAttributes(variant.attributes),
  );
  const surface = resolvePersonalizationSurface(product.personalizationKind, merged);
  if (surface.surface !== "name") throw new Error("NAME_SURFACE_REQUIRED");

  const norm = normalizeName(opts.name, surface.config);
  if (!norm.valid) {
    throw new Error(
      `INVALID_NAME: ${norm.tooShort ? "muy corto" : norm.tooLong ? "muy largo" : "inválido"}`,
    );
  }

  const canvasData: CanvasDataV1 = {
    version: 1,
    stage: { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 },
    layers: [{ id: "background", type: "background", color: "#FFFFFF" }],
  };

  const design = await prisma.design.create({
    data: {
      productId: opts.productId,
      templateId: null,
      customerId: opts.customerId,
      sessionId: opts.sessionId,
      status: "DRAFT",
      canvasData: canvasData as unknown as Prisma.InputJsonValue,
      metadata: {
        kind: product.personalizationKind,
        surface: "name",
        schemaVersion: 2,
        name: norm.display,
        letters: norm.letters,
        language: surface.config.language,
        variant: typeof merged.variant === "string" ? merged.variant : null,
        // Recover (?designId=): variante con la que se creó el diseño — el Estudio
        // reabre con ella (el link «Editar» del carrito solo trae designId).
        variantId: opts.variantId,
        themeId: opts.themeId ?? "arcoiris",
        colors: Array.isArray(opts.colors) ? opts.colors.slice(0, norm.letters.length) : [],
        // Estilo ilustrado elegido (para producción). null = "Solo letra".
        styleSetId: opts.styleSetId ?? null,
        // Opción de diseño "Con borde / Sin borde" (Lucy 2026-09-09, espejo del set de
        // letras). Siempre se persiste el booleano: default true = con borde (comportamiento
        // histórico, retrocompatible con diseños que no traen la clave).
        withBorder: opts.withBorder !== false,
      },
    },
  });

  logger.info(
    {
      event: "design.create_name.success",
      designId: design.id,
      productId: opts.productId,
      letterCount: norm.letters.length,
      language: surface.config.language,
      ownerType: opts.customerId ? "customer" : "session",
    },
    "Name design created",
  );

  // 2026-10-13 — cada confirmación del editor de nombre crea un DRAFT nuevo
  // (el editor nunca reusa el id): poda «últimos N» del mismo dueño+producto.
  await trimDraftsBestEffort(
    { customerId: opts.customerId, sessionId: opts.sessionId },
    opts.productId,
    design.id,
  );

  return { id: design.id, display: norm.display, letters: norm.letters };
}

// ──────────────────────────────────────────────────────────────────
//  Diseño de SET DE LETRAS (Completo/Vocales) con color de marco (ADR-057)
// ──────────────────────────────────────────────────────────────────
//
// El producto es un set fijo (todas las letras); el cliente personaliza el COLOR DEL MARCO por
// ficha y (Lucy 2026-09-05) la opción de diseño "Con borde / Sin borde" — ambos cambios físicos
// reales reflejados en el PNG de producción que sube el cliente (WYSIWYG). Se guarda el tema +
// las letras en metadata; canvasData v1 → reutiliza finalize/carrito. Valida el marcador letterSet.

export async function createLetterSetDesign(opts: {
  productId: string;
  variantId: string;
  frameTheme: string;
  /** ADR-057 — color efectivo por ficha (mismo patrón que createNameDesign). */
  colors?: string[];
  /** ADR-057 — estilo ilustrado elegido (LetterTileSet.id) o null = "Solo letra". */
  styleSetId?: string | null;
  /** Ola 2A — idioma elegido EN EL ESTUDIO (el cliente ya no lo elige en la PDP). Si viene,
   *  manda sobre el de la variante: define el alfabeto (es incluye Ñ) y queda en metadata. */
  language?: "es" | "en";
  /** Lucy 2026-09-05 — opción de diseño "Con borde / Sin borde" (mismo precio). Default true
   *  (retrocompatible): los diseños guardados antes de la opción no traen la clave y se tratan
   *  como con borde. */
  withBorder?: boolean;
  /**
   * Modelo MULTI-UNIDAD (owner 2026-09-09) — TODOS los sets del diseño con sus
   * colores por ficha. El server valida `units.length === unitCount` y los persiste
   * en metadata.units; el precio ×N sale de `letterSetUnitCount(metadata)` en el
   * carrito (nunca del cliente: units es la única fuente de verdad del N).
   * 2026-10-19 (rediseño owner) — el estilo ilustrado y el borde también son
   * POR SET: cada unidad declara su `styleSetId` (null = «Solo letra») y su
   * `withBorder`; las claves de nivel diseño (styleSetId/withBorder raíz) quedan
   * como representante del set 0 (retrocompat con clientes/lectores viejos).
   */
  units?: { colors?: string[]; styleSetId?: string | null; withBorder?: boolean }[];
  /** Sets del diseño (1..MAX_LETTER_SET_UNITS). Default 1 (diseño de un set). */
  unitCount?: number;
  customerId: string | null;
  sessionId: string | null;
}): Promise<{ id: string; letters: string[]; language: string }> {
  if (!opts.customerId && !opts.sessionId) {
    throw new Error("createLetterSetDesign: requires customerId or sessionId");
  }
  // Multi-unidad: validar la coherencia del N ANTES de escribir (el precio sale de acá).
  const unitCount = Math.min(
    MAX_LETTER_SET_UNITS,
    Math.max(1, Math.trunc(opts.unitCount ?? 1) || 1),
  );
  const units = opts.units ?? [];
  if (unitCount > 1 && units.length !== unitCount) {
    throw new Error(`UNITS_MISMATCH: ${units.length} sets para unitCount=${unitCount}`);
  }
  const product = await prisma.product.findUnique({
    where: { id: opts.productId },
    select: {
      id: true,
      personalizationKind: true,
      personalizationSchema: true,
      variants: {
        where: { id: opts.variantId, isActive: true, deletedAt: null },
        select: { id: true, attributes: true },
      },
    },
  });
  if (!product) throw new Error(`createLetterSetDesign: product ${opts.productId} not found`);
  const variant = product.variants[0];
  if (!variant) throw new Error("createLetterSetDesign: variant not found");
  const schema = (product.personalizationSchema ?? {}) as { letterSet?: string };
  if (schema.letterSet !== "full" && schema.letterSet !== "vowels") {
    throw new Error("LETTERSET_REQUIRED");
  }

  const attrs = parseVariantAttributes(variant.attributes);
  // Ola 2A — el idioma lo elige el cliente en el Estudio (la PDP ya no lo muestra). El del
  // Estudio manda; el de la variante queda como fallback (preselección desde la PDP).
  const language =
    opts.language === "en" || opts.language === "es"
      ? opts.language
      : attrs.language === "en"
        ? "en"
        : "es";
  const letters =
    schema.letterSet === "vowels" ? ["A", "E", "I", "O", "U"] : (ALPHABET[language] ?? ALPHABET.es);

  const canvasData: CanvasDataV1 = {
    version: 1,
    stage: { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 },
    layers: [{ id: "background", type: "background", color: "#FFFFFF" }],
  };

  const design = await prisma.design.create({
    data: {
      productId: opts.productId,
      templateId: null,
      customerId: opts.customerId,
      sessionId: opts.sessionId,
      status: "DRAFT",
      canvasData: canvasData as unknown as Prisma.InputJsonValue,
      metadata: {
        kind: product.personalizationKind,
        surface: "letterset",
        schemaVersion: 2,
        letterSet: schema.letterSet,
        language,
        // Recover (?designId=): variante con la que se creó el diseño — el Estudio
        // reabre con ella (el link «Editar» del carrito solo trae designId).
        variantId: opts.variantId,
        frameTheme: opts.frameTheme,
        letters,
        // Color efectivo por ficha (para producción). Acotado al nº de letras del set.
        colors: Array.isArray(opts.colors) ? opts.colors.slice(0, letters.length) : [],
        // Multi-unidad (2026-09-09) — TODOS los sets con sus colores por ficha
        // (validados arriba: units.length === unitCount). El carrito deriva el
        // precio ×N de `unitCount` (letterSetUnitCount) y producción ve las N
        // láminas. Con 1 set no se escribe (retrocompatible con diseños viejos).
        // 2026-10-19 — estilo ilustrado y borde POR SET: cada unidad persiste
        // los suyos (styleSetId null = «Solo letra», withBorder default true).
        ...(unitCount > 1
          ? {
              unitCount,
              units: units.map((u) => ({
                colors: Array.isArray(u.colors) ? u.colors.slice(0, letters.length) : [],
                styleSetId: typeof u.styleSetId === "string" ? u.styleSetId : null,
                withBorder: u.withBorder !== false,
              })),
            }
          : {}),
        // Estilo ilustrado elegido (para producción). null = "Solo letra".
        styleSetId: opts.styleSetId ?? null,
        // Opción de diseño "Con borde / Sin borde" (Lucy 2026-09-05). Siempre se persiste el
        // booleano: default true = con borde (comportamiento histórico, retrocompatible con
        // diseños que no traen la clave).
        withBorder: opts.withBorder !== false,
      },
    },
  });

  logger.info(
    {
      event: "design.create_letterset.success",
      designId: design.id,
      productId: opts.productId,
      letterSet: schema.letterSet,
      frameTheme: opts.frameTheme,
    },
    "Letter set design created",
  );

  // 2026-10-13 — misma poda «últimos N» que createNameDesign (cada confirmación
  // del editor de sets crea un DRAFT nuevo del mismo dueño+producto).
  await trimDraftsBestEffort(
    { customerId: opts.customerId, sessionId: opts.sessionId },
    opts.productId,
    design.id,
  );

  return { id: design.id, letters, language };
}

// ──────────────────────────────────────────────────────────────────
//  Save canvas (DRAFT only). Acepta V1 o V2. N-08: también puede
//  actualizar Design.templateId (cambio de plantilla del sidebar),
//  validado contra el producto antes de persistirse.
// ──────────────────────────────────────────────────────────────────

/**
 * 2026-10-13 — miniatura del DRAFT para "Mis diseños": sube el dataURL (≤400 px,
 * WebP/JPEG — lo genera el auto-save del Estudio, throttled) al bucket público
 * design-previews en el path FIJO `<designId>/draft-preview.<ext>` con upsert
 * (sobreescribe la anterior: NO acumula archivos por diseño; si cambia la
 * extensión entre navegadores, borra el archivo viejo). Devuelve la URL pública
 * o null si el payload no es una imagen aceptada. La purga de retención y el
 * barrido de huérfanos cubren estos bytes (path anclado al designId + columna
 * Design.draftPreviewUrl en purgeDesignBatch/archiveCustomerDesign).
 */
async function uploadDraftPreviewThumbnail(
  designId: string,
  dataUrl: string,
  previousUrl: string | null,
): Promise<string | null> {
  const match = dataUrl.match(/^data:(image\/(?:webp|jpeg|png));base64,(.+)$/);
  if (!match) return null;
  const mime = match[1] as PreviewMime;
  if (!PREVIEW_ALLOWED_MIME.includes(mime)) return null;
  const buf = Buffer.from(match[2]!, "base64");
  // Cap defensivo server-side (el schema ya limita el string a ~160 KB
  // binarios): un thumbnail legítimo pesa 10-40 KB.
  if (buf.length === 0 || buf.length > 256 * 1024) return null;
  // El bucket es PÚBLICO: verificar que el buffer decodifica como imagen del
  // mime declarado antes de exponerlo (un blob arbitrario no se sube).
  const { sniffImageMime } = await import("@/lib/storage");
  if (sniffImageMime(buf) !== mime) return null;

  const path = `${designId}/draft-preview.${previewExtensionForMime(mime)}`;
  const previousPath = previousUrl ? pathFromPublicUrl(previousUrl, PREVIEWS_BUCKET) : null;
  const { error } = await supabaseService.storage.from(BUCKET_PREVIEWS).upload(path, buf, {
    contentType: mime,
    // 5 min: el path es fijo y el contenido cambia con cada thumbnail nuevo —
    // un cacheControl largo serviría la miniatura vieja tras re-editar.
    cacheControl: "300",
    upsert: true,
  });
  if (error) {
    logger.warn(
      { event: "design.save_canvas.draft_preview_upload_fail", designId, err: error.message },
      "Draft preview upload fail (best-effort: el canvas se guarda igual)",
    );
    return null;
  }
  // Si la extensión cambió (otro navegador sin WebP), borrar el archivo viejo
  // para no acumular dos miniaturas del mismo diseño.
  if (previousPath && previousPath !== path) {
    await removeStorage(PREVIEWS_BUCKET, [previousPath]);
  }
  const {
    data: { publicUrl },
  } = supabaseService.storage.from(BUCKET_PREVIEWS).getPublicUrl(path);
  return publicUrl;
}

export async function saveCanvas(opts: {
  designId: string;
  canvasData: CanvasData;
  /**
   * N-08 (2026-09-11) — plantilla aplicada en el sidebar (`store.applyTemplate`):
   * el auto-save la envía para que `Design.templateId` refleje el cambio (antes
   * nunca se persistía). Se valida server-side con la MISMA regla que
   * createDraftDesign (activa, EDITABLE, kind del producto, producto/global) —
   * anónimos y autenticados por igual. Si NO pasa la validación (p.ej. la
   * desactivaron entre la carga de la página y el guardado), el canvasData se
   * guarda igual y el templateId queda como estaba: el canvas es la SoT y un
   * auto-save de 2 s no debe romperse por una FK informativa.
   */
  templateId?: string;
  /**
   * 2026-10-12 — variante EFECTIVA de un pack de foto (matchea el N de fotos +
   * magnet del canvas): se persiste en metadata.variantId para que el recover
   * (?designId=, «Editar» desde el carrito) reabra el Estudio con ESA variante
   * en vez de caer a la primera del producto. Se valida contra las variantes
   * del producto (anti-tamper, mismo criterio que templateId); si no pasa, el
   * canvasData se guarda igual y la metadata queda como estaba. La ruta del
   * dinero NO la lee: el carrito deriva la variante del canvasData, como siempre.
   */
  variantId?: string;
  /**
   * 2026-10-13 — miniatura del borrador para "Mis diseños" (ver
   * uploadDraftPreviewThumbnail). Opcional y BEST-EFFORT: un fallo de upload
   * nunca rompe el guardado del canvas (el thumbnail se reintenta en un save
   * posterior). Solo se procesa en diseños DRAFT (gate de abajo).
   */
  draftPreviewDataUrl?: string;
  customerId: string | null;
  sessionId: string | null;
}) {
  const design = await getOwnedDesign(opts.designId, opts);
  if (!design) {
    throw new Error("Design not found or not owned by caller");
  }
  if (design.status !== "DRAFT") {
    throw new Error(`Design is ${design.status} — only DRAFT can be edited`);
  }

  const referencedAssetIds =
    opts.canvasData.version === 2
      ? opts.canvasData.slots.flatMap((slot) => (slot.assetId ? [slot.assetId] : []))
      : [];
  if (referencedAssetIds.length > 0) {
    await prisma.designAsset.updateMany({
      where: {
        id: { in: referencedAssetIds },
        designId: null,
        ...(opts.customerId ? { customerId: opts.customerId } : { sessionId: opts.sessionId }),
      },
      data: { designId: design.id },
    });
  }

  let templateId: string | undefined;
  if (opts.templateId) {
    const product = await prisma.product.findUnique({
      where: { id: design.productId },
      select: { personalizationKind: true },
    });
    const tpl = product
      ? await findUsableEditableTemplate({
          templateId: opts.templateId,
          productId: design.productId,
          kind: product.personalizationKind,
        })
      : null;
    if (tpl) {
      templateId = tpl.id;
    } else {
      logger.warn(
        {
          event: "design.save_canvas.template_rejected",
          designId: design.id,
          templateId: opts.templateId,
        },
        "templateId inválido en saveCanvas — se conserva el anterior",
      );
    }
  }

  let variantId: string | undefined;
  const declaresPackVariant =
    opts.canvasData.version === 2 && typeof opts.canvasData.photoSlots === "number";
  if (declaresPackVariant) {
    const variants = await prisma.productVariant.findMany({
      where: { productId: design.productId, isActive: true, deletedAt: null },
      select: { id: true, price: true, stock: true, attributes: true },
    });
    const effective = resolveEffectiveVariant({ variants, canvasData: opts.canvasData });
    if (effective) {
      variantId = effective.id;
    } else {
      logger.warn(
        {
          event: "design.save_canvas.variant_unresolved",
          designId: design.id,
          requestedVariantId: opts.variantId ?? null,
        },
        "El canvas no tiene una variante activa exacta — se conserva la metadata anterior",
      );
    }
  } else if (opts.variantId) {
    const owns = await prisma.productVariant.findFirst({
      where: { id: opts.variantId, productId: design.productId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (owns) {
      variantId = owns.id;
    } else {
      logger.warn(
        {
          event: "design.save_canvas.variant_rejected",
          designId: design.id,
          variantId: opts.variantId,
        },
        "variantId inválido en saveCanvas — se conserva la metadata anterior",
      );
    }
  }

  const incomingClientRev = opts.canvasData.version === 2 ? opts.canvasData.clientRev : undefined;
  const update = await prisma.design.updateMany({
    where: {
      id: design.id,
      status: "DRAFT",
      clientRev: incomingClientRev === undefined ? BigInt(0) : { lte: BigInt(incomingClientRev) },
    },
    data: {
      canvasData: opts.canvasData as unknown as Prisma.InputJsonValue,
      ...(incomingClientRev === undefined ? {} : { clientRev: BigInt(incomingClientRev) }),
      ...(templateId ? { templateId } : {}),
      ...(variantId
        ? {
            metadata: {
              ...((design.metadata as Record<string, unknown> | null) ?? {}),
              variantId,
            } as Prisma.InputJsonValue,
          }
        : {}),
    },
  });
  if (update.count !== 1) {
    const current = await prisma.design.findUnique({
      where: { id: design.id },
      select: { status: true },
    });
    if (!current) throw new Error("Design not found or not owned by caller");
    if (current.status !== "DRAFT") {
      throw new Error(`Design is ${current.status} — only DRAFT can be edited`);
    }
    throw new Error("STALE_REVISION");
  }

  // 2026-10-13 — miniatura del borrador (Mis diseños). DESPUÉS del guardado del
  // canvas (lo importante) y best-effort: cualquier fallo se loguea y el save
  // sigue OK — el thumbnail se reintenta en el próximo auto-save.
  if (opts.draftPreviewDataUrl) {
    try {
      const url = await uploadDraftPreviewThumbnail(
        design.id,
        opts.draftPreviewDataUrl,
        design.draftPreviewUrl ?? null,
      );
      if (url) {
        await prisma.design.update({
          where: { id: design.id },
          data: { draftPreviewUrl: url },
        });
      }
    } catch (err) {
      logger.warn(
        {
          event: "design.save_canvas.draft_preview_fail",
          designId: design.id,
          err: err instanceof Error ? err.message : String(err),
        },
        "Draft preview falló (best-effort: el canvas ya quedó guardado)",
      );
    }
  }
}

// ──────────────────────────────────────────────────────────────────
//  Finalize (snapshot READY) — V2 multi-PNG
// ──────────────────────────────────────────────────────────────────
//
// Recibe `previewDataUrl` (snapshot del grid completo, 1 PNG) +
// `productionDataUrls[]` (snapshots individuales, N PNGs a 300 DPI).
//
// Server:
//   1. Valida ownership + status DRAFT
//   2. Valida productionDataUrls.length === slots REQUERIDOS del canvas
//      (todos los slots tienen snapshot — el cliente NO debe enviar
//       finalize si hay slots vacíos; el server bloquea por defensa.
//       Excepción 2026-09-22: con `backOptional` en el schema del producto
//       las caras B —slots impares— pueden faltar; producción duplica la A)
//   3. Sube preview compositado a bucket design-previews (público)
//   4. Sube N production PNGs a bucket production-assets (privado)
//   5. Marca Design.status=READY, persiste previewUrl + productionUrls[]

// ──────────────────────────────────────────────────────────────────
//  Fallback: snapshots del cliente por subida DIRECTA a Storage (ADR-081)
// ──────────────────────────────────────────────────────────────────
//
// Cuando ningún tier server-side reproduce el diseño con fidelidad (hoy: el marco SVG de la
// Polaroid, que trae fuentes horneadas), los PNG de imprenta tienen que venir del navegador. Lo que
// NO pueden hacer es venir por el body de la Server Action: un slot solo ya llega a 5 MB y Vercel
// corta las Functions en 4.5 MB. Van directo a Storage con una URL firmada de subida y el servidor
// los recoge de ahí — ese camino no pasa por la Function, así que no tiene techo de tamaño.
//
// El área de paso vive bajo el prefijo `_client/` del propio diseño y se borra al terminar: los
// archivos definitivos son siempre los que sube `finalizeDesign`.

const MAX_STAGED_SLOT_BYTES = 20 * 1024 * 1024;

/**
 * Emite N URLs firmadas de subida (2 h) para los snapshots del cliente.
 *
 * Valida propiedad y estado DRAFT antes de emitirlas: una URL firmada es una CAPACIDAD, y emitir
 * una sobre un diseño ajeno dejaría sobrescribir sus archivos de imprenta.
 *
 * Y acota cuántas emite contra la variante efectiva, no contra el canvas: `slotCount` lo escribe
 * el cliente, así que confiar en él regalaría permisos de escritura en el área de paso.
 */
export async function createClientSlotUploadTickets(opts: {
  designId: string;
  customerId: string | null;
  sessionId: string | null;
}): Promise<{ slotIndex: number; url: string }[]> {
  const design = await getOwnedDesign(opts.designId, opts);
  if (!design) throw new Error("Design not found or not owned by caller");
  if (design.status !== "DRAFT") {
    throw new Error(`Design is ${design.status} — only DRAFT can be finalized`);
  }
  const canvasData = design.canvasData as unknown as CanvasData;
  const slotCount = canvasData.version === 2 ? (canvasData as CanvasDataV2).slotCount : 1;
  const declaredUnits = canvasData.version === 2 ? unitCountOf(canvasData as CanvasDataV2) : 1;
  const { productConfig, effectiveVariant, metadataVariantId } =
    await loadEffectiveProductConfig(design);
  const allowed = productConfig.photoSlots;
  // `facesPerUnit: 2` (separadores) manda 2 snapshots por unidad: el tope es por CARA, no por pieza.
  const faces = productConfig.facesPerUnit ?? 1;
  const maxSlots = Math.max(1, allowed * faces * declaredUnits);
  if (slotCount > maxSlots) {
    throw new Error(
      `INCOMPLETE_SLOTS: el diseño declara ${slotCount} piezas y el producto admite ${maxSlots}`,
    );
  }

  // Cara B opcional (backOptional, 2026-09-22): las caras B sin diseñar (slot
  // impar sin assetUrl) NO reciben ticket — el cliente solo sube caras A y las
  // B que sí diseñó; finalize genera una cara B EN BLANCO para cada B vacía
  // (blank-back-face.ts — decisión owner 2026-10-07, nunca espejo de la A).
  const skipBackSlots = new Set<number>(
    productConfig.facesPerUnit === 2 &&
      productConfig.backOptional === true &&
      canvasData.version === 2
      ? (canvasData as CanvasDataV2).slots
          .filter((s) => s.slotIndex % 2 === 1 && !s.assetUrl)
          .map((s) => s.slotIndex)
      : [],
  );

  const ticketContext = {
    designId: design.id,
    clientRev: Number(design.clientRev),
    slotCount,
    requiredSlots: slotCount - skipBackSlots.size,
    maxSlots,
    variantId: effectiveVariant?.id ?? metadataVariantId ?? null,
    bucket: BUCKET_PRODUCTION,
  };
  logger.info({ event: "design.slot_tickets.prepare", ...ticketContext }, "Preparando tickets");

  const tickets: { slotIndex: number; url: string }[] = [];
  for (let i = 0; i < slotCount; i++) {
    if (skipBackSlots.has(i)) continue;
    try {
      const data = await withRetry(
        async () => {
          const { data, error } = await supabaseService.storage
            .from(BUCKET_PRODUCTION)
            .createSignedUploadUrl(stagedSlotPath(design.id, i), { upsert: true });
          if (error || !data) throw error ?? new Error("signed upload URL vacía");
          return data;
        },
        { attempts: 3, baseMs: 250, maxMs: 1200 },
      );
      tickets.push({ slotIndex: i, url: data.signedUrl });
    } catch (err) {
      logger.error(
        {
          event: "design.slot_tickets.prepare_failed",
          ...ticketContext,
          slotIndex: i,
          err: err instanceof Error ? err.message : String(err),
        },
        "Falló la emisión del ticket",
      );
      throw new Error(`No pudimos preparar la subida del slot ${i + 1}. Intenta de nuevo.`);
    }
  }
  return tickets;
}

/** Recoge del área de paso los snapshots que subió el cliente (uno por índice REQUERIDO). */
async function readStagedClientSlots(designId: string, slotIndexes: number[]): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (const i of slotIndexes) {
    const { data, error } = await supabaseService.storage
      .from(BUCKET_PRODUCTION)
      .download(stagedSlotPath(designId, i));
    if (error || !data) {
      throw new Error(`INCOMPLETE_SLOTS: falta el snapshot del slot ${i + 1}`);
    }
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length === 0) throw new Error(`INCOMPLETE_SLOTS: el slot ${i + 1} llegó vacío`);
    if (buf.length > MAX_STAGED_SLOT_BYTES) {
      throw new Error(
        `slot ${i + 1} demasiado grande (${Math.round(buf.length / 1024 / 1024)}MB, max 20MB)`,
      );
    }
    out.push(buf);
  }
  return out;
}

/**
 * Cara B EN BLANCO (decisión owner 2026-10-07 — revierte la regla espejo del
 * Paquete D): carga perezosa del generador (sharp nativo — ver nota en imports).
 * Si el binario no carga NO caemos a la regla espejo vieja: imprenta recibiría
 * un producto distinto del que el cliente aprobó. El finalize falla con mensaje
 * claro y el diseño queda DRAFT para reintentar.
 */
async function loadBlankBackFace(): Promise<typeof import("./blank-back-face")> {
  try {
    return await import("./blank-back-face");
  } catch (err) {
    logger.error(
      {
        event: "design.finalize.blank_back_face_error",
        err: err instanceof Error ? err.message : String(err),
      },
      "No se pudo cargar el generador de cara B en blanco (sharp nativo)",
    );
    throw new Error("No pudimos preparar la cara B en blanco del separador. Intenta de nuevo.");
  }
}

/**
 * Borra el área de paso. Best-effort: no romper un finalize que ya salió bien.
 *
 * Lista lo que hay en vez de reconstruir las rutas desde `slotCount`: si el canvas cambió entre la
 * subida y el finalize, reconstruirlas dejaría archivos atrás.
 */
async function discardStagedClientSlots(designId: string): Promise<void> {
  const paths = await listStagedSlotPaths(BUCKET_PRODUCTION, [designId]);
  if (paths.length === 0) return;
  const { error } = await supabaseService.storage.from(BUCKET_PRODUCTION).remove(paths);
  if (error) {
    logger.warn(
      { event: "design.finalize.staging_cleanup_fail", designId, err: error.message },
      "No se pudo limpiar el área de paso de snapshots",
    );
  }
}

export async function finalizeDesign(opts: {
  designId: string;
  /** Buffer binario del preview compositado (PNG 1080×1080 típico). */
  previewBuffer: Buffer;
  /**
   * Mime real del preview (T2, 2026-09-22): el Estudio manda WebP/JPEG y el
   * server action re-comprime a WebP cuando el blob supera el techo. Define la
   * extensión del archivo en Storage (preview.webp/.jpg/.png) y su contentType.
   * Default "image/png" (clientes viejos que mandan PNG).
   */
  previewMime?: string;
  /**
   * Buffers binarios de los N snapshots production (PNG 300 DPI por slot).
   *
   * OPCIONAL desde 2026-07-25 (ADR-081) — y ausente en el caso normal. Los PNG de imprenta los
   * RENDERIZA EL SERVIDOR; estos son el fallback para lo que ningún tier server-side reproduce
   * (hoy: el marco SVG de la Polaroid). Mandarlos siempre era lo que rompía producción: 12 páginas
   * de calendario pesan ~57 MB y Vercel corta el body de una Function en 4.5 MB.
   *
   * Cuando vienen, se reciben como Buffer y no como dataURL base64 porque el protocolo React Flight
   * de Next 16 chunkea los strings grandes y dispara "Maximum array nesting exceeded"; la acción
   * recibe FormData con Blobs y el llamador convierte a Buffer.
   */
  productionBuffers?: Buffer[];
  /**
   * ADR-081 — el cliente ya subió sus snapshots al área de paso de Storage (segunda pasada, tras un
   * `NEEDS_CLIENT_SLOTS`): recógelos de ahí en vez de esperarlos en el body.
   */
  useStagedClientSlots?: boolean;
  customerId: string | null;
  sessionId: string | null;
  /** ADR-063 CAL2 — año elegido por el cliente para un calendario mes-a-mes (opcional). */
  calendarYear?: number;
  /**
   * Paquete C (2026-10-02) — aceptación EXPLÍCITA de calidad de fotos: el cliente
   * marcó el checkbox de la Vista Previa ("entiendo que estas fotos pueden
   * imprimirse con menor calidad"). Se sella en Design.qualityAcknowledgedAt —
   * evidencia ante reclamos de garantía. Ausente/false → la columna queda null.
   */
  qualityAcknowledged?: boolean;
}) {
  // PERF (2026-10-07) — reloj de fases para el evento design.finalize.timing
  // (render / uploads / total): el p95 se lee en los logs de Vercel.
  const tFinalizeStart = Date.now();
  const design = await getOwnedDesign(opts.designId, opts);
  if (!design) {
    throw new Error("Design not found or not owned by caller");
  }
  // Finalizar es IDEMPOTENTE. Un diseño ya READY no se puede editar (`saveCanvas` solo acepta
  // borradores), así que volver a finalizarlo no puede producir nada distinto: devolverlo tal cual es
  // la respuesta correcta. Antes se lanzaba un error, y eso dejaba al cliente sin salida cuando el
  // finalize salía bien pero el CARRITO fallaba: al reintentar veía «Design is READY — only DRAFT can
  // be finalized» —texto interno, en inglés— y por más que insistiera nunca podía completar la compra
  // (revisión adversarial 2026-07-25).
  if (design.status === "READY" && design.productionUrls.length > 0) {
    logger.info(
      { event: "design.finalize.already_ready", designId: design.id },
      "Finalize idempotente: el diseño ya estaba listo",
    );
    return design;
  }
  // ADR-131 — READY pero SIN productionUrls: el render quedó corriendo en background
  // (RenderJob) cuando el cliente siguió al carrito. Re-finalizar no re-hace nada: si el job
  // sigue vivo, es no-op; si murió FAILED (o el diseño quedó en este estado sin job), se
  // re-encola y se patea de nuevo — el carrito nunca se queda sin salida.
  if (design.status === "READY") {
    const existingJob = await prisma.renderJob.findUnique({
      where: { designId: design.id },
      select: { id: true, status: true },
    });
    if (existingJob && (existingJob.status === "PENDING" || existingJob.status === "PROCESSING")) {
      logger.info(
        { event: "design.finalize.render_in_flight", designId: design.id },
        "Finalize idempotente: el render de producción sigue en curso",
      );
      return design;
    }
    const cd = design.canvasData as unknown as CanvasData;
    if (cd?.version === 2) {
      await createOrResetRenderJob({
        designId: design.id,
        productId: design.productId,
        slotCount: (cd as CanvasDataV2).slotCount,
        calendarYear: opts.calendarYear,
      });
      await processRenderJobs({
        onlyDesignId: design.id,
        budgetMs: RENDER_JOB_KICK_BUDGET_MS,
        maxJobs: 1,
      });
      logger.info(
        { event: "design.finalize.render_requeued", designId: design.id },
        "RenderJob re-encolado desde un finalize repetido",
      );
    }
    return design;
  }
  if (design.status !== "DRAFT") {
    throw new Error(`Design is ${design.status} — only DRAFT can be finalized`);
  }

  // Si el cliente mandó snapshots, deben ser exactamente uno por slot REQUERIDO.
  const canvasData = design.canvasData as unknown as CanvasData;
  const v2 = canvasData.version === 2 ? (canvasData as CanvasDataV2) : null;
  // Sets de letras (canvasData V1 stub + metadata.surface="letterset"): el Estudio
  // sube UNA lámina de producción POR SET (production_i, 1 lámina/unidad — el set
  // es la unidad). El finalize espera exactamente `unitCount` snapshots (validados
  // al crear: units.length === unitCount), no 1 — antes un diseño multi-set
  // rebotaba con «INCOMPLETE_SLOTS: expected 1 production snapshots, got N» y la
  // venta quedaba bloqueada. Los índices son posicionales: production_i = set i.
  const expectedSlotCount = v2 ? v2.slotCount : letterSetUnitCount(design.metadata);

  // Cara B OPCIONAL (backOptional, 2026-09-22 — separadores magnéticos 2×6/4×4.2
  // y alargados): cuando el schema del producto lo declara, las caras B (slots
  // impares 2k+1 — convención de lib/faces.ts) pueden quedar SIN diseñar. Solo
  // se exige snapshot de las caras A y de las B que sí tienen asset; producción
  // genera una cara B EN BLANCO para cada B vacía (blank-back-face.ts — decisión
  // owner 2026-10-07, revierte la regla espejo: nunca copia de la cara A).
  const { productConfig } = await loadEffectiveProductConfig(design);
  const backOptional = productConfig.facesPerUnit === 2 && productConfig.backOptional === true;
  const emptyBackSlots = new Set<number>(
    backOptional && v2
      ? v2.slots.filter((s) => s.slotIndex % 2 === 1 && !s.assetUrl).map((s) => s.slotIndex)
      : [],
  );
  // Índices de slot que SÍ requieren snapshot, en orden (posicional para los
  // arrays de buffers inline/staged del cliente).
  const requiredSlotIndexes = Array.from({ length: expectedSlotCount }, (_, i) => i).filter(
    (i) => !emptyBackSlots.has(i),
  );
  if (opts.productionBuffers && opts.productionBuffers.length !== requiredSlotIndexes.length) {
    throw new Error(
      `INCOMPLETE_SLOTS: expected ${requiredSlotIndexes.length} production snapshots, got ${opts.productionBuffers.length}`,
    );
  }

  // Validar también que todos los slots V2 REQUERIDOS tienen assetUrl (defensa server)
  if (v2) {
    const empty = v2.slots
      .filter((s) => !s.assetUrl && !emptyBackSlots.has(s.slotIndex))
      .map((s) => s.slotIndex);
    if (empty.length > 0) {
      throw new Error(`INCOMPLETE_SLOTS: slots vacíos ${empty.join(", ")}`);
    }
  }

  // Para el render server-side, las caras B vacías se alimentan al motor como
  // COPIA DE TRABAJO de la cara A de su pareja (mismo asset/encuadre): el motor
  // exige un asset por slot. Esa copia se DESCARTA después del render y se
  // reemplaza por la cara BLANCA real (blankOutEmptyBackFaces, más abajo) — es
  // lo que imprenta imprime (owner 2026-10-07).
  const canvasForRender =
    v2 && emptyBackSlots.size > 0
      ? {
          ...v2,
          slots: v2.slots.map((s) => {
            if (!emptyBackSlots.has(s.slotIndex)) return s;
            const faceA = v2.slots.find((x) => x.slotIndex === s.slotIndex - 1);
            return faceA ? { ...faceA, slotIndex: s.slotIndex } : s;
          }),
        }
      : v2;

  const supabase = supabaseService;

  // ADR-057 A1a — El render de producción lo hace el SERVIDOR (independiente del celular del
  // cliente). ADR-081 — es la vía PRINCIPAL, no una mejora: el cliente ya no manda los PNG
  // salvo que se los pidamos, porque no caben en el body de una Function de Vercel (4.5 MB
  // contra ~57 MB de un calendario). Si ningún tier reproduce el diseño con fidelidad (hoy
  // solo el marco SVG de la Polaroid) se exige el fallback del cliente, que sube por Storage
  // y no por el body.
  //
  // ADR-131 (2026-10-13) — el render ya NO corre en este request: se encola un RenderJob y el
  // worker (cron + el kick de abajo) lo procesa página por página con progreso real. Antes un
  // set de calendario ×3 = 36 páginas dentro de la Server Action con maxDuration=60 → la
  // Function moría (500/504) y el cliente esperaba "Guardando…" a ciegas hasta el crash.
  //
  // Va ANTES de subir el preview a propósito: la primera pasada de un diseño que necesita el
  // fallback termina en `NEEDS_CLIENT_SLOTS`, y si el cliente abandona ahí, un preview ya subido
  // quedaría huérfano en un bucket PÚBLICO sin ninguna fila que lo referencie (revisión adversarial
  // 2026-07-25). Resolver primero los PNG deja el efecto de red recién cuando el finalize va a salir.
  let productionBuffers: Buffer[] | undefined;
  if (opts.productionBuffers) {
    // Caras B vacías → cara BLANCA del tamaño/DPI de su cara A (owner 2026-10-07).
    productionBuffers =
      emptyBackSlots.size > 0
        ? await (
            await loadBlankBackFace()
          ).expandMissingBackFaces(opts.productionBuffers, requiredSlotIndexes, expectedSlotCount)
        : opts.productionBuffers;
  }
  if (canvasForRender && !opts.productionBuffers && !opts.useStagedClientSlots) {
    // Guard estático: los motivos de fallback decidibles por slot SIN renderizar (filtro,
    // rotación, texto multilínea) se resuelven acá — el diseño ni siquiera encola el job.
    const staticReason = staticClientFallbackReason(canvasForRender);
    if (staticReason) {
      throw new Error(
        `NEEDS_CLIENT_SLOTS: el servidor no puede renderizar este diseño (${staticReason})`,
      );
    }
  }
  // Fuera del `if` de v2: con canvasData v1 también se emiten tickets, y dejar la lectura dentro
  // dejaba al cliente en un bucle —sube los PNG, y el finalize vuelve a pedírselos— sin salida.
  if (!productionBuffers && opts.useStagedClientSlots) {
    const staged = await readStagedClientSlots(design.id, requiredSlotIndexes);
    // Caras B vacías → cara BLANCA del tamaño/DPI de su cara A (owner 2026-10-07).
    productionBuffers =
      emptyBackSlots.size > 0
        ? await (
            await loadBlankBackFace()
          ).expandMissingBackFaces(staged, requiredSlotIndexes, expectedSlotCount)
        : staged;
    logger.info(
      {
        event: "design.finalize.staged_slots_used",
        designId: design.id,
        slots: productionBuffers.length,
      },
      "Snapshots del cliente recogidos del área de paso",
    );
  }
  if (productionBuffers && emptyBackSlots.size > 0) {
    logger.info(
      {
        event: "design.finalize.back_faces_blank",
        designId: design.id,
        backs: [...emptyBackSlots],
      },
      "Caras B vacías resueltas EN BLANCO (backOptional, owner 2026-10-07)",
    );
  }
  // ADR-131 — sin PNG del cliente, el render pasa al RenderJob ASÍNCRONO: se crea/resetea el
  // job y se patea con un presupuesto chico (kick). La PRIMERA unidad del kick es además el
  // probe de renderabilidad real (motor nativo + plantilla + primera foto): si revienta, el
  // desenlace es el de siempre — NEEDS_CLIENT_SLOTS y el cliente sube sus PNG por Storage.
  let asyncRenderJob = false;
  if (!productionBuffers) {
    if (!canvasForRender) {
      // canvasData v1 sin snapshots del cliente: no hay fuente server-side para imprenta.
      throw new Error(
        `NEEDS_CLIENT_SLOTS: el servidor no pudo renderizar los ${expectedSlotCount} PNG de imprenta`,
      );
    }
    await createOrResetRenderJob({
      designId: design.id,
      productId: design.productId,
      slotCount: expectedSlotCount,
      calendarYear: opts.calendarYear,
    });
    asyncRenderJob = true;
    await processRenderJobs({
      onlyDesignId: design.id,
      budgetMs: RENDER_JOB_KICK_BUDGET_MS,
      maxJobs: 1,
    });
    const job = await prisma.renderJob.findUnique({
      where: { designId: design.id },
      select: {
        id: true,
        status: true,
        totalUnits: true,
        doneUnits: true,
        attempts: true,
        error: true,
      },
    });
    // FAILED en el kick = el probe declaró el diseño no renderizable (NEEDS_KONVA, sin
    // archivos del cliente que conservar). doneUnits=0 con attempts>0 = la primera unidad
    // lanzó un error genérico (hoy ese fallo también terminaba en fallback al cliente).
    if (job && (job.status === "FAILED" || (job.doneUnits === 0 && job.attempts > 0))) {
      logger.info(
        {
          event: "design.finalize.async_probe_failed",
          designId: design.id,
          jobStatus: job.status,
          err: job.error,
        },
        "El probe del render asíncrono falló — se piden los snapshots al cliente",
      );
      await prisma.renderJob.delete({ where: { id: job.id } }).catch(() => undefined);
      throw new Error(
        `NEEDS_CLIENT_SLOTS: el servidor no pudo renderizar los ${expectedSlotCount} PNG de imprenta`,
      );
    }
    logger.info(
      {
        event: "design.finalize.async_render_enqueued",
        designId: design.id,
        totalUnits: job?.totalUnits,
        doneUnitsAfterKick: job?.doneUnits,
        kickCompleted: job?.status === "DONE",
      },
      "Render de producción encolado (worker + cron cada minuto)",
    );
  }
  // Fase RENDER cerrada: con buffers del cliente ya están resueltos acá; con RenderJob quedó
  // encolado/parcialmente procesado (el cron lo termina). renderMs mide el kick en ese caso.
  const renderMs = Date.now() - tFinalizeStart;

  // Subir preview compositado del grid completo. La extensión refleja el mime
  // REAL (T2, 2026-09-22: webp/jpg/png) — los consumers (OrderItem.designAssetUrl,
  // admin) solo usan la URL pública, nunca asumen ".png".
  const previewMime = PREVIEW_ALLOWED_MIME.includes(opts.previewMime as PreviewMime)
    ? (opts.previewMime as PreviewMime)
    : "image/png";
  const previewPath = `${design.id}/preview.${previewExtensionForMime(previewMime)}`;
  const { error: pErr } = await supabase.storage
    .from(BUCKET_PREVIEWS)
    .upload(previewPath, opts.previewBuffer, {
      contentType: previewMime,
      // 1 año: el path va versionado por diseño (<designId>/preview.<ext>) y el contenido
      // no cambia una vez finalizado (T4). OJO: si el diseño se RE-finaliza, el upsert
      // pisa el mismo path y el CDN/navegador puede servir el preview anterior hasta que
      // venza el cache — riesgo aceptado (re-finalize es excepcional y admin-driven).
      cacheControl: "31536000",
      upsert: true,
    });
  if (pErr) {
    logger.warn(
      { event: "design.finalize.upload_preview_fail", err: pErr.message },
      "Preview upload fail",
    );
    throw new Error(`No pudimos subir el preview: ${pErr.message}`);
  }
  const {
    data: { publicUrl: previewPublicUrl },
  } = supabase.storage.from(BUCKET_PREVIEWS).getPublicUrl(previewPath);

  // 2026-10-13 — artefactos WATERMARK del preview (anti-copia en las superficies
  // de exhibición: carrito, "Ver diseño", Mis diseños, /d/<token> + OG,
  // cotización, gracias, pedidos): preview-wm.webp + thumb.webp por convención
  // de paths (preview-artifacts.ts). BEST-EFFORT: si sharp/Storage fallan, el
  // finalize sigue y las superficies degradan al preview limpio (columna
  // previewWatermarkedAt queda null = "no existen"). Las páginas por unidad las
  // sube el Estudio tras el finalize (saveDesignPreviewPages) — el Estudio ya
  // las compone para su modal y es la fuente más fiel (server-side no puede
  // recomponer las unidades del montaje: separadores/calendario no son grids
  // uniformes). El thumb queda provisionalmente del global; la primera página
  // lo reemplaza al llegar (miniatura representativa, decisión 2026-10-13).
  const previewArtifactsOk = await uploadPreviewWatermarkArtifacts(design.id, opts.previewBuffer);

  // Ola 3 (Lucy 2026-07-22) — SEPARADORES 2 CARAS: la pieza física cuelga de la página
  // con el DOBLEZ ARRIBA; la imprenta recibe la tira DESPLEGADA VERTICAL en disposición
  // "cabezas al doblez" (tête-bêche): cara B ARRIBA rotada 180°, cara A ABAJO derecha —
  // así ambas caras se leen derechas al colgar (corrección del owner 2026-09-25; la
  // convención anterior —A arriba, B abajo rotada— dejaba ambas cabeza-abajo).
  // Desplegado: 2×12 / 4×8.4 cm. El cliente sube 2N snapshots (uno por slot cara A/B,
  // espejo del canvas); acá se componen N tiras (slot 2k = cara A, slot 2k+1 = cara B)
  // con las esquinas exteriores redondeadas del troquel.
  // noFold (Alargados planos): composición horizontal A|B sin rotar (histórico).
  // Solo aplica a buffers resueltos EN ESTE REQUEST (inline/staged del cliente);
  // en la vía asíncrona (ADR-131) las tiras las compone el worker, par por par.
  let facesComposed = false;
  if (productionBuffers && canvasData.version === 2) {
    // productConfig ya se cargó arriba (validación de slots / backOptional).
    if (productConfig.facesPerUnit === 2 && productionBuffers.length % 2 === 0) {
      try {
        // cornerRadiusPx del schema es en px LÓGICOS del stage de la cara; los buffers
        // están a escala de producción (×3, mismo factor que el snapshot del cliente).
        // composeFaceStrips carga sharp (nativo) — import perezoso: ver nota en imports.
        const { composeFaceStrips } = await import("./bookmark-strips");
        productionBuffers = await composeFaceStrips(productionBuffers, {
          cornerRadiusPx: (productConfig.cornerRadiusPx ?? 0) * 3,
          noFold: productConfig.noFold === true,
        });
        facesComposed = true;
        logger.info(
          {
            event: "design.finalize.face_strips_ok",
            designId: design.id,
            strips: productionBuffers.length,
          },
          "Tiras desplegadas 2-caras compuestas para producción",
        );
      } catch (err) {
        // No rompemos el finalize: si la composición falla, se suben las caras sueltas
        // (mejor que perder el pedido; el log deja el rastro para revisión manual).
        logger.warn(
          {
            event: "design.finalize.face_strips_error",
            designId: design.id,
            err: err instanceof Error ? err.message : String(err),
          },
          "No se pudieron componer las tiras 2-caras — se suben las caras sueltas",
        );
      }
    }
  }

  // Subir N production PNGs (uno por imán físico; en separadores 2-caras, uno por TIRA).
  // SOLO cuando los buffers se resolvieron en este request (snapshots inline o del área de
  // paso del cliente). En la vía ADR-131 el upload lo hace el worker por unidad; acá se
  // conservan los paths que el diseño ya tenía (re-finalize tras reopen: los archivos
  // anteriores siguen siendo válidos hasta que el job nuevo los pisa con upsert).
  //
  // PERF/ROBUSTEZ (2026-10-07) — antes: subidas SECUENCIALES (~200–500 ms c/u;
  // 24–48 slots ≈ 5–24 s de Function) reteniendo TODOS los buffers en memoria
  // (50 × 2–5 MB = pico 100–250 MB → OOM intermitente, que el cliente veía como
  // "An unexpected response was received from the server" por un 500/504 HTML
  // de plataforma). Ahora, mismo patrón que lib/upload-with-retry.ts del
  // cliente: concurrencia acotada a 3 lanes (fail-fast: el primer error frena
  // el despacho y se re-lanza; las subidas en vuelo terminan) y cada buffer se
  // LIBERA (null out del array) apenas su subida termina — el pico de memoria
  // deja de crecer con N.
  let productionPaths: string[] = asyncRenderJob ? design.productionUrls : [];
  let totalProductionBytes = 0;
  let uploadMs = 0;
  if (productionBuffers) {
    productionPaths = new Array(productionBuffers.length);
    // Copia LOCAL del array para el null-out: nunca se muta el array del caller
    // (puede ser un array compartido/reusado entre llamadas — el null-out sobre
    // la copia sí libera las referencias cuando los buffers se crearon acá
    // adentro: render server-side o área de paso, el caso dominante).
    const buffersToRelease: (Buffer | null)[] = [...productionBuffers];
    productionBuffers = undefined; // suelta también el binding local
    let nextUploadIndex = 0;
    // Array (no let aplanado): TS no estrecha las escrituras hechas dentro del
    // closure del runner y el fail-fast lee `length === 0`.
    const uploadErrors: { index: number; message: string }[] = [];
    const tUploadsStart = Date.now();
    const uploadRunner = async () => {
      while (nextUploadIndex < buffersToRelease.length && uploadErrors.length === 0) {
        const i = nextUploadIndex++;
        const buf = buffersToRelease[i]!;
        // Ola 3 — con tiras compuestas (separadores 2 caras) el archivo es la TIRA desplegada
        // de la unidad (cara A + cara B), no una cara suelta: nombre explícito para imprenta.
        const path = facesComposed
          ? `${design.id}/tira-${String(i + 1).padStart(2, "0")}.png`
          : `${design.id}/slot-${String(i + 1).padStart(2, "0")}.png`;
        const { error: prodErr } = await supabase.storage
          .from(BUCKET_PRODUCTION)
          .upload(path, buf, {
            contentType: "image/png",
            // 1h, alineado con el TTL de los signed URLs (getProductionAssetSignedUrls): el bucket
            // es PRIVADO y cada acceso genera una firma nueva, así que un cache-control largo no
            // se aprovecharía (la URL rotativa cambia el query string = cache key distinto). Con
            // 3600 el navegador sí puede reusar la pieza mientras la firma siga viva (T4).
            cacheControl: "3600",
            upsert: true,
          });
        if (prodErr) {
          logger.warn(
            { event: "design.finalize.upload_production_fail", err: prodErr.message, slotIndex: i },
            "Production upload fail",
          );
          uploadErrors.push({ index: i, message: prodErr.message });
          return;
        }
        totalProductionBytes += buf.length;
        productionPaths[i] = path;
        buffersToRelease[i] = null; // liberar el buffer apenas sube (pico de memoria ∝ N)
      }
    };
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(3, buffersToRelease.length)) }, uploadRunner),
    );
    uploadMs = Date.now() - tUploadsStart;
    const firstUploadError = uploadErrors[0];
    if (firstUploadError) {
      throw new Error(
        `No pudimos subir el slot ${firstUploadError.index + 1}: ${firstUploadError.message}`,
      );
    }
  }

  // ADR-063 CAL2 — registrar el año del calendario en metadata (fuente para re-render/admin;
  // el PNG ya lo trae horneado). Merge para no pisar el resto de metadata (kind, schemaVersion…).
  // Ola 3 — también se registra cuando el diseño salió como TIRAS 2-caras compuestas
  // (separadores): el admin/imprenta sabe que cada PNG es una unidad desplegada A|B.
  // Multi-unidad (2026-09-09) — también las UNIDADES del diseño (unitCount): el
  // carrito/checkout y el spec de producción las leen de metadata sin deserializar
  // el canvas completo (1 = diseño de una unidad; siempre se escribe en V2).
  const designUnits = canvasData.version === 2 ? unitCountOf(canvasData as CanvasDataV2) : 1;
  // ADR-131 — en la vía asíncrona las tiras 2-caras las compone el WORKER al terminar el job;
  // la metadata las registra igual desde ya (el admin/imprenta sabe qué esperar de cada PNG).
  const facesPending =
    asyncRenderJob &&
    canvasData.version === 2 &&
    productConfig.facesPerUnit === 2 &&
    expectedSlotCount % 2 === 0;
  const facesComposedOrPending = facesComposed || facesPending;
  const mergedMetadata =
    typeof opts.calendarYear === "number" || facesComposedOrPending || canvasData.version === 2
      ? {
          ...((design.metadata as Record<string, unknown> | null) ?? {}),
          ...(typeof opts.calendarYear === "number" ? { calendarYear: opts.calendarYear } : {}),
          ...(facesComposedOrPending
            ? {
                faceStrips: {
                  facesPerUnit: 2,
                  strips: facesComposed ? productionPaths.length : expectedSlotCount / 2,
                },
              }
            : {}),
          ...(canvasData.version === 2 ? { unitCount: designUnits } : {}),
        }
      : undefined;

  const finalizeUpdate = await prisma.design.updateMany({
    where: { id: design.id, status: "DRAFT" },
    data: {
      status: "READY",
      previewUrl: previewPublicUrl,
      // ADR-131 — en la vía asíncrona productionUrls la escribe SOLO el worker al DONE (lista
      // completa de una vez). Escribirla acá pisaría con el array viejo lo que el kick ya
      // completó (race real: kick DONE → update con `design.productionUrls` leído al inicio).
      // En la vía síncrona (snapshots del cliente) se escribe acá, como siempre.
      ...(asyncRenderJob ? {} : { productionUrls: productionPaths }),
      // Legacy field: en V2 dejamos null (el array es source-of-truth).
      productionUrl: null,
      // Paquete C — sello de la aceptación explícita de calidad (checkbox de la
      // Vista Previa). Solo se escribe cuando el cliente la marcó.
      ...(opts.qualityAcknowledged ? { qualityAcknowledgedAt: new Date() } : {}),
      // 2026-10-13 — sello de los artefactos watermark (preview-wm.webp +
      // thumb.webp subidos arriba, best-effort). En un RE-finalize el conteo de
      // páginas se resetea: las páginas viejas eran del canvas anterior y el
      // Estudio las re-sube tras confirmar (saveDesignPreviewPages).
      previewWatermarkedAt: previewArtifactsOk ? new Date() : null,
      previewPagesCount: null,
      ...(mergedMetadata ? { metadata: mergedMetadata as Prisma.InputJsonValue } : {}),
    },
  });
  if (finalizeUpdate.count !== 1) {
    const current = await prisma.design.findUnique({ where: { id: design.id } });
    if (current?.status === "READY") return current;
    throw new Error("Design is no longer a DRAFT — refresh and try again");
  }
  const updated = await prisma.design.findUniqueOrThrow({ where: { id: design.id } });

  logger.info(
    {
      event: "design.finalize.success",
      designId: design.id,
      previewBytes: opts.previewBuffer.length,
      productionSlotsCount: productionPaths.length,
      productionTotalBytes: totalProductionBytes,
      qualityAcknowledged: opts.qualityAcknowledged === true,
      renderMode: asyncRenderJob ? "async-job" : "client-snapshots",
    },
    "Design finalized (V2)",
  );

  // PERF (2026-10-07) — tiempos por fase para leer el p95 en los logs de Vercel
  // y detectar regresiones. ADR-131: en la vía asíncrona renderMs mide el KICK
  // (presupuesto acotado, ~8s máx) y uploadMs queda en 0 — las subidas de
  // producción las mide el worker (design.render_job.done, durationMs).
  logger.info(
    {
      event: "design.finalize.timing",
      designId: design.id,
      renderMs,
      uploadMs,
      totalMs: Date.now() - tFinalizeStart,
      productionSlotsCount: productionPaths.length,
      productionTotalBytes: totalProductionBytes,
      renderMode: asyncRenderJob ? "async-job" : "client-snapshots",
    },
    "Finalize: tiempos por fase (render / uploads / total)",
  );

  // ADR-131 — cuando los PNG vinieron del cliente (inline o área de paso), se encola un job
  // de MEJORA: el worker intenta el render server-side en background y, si lo logra, pisa los
  // archivos con la calidad garantizada (sin adornos de pantalla). Si el diseño no es
  // reproducible server-side, el job cierra DONE y los PNG del cliente quedan vigentes —
  // exactamente el fallback de antes. Best-effort: los archivos del cliente ya quedaron.
  if (!asyncRenderJob && v2) {
    try {
      await createOrResetRenderJob({
        designId: design.id,
        productId: design.productId,
        slotCount: expectedSlotCount,
        calendarYear: opts.calendarYear,
      });
    } catch (err) {
      logger.warn(
        {
          event: "design.finalize.upgrade_job_fail",
          designId: design.id,
          err: err instanceof Error ? err.message : String(err),
        },
        "No se pudo encolar el job de mejora de render — quedan los PNG del cliente",
      );
    }
  }

  // Los definitivos ya están subidos: el área de paso sobra (ADR-081).
  if (opts.useStagedClientSlots) {
    await discardStagedClientSlots(design.id);
  }

  return updated;
}

// ──────────────────────────────────────────────────────────────────
//  List templates by kind
// ──────────────────────────────────────────────────────────────────

export async function listTemplatesForKind(
  kind: string,
  opts?: {
    productId?: string;
    take?: number;
    productAspectRatio?: string;
    /**
     * N-08 (2026-09-11) — modo de las plantillas. Default "EDITABLE": el Estudio
     * solo lista puntos de partida editables; antes no se filtraba y una PREMADE
     * del mismo kind se colaba al sidebar/boot como si fuera editable. El
     * concepto PREMADE está RETIRADO del storefront (0 datos, 0 consumidores —
     * decisión de producto 2026-09-11); el parámetro queda por si otro caller
     * (admin) necesita otro modo explícitamente.
     */
    mode?: "EDITABLE" | "PREMADE";
    /**
     * Composición de la unidad de la variante elegida (tiras 3/4 fotos) — oculta
     * plantillas que declaren otra composición (filterTemplatesByPhotoSlots).
     */
    photoSlots?: number;
  },
) {
  const templates = await prisma.personalizationTemplate.findMany({
    where: {
      kind: kind as never,
      mode: opts?.mode ?? "EDITABLE",
      isActive: true,
      deletedAt: null,
      OR: opts?.productId
        ? [{ productId: opts.productId }, { productId: null }]
        : [{ productId: null }],
    },
    orderBy: { order: "asc" },
    // SIN `take` en la query: el tope se aplica DESPUÉS de los filtros de
    // visibilidad (específicas > globales y aspect ratio). Un take en DB cortaba
    // antes de filtrar — con take:1 traía la primera por `order` y, si el aspect
    // la descartaba, la lista quedaba vacía aunque hubiera visibles después
    // (bug cazado por templates.integration.test.ts, 2026-09-11). El universo
    // crudo (activas del kind, producto-o-globales) es chico y curado.
    select: {
      id: true,
      slug: true,
      name: true,
      previewUrl: true,
      canvasData: true,
      // Ola 3 / Ola 19 — necesario para preferir plantillas específicas del producto.
      productId: true,
    },
  });

  // Ola 19 (Lucy 2026-07-26) — si el producto tiene plantillas ESPECÍFICAS curadas,
  // se usan SOLO esas (no mezclamos con globales del mismo kind). Si no tiene específicas,
  // caemos a las globales filtradas por aspect ratio.
  const visible = preferProductSpecific(templates, opts?.productId);

  // Aspect filter aterrizado 2026-05-13: solo mostrar plantillas cuyo
  // canvasData.stage.width/height matchee con el aspect ratio del producto.
  const byAspect = filterTemplatesByAspectRatio(visible, opts?.productAspectRatio);
  // 2026-09-15 — composición de la unidad (tiras 3/4 fotos): no ofrecer la plantilla
  // de la composición que el cliente NO eligió (cada una cobra su precio).
  return filterTemplatesByPhotoSlots(byAspect, opts?.photoSlots).slice(0, opts?.take ?? 30);
}

// ──────────────────────────────────────────────────────────────────
//  Mis diseños (cuenta) + compartir (Fase 3 — /mi-cuenta/disenos + /d/[token])
// ──────────────────────────────────────────────────────────────────

/**
 * Lista los diseños del cliente para "Mis diseños": los finalizados (listos o
 * ya comprados, con preview) MÁS los borradores VIGENTES (Fase 2 · item 2.4,
 * 2026-10-07 — CTA "Seguir editando" → /estudio/<slug>?designId=).
 *
 * Vigencia del borrador: 30 días sin actividad para cuentas y con avance real. Los
 * DRAFT vacíos legacy no se listan ni se ofrecen como "seguir editando".
 */
export async function listCustomerDesigns(customerId: string, opts?: { now?: Date }) {
  const now = opts?.now ?? new Date();
  const draftCutoff = new Date(now.getTime() - PURGE_IDLE_DESIGN_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.design.findMany({
    where: {
      customerId,
      createdAt: { lte: now },
      OR: [
        { status: { in: ["READY", "USED_IN_ORDER"] }, previewUrl: { not: null } },
        { status: "DRAFT", updatedAt: { gt: draftCutoff } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      previewUrl: true,
      previewWatermarkedAt: true,
      previewPagesCount: true,
      draftPreviewUrl: true,
      status: true,
      shareTokenHash: true,
      createdAt: true,
      updatedAt: true,
      canvasData: true,
      metadata: true,
      cartItems: { where: { cart: { deletedAt: null } }, select: { id: true }, take: 1 },
      product: { select: { name: true, slug: true } },
    },
  });
  return rows
    .filter(
      (row) =>
        row.status !== "DRAFT" ||
        designHasMeaningfulProgress({ canvasData: row.canvasData, metadata: row.metadata }),
    )
    .slice(0, 60)
    .map(({ canvasData: _canvasData, metadata: _metadata, cartItems, ...row }) => ({
      ...row,
      inCart: cartItems.length > 0,
    }));
}

/**
 * Genera el shareToken de un diseño del cliente para compartirlo por link
 * público /d/<token>. Solo el dueño (customerId). El token es imposible de
 * adivinar (16 bytes hex) → sin IDOR.
 *
 * F-11 (auditoría seguridad 2026-08-24): en DB solo queda el hash sha256 del
 * token, así que un link ya emitido NO se puede releer — si el diseño ya tiene
 * hash, pedir el link de nuevo ROTA el token (el link anterior deja de
 * funcionar) y devuelve el plano fresco. La UI avisa con un toast.
 */
export async function ensureDesignShareToken(
  designId: string,
  customerId: string,
): Promise<string | null> {
  const design = await prisma.design.findFirst({
    where: { id: designId, customerId, status: { in: ["READY", "USED_IN_ORDER"] } },
    select: { id: true, shareTokenHash: true },
  });
  if (!design) return null;
  const token = crypto.randomBytes(16).toString("hex");
  const tokenHash = hashBearerToken(token);
  if (design.shareTokenHash) {
    // Link ya emitido: el plano no es recuperable (solo queda el hash) → rotar.
    await prisma.design.update({
      where: { id: design.id },
      data: { shareTokenHash: tokenHash },
    });
    return token;
  }
  // Primera vez. Update atómico condicional (where shareTokenHash:null): si dos
  // llamadas concurrentes (misma cuenta en dos pestañas) generan tokens distintos,
  // solo una gana; la que pierde rota sobre el hash ganador con SU token — ambas
  // devuelven un token válido pero solo el último persistido resuelve (el cliente
  // usa el link que acaba de ver; el otro muere, igual que en la rotación).
  const res = await prisma.design.updateMany({
    where: { id: design.id, shareTokenHash: null },
    data: { shareTokenHash: tokenHash },
  });
  if (res.count === 1) return token;
  const fresh = crypto.randomBytes(16).toString("hex");
  await prisma.design.update({
    where: { id: design.id },
    data: { shareTokenHash: hashBearerToken(fresh) },
  });
  return fresh;
}

/**
 * Archiva un diseño del cliente (status ARCHIVED → sale de "Mis diseños") y REVOCA el
 * link público (shareTokenHash=null), reforzando el filtro ARCHIVED de getSharedDesign: el
 * /d/<token> que la clienta compartió deja de resolver.
 *
 * NO borramos previewUrl ni el objeto del bucket: las vistas de pedido (cliente,
 * confirmación y producción en admin) leen design.previewUrl en vivo para diseños
 * USED_IN_ORDER; borrarlo dejaría imágenes rotas en esas vistas. La imagen sigue
 * accesible en su URL pública directa para quien ya la tenga — retirarla del bucket
 * requiere desacoplar el pedido de la imagen del diseño (ver docs/DECISIONS.md).
 */
export async function archiveCustomerDesign(
  designId: string,
  customerId: string,
): Promise<boolean> {
  const design = await prisma.design.findFirst({
    where: { id: designId, customerId, status: { in: ["READY", "USED_IN_ORDER"] } },
    select: {
      id: true,
      status: true,
      previewUrl: true,
      draftPreviewUrl: true,
      previewPagesCount: true,
      orderItems: { select: { id: true }, take: 1 },
    },
  });
  if (!design) return false;

  await prisma.design.update({
    where: { id: design.id },
    data: { status: "ARCHIVED", archivedFrom: design.status, shareTokenHash: null },
  });

  // #1 (safe slice) — un diseño READY SIN pedido no lo referencia ninguna vista: al archivar borramos
  // su preview del bucket PÚBLICO (design-previews) para no dejar la foto del cliente de por vida
  // (minimización Ley 1581). El caso USED_IN_ORDER se conserva (las 3 vistas de pedido leen el preview
  // en vivo) hasta implementar el snapshot del preview en OrderItem (ADR-056, opción A elegida por Lucy).
  // 2026-10-13 — junto con el preview van sus artefactos derivados por convención
  // de paths (preview-wm.webp, thumb.webp, pages/NN.webp, wm/pages/NN.webp):
  // muestran la misma cara y nadie los referencia ya.
  const usedInOrder = design.status === "USED_IN_ORDER" || design.orderItems.length > 0;
  if (!usedInOrder && design.previewUrl) {
    const path = pathFromPublicUrl(design.previewUrl, PREVIEWS_BUCKET);
    const derived = designPreviewDerivedPaths(design.id, design.previewPagesCount);
    if (path && (await removeStorage(PREVIEWS_BUCKET, [path, ...derived]))) {
      await prisma.design.update({
        where: { id: design.id },
        data: { previewUrl: null, previewWatermarkedAt: null, previewPagesCount: null },
      });
    }
  }
  // 2026-10-13 — la miniatura del DRAFT (draftPreviewUrl) no la referencia
  // NINGUNA vista de pedido: al archivar se borra siempre (misma minimización;
  // el diseño archivado ya no sale en "Mis diseños").
  if (design.draftPreviewUrl) {
    const draftPath = pathFromPublicUrl(design.draftPreviewUrl, PREVIEWS_BUCKET);
    if (draftPath && (await removeStorage(PREVIEWS_BUCKET, [draftPath]))) {
      await prisma.design.update({ where: { id: design.id }, data: { draftPreviewUrl: null } });
    }
  }
  return true;
}

/**
 * #17 — Dejar de compartir un diseño SIN archivarlo: mata el /d/<token> viejo (getSharedDesign
 * resuelve por shareTokenHash) pero conserva el diseño en "Mis diseños". Antes revocar el link exigía
 * archivar, que es irreversible. Reusa la semántica shareTokenHash=null (sin columna ni migración nueva);
 * volver a compartir regenera el token con ensureDesignShareToken.
 */
export async function revokeDesignShareToken(
  designId: string,
  customerId: string,
): Promise<boolean> {
  const res = await prisma.design.updateMany({
    where: { id: designId, customerId, status: { in: ["READY", "USED_IN_ORDER"] } },
    data: { shareTokenHash: null },
  });
  return res.count > 0;
}

/**
 * Vista PÚBLICA de un diseño compartido por token — sin PII, solo el preview + el
 * producto. No expone diseños archivados/borrador. El cliente decide compartir
 * (el preview puede incluir su foto); el token va solo a quien él se lo mande.
 *
 * F-11: el lookup es por el hash sha256 del token (la columna en claro ya no existe).
 *
 * A4-01 (cert 2026-09-26): tampoco expone diseños RECHAZADOS por moderación.
 * rejectDesign ya revoca el shareTokenHash (el link muere en origen), pero este
 * filtro es defensa en profundidad ante datos históricos o un re-compartir del
 * cliente (ensureDesignShareToken puede regenerar token sobre un diseño REJECTED).
 */
export async function getSharedDesign(shareToken: string) {
  if (!/^[a-f0-9]{32}$/.test(shareToken)) return null;
  const design = await prisma.design.findFirst({
    where: {
      shareTokenHash: hashBearerToken(shareToken),
      moderationStatus: { not: "REJECTED" },
    },
    select: {
      previewUrl: true,
      // 2026-10-13 — la vista pública exhibe la versión WATERMARK cuando existe
      // (preview-wm.webp por convención de paths); null = fallback al limpio.
      previewWatermarkedAt: true,
      status: true,
      product: { select: { name: true, slug: true } },
    },
  });
  if (!design || design.status === "ARCHIVED" || design.status === "DRAFT" || !design.previewUrl) {
    return null;
  }
  return design;
}

/**
 * 2026-10-13 — páginas POR UNIDAD del preview (set/tira/separador/pack), para el
 * "Ver" paginado del carrito/pedidos y la miniatura representativa. Las compone
 * el Estudio con el MISMO compositor de su modal «Vista previa» (fidelidad
 * WYSIWYG — server-side no puede recomponer las unidades del montaje global:
 * separadores tête-bêche y calendarios no son grids uniformes) y las sube en un
 * request APARTE del finalize (el body de la Server Action tiene techo ~4.5 MB
 * y el preview ya lo roza; además las páginas perezosas se generan al confirmar,
 * no hay que inflar el request crítico).
 *
 * Best-effort de punta a punta: si falla, las superficies caen al preview
 * global (watermarked si existe). Por eso no revienta: devuelve ok:false.
 */
export async function saveDesignPreviewPages(opts: {
  designId: string;
  owner: { customerId: string | null; sessionId: string | null };
  /** Buffers de las páginas EN ORDEN (página 1 = primera unidad). */
  pages: Buffer[];
}): Promise<{ ok: true; pagesCount: number } | { ok: false; message: string }> {
  const design = await getOwnedDesign(opts.designId, opts.owner);
  // Solo diseños finalizados: las páginas son del canvas CONFIRMADO (un DRAFT
  // reabierto para editar invalida las del READY anterior — el re-finalize las
  // resetea a null y el Estudio las vuelve a subir).
  if (!design || (design.status !== "READY" && design.status !== "USED_IN_ORDER")) {
    return { ok: false, message: "Diseño no encontrado" };
  }
  if (opts.pages.length < 1 || opts.pages.length > PREVIEW_PAGES_MAX) {
    return { ok: false, message: "Número de páginas inválido" };
  }
  const uploaded = await uploadPreviewPages(design.id, opts.pages);
  if (uploaded === null) {
    return { ok: false, message: "No pudimos procesar las páginas del preview" };
  }
  // El sello previewWatermarkedAt avala que preview-wm.webp + thumb.webp
  // EXISTEN. Si el finalize no logró su paso watermark (best-effort), se
  // regenera el global desde el preview limpio ya público antes de sellar —
  // nunca se marca una URL que 404.
  const wmReady =
    design.previewWatermarkedAt !== null ||
    (design.previewUrl ? await ensurePreviewWatermarkGlobal(design.id, design.previewUrl) : false);
  await prisma.design.update({
    where: { id: design.id },
    // La miniatura representativa (thumb.webp) quedó regenerada desde la
    // primera página dentro de uploadPreviewPages.
    data: {
      previewPagesCount: uploaded,
      ...(wmReady ? { previewWatermarkedAt: new Date() } : {}),
    },
  });
  logger.info(
    { event: "design.preview_pages.saved", designId: design.id, pagesCount: uploaded },
    "Páginas por unidad del preview subidas",
  );
  return { ok: true, pagesCount: uploaded };
}
