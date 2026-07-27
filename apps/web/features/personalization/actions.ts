/*
 * Server actions — Estudio de Personalización (M.3).
 *
 * Cada action:
 *   1. Resuelve owner (customerId si logueado, sessionId anon).
 *   2. Valida input con Zod (rechazo con problem details si falla).
 *   3. Delega al service layer (única lógica de DB / Storage).
 *   4. Loguea event estandarizado.
 *
 * Auth model:
 *   - Storefront público — no requiere admin. Anon flow OK.
 *   - Pero el caller siempre debe ser owner del Design para mutar.
 */

"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { getCurrentCustomer } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
import { getOrCreateCartSession, peekCartSession } from "@/lib/cart-session";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ownerKey, ipKey } from "@/lib/rate-limit-keys";
import { uploadCustomerPhoto } from "@/lib/storage";
import { getGalleryImageById } from "./design-gallery";
import { prisma } from "@/lib/db";
import {
  CreateDraftDesignSchema,
  IMAGE_RIGHTS_POLICY_VERSION,
  SaveCanvasSchema,
  UploadAssetMetadataSchema,
} from "./schemas";
import {
  createClientSlotUploadTickets,
  createDraftDesign,
  createNameDesign,
  createLetterSetDesign,
  finalizeDesign,
  getOwnedDesign,
  saveCanvas,
} from "./service";

// ──────────── Helpers ────────────

async function resolveOwner() {
  const session = await getCurrentCustomer();
  const customerId = session?.customer.id ?? null;
  const sessionId = customerId ? null : await peekCartSession();
  return { customerId, sessionId };
}

// ──────────── Create draft ────────────

export async function createDraftDesignAction(input: { productId: string; templateId?: string }) {
  const parsed = CreateDraftDesignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, code: "VALIDATION" as const, message: parsed.error.message };
  }

  // #2 — rate-limit por IP: un bot sin cookie obtiene un sessionId fresco por request, así que
  // ownerKey no lo frena; ipKey sí. Generoso para no romper el uso legítimo del Estudio.
  const draftRl = await rateLimit(
    ipKey("create_draft_design", getClientIp(await headers())),
    process.env.VERCEL_ENV === "production" ? 40 : 200,
    600,
  );
  if (!draftRl.allowed) {
    logger.warn({ event: "design.create_draft.rate_limited", count: draftRl.count });
    return {
      ok: false as const,
      code: "INTERNAL" as const,
      message: "Demasiados intentos. Espera un momento.",
    };
  }

  const { customerId, sessionId: existingSession } = await resolveOwner();
  // Si anon y no había cookie, crear una ahora. createDraftDesign requiere
  // al menos uno de customerId/sessionId.
  const sessionId =
    !customerId && !existingSession ? await getOrCreateCartSession() : existingSession;

  try {
    const design = await createDraftDesign({
      productId: parsed.data.productId,
      templateId: parsed.data.templateId,
      customerId,
      sessionId,
    });
    return { ok: true as const, designId: design.id };
  } catch (err) {
    logger.warn(
      { event: "design.create_draft.fail", err: err instanceof Error ? err.message : String(err) },
      "createDraftDesign failed",
    );
    return { ok: false as const, code: "INTERNAL" as const, message: "No pudimos crear el diseño" };
  }
}

// ──────────── Save canvas (debounced 2s desde cliente) ────────────

