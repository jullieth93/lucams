/*
 * ADR-057 — Sets de fichas del abecedario. Read-side (editor de nombre) + gestión (admin).
 * El editor mapea cada letra escrita a su ficha ilustrada; si falta, cae a placeholder.
 */

import "server-only";
import { prisma } from "@/lib/db";

export type LetterTileMap = Record<string, { imageUrl: string; label: string | null }>;

/** ADR-057 — un ESTILO (tema/ocasión) del abecedario: un set de fichas ilustradas. */
export type LetterStyle = { id: string; name: string; tiles: LetterTileMap };

function tilesToMap(
  tiles: { char: string; imageUrl: string; label: string | null }[],
): LetterTileMap {
  const map: LetterTileMap = {};
  for (const t of tiles) map[t.char.toUpperCase()] = { imageUrl: t.imageUrl, label: t.label };
  return map;
}

/**
 * Fichas del set activo por defecto de un idioma, como mapa CHAR(mayúscula) → ficha.
 * Usado como fallback / compat. El editor moderno usa listLetterStyles (multi-estilo).
 */
export async function getLetterTilesForLanguage(language: string): Promise<LetterTileMap> {
  const set = await prisma.letterTileSet.findFirst({
    where: { language, isActive: true, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { order: "asc" }],
    select: { tiles: { select: { char: true, imageUrl: true, label: true } } },
  });
  return set ? tilesToMap(set.tiles) : {};
}

/**
 * ADR-057 — ESTILOS ilustrados disponibles de un idioma (Animales, Navidad, …). Cada estilo
 * es un set activo CON fichas subidas (los vacíos se omiten: renderizarían letra plana, que ya
 * cubre el estilo "Default"/Solo-letra del editor). Ordenados: default primero, luego `order`.
 * El editor los ofrece como chips; el cliente elige el tema y ve las fichas al instante (WYSIWYG).
 */
export async function listLetterStyles(language: string): Promise<LetterStyle[]> {
  const expected = ALPHABET[language]?.length ?? 27;
  const sets = await prisma.letterTileSet.findMany({
    where: {
      language,
      isActive: true,
      deletedAt: null,
      OR: [{ isDefault: true }, { tiles: { some: {} } }],
    },
    orderBy: [{ isDefault: "desc" }, { order: "asc" }],
    select: {
      id: true,
      name: true,
      isDefault: true,
      _count: { select: { tiles: true } },
      tiles: { select: { char: true, imageUrl: true, label: true } },
    },
  });
  // Ola 19 — solo mostrar sets completos (todas las fichas del alfabeto). El default
  // vacío se conserva para que el editor pueda degradar a letra plana.
  return sets
    .filter((s) => s.isDefault || s._count.tiles >= expected)
    .map((s) => ({ id: s.id, name: s.name, tiles: tilesToMap(s.tiles) }));
}

/**
 * Ola 2A (Lucy 2026-07-22) — OPCIONES DE TEMA para el selector del Estudio de sets de letras
 * (Abecedario/Vocales): TODOS los sets activos de un idioma, INCLUSO los vacíos (que degradan
 * a letra estándar en el preview). El tema ya no se elige como variante en la PDP: se elige
 * acá. `theme` se deriva del nombre del set ("Kawaii Animales · Español" → "animales").
 */
export type LetterThemeOption = {
  id: string;
  name: string;
  /** Clave de tema derivada del nombre: "animales" | "frutas" | "profesiones" | null (otro). */
  theme: string | null;
  language: string;
  tileCount: number;
};

/** Deriva la clave de tema del nombre de un set (es/en). null = tema no reconocido. */
export function themeKeyFromSetName(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("animal")) return "animales";
  if (n.includes("fruta") || n.includes("fruit")) return "frutas";
  if (n.includes("profesion") || n.includes("profession") || n.includes("oficio")) {
    return "profesiones";
  }
  return null;
}

export async function listLetterThemeOptions(language: string): Promise<LetterThemeOption[]> {
  const sets = await prisma.letterTileSet.findMany({
    where: { language, isActive: true, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { order: "asc" }],
    select: {
      id: true,
      name: true,
      language: true,
      isDefault: true,
      _count: { select: { tiles: true } },
    },
  });
  // Ola 19 (Lucy 2026-07-26) — solo ofrecer sets que tengan TODAS las fichas del alfabeto.
  // Un set incompleto se veía "roto" en el Estudio (algunas letras ilustradas, otras planas).
  // El default vacío se mantiene para que el cliente vea el hint "sube las ilustraciones".
  const expected = ALPHABET[language]?.length ?? 27;
  return sets
    .filter((s) => s.isDefault || s._count.tiles >= expected)
    .map((s) => ({
      id: s.id,
      name: s.name,
      theme: themeKeyFromSetName(s.name),
      language: s.language,
      tileCount: s._count.tiles,
    }));
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

/** ADR-057 — crea un ESTILO nuevo (set de fichas vacío) para empezar a subirle ilustraciones. */
export async function createLetterSet(opts: {
  name: string;
  language: string;
  adminId: string;
}): Promise<{ id: string }> {
  const count = await prisma.letterTileSet.count({
    where: { language: opts.language, deletedAt: null },
  });
  const set = await prisma.letterTileSet.create({
    data: {
      name: opts.name,
      language: opts.language,
      isActive: true,
      isDefault: count === 0, // el primero del idioma queda como default
      order: count,
      createdBy: opts.adminId,
      updatedBy: opts.adminId,
    },
    select: { id: true },
  });
  return set;
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
      tiles: {
        select: { id: true, char: true, imageUrl: true, label: true },
        orderBy: { order: "asc" },
      },
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
    create: {
      setId: opts.setId,
      char,
      imageUrl: opts.imageUrl,
      label: opts.label ?? null,
      order: idx,
    },
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
