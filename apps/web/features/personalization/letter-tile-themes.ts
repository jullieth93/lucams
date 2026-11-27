/*
 * Temas de color y constantes puras de fichas de letras (ADR-057).
 *
 * Extraído de `app/estudio/[slug]/letter-tile.tsx` para permitir su consumo
 * desde componentes administrativos sin cruzar hacia `app/estudio/` (Fase 5 · #19).
 */

export const TILE_BORDER_COLORS = ["#7C6AAD", "#5DD9D1", "#E85B9F", "#F58A6F", "#FFD93D"] as const;

export type NameTileTheme = {
  id: string;
  label: string;
  emoji: string;
  colors: readonly string[];
};

export const NAME_TILE_THEMES: readonly NameTileTheme[] = [
  {
    id: "arcoiris",
    label: "Arcoíris",
    emoji: "🌈",
    colors: ["#E85B9F", "#F58A6F", "#FFD93D", "#3FB8AF", "#4A90D9", "#9B5DE5"],
  },
  {
    id: "vibrante",
    label: "Vibrante",
    emoji: "⚡",
    colors: ["#E63946", "#F4511E", "#FFC300", "#43AA8B", "#1D6FB8", "#9B5DE5"],
  },
  {
    id: "nina",
    label: "Niña",
    emoji: "💗",
    colors: ["#E85B9F", "#F58A6F", "#C86FB0", "#FF3D7F", "#9B5DE5"],
  },
  {
    id: "nino",
    label: "Niño",
    emoji: "💙",
    colors: ["#5DD9D1", "#4A90D9", "#1D6FB8", "#43AA8B", "#7C6AAD"],
  },
  {
    id: "neutro",
    label: "Neutro",
    emoji: "🖤",
    colors: ["#3D2E5C", "#2B2D42", "#6B7280", "#8B5A2B", "#7C6AAD"],
  },
];

export function getNameTileTheme(id: string | null | undefined): NameTileTheme {
  return NAME_TILE_THEMES.find((t) => t.id === id) ?? NAME_TILE_THEMES[0];
}
