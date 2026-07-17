/*
 * ADR-057 Fase B2 — Galería de diseños PREDISEÑADOS. Imágenes listas que el cliente aplica a un
 * slot en el editor (en vez de subir su foto). Agrupadas por `tag` (ej. "separadores"). El admin
 * las gestiona; el editor las ofrece + al elegir una, se llena el slot reusando el pipeline de foto.
 */

import "server-only";
import { prisma } from "@/lib/db";

export type GalleryImage = { id: string; name: string; imageUrl: string };

/** Diseños prediseñados activos de un tag, para el editor (público). */
export async function listGalleryImages(tag: string): Promise<GalleryImage[]> {
  const rows = await prisma.designGalleryImage.findMany({
    where: { tag, isActive: true, deletedAt: null },
    orderBy: { order: "asc" },
    select: { id: true, name: true, imageUrl: true },
  });
  return rows;
}

/** URL pública de un diseño de la galería (para la acción de llenar slot). */
export async function getGalleryImageUrl(id: string): Promise<string | null> {
  const row = await prisma.designGalleryImage.findFirst({
    where: { id, isActive: true, deletedAt: null },
    select: { imageUrl: true },
  });
  return row?.imageUrl ?? null;
}

// ──────────────────────── Admin ────────────────────────

export async function listGalleryAdmin(tag?: string) {
  return prisma.designGalleryImage.findMany({
    where: { deletedAt: null, ...(tag ? { tag } : {}) },
    orderBy: [{ tag: "asc" }, { order: "asc" }],
    select: { id: true, tag: true, name: true, imageUrl: true, isActive: true, order: true },
  });
}

export async function createGalleryImage(opts: {
  tag: string;
  name: string;
  imageUrl: string;
  adminId: string;
}): Promise<{ id: string }> {
  const count = await prisma.designGalleryImage.count({
    where: { tag: opts.tag, deletedAt: null },
  });
  const row = await prisma.designGalleryImage.create({
    data: {
      tag: opts.tag,
      name: opts.name,
      imageUrl: opts.imageUrl,
      order: count,
      isActive: true,
      createdBy: opts.adminId,
      updatedBy: opts.adminId,
    },
    select: { id: true },
  });
  return row;
}

export async function deleteGalleryImage(id: string): Promise<void> {
  await prisma.designGalleryImage
    .update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
    .catch(() => {});
}
