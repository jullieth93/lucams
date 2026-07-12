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

export function LetterTile({
  letter,
  index,
  imageUrl,
  size = 72,
  colors = TILE_BORDER_COLORS,
}: {
  letter: string;
  index: number;
  imageUrl?: string | null;
  size?: number;
  colors?: readonly string[];
}) {
  const color = colors[index % colors.length];
  return (
    <div
      className="relative flex flex-shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm"
      style={{
        width: size,
        height: size * 1.18,
        border: `3px solid ${color}`,
        boxShadow: `0 4px 14px ${color}22`,
      }}
      aria-hidden="true"
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element — ficha desde bucket público
        <img src={imageUrl} alt="" className="h-full w-full rounded-xl object-contain p-1" />
      ) : (
        <span
          className="font-display leading-none font-extrabold select-none"
          style={{ color, fontSize: size * 0.56 }}
        >
          {letter}
        </span>
      )}
    </div>
  );
}
