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
import {
  pathFromPublicUrl,
  removeStorage,
  PREVIEWS_BUCKET,
} from "@/features/personalization/retention-service";
import { supabaseService } from "@/lib/supabase/service";
import { hashBearerToken } from "@/lib/token-hash";
import { parsePhotoProductConfig } from "./schemas";
import { listStagedSlotPaths, stagedSlotPath } from "./staged-slots";
import { resolvePersonalizationSurface } from "./surface";
import { normalizeName } from "./name-input";
import { remapCanvasAssetIds } from "./canvas-remap";
import { calendarLayoutFromUnitTemplate } from "./calendar-layout";
import { ALPHABET } from "./letter-tiles";
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
import type { LoadAssetBytes } from "./production-render";
import type { CanvasData, CanvasDataV1, CanvasDataV2 } from "./schemas";
import type { z } from "zod";
import type { SlotStateSchema } from "./schemas";
type SlotState = z.infer<typeof SlotStateSchema>;

const BUCKET_PREVIEWS = "design-previews";
const BUCKET_PRODUCTION = "production-assets";
const BUCKET_CUSTOMER_UPLOADS = "customer-uploads";

/**
 * ADR-057 Fase A1a — Intenta re-renderizar los PNG de producción EN EL SERVIDOR desde el
 * canvasData (fuente de verdad: encuadre del usuario), en vez de confiar en el celular del
 * cliente. Devuelve los buffers server-side, o `null` si la plantilla no es solo-foto
 * (NEEDS_KONVA → Fase A1b) o si algo falla → el caller conserva los PNG del cliente (fallback).
 */