export async function saveCanvasAction(input: { designId: string; canvasData: unknown }) {
  const parsed = SaveCanvasSchema.safeParse(input);
  if (!parsed.success) {
    // Log structured con detalle del fallo (incluye M.3.b.fix size cap)
    logger.warn(
      {
        event: "design.save_canvas.validation_fail",
        designId: input.designId,
        issues: parsed.error.issues.slice(0, 3).map((i) => i.message),
      },
      "saveCanvas validation rejected",
    );
    // Auditoría v3 · B5: NO exponer el JSON crudo de Zod al cliente (se veía en el header del
    // editor). El detalle ya quedó en el log; al cliente le damos un mensaje claro y accionable.
    return {
      ok: false as const,
      code: "VALIDATION" as const,
      message:
        "No pudimos guardar tu diseño. Refresca la página; si sigue, escríbenos por WhatsApp.",
    };
  }
  // #2 — rate-limit por IP MUY generoso (el cliente auto-guarda debounced cada 2s → cientos de saves
  // por sesión legítima; solo frena un bot en bucle).
  const saveRl = await rateLimit(
    ipKey("save_canvas", getClientIp(await headers())),
    process.env.VERCEL_ENV === "production" ? 600 : 2000,
    600,
  );
  if (!saveRl.allowed) {
    logger.warn({ event: "design.save_canvas.rate_limited", count: saveRl.count });
    return {
      ok: false as const,
      code: "INTERNAL" as const,
      message: "Estás guardando muy rápido. Espera un momento.",
    };
  }
  // Telemetry M.3.b.fix — tracking payload size para early-detect regresiones
  const payloadSize = JSON.stringify(parsed.data.canvasData).length;
  const { customerId, sessionId } = await resolveOwner();
  try {
    await saveCanvas({
      designId: parsed.data.designId,
      canvasData: parsed.data.canvasData,
      customerId,
      sessionId,
    });
    logger.info(
      {
        event: "design.save_canvas.success",
        designId: parsed.data.designId,
        payloadBytes: payloadSize,
      },
      "saveCanvas OK",
    );
    return { ok: true as const };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: "design.save_canvas.fail", err: msg, payloadBytes: payloadSize },
      "saveCanvas failed",
    );
    return { ok: false as const, code: "INTERNAL" as const, message: msg };
  }
}

// ──────────── Finalize (READY snapshot) ────────────
//
// El cliente envía 1 preview compositado del grid. Los N PNG de imprenta los RENDERIZA EL SERVIDOR
// (ADR-081): antes viajaban en este mismo body y por eso el Estudio nunca funcionó en producción —
// un calendario de 12 páginas pesa ~57 MB y Vercel corta el body de una Function en 4.5 MB
// (https://vercel.com/docs/functions/limitations, consulta 2026-07-25). El 413 vuelve como HTML, el
// cliente de Next no puede leerlo y el cliente veía "An unexpected response was received from the
// server". El preview sí cabe de sobra: el mayor medido en Storage pesa 0.61 MB.
//
// Dos caminos siguen aceptando snapshots del cliente:
//   · inline (`production_i`) — lo usan los editores de una sola ficha (nombre, abecedario), donde
//     el blob es diminuto y no hay nada que renderizar en el servidor;
//   · `useStagedSlots` — segunda pasada del fallback: el cliente ya los subió DIRECTO a Storage con
//     una URL firmada, así que no pasan por el body y no tienen techo de tamaño.
//
// Códigos de error para el cliente: `INCOMPLETE_SLOTS` (slots vacíos → modal específica) y
// `NEEDS_CLIENT_SLOTS` (ningún tier server-side reproduce el diseño → el cliente sube los suyos).

const MAX_PRODUCTION_BUFFER_BYTES = 20 * 1024 * 1024; // 20 MB por slot
// Techo del preview: por debajo de los 4.5 MB de Vercel, con margen para el resto del multipart.
const MAX_PREVIEW_BUFFER_BYTES = 3 * 1024 * 1024;

export async function finalizeDesignAction(formData: FormData): Promise<
  | { ok: true; previewUrl: string | null; status: string; productionSlotsCount: number }
  | {
      ok: false;
      code: "NEEDS_CLIENT_SLOTS";
      message: string;
      uploads: { slotIndex: number; url: string }[];
    }
  | { ok: false; code: "VALIDATION" | "INCOMPLETE_SLOTS" | "INTERNAL"; message: string }
