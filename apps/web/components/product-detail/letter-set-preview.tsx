/*
 * ADR-057 — "Esto recibes" ESTÁTICO para la ficha de Abecedario Completo / Pack Vocales.
 * Muestra el set de fichas (biblioteca) para que el cliente vea el producto sin entrar al
 * Estudio. La personalización (color de marco) vive dentro del Estudio ("Personalizar").
 */

const BORDER_COLORS = ["#7C6AAD", "#5DD9D1", "#E85B9F", "#F58A6F", "#FFD93D", "#4A90D9"];

export function LetterSetPreview({
  letters,
  tiles,
  title,
  subtitle,
}: {
  letters: string[];
  tiles: Record<string, { imageUrl: string; label: string | null }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-brand-purple-dark font-display text-xl">{title}</h2>
      {subtitle && <p className="text-brand-muted mt-1 text-sm">{subtitle}</p>}
      <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-9">
        {letters.map((ch, i) => {
          const tile = tiles[ch];
          const color = BORDER_COLORS[i % BORDER_COLORS.length];
          return (
            <div key={ch} className="flex flex-col items-center">
              <div
                className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-white"
                style={{ border: `2px solid ${color}`, boxShadow: `0 3px 10px ${color}22` }}
              >
                {tile ? (
                  // eslint-disable-next-line @next/next/no-img-element — ficha del bucket público
                  <img src={tile.imageUrl} alt={`Letra ${ch}`} className="h-full w-full object-contain p-1" />
                ) : (
                  <span className="font-display text-lg font-extrabold" style={{ color }}>
                    {ch}
                  </span>
                )}
              </div>
              <span className="text-brand-muted mt-1 text-[11px] font-semibold">
                {tile?.label ? `${ch} de ${tile.label}` : ch}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
