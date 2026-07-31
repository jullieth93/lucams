/*
 * Mediateca CMS (roadmap B5) — pipeline de subida/listado/borrado de imágenes
 * para los campos `type: IMAGE` del CMS v2.
 *
 * Un campo IMAGE guarda en `body` el `CmsMedia.id`; la URL pública se deriva de
 * bucket+path (bucket `cms-media`, público, 5 MB, jpg/png/webp/avif — migración
 * supabase 00000000000020). El `alt` es OBLIGATORIO (WCAG 1.1.1): sin texto
 * alternativo no se registra el asset.
 *
 * Seguridad: mismo pipeline que uploadProductImage (lib/storage.ts) — tamaño,
 * MIME declarado contra allow-list y MIME REAL por magic bytes (anti-polyglot:
 * un .html renombrado a .jpg no entra). Además se prueban las dimensiones con
 * sharp endurecido (sharp-safe: loaders con CVE bloqueados), lo que también
 * confirma que el archivo decodifica de verdad.
 *
 * Borrado con guarda de uso: si algún campo (borrador o cualquier versión del
 * historial) apunta al asset — sea un campo IMAGE (body = id) o un campo
 * LISTA con subcampo IMAGE (id embebido en el JSON, roadmap B6) — no se puede
 * borrar: revertir a una versión vieja nunca rompe una imagen publicada.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { StorageError, sniffImageMime } from "@/lib/storage";
import { CmsValidationError } from "@/features/cms/service";

type CmsMedia = Prisma.CmsMediaGetPayload<object>;

const BUCKET = "cms-media";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (misma fila del bucket)
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export type CmsMediaWithUrl = CmsMedia & { url: string };

/** URL pública del asset (bucket público → sin firma; path inmutable con UUID). */
export function cmsMediaPublicUrl(bucket: string, path: string): string {
  const { data } = supabaseService.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Sube una imagen a la mediateca: valida → prueba dimensiones → sube al bucket
 * → registra CmsMedia. El llamador (server action) ya verificó el rol admin.
 */
export async function uploadCmsMedia(opts: {
  file: File;
  alt: string;
  createdBy: string | null;
}): Promise<CmsMediaWithUrl> {
  const { file, createdBy } = opts;
  const alt = opts.alt.trim();

  if (alt.length === 0) {
    throw new CmsValidationError(
      "general",
      "El texto alternativo es obligatorio (lo leen los lectores de pantalla).",
    );
  }
  if (alt.length > 300) {
    throw new CmsValidationError(
      "general",
      "El texto alternativo no puede pasar de 300 caracteres.",
    );
  }
  if (file.size === 0) {
    throw new StorageError("EMPTY_FILE", "Archivo vacío");
  }
  if (file.size > MAX_BYTES) {
    throw new StorageError("FILE_TOO_LARGE", `El archivo excede ${MAX_BYTES / 1024 / 1024} MB`);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new StorageError("INVALID_TYPE", `Tipo "${file.type}" no permitido (jpg/png/webp/avif)`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Anti-polyglot: el MIME REAL manda, no el declarado por el cliente.
  const realMime = sniffImageMime(buffer);
  if (!realMime || !ALLOWED_MIME.has(realMime)) {
    throw new StorageError(
      "INVALID_TYPE",
      "El archivo no es una imagen válida (jpg/png/webp/avif).",
    );
  }

  // Dimensiones reales + confirmación de que decodifica (sharp endurecido).
  const sharp = (await import("@/features/personalization/sharp-safe")).default;
  let width: number;
  let height: number;
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) throw new Error("sin dimensiones");
    width = meta.width;
    height = meta.height;
  } catch {
    throw new StorageError(
      "INVALID_TYPE",
      "No pudimos leer la imagen. ¿Está completa y sin daños?",
    );
  }

  const ext =
    realMime === "image/jpeg"
      ? "jpg"
      : realMime === "image/png"
        ? "png"
        : realMime === "image/webp"
          ? "webp"
          : "avif";
  const path = `media/${randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabaseService.storage.from(BUCKET).upload(path, buffer, {
    contentType: realMime,
    cacheControl: "31536000", // 1 año — el path lleva UUID, es inmutable
    upsert: false,
  });
  if (uploadErr) {
    throw new StorageError("UPLOAD_FAILED", `Error subiendo: ${uploadErr.message}`);
  }

  const media = await prisma.cmsMedia.create({
    data: {
      bucket: BUCKET,
      path,
      alt,
      width,
      height,
      bytes: file.size,
      mime: realMime,
      ...(createdBy ? { createdBy } : {}),
    },
  });
  return { ...media, url: cmsMediaPublicUrl(media.bucket, media.path) };
}

/**
 * Lista la mediateca (más reciente primero) con URL derivada y conteo de uso:
 * cuántos campos IMAGE activos apuntan a cada asset (para bloquear borrados
 * peligrosos y mostrar «en uso» en el admin).
 */
export async function listCmsMedia(limit = 120): Promise<CmsMediaWithUrl[]> {
  const media = await prisma.cmsMedia.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return media.map((m) => ({ ...m, url: cmsMediaPublicUrl(m.bucket, m.path) }));
}

/** Mapa `CmsMedia.id → keys de campos activos que lo usan en su borrador actual`. */
export async function getCmsMediaUsage(ids: string[]): Promise<Map<string, string[]>> {
  const usage = new Map<string, string[]>();
  if (ids.length === 0) return usage;
  // `contains` y no igualdad: en los campos LISTA con subcampo IMAGE (roadmap
  // B6, ej. home.banners) el id va EMBEBIDO en el body JSON del campo; en un
  // campo type IMAGE el body ES el id (contains también matchea).
  const fields = await prisma.cmsField.findMany({
    where: { deletedAt: null, OR: ids.map((id) => ({ body: { contains: id } })) },
    select: { key: true, body: true },
  });
  for (const f of fields) {
    for (const id of ids) {
      if (f.body.includes(id)) {
        const list = usage.get(id) ?? [];
        list.push(f.key);
        usage.set(id, list);
      }
    }
  }
  return usage;
}

/** Edita el texto alternativo (a11y — corrige typos sin resubir el archivo). */
export async function updateCmsMediaAlt(id: string, alt: string): Promise<CmsMedia> {
  const clean = alt.trim();
  if (clean.length === 0) {
    throw new CmsValidationError("general", "El texto alternativo no puede quedar vacío.");
  }
  if (clean.length > 300) {
    throw new CmsValidationError(
      "general",
      "El texto alternativo no puede pasar de 300 caracteres.",
    );
  }
  return prisma.cmsMedia.update({ where: { id }, data: { alt: clean } });
}

/**
 * Borra un asset de la mediateca (fila + archivo en el bucket). GUARDA DE USO:
 * rechaza si el borrador actual de algún campo activo lo usa, o si CUALQUIER
 * versión del historial lo referencia (revertir no debe romper imágenes).
 */
export async function deleteCmsMedia(id: string): Promise<void> {
  const media = await prisma.cmsMedia.findUnique({ where: { id } });
  if (!media) throw new CmsValidationError("general", "Imagen no encontrada");

  const [usedByFields, usedByVersion] = await Promise.all([
    // `contains` y no igualdad (mismo criterio que getCmsMediaUsage): en los
    // campos LISTA (B6) el id va embebido en el body JSON; en un campo IMAGE
    // el body ES el id. Falso positivo = un cuid de 25 chars en prosa: no
    // pasa en la práctica, y el mensaje lista las keys para verificar.
    prisma.cmsField.findMany({
      where: { body: { contains: id }, deletedAt: null },
      select: { key: true },
    }),
    prisma.cmsFieldVersion.findFirst({
      where: { body: { contains: id } },
      select: { field: { select: { key: true } } },
    }),
  ]);
  if (usedByFields.length > 0 || usedByVersion) {
    const keys = [...new Set([...usedByFields.map((f) => f.key), usedByVersion?.field.key])]
      .filter(Boolean)
      .join(", ");
    throw new CmsValidationError(
      "general",
      `No se puede borrar: la usan estos campos (${keys}). Quítala de ahí primero.`,
    );
  }

  await prisma.cmsMedia.delete({ where: { id } });
  const { error } = await supabaseService.storage.from(media.bucket).remove([media.path]);
  if (error) {
    // La fila ya se fue: el archivo queda huérfano en el bucket (recolectable
    // a mano). Se reporta para que el admin sepa, sin fingir que falló todo.
    throw new StorageError(
      "DELETE_FAILED",
      `Se borró el registro pero no el archivo en el bucket: ${error.message}`,
    );
  }
}
