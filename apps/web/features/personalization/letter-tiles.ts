/*
 * ADR-057 — Sets de fichas del abecedario. Read-side (editor de nombre) + gestión (admin).
 * El editor mapea cada letra escrita a su ficha ilustrada; si falta, cae a placeholder.
 */

import "server-only";
import { prisma } from "@/lib/db";

export type LetterTileMap = Record<string, { imageUrl: string; label: string | null }>;

/**
 * Fichas del set activo por defecto de un idioma, como mapa CHAR(mayúscula) → ficha.
 * Usado por el editor de nombre para renderizar la palabra con las ilustraciones reales.
 */
export async function getLetterTilesForLanguage(language: string): Promise<LetterTileMap> {
  const set = await prisma.letterTileSet.findFirst({
    where: { language, isActive: true, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { order: "asc" }],
    select: { tiles: { select: { char: true, imageUrl: true, label: true } } },
  });
  const map: LetterTileMap = {};
  if (set) {
    for (const t of set.tiles) map[t.char.toUpperCase()] = { imageUrl: t.imageUrl, label: t.label };
  }
  return map;
}

// ──────────────────────── Admin ────────────────────────

/** Alfabeto esperado por idioma (para la grilla del admin). es incluye la Ñ. */
export const ALPHABET: Record<string, string[]> = {
  es: [..."ABCDEFGHIJKLMNÑOPQRSTUVWXYZ"],
  en: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
};

export async function listLetterSets() {
  return prisma.letterTileSet.findMany({
    where: { deletedAt: null },
    orderBy: [{ language: "asc" }, { order: "asc" }],
    select: {
      id: true,
      name: true,
      language: true,
      isActive: true,
      isDefault: true,
      _count: { select: { tiles: true } },
    },
  });
}

export async function getLetterSet(setId: string) {
  return prisma.letterTileSet.findFirst({
    where: { id: setId, deletedAt: null },
    select: {
      id: true,
      name: true,
      language: true,
      isActive: true,
      isDefault: true,
      tiles: { select: { id: true, char: true, imageUrl: true, label: true }, orderBy: { order: "asc" } },
    },
  });
}

/** Sube/reemplaza la ficha de una letra (imageUrl ya subida al bucket). */
export async function upsertLetterTile(opts: {
  setId: string;
  char: string;
  imageUrl: string;
  label?: string | null;
  adminId: string;
}): Promise<void> {
  const char = opts.char.toUpperCase();
  const idx = Math.max(0, "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".indexOf(char));
  await prisma.letterTile.upsert({
    where: { setId_char: { setId: opts.setId, char } },
    create: { setId: opts.setId, char, imageUrl: opts.imageUrl, label: opts.label ?? null, order: idx },
    update: { imageUrl: opts.imageUrl, label: opts.label ?? undefined },
  });
  await prisma.letterTileSet.update({
    where: { id: opts.setId },
    data: { updatedBy: opts.adminId },
  });
}

export async function deleteLetterTile(setId: string, char: string): Promise<void> {
  await prisma.letterTile
    .delete({ where: { setId_char: { setId, char: char.toUpperCase() } } })
    .catch(() => {});
}