> {
  const designId = String(formData.get("designId") ?? "").trim();
  if (!designId) {
    return { ok: false, code: "VALIDATION", message: "designId requerido" };
  }

  // #2 — rate-limit por IP: finalizar escribe N PNGs de producción a Storage (lo más caro del flujo);
  // lo blindamos contra abuso en caliente. Generoso para no romper un cliente que reintenta.
  const finalizeRl = await rateLimit(
    ipKey("finalize_design", getClientIp(await headers())),
    process.env.VERCEL_ENV === "production" ? 20 : 100,
    600,
  );
  if (!finalizeRl.allowed) {
    logger.warn({ event: "design.finalize.rate_limited", count: finalizeRl.count });
    return { ok: false, code: "INTERNAL", message: "Demasiados intentos. Espera un momento." };
  }

  const slotCountRaw = Number(formData.get("slotCount") ?? 0);
  if (!Number.isInteger(slotCountRaw) || slotCountRaw < 1 || slotCountRaw > 50) {
    return { ok: false, code: "VALIDATION", message: "slotCount inválido (1-50)" };
  }

  const previewBlob = formData.get("preview");
  if (!(previewBlob instanceof Blob)) {
    return { ok: false, code: "VALIDATION", message: "preview blob requerido" };
  }
  if (previewBlob.size > MAX_PREVIEW_BUFFER_BYTES) {
    return {
      ok: false,
      code: "VALIDATION",
      message: `preview demasiado grande (${Math.round(previewBlob.size / 1024 / 1024)}MB, max 3MB)`,
    };
  }
  if (previewBlob.size === 0) {
    return { ok: false, code: "VALIDATION", message: "preview vacío" };
  }

  // Snapshots inline: OPCIONALES (ADR-081). Solo los mandan los editores de una sola ficha. Si
  // viene el primero, tienen que venir todos — un envío a medias es un bug del cliente, no un caso
  // que debamos completar renderizando la mitad.
  let productionBuffers: Buffer[] | undefined;
  if (formData.get("production_0") instanceof Blob) {
    productionBuffers = [];
    for (let i = 0; i < slotCountRaw; i++) {
      const blob = formData.get(`production_${i}`);
      if (!(blob instanceof Blob)) {
        return { ok: false, code: "VALIDATION", message: `falta production_${i}` };
      }
      if (blob.size === 0) {
        return { ok: false, code: "VALIDATION", message: `production_${i} vacío` };
      }
      if (blob.size > MAX_PRODUCTION_BUFFER_BYTES) {
        return {
          ok: false,
          code: "VALIDATION",
          message: `slot ${i + 1} demasiado grande (${Math.round(blob.size / 1024 / 1024)}MB, max 20MB)`,
        };
      }
      productionBuffers.push(Buffer.from(await blob.arrayBuffer()));
    }
  }

  const previewBuffer = Buffer.from(await previewBlob.arrayBuffer());

  // ADR-063 CAL2 — año elegido por el cliente para un calendario mes-a-mes (opcional; solo lo envía
  // el editor de ese kind). Se valida el rango antes de confiar en él para el render server-side.
  const yearRaw = Number(formData.get("calendarYear") ?? NaN);
  const calendarYear =
    Number.isInteger(yearRaw) && yearRaw >= 2020 && yearRaw <= 2100 ? yearRaw : undefined;

  const { customerId, sessionId } = await resolveOwner();
  try {
    const design = await finalizeDesign({
      designId,
      previewBuffer,
      productionBuffers,
      useStagedClientSlots: formData.get("useStagedSlots") === "1",
      customerId,
      sessionId,
      calendarYear,
    });
    return {
      ok: true,
      previewUrl: design.previewUrl,
      status: design.status,
      productionSlotsCount: design.productionUrls.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Ningún tier server-side reproduce este diseño (hoy: el marco SVG de la Polaroid). Le pedimos
    // los PNG al navegador, pero por Storage y no por el body — ver ADR-081.
    if (msg.startsWith("NEEDS_CLIENT_SLOTS")) {
      try {
        const uploads = await createClientSlotUploadTickets({ designId, customerId, sessionId });
        logger.info(
          { event: "design.finalize.needs_client_slots", designId, slots: uploads.length },
          "Render server-side no disponible — se piden los snapshots al cliente",
        );
        return {
          ok: false,
          code: "NEEDS_CLIENT_SLOTS",
          message: "Necesitamos las imágenes de imprenta desde tu navegador.",
          uploads,
        };
      } catch (ticketErr) {
        const tmsg = ticketErr instanceof Error ? ticketErr.message : String(ticketErr);
        logger.warn(
          { event: "design.finalize.tickets_fail", designId, err: tmsg },
          "No se pudieron emitir las URLs de subida",
        );
        return { ok: false, code: "INTERNAL", message: tmsg };
      }
    }

    const code: "INCOMPLETE_SLOTS" | "INTERNAL" = msg.startsWith("INCOMPLETE_SLOTS")
      ? "INCOMPLETE_SLOTS"
      : "INTERNAL";
    logger.warn({ event: "design.finalize.fail", code, err: msg }, "finalizeDesign failed");
    return { ok: false, code, message: msg };
  }
}

// ──────────── Crear draft de NOMBRE (superficie "name", ADR-057) ────────────
//
// El editor de nombre crea el diseño con esta acción; luego renderiza la tira de
// fichas a PNG y reutiliza finalizeDesignAction + addPersonalizedToCartAction (sin
// cambios). La validación del nombre corre en el servidor (createNameDesign).

const NameDesignInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  name: z.string().min(1).max(60),
  themeId: z.string().max(40).optional(),
  // Color por letra: hex de 6 dígitos, cap 50 (anti-inyección).
  colors: z
    .array(z.string().regex(/^#[0-9A-Fa-f]{6}$/))
    .max(50)
    .optional(),
  // ADR-057 — estilo ilustrado elegido (LetterTileSet.id) o null = "Solo letra".
  styleSetId: z.string().max(40).nullable().optional(),
});

export async function createNameDesignAction(
  input: unknown,
): Promise<{ ok: true; designId: string; display: string } | { ok: false; message: string }> {
  const parsed = NameDesignInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const { customerId, sessionId } = await resolveOwner();

  // Rate-limit: bucket propio (crear diseño + fila DB). Menos estricto que checkout.
  const rl = await rateLimit(
    ownerKey("create_name_design", customerId ?? sessionId ?? "anon"),
    30,
    600,
  );
  if (!rl.allowed) return { ok: false, message: "Demasiados intentos. Espera un momento." };

  try {
    const design = await createNameDesign({ ...parsed.data, customerId, sessionId });
    return { ok: true, designId: design.id, display: design.display };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "design.create_name.fail", err: msg }, "createNameDesign failed");
    if (msg.startsWith("INVALID_NAME")) {
      return {
        ok: false,
        message: "Revisa el nombre: solo letras, entre el mínimo y máximo permitidos.",
      };
    }
    return { ok: false, message: "No pudimos crear el diseño. Intenta de nuevo." };
  }
}

