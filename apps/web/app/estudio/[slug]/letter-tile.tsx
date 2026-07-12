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
  { id: "arcoiris", label: "Arcoíris", emoji: "🌈", colors: TILE_BORDER_COLORS },
  { id: "nina", label: "Niña", emoji: "💗", colors: ["#E85B9F", "#F58A6F", "#C86FB0", "#FF9EC9", "#7C6AAD"] },
  { id: "nino", label: "Niño", emoji: "💙", colors: ["#5DD9D1", "#4A90D9", "#7C6AAD", "#3FB8AF", "#3D2E5C"] },
  { id: "neutro", label: "Neutro", emoji: "🎨", colors: ["#7C6AAD", "#8B7BB8", "#6A5A99", "#9B8BC4", "#5A4A82"] },
];

export function getNameTileTheme(id: string | null | undefined): NameTileTheme {
  return NAME_TILE_THEMES.find((t) => t.id === id) ?? NAME_TILE_THEMES[0];
}

/** Colores curados (aptos para impresión) para elegir el color de cada letra. */
export const LETTER_SWATCHES = [
  "#7C6AAD", "#5DD9D1", "#E85B9F", "#F58A6F", "#FFD93D",
  "#4A90D9", "#3FB8AF", "#C86FB0", "#F5A623", "#3D2E5C",
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
