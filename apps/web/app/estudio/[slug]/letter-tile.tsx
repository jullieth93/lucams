"use client";

/*
 * Ficha de letra del abecedario (ADR-057, Fase 0). Muestra el dibujo real de la letra
 * cuando existe (imageUrl), o un PLACEHOLDER kawaii de marca mientras Lucy carga sus 53
 * ilustraciones. El color del borde cicla por la paleta para que la tira se vea lúdica.
 *
 * El mismo diseño se re-dibuja en canvas para el PNG de producción (ver name-editor).
 */

export const TILE_BORDER_COLORS = ["#7C6AAD", "#5DD9D1", "#E85B9F", "#F58A6F", "#FFD93D"] as const;

/*
 * Temas de color de las fichas (ADR-057). Hoy recolorean el placeholder; mañana cada
 * tema mapea a un "Set de fichas" ilustrado que Lucy gestiona en el admin (niña/niño/
 * arcoíris/neutro). El tema elegido se guarda en el diseño (metadata.themeId).
 */
export type NameTileTheme = {
  id: string;
  label: string;
  emoji: string;
  colors: readonly string[];
};

export const NAME_TILE_THEMES: readonly NameTileTheme[] = [
  { id: "arcoiris", label: "Arcoíris", emoji: "🌈", colors: ["#E85B9F", "#F58A6F", "#FFD93D", "#3FB8AF", "#4A90D9", "#9B5DE5"] },
  { id: "vibrante", label: "Vibrante", emoji: "⚡", colors: ["#E63946", "#F4511E", "#FFC300", "#43AA8B", "#1D6FB8", "#9B5DE5"] },
  { id: "nina", label: "Niña", emoji: "💗", colors: ["#E85B9F", "#F58A6F", "#C86FB0", "#FF3D7F", "#9B5DE5"] },
  { id: "nino", label: "Niño", emoji: "💙", colors: ["#5DD9D1", "#4A90D9", "#1D6FB8", "#43AA8B", "#7C6AAD"] },
  { id: "neutro", label: "Neutro", emoji: "🖤", colors: ["#3D2E5C", "#2B2D42", "#6B7280", "#8B5A2B", "#7C6AAD"] },
];

export function getNameTileTheme(id: string | null | undefined): NameTileTheme {
  return NAME_TILE_THEMES.find((t) => t.id === id) ?? NAME_TILE_THEMES[0];
}

/**
 * Colores curados (aptos para impresión) para elegir el color de cada letra. Paleta
 * amplia: rojos/naranjas/amarillos/verdes/azules/morados/rosas + neutros — no solo
 * pastel (feedback de Lucy 2026-07-12).
 */
export const LETTER_SWATCHES = [
  "#E63946", "#F4511E", "#F58A6F", "#F5A623", "#FFC300", "#FFD93D",
  "#8BC34A", "#43AA8B", "#2A9D8F", "#5DD9D1", "#4A90D9", "#1D6FB8",
  "#9B5DE5", "#7C6AAD", "#C86FB0", "#E85B9F", "#FF3D7F", "#D81159",
  "#8B5A2B", "#6B7280", "#3D2E5C", "#2B2D42",
] as const;

export function LetterTile({
  letter,
  color,
  imageUrl,
  size = 72,
  selected = false,
  onClick,
}: {
  letter: string;
  color: string;
  imageUrl?: string | null;
  size?: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={interactive ? `Cambiar el color de la letra ${letter}` : undefined}
      className={`relative flex flex-shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm transition ${
        interactive ? "cursor-pointer hover:-translate-y-0.5" : "cursor-default"
      }`}
      style={{
        width: size,
        height: size * 1.18,
        border: `3px solid ${color}`,
        boxShadow: selected ? `0 0 0 3px ${color}55, 0 4px 14px ${color}33` : `0 4px 14px ${color}22`,
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element — ficha desde bucket público
        <img src={imageUrl} alt="" className="h-full w-full rounded-xl object-contain p-1" />
      ) : (
        <span
          className="font-display leading-none font-extrabold select-none"
          style={{ color, fontSize: size * 0.56 }}
          aria-hidden="true"
        >
          {letter}
        </span>
      )}
    </button>
  );
}