// ──────────── Crear diseño de SET DE LETRAS (color de marco, ADR-057) ────────────

const LetterSetDesignInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  frameTheme: z.string().min(1).max(40),
  // ADR-057 — paridad con Nombre: color por ficha (hex 6 dígitos, cap 50 anti-inyección).
  colors: z
    .array(z.string().regex(/^#[0-9A-Fa-f]{6}$/))
    .max(50)
    .optional(),
  // ADR-057 — estilo ilustrado elegido (LetterTileSet.id) o null = "Solo letra".
  styleSetId: z.string().max(40).nullable().optional(),
  // Ola 2A — idioma elegido en el Estudio (opcional; default = el de la variante).
  language: z.enum(["es", "en"]).optional(),
});

export async function createLetterSetDesignAction(
  input: unknown,
): Promise<{ ok: true; designId: string } | { ok: false; message: string }> {
  const parsed = LetterSetDesignInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const { customerId, sessionId } = await resolveOwner();
  const rl = await rateLimit(
    ownerKey("create_letterset_design", customerId ?? sessionId ?? "anon"),
    30,
    600,
  );
  if (!rl.allowed) return { ok: false, message: "Demasiados intentos. Espera un momento." };

  try {
    const design = await createLetterSetDesign({ ...parsed.data, customerId, sessionId });
    return { ok: true, designId: design.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { event: "design.create_letterset.fail", err: msg },
      "createLetterSetDesign failed",
    );
    return { ok: false, message: "No pudimos crear el diseño. Intenta de nuevo." };
  }
}

