"use client";

/*
 * ADR-057 (2026-07-12) — Lógica de color COMPARTIDA por el editor de Nombre y el de Set de
 * letras (Completo/Vocales). Unifica lo que Lucy pidió: mismos controles de color en todos
 * los productos del abecedario — tema + barajar (re-clic) + color por ficha.
 *
 * `count` = nº de fichas visibles (letras.length). El override por índice se conserva aunque
 * el nombre cambie de longitud (idéntico al comportamiento previo del editor de Nombre).
 * Barajar usa Math.random SOLO dentro de handlers (post-hidratación) → sin mismatch SSR.
 */

import { useMemo, useState } from "react";
import { NAME_TILE_THEMES, getNameTileTheme } from "./letter-tile";

export function useLetterColors(count: number) {
  const [themeId, setThemeId] = useState(NAME_TILE_THEMES[0].id);
  // Orden de colores del tema activo. Inicial = orden del tema (determinista para SSR);
  // cada re-clic al tema lo BARAJA.
  const [activeColors, setActiveColors] = useState<readonly string[]>(NAME_TILE_THEMES[0].colors);
  // Override de color por ficha (índice → color). Vacío = usa el color del tema.
  const [letterColors, setLetterColors] = useState<Record<number, string>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const effectiveColors = useMemo(
    () =>
      Array.from(
        { length: Math.max(0, count) },
        (_, i) => letterColors[i] ?? activeColors[i % activeColors.length],
      ),
    [count, letterColors, activeColors],
  );

  /** Baraja Fisher-Yates. Solo se llama desde onClick (post-hidratación) → seguro. */
  function shuffleColors(colors: readonly string[]): string[] {
    const a = [...colors];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function applyTheme(id: string) {
    setThemeId(id);
    setActiveColors(shuffleColors(getNameTileTheme(id).colors)); // re-clic → otra combinación
    setLetterColors({}); // el tema es un punto de partida limpio
    setSelectedIndex(null);
  }

  function setColorForSelected(color: string) {
    if (selectedIndex === null) return;
    setLetterColors((prev) => ({ ...prev, [selectedIndex]: color }));
    setSelectedIndex(null);
  }

  function toggleSelected(index: number) {
    setSelectedIndex((cur) => (cur === index ? null : index));
  }

  // ¿El tema sigue "limpio" (sin overrides por ficha)? Para el aria-pressed del picker.
  const customized = Object.keys(letterColors).length > 0;

  return {
    themeId,
    effectiveColors,
    selectedIndex,
    setSelectedIndex,
    toggleSelected,
    applyTheme,
    setColorForSelected,
    customized,
  };
}