async function tryServerRenderProduction(
  designId: string,
  canvasData: CanvasDataV2,
  overrides?: { calendarYear?: number },
): Promise<Buffer[] | null> {
  // Cargar forma + assets + loader (compartido por ambos motores).
  let shape: string | undefined;
  let loadAsset: LoadAssetBytes;
  let personalizationKind: string | undefined;
  let productSchema: Record<string, unknown> | undefined;
  try {
    const design = await prisma.design.findUnique({
      where: { id: designId },
      select: {
        product: { select: { personalizationSchema: true, personalizationKind: true } },
      },
    });
    // Forma del schema del PRODUCTO. En el catálogo actual la forma es a nivel de producto
    // (Fotoimanes Circular/Corazón/Cuadrado son productos distintos; sus variantes son
    // tamaño/cantidad, no forma) → esto coincide con lo que renderizó el cliente. Si algún día
    // una VARIANTE override la forma, habría que persistir la forma efectiva en el diseño (el
    // diseño no guarda su variantId en finalize). Latente: ningún producto lo usa hoy.
    shape = (design?.product?.personalizationSchema as { shape?: string } | null)?.shape;
    personalizationKind = design?.product?.personalizationKind;
    productSchema =
      (design?.product?.personalizationSchema as Record<string, unknown> | null) ?? undefined;

    const assets = await prisma.designAsset.findMany({
      where: { designId },
      select: { id: true, storageUrl: true },
    });
    const assetPaths = new Map(assets.map((a) => [a.id, a.storageUrl]));
    loadAsset = async (assetId) => {
      const path = assetPaths.get(assetId);
      if (!path) return null;
      const { data, error } = await supabaseService.storage
        .from(BUCKET_CUSTOMER_UPLOADS)
        .download(path);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    };
  } catch (err) {
    logger.warn(
      {
        event: "design.finalize.server_render_error",
        designId,
        stage: "load",
        err: err instanceof Error ? err.message : String(err),
      },
      "No se pudieron cargar assets para el render server — usando PNG del cliente",
    );
    return null;
  }

  // Carga perezosa de los motores nativos (sharp / @napi-rs/canvas) — ver nota en imports.
  // Si el binario no carga en este runtime, el finalize continúa con los PNG del cliente.
  let renderProductionSlots: typeof import("./production-render").renderProductionSlots;
  let RenderNeedsKonvaError: typeof import("./production-render").RenderNeedsKonvaError;
  let renderProductionSlotsCanvas: typeof import("./production-render-canvas").renderProductionSlotsCanvas;
  let renderCalendarMonthPagesCanvas: typeof import("./production-render-canvas").renderCalendarMonthPagesCanvas;
  try {
    const [sharpEngine, canvasEngine] = await Promise.all([
      import("./production-render"),
      import("./production-render-canvas"),
    ]);
    renderProductionSlots = sharpEngine.renderProductionSlots;
    RenderNeedsKonvaError = sharpEngine.RenderNeedsKonvaError;
    renderProductionSlotsCanvas = canvasEngine.renderProductionSlotsCanvas;
    renderCalendarMonthPagesCanvas = canvasEngine.renderCalendarMonthPagesCanvas;
  } catch (err) {
    logger.warn(
      {
        event: "design.finalize.server_render_error",
        designId,
        stage: "engine-load",
        err: err instanceof Error ? err.message : String(err),
      },
      "Motores de render nativos no cargaron en este runtime — usando PNG del cliente",
    );
    return null;
  }

  // ADR-063 CAL1 — Calendario mes-a-mes: compone la PÁGINA de cada mes (foto + mes + año + grilla),
  // no la foto desnuda. Reemplaza los dos tiers genéricos para este kind — el PNG del cliente no
  // trae la grilla, así que no hay fallback útil; si el compositor falla, cae a los PNG del cliente.
  if (personalizationKind === "CALENDAR_PHOTO_MONTH") {
    try {
      // ADR-063 CAL2 — el año lo elige el CLIENTE en el editor (persistido por-diseño). Prioridad:
      // elección del cliente → default del producto (personalizationSchema.year) → próximo año.
      const yearRaw = overrides?.calendarYear ?? productSchema?.year;
      const year =
        typeof yearRaw === "number" && yearRaw >= 2020 && yearRaw <= 2100
          ? yearRaw
          : new Date().getFullYear() + 1;
      const startRaw = productSchema?.startMonth;
      const startMonth = typeof startRaw === "number" ? startRaw : 0;
      const slots = canvasData.slots.map((s) => ({
        slotIndex: s.slotIndex,
        assetId: s.assetId,
        photoTransform: s.photoTransform,
      }));
      const bufs = await renderCalendarMonthPagesCanvas({
        slots,
        loadAsset,
        year,
        startMonth,
        // Reescala el encuadre (pan) de unidades de la plantilla del editor a la página 1080.
        templateStageWidth: canvasData.unitTemplate?.stage?.width,
        // Layout de la tarjeta ("classic" default | "split" lateral) — lo declara la plantilla.
        layout: calendarLayoutFromUnitTemplate(canvasData.unitTemplate),
      });
      logger.info(
        {
          event: "design.finalize.server_render_ok",
          designId,
          engine: "calendar",
          slots: bufs.length,
        },
        "Calendario renderizado en el servidor (páginas de mes)",
      );
      return bufs;
    } catch (err) {
      logger.warn(
        {
          event: "design.finalize.server_render_error",
          designId,
          engine: "calendar",
          err: err instanceof Error ? err.message : String(err),
        },
        "Render de calendario falló — usando PNG del cliente",
      );
      return null;
    }
  }

  // Ola 2A — marco de color elegido en el Estudio (viaja en canvasData). El tier sharp no
  // dibuja marcos → con marco se entra directo al tier canvas (que sí lo hornea, WYSIWYG).
  const borderColor =
    typeof (canvasData as { borderColor?: unknown }).borderColor === "string"
      ? ((canvasData as { borderColor?: string }).borderColor ?? null)
      : null;
  // Ola 3 — ¿el producto admite texto? (Fotoimanes Cuadrados NO: el texto es de la
  // Polaroid). El editor oculta las capas de texto → producción también (WYSIWYG);
  // si no, el PNG de imprenta saldría con el "Escribe tu mensaje" de la plantilla.
  // Schema no cargado → default legacy true (no esconder texto por un fallo de lectura).
  const includeText = productSchema
    ? parsePhotoProductConfig(productSchema).allowText === true
    : true;
  // Ola 3b (Lucy 2026-07-22) — ¿el producto ofrece marcos de color? Con frameOptions +
  // borderColor la tarjeta se imprime ENTERA del color y la foto va inserta ("fin del
  // papel"), no un stroke sobre tarjeta blanca. Misma regla que el editor (WYSIWYG).
  const frameFullBleed = productSchema
    ? (parsePhotoProductConfig(productSchema).frameOptions?.length ?? 0) > 0
    : false;
  const args = {
    unitTemplate: canvasData.unitTemplate as never,
    slots: canvasData.slots as never,
    shape,
    loadAsset,
    borderColor,
    includeText,
    frameFullBleed,
  };

  // Tier 1 — sharp (foto pura, rápido, sin deps nativas). Solo SIN marco y SIN frameOptions.
  // Ola 4 (Lucy 2026-07-23): los productos con frameOptions (Cuadrados) van DIRECTO al tier
  // canvas — la regla "sin borde → foto a sangre total / con borde → franja uniforme" solo
  // vive allá; el tier sharp dibuja la ventana cruda de la plantilla y dejaría la franja.
  if (!borderColor && !frameFullBleed) {
    try {
      return await renderProductionSlots(args);
    } catch (err) {
      if (!(err instanceof RenderNeedsKonvaError)) {
        logger.warn(
          {
            event: "design.finalize.server_render_error",
            designId,
            engine: "sharp",
            err: err instanceof Error ? err.message : String(err),
          },
          "Render sharp falló — usando PNG del cliente",
        );
        return null;
      }
      // Tier 2 — canvas (@napi-rs/canvas): la plantilla trae texto/marco/esquinas que sharp no hace.
      try {
        const bufs = await renderProductionSlotsCanvas(args);
        logger.info(
          {
            event: "design.finalize.server_render_ok",
            designId,
            engine: "canvas",
            slots: bufs.length,
          },
          "Production renderizada en el servidor (canvas)",
        );
        return bufs;
      } catch (err2) {
        if (err2 instanceof RenderNeedsKonvaError) {
          logger.info(
            { event: "design.finalize.server_render_skip", designId, reason: err2.message },
            "Server render omitido (filtro/fuente/etc.) — usando PNG del cliente",
          );
        } else {
          logger.warn(
            {
              event: "design.finalize.server_render_error",
              designId,
              engine: "canvas",
              err: err2 instanceof Error ? err2.message : String(err2),
            },
            "Render canvas falló — usando PNG del cliente",
          );
        }
        return null;
      }
    }
  }

  // Con marco (o con frameOptions, Ola 4): directo al tier canvas (sharp no dibuja marcos
  // ni aplica la regla sangre-total/franja-uniforme de las tarjetas simples).
  try {
    const bufs = await renderProductionSlotsCanvas(args);
    logger.info(
      {
        event: "design.finalize.server_render_ok",
        designId,
        engine: "canvas",
        slots: bufs.length,
      },
      "Production renderizada en el servidor (canvas, con marco)",
    );
    return bufs;
  } catch (err2) {
    if (err2 instanceof RenderNeedsKonvaError) {
      logger.info(
        { event: "design.finalize.server_render_skip", designId, reason: err2.message },
        "Server render omitido (filtro/fuente/etc.) — usando PNG del cliente",
      );
    } else {
      logger.warn(
        {
          event: "design.finalize.server_render_error",
          designId,
          engine: "canvas",
          err: err2 instanceof Error ? err2.message : String(err2),
        },
        "Render canvas falló — usando PNG del cliente",
      );
    }
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
//  Ownership check
// ──────────────────────────────────────────────────────────────────

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
 */
export async function cloneDesignForEdit(
  originalId: string,
  owner: { customerId: string | null; sessionId: string | null },
): Promise<{ id: string } | null> {
  const original = await getOwnedDesign(originalId, owner);
  if (!original || original.status !== "READY") return null;
  const assets = await prisma.designAsset.findMany({ where: { designId: original.id } });

  return prisma.$transaction(async (tx) => {
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

export async function createDraftDesign(opts: {
  productId: string;
  templateId?: string;
  customerId: string | null;
  sessionId: string | null;
}) {
  if (!opts.customerId && !opts.sessionId) {
    throw new Error("createDraftDesign: requires customerId or sessionId");
  }

  // Cargar producto + su personalizationSchema para saber cuántos slots crear
  const product = await prisma.product.findUnique({
    where: { id: opts.productId },
    select: {
      id: true,
      personalizationKind: true,
      personalizationSchema: true,
    },
  });
  if (!product) {
    throw new Error(`createDraftDesign: product ${opts.productId} not found`);
  }

  const photoConfig = parsePhotoProductConfig(product.personalizationSchema);
  const slotCount = photoConfig.photoSlots;

  // Cargar unitTemplate desde PersonalizationTemplate (si se pasó templateId
  // explícito) o el primer template activo del kind del producto.
  let unitTemplate: CanvasDataV1;
  let templateIdToUse: string | null = opts.templateId ?? null;

  if (opts.templateId) {
    const tpl = await prisma.personalizationTemplate.findUnique({
      where: { id: opts.templateId },
      select: { canvasData: true, isActive: true, deletedAt: true },
    });
    if (!tpl || !tpl.isActive || tpl.deletedAt) {
      throw new Error(`createDraftDesign: template ${opts.templateId} not available`);
    }
    unitTemplate = tpl.canvasData as unknown as CanvasDataV1;
  } else {
    // Default: primer template activo del kind
    const tpl = await prisma.personalizationTemplate.findFirst({
      where: {
        kind: product.personalizationKind,
        isActive: true,
        deletedAt: null,
        OR: [{ productId: product.id }, { productId: null }],
      },
      orderBy: { order: "asc" },
      select: { id: true, canvasData: true },
    });
    if (tpl) {
      unitTemplate = tpl.canvasData as unknown as CanvasDataV1;
      templateIdToUse = tpl.id;
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
      metadata: { kind: product.personalizationKind, schemaVersion: 2 },
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
        themeId: opts.themeId ?? "arcoiris",
        colors: Array.isArray(opts.colors) ? opts.colors.slice(0, norm.letters.length) : [],
        // Estilo ilustrado elegido (para producción). null = "Solo letra".
        styleSetId: opts.styleSetId ?? null,
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

  return { id: design.id, display: norm.display, letters: norm.letters };
}

// ──────────────────────────────────────────────────────────────────
//  Diseño de SET DE LETRAS (Completo/Vocales) con color de marco (ADR-057)
// ──────────────────────────────────────────────────────────────────
//
// El producto es un set fijo (todas las letras); lo único que el cliente personaliza es
// el COLOR DEL MARCO (un cambio físico real — WYSIWYG). Se guarda el tema + las letras en
// metadata; canvasData v1 → reutiliza finalize/carrito. Valida el marcador letterSet.

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
  customerId: string | null;
  sessionId: string | null;
}): Promise<{ id: string; letters: string[]; language: string }> {
  if (!opts.customerId && !opts.sessionId) {
    throw new Error("createLetterSetDesign: requires customerId or sessionId");
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
        frameTheme: opts.frameTheme,
        letters,
        // Color efectivo por ficha (para producción). Acotado al nº de letras del set.
        colors: Array.isArray(opts.colors) ? opts.colors.slice(0, letters.length) : [],
        // Estilo ilustrado elegido (para producción). null = "Solo letra".
        styleSetId: opts.styleSetId ?? null,
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

  return { id: design.id, letters, language };
}

// ──────────────────────────────────────────────────────────────────
//  Save canvas (DRAFT only). Acepta V1 o V2.
// ──────────────────────────────────────────────────────────────────

export async function saveCanvas(opts: {
  designId: string;
  canvasData: CanvasData;
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

  await prisma.design.update({
    where: { id: design.id },
    data: { canvasData: opts.canvasData as unknown as Prisma.InputJsonValue },
  });
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
//   2. Valida productionDataUrls.length === Design canvasData.slotCount
//      (todos los slots tienen snapshot — el cliente NO debe enviar
//       finalize si hay slots vacíos; el server bloquea por defensa)
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
 * Y acota cuántas emite contra el PRODUCTO, no contra el canvas: `canvasData.slotCount` lo escribe
 * el propio cliente con `saveCanvasAction` y el esquema solo lo topa en 50, así que confiar en él
 * regalaba hasta 50 permisos de escritura por llamada a quien quisiera llenarnos el bucket
 * (revisión adversarial 2026-07-25). El producto es la fuente de verdad de cuántas piezas hay.
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

  const product = await prisma.product.findUnique({
    where: { id: design.productId },
    select: { personalizationSchema: true },
  });
  const allowed = product ? parsePhotoProductConfig(product.personalizationSchema).photoSlots : 1;
  // `facesPerUnit: 2` (separadores) manda 2 snapshots por unidad: el tope es por CARA, no por pieza.
  const faces = product
    ? (parsePhotoProductConfig(product.personalizationSchema).facesPerUnit ?? 1)
    : 1;
  const maxSlots = Math.max(1, allowed * faces);
  if (slotCount > maxSlots) {
    throw new Error(
      `INCOMPLETE_SLOTS: el diseño declara ${slotCount} piezas y el producto admite ${maxSlots}`,
    );
  }

  const tickets: { slotIndex: number; url: string }[] = [];
  for (let i = 0; i < slotCount; i++) {
    const { data, error } = await supabaseService.storage
      .from(BUCKET_PRODUCTION)
      .createSignedUploadUrl(stagedSlotPath(design.id, i), { upsert: true });
    if (error || !data) {
      throw new Error(`No pudimos preparar la subida del slot ${i + 1}: ${error?.message ?? "?"}`);
    }
    tickets.push({ slotIndex: i, url: data.signedUrl });
  }
  return tickets;
}

/** Recoge del área de paso los N snapshots que subió el cliente. */
async function readStagedClientSlots(designId: string, slotCount: number): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (let i = 0; i < slotCount; i++) {
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
}) {
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
  if (design.status !== "DRAFT") {
    throw new Error(`Design is ${design.status} — only DRAFT can be finalized`);
  }

  // Si el cliente mandó snapshots, deben ser exactamente uno por slot.
  const canvasData = design.canvasData as unknown as CanvasData;
  const expectedSlotCount = canvasData.version === 2 ? (canvasData as CanvasDataV2).slotCount : 1;
  if (opts.productionBuffers && opts.productionBuffers.length !== expectedSlotCount) {
    throw new Error(
      `INCOMPLETE_SLOTS: expected ${expectedSlotCount} production snapshots, got ${opts.productionBuffers.length}`,
    );
  }

  // Validar también que todos los slots V2 tienen assetUrl (defensa server)
  if (canvasData.version === 2) {
    const v2 = canvasData as CanvasDataV2;
    const empty = v2.slots.filter((s) => !s.assetUrl).map((s) => s.slotIndex);
    if (empty.length > 0) {
      throw new Error(`INCOMPLETE_SLOTS: slots vacíos ${empty.join(", ")}`);
    }
  }

  const supabase = supabaseService;

  // ADR-057 A1a — Render de producción EN EL SERVIDOR (independiente del celular del cliente).
  // ADR-081 — es la vía PRINCIPAL, no una mejora: el cliente ya no manda los PNG salvo que se los
  // pidamos, porque no caben en el body de una Function de Vercel (4.5 MB contra ~57 MB de un
  // calendario). Si ningún tier reproduce el diseño con fidelidad (hoy solo el marco SVG de la
  // Polaroid) se exige el fallback del cliente, que sube por Storage y no por el body.
  //
  // Va ANTES de subir el preview a propósito: la primera pasada de un diseño que necesita el
  // fallback termina en `NEEDS_CLIENT_SLOTS`, y si el cliente abandona ahí, un preview ya subido
  // quedaría huérfano en un bucket PÚBLICO sin ninguna fila que lo referencie (revisión adversarial
  // 2026-07-25). Resolver primero los PNG deja el efecto de red recién cuando el finalize va a salir.
  // Cuando el render server-side sale bien GANA sobre los snapshots inline del cliente: es el
  // archivo de imprenta de calidad garantizada, sin adornos de pantalla y sin depender del celular.
  let productionBuffers = opts.productionBuffers;
  if (canvasData.version === 2) {
    const serverBuffers = await tryServerRenderProduction(design.id, canvasData as CanvasDataV2, {
      calendarYear: opts.calendarYear,
    });
    if (serverBuffers && serverBuffers.length === expectedSlotCount) {
      productionBuffers = serverBuffers;
      logger.info(
        {
          event: "design.finalize.server_render_ok",
          designId: design.id,
          slots: serverBuffers.length,
        },
        "Production renderizada en el servidor",
      );
    }
  }
  // Fuera del `if` de v2: con canvasData v1 también se emiten tickets, y dejar la lectura dentro
  // dejaba al cliente en un bucle —sube los PNG, y el finalize vuelve a pedírselos— sin salida.
  if (!productionBuffers && opts.useStagedClientSlots) {
    productionBuffers = await readStagedClientSlots(design.id, expectedSlotCount);
    logger.info(
      {
        event: "design.finalize.staged_slots_used",
        designId: design.id,
        slots: productionBuffers.length,
      },
      "Snapshots del cliente recogidos del área de paso",
    );
  }
  if (!productionBuffers) {
    // El caller traduce esto a un pedido de snapshots al cliente (subida directa a Storage).
    throw new Error(
      `NEEDS_CLIENT_SLOTS: el servidor no pudo renderizar los ${expectedSlotCount} PNG de imprenta`,
    );
  }

  // Subir preview compositado del grid completo
  const previewPath = `${design.id}/preview.png`;
  const { error: pErr } = await supabase.storage
    .from(BUCKET_PREVIEWS)
    .upload(previewPath, opts.previewBuffer, { contentType: "image/png", upsert: true });
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

  // Ola 3 (Lucy 2026-07-22) — SEPARADORES 2 CARAS: la pieza física es una tira doblada;
  // la imprenta recibe la tira DESPLEGADA con las 2 caras lado a lado (8×4.2 / 12×2 cm).
  // El cliente sube 2N snapshots (uno por slot cara A/B, espejo del canvas); acá se componen
  // N tiras (slot 2k = cara A izquierda, slot 2k+1 = cara B derecha) con las esquinas
  // exteriores redondeadas del troquel. Aplica igual a buffers server-side o del cliente.
  let facesComposed = false;
  if (canvasData.version === 2) {
    const product = await prisma.product.findUnique({
      where: { id: design.productId },
      select: { personalizationSchema: true },
    });
    const productConfig = parsePhotoProductConfig(product?.personalizationSchema);
    if (productConfig.facesPerUnit === 2 && productionBuffers.length % 2 === 0) {
      try {
        // cornerRadiusPx del schema es en px LÓGICOS del stage de la cara; los buffers
        // están a escala de producción (×3, mismo factor que el snapshot del cliente).
        // composeFaceStrips carga sharp (nativo) — import perezoso: ver nota en imports.
        const { composeFaceStrips } = await import("./bookmark-strips");
        productionBuffers = await composeFaceStrips(productionBuffers, {
          cornerRadiusPx: (productConfig.cornerRadiusPx ?? 0) * 3,
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

  // Subir N production PNGs (uno por imán físico; en separadores 2-caras, uno por TIRA)
  const productionPaths: string[] = [];
  let totalProductionBytes = 0;
  for (let i = 0; i < productionBuffers.length; i++) {
    const buf = productionBuffers[i]!;
    totalProductionBytes += buf.length;
    // Ola 3 — con tiras compuestas (separadores 2 caras) el archivo es la TIRA desplegada
    // de la unidad (cara A + cara B), no una cara suelta: nombre explícito para imprenta.
    const path = facesComposed
      ? `${design.id}/tira-${String(i + 1).padStart(2, "0")}.png`
      : `${design.id}/slot-${String(i + 1).padStart(2, "0")}.png`;
    const { error: prodErr } = await supabase.storage
      .from(BUCKET_PRODUCTION)
      .upload(path, buf, { contentType: "image/png", upsert: true });
    if (prodErr) {
      logger.warn(
        { event: "design.finalize.upload_production_fail", err: prodErr.message, slotIndex: i },
        "Production upload fail",
      );
      throw new Error(`No pudimos subir el slot ${i + 1}: ${prodErr.message}`);
    }
    productionPaths.push(path);
  }

  // ADR-063 CAL2 — registrar el año del calendario en metadata (fuente para re-render/admin;
  // el PNG ya lo trae horneado). Merge para no pisar el resto de metadata (kind, schemaVersion…).
  // Ola 3 — también se registra cuando el diseño salió como TIRAS 2-caras compuestas
  // (separadores): el admin/imprenta sabe que cada PNG es una unidad desplegada A|B.
  const mergedMetadata =
    typeof opts.calendarYear === "number" || facesComposed
      ? {
          ...((design.metadata as Record<string, unknown> | null) ?? {}),
          ...(typeof opts.calendarYear === "number" ? { calendarYear: opts.calendarYear } : {}),
          ...(facesComposed
            ? { faceStrips: { facesPerUnit: 2, strips: productionPaths.length } }
            : {}),
        }
      : undefined;

  const updated = await prisma.design.update({
    where: { id: design.id },
    data: {
      status: "READY",
      previewUrl: previewPublicUrl,
      productionUrls: productionPaths,
      // Legacy field: en V2 dejamos null (el array es source-of-truth).
      productionUrl: null,
      ...(mergedMetadata ? { metadata: mergedMetadata as Prisma.InputJsonValue } : {}),
    },
  });

  logger.info(
    {
      event: "design.finalize.success",
      designId: design.id,
      previewBytes: opts.previewBuffer.length,
      productionSlotsCount: productionPaths.length,
      productionTotalBytes: totalProductionBytes,
    },
    "Design finalized (V2)",
  );

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
  opts?: { productId?: string; take?: number; productAspectRatio?: string },
) {
  const templates = await prisma.personalizationTemplate.findMany({
    where: {
      kind: kind as never,
      isActive: true,
      deletedAt: null,
      OR: opts?.productId
        ? [{ productId: opts.productId }, { productId: null }]
        : [{ productId: null }],
    },
    orderBy: { order: "asc" },
    take: opts?.take ?? 30,
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
  if (opts?.productId) {
    const specific = templates.filter((t) => t.productId === opts.productId);
    if (specific.length > 0) {
      return filterTemplatesByAspectRatio(specific, opts.productAspectRatio);
    }
  }

  // Aspect filter aterrizado 2026-05-13: solo mostrar plantillas cuyo
  // canvasData.stage.width/height matchee con el aspect ratio del producto.
  return filterTemplatesByAspectRatio(templates, opts?.productAspectRatio);
}

function filterTemplatesByAspectRatio(
  templates: {
    id: string;
    slug: string;
    name: string;
    previewUrl: string;
    canvasData: unknown;
    productId: string | null;
  }[],
  productAspectRatio?: string,
) {
  if (!productAspectRatio) return templates;
  const target = parseAspectRatio(productAspectRatio);
  if (target === null) return templates;
  return templates.filter((t) => {
    const a = templateAspectRatio(t.canvasData);
    if (a === null) return true; // template sin stage parseable → permitir
    return Math.abs(a - target) <= 0.05;
  });
}

/** Parsea "1:1", "4:5", "7:9" → ratio numérico width/height. */
function parseAspectRatio(s: string): number | null {
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[:×x]\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const h = parseFloat(m[2]);
  if (h === 0) return null;
  return parseFloat(m[1]) / h;
}

/** Aspect width/height del stage de la plantilla, o null si no parseable. */
function templateAspectRatio(canvasData: unknown): number | null {
  if (!canvasData || typeof canvasData !== "object") return null;
  const cd = canvasData as { stage?: { width?: unknown; height?: unknown } };
  const w = typeof cd.stage?.width === "number" ? cd.stage.width : null;
  const h = typeof cd.stage?.height === "number" ? cd.stage.height : null;
  if (w === null || h === null || h === 0) return null;
  return w / h;
}

// ──────────────────────────────────────────────────────────────────
//  Mis diseños (cuenta) + compartir (Fase 3 — /mi-cuenta/disenos + /d/[token])
// ──────────────────────────────────────────────────────────────────

/** Lista los diseños finalizados del cliente (listos o ya comprados), con producto. */
export async function listCustomerDesigns(customerId: string) {
  return prisma.design.findMany({
    where: {
      customerId,
      status: { in: ["READY", "USED_IN_ORDER"] },
      previewUrl: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: {
      id: true,
      previewUrl: true,
      status: true,
      shareTokenHash: true,
      createdAt: true,
      product: { select: { name: true, slug: true } },
    },
  });
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
      orderItems: { select: { id: true }, take: 1 },
    },
  });
  if (!design) return false;

  await prisma.design.update({
    where: { id: design.id },
    data: { status: "ARCHIVED", shareTokenHash: null },
  });

  // #1 (safe slice) — un diseño READY SIN pedido no lo referencia ninguna vista: al archivar borramos
  // su preview del bucket PÚBLICO (design-previews) para no dejar la foto del cliente de por vida
  // (minimización Ley 1581). El caso USED_IN_ORDER se conserva (las 3 vistas de pedido leen el preview
  // en vivo) hasta implementar el snapshot del preview en OrderItem (ADR-056, opción A elegida por Lucy).
  const usedInOrder = design.status === "USED_IN_ORDER" || design.orderItems.length > 0;
  if (!usedInOrder && design.previewUrl) {
    const path = pathFromPublicUrl(design.previewUrl, PREVIEWS_BUCKET);
    if (path && (await removeStorage(PREVIEWS_BUCKET, [path]))) {
      await prisma.design.update({ where: { id: design.id }, data: { previewUrl: null } });
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
 */
export async function getSharedDesign(shareToken: string) {
  if (!/^[a-f0-9]{32}$/.test(shareToken)) return null;
  const design = await prisma.design.findUnique({
    where: { shareTokenHash: hashBearerToken(shareToken) },
    select: {
      previewUrl: true,
      status: true,
      product: { select: { name: true, slug: true } },
    },
  });
  if (!design || design.status === "ARCHIVED" || design.status === "DRAFT" || !design.previewUrl) {
    return null;
  }
  return design;
}