// ──────────── Upload customer photo ────────────
//
// El cliente envía el archivo via FormData. Server:
//   1. Valida ownership del Design (si designId pasó)
//   2. Strip EXIF + auto-orient + persists DesignAsset
//   3. Devuelve signed URL para uso en editor

export async function uploadDesignAssetAction(formData: FormData) {
  const file = formData.get("file");
  const designId = formData.get("designId");
  if (!(file instanceof File)) {
    return { ok: false as const, code: "VALIDATION" as const, message: "Archivo faltante" };
  }
  const metaParsed = UploadAssetMetadataSchema.safeParse({
    designId: typeof designId === "string" && designId.length > 0 ? designId : undefined,
    mimeType: file.type,
    sizeBytes: file.size,
    rightsAccepted: formData.get("rightsAccepted") === "true",
  });
  if (!metaParsed.success) {
    return {
      ok: false as const,
      code: "VALIDATION" as const,
      message: metaParsed.error.issues[0]?.message ?? "Metadata inválida",
    };
  }

  const { customerId, sessionId: anonSession } = await resolveOwner();
  // sessionId garantizado: si no hay aún, lo creamos (anon sube → necesita cookie).
  const sessionId = anonSession ?? (await getOrCreateCartSession());
  const ownerId = customerId ?? sessionId;

  // F2 — rate-limit de subida por dueño (sesión/cliente): el estudio es público,
  // así que limitamos el flood de storage por bots. Generoso para un diseño real.
  const isProd = process.env.VERCEL_ENV === "production";
  const rl = await rateLimit(ownerKey("upload_design_asset", ownerId), isProd ? 30 : 200, 600);
  if (!rl.allowed) {
    logger.warn({ event: "design.asset.upload.rate_limited", ownerId, count: rl.count });
    return {
      ok: false as const,
      code: "RATE_LIMIT" as const,
      message:
        "Has subido muchas imágenes en poco tiempo. Espera unos minutos e inténtalo de nuevo.",
    };
  }

  // Si pasaron designId, verificar ownership.
  let design = null;
  if (metaParsed.data.designId) {
    design = await getOwnedDesign(metaParsed.data.designId, { customerId, sessionId });
    if (!design) {
      return {
        ok: false as const,
        code: "FORBIDDEN" as const,
        message: "Diseño no encontrado o no autorizado",
      };
    }
  }

  // M.3.b.B.2 — Buscar productSizeCm del product asociado al Design para DPI check.
  // Si no hay Design (upload sin draft creado aún) → sin sizeCm, validation
  // solo evalúa brillo + blur.
  let productSizeCm: string | undefined;
  if (design) {
    const product = await prisma.product.findUnique({
      where: { id: design.productId },
      select: { personalizationSchema: true },
    });
    if (product?.personalizationSchema && typeof product.personalizationSchema === "object") {
      const cfg = product.personalizationSchema as { sizeCm?: unknown };
      if (typeof cfg.sizeCm === "string") productSizeCm = cfg.sizeCm;
    }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadCustomerPhoto({
      buffer,
      originalMimeType: metaParsed.data.mimeType,
      ownerId,
      designId: metaParsed.data.designId ?? null,
      productSizeCm,
    });

    // Persistir DesignAsset
    const asset = await prisma.designAsset.create({
      data: {
        designId: metaParsed.data.designId ?? null,
        customerId,
        sessionId,
        storageUrl: uploaded.path, // path interno; signed URL generada al demand
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        width: uploaded.width,
        height: uploaded.height,
        exifStripped: uploaded.exifStripped,
        malwareScanned: false, // V1 sin scanner; M.8 evalúa
        // Evidencia de consentimiento de derechos de imagen (Ley 1581). El schema ya
        // garantizó rightsAccepted===true, así que sellamos el momento + la versión.
        rightsAcceptedAt: new Date(),
        rightsPolicyVersion: IMAGE_RIGHTS_POLICY_VERSION,
      },
    });

    logger.info(
      {
        event: "design.asset.upload.success",
        assetId: asset.id,
        designId: metaParsed.data.designId,
        ownerType: customerId ? "customer" : "session",
        sizeBytes: uploaded.sizeBytes,
        validationLevel: uploaded.validation?.level,
      },
      "Customer photo uploaded",
    );

    return {
      ok: true as const,
      assetId: asset.id,
      signedUrl: uploaded.signedUrl,
      width: uploaded.width,
      height: uploaded.height,
      // M.3.b.B.2 — Validación de calidad para que el cliente muestre warning UI.
      validationLevel: uploaded.validation?.level,
      validationMessage: uploaded.validation?.message,
      validationRecommendation: uploaded.validation?.recommendation,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "design.asset.upload.fail", err: msg }, "uploadCustomerPhoto failed");
    return { ok: false as const, code: "INTERNAL" as const, message: msg };
  }
}

