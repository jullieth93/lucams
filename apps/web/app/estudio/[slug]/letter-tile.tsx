"use client";

/*
 * Ficha de letra del abecedario (ADR-057, Fase 0). Muestra el dibujo real de la letra
 * cuando existe (imageUrl), o un PLACEHOLDER kawaii de marca mientras Lucy carga sus 53
 * ilustraciones. El color del borde cicla por la paleta para que la tira se vea lúdica.
 *
 * El mismo diseño se re-dibuja en canvas para el PNG de producción (ver name-editor).
 */

export const TILE_BORDER_COLORS = ["#7C6AAD", "#5DD9D1", "#E85B9F", "#F58A6F", "#FFD93D"] as const;

export function LetterTile({
  letter,
  index,
  imageUrl,
  size = 72,
}: {
  letter: string;
  index: number;
  imageUrl?: string | null;
  size?: number;
}) {
  const color = TILE_BORDER_COLORS[index % TILE_BORDER_COLORS.length];
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