// ──────────── Fase B2 — aplicar un diseño PREDISEÑADO a un slot ────────────
//
// El cliente elige un diseño de la galería; lo "subimos" como asset del diseño (reusando
// uploadCustomerPhoto) para que el slot lo trate como cualquier foto (encuadre, finalize, render).
// Ola 21 — soporta pares cara A/B para separadores: si el diseño tiene `imageUrlB`, se suben
// ambas imágenes y se devuelven los dos assets.

export async function assignPredesignedToDesignAction(input: {
  designId: string;
  galleryImageId: string;
}): Promise<
  | {
      ok: true;
      assetId: string;
      signedUrl: string;
      width: number;
      height: number;
      assetB?: { assetId: string; signedUrl: string; width: number; height: number };
    }
  | { ok: false; message: string }
> {
  const designId = typeof input?.designId === "string" ? input.designId : "";
  const galleryImageId = typeof input?.galleryImageId === "string" ? input.galleryImageId : "";
  if (!designId || !galleryImageId) return { ok: false, message: "Datos inválidos." };

  const { customerId, sessionId: anonSession } = await resolveOwner();
  const sessionId = anonSession ?? (await getOrCreateCartSession());
  const ownerId = customerId ?? sessionId;

  const rl = await rateLimit(ownerKey("upload_design_asset", ownerId), 30, 600);
  if (!rl.allowed) return { ok: false, message: "Demasiados intentos. Espera un momento." };

  const design = await getOwnedDesign(designId, { customerId, sessionId });
  if (!design) return { ok: false, message: "Diseño no encontrado o no autorizado." };

  const galleryImage = await getGalleryImageById(galleryImageId);
  if (!galleryImage) return { ok: false, message: "Diseño no disponible." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const isAllowedUrl = (url: string) =>
    !!supabaseUrl && url.startsWith(`${supabaseUrl}/storage/v1/object/public/`);

  // Anti-SSRF: solo se permite bajar la imagen desde NUESTRO storage público (la galería la
  // llena el admin vía uploadProductImage → bucket propio). Cualquier otra URL se rechaza.
  if (!isAllowedUrl(galleryImage.imageUrl)) {
    return { ok: false, message: "Diseño no disponible." };
  }

  async function uploadFromUrl(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0].trim();
    const uploaded = await uploadCustomerPhoto({
      buffer,
      originalMimeType: mime,
      ownerId,
      designId,
      productSizeCm: undefined,
    });
    const asset = await prisma.designAsset.create({
      data: {
        designId,
        customerId,
        sessionId,
        storageUrl: uploaded.path,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        width: uploaded.width,
        height: uploaded.height,
        exifStripped: uploaded.exifStripped,
        malwareScanned: false,
      },
    });
    return {
      assetId: asset.id,
      signedUrl: uploaded.signedUrl,
      width: uploaded.width,
      height: uploaded.height,
    };
  }

  try {
    const assetA = await uploadFromUrl(galleryImage.imageUrl);
    let assetB;
    if (galleryImage.imageUrlB && isAllowedUrl(galleryImage.imageUrlB)) {
      assetB = await uploadFromUrl(galleryImage.imageUrlB);
    }
    return { ok: true, ...assetA, assetB };
  } catch (err) {
    logger.warn(
      {
        event: "design.predesigned.assign.fail",
        err: err instanceof Error ? err.message : String(err),
      },
      "assignPredesigned failed",
    );
    return { ok: false, message: "No pudimos aplicar el diseño." };
  }
}
