"use client";

/*
 * ADR-057 (2026-07-12) — Controles de color COMPARTIDOS (Nombre + Set de letras): el picker
 * de tema (con barajar al re-clic) y la fila de swatches para pintar una ficha puntual.
 * Presentacionales puros; el estado vive en useLetterColors.
 */

import { NAME_TILE_THEMES, LETTER_SWATCHES, LETTER_SWATCH_LABELS } from "./letter-tile";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText, splitStudioText } from "./studio-texts";

/** Picker de tema de color. Re-clic al tema activo lo baraja (lo maneja applyTheme). */
export function ThemePicker({
  themeId,
  customized,
  onApply,
}: {
  themeId: string;
  /** true = hay overrides por ficha → ningún tema se marca "activo". */
  customized: boolean;
  onApply: (id: string) => void;
}) {
  const texts = useStudioTexts();
  return (
    <div>
      <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
        {texts.nombre.coloresTitulo}
        <span className="text-brand-muted ml-2 text-xs font-normal">
          {texts.nombre.coloresHint}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {NAME_TILE_THEMES.map((t) => {
          const active = t.id === themeId && !customized;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onApply(t.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full border-2 py-1.5 pr-3 pl-2 text-sm font-semibold transition ${
                active
                  ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                  : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
              }`}
            >
              <span className="flex gap-0.5" aria-hidden="true">
                {t.colors.slice(0, 3).map((c, i) => (
                  <span
                    key={i}
                    className="h-3.5 w-3.5 rounded-full ring-1 ring-black/5"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </span>
              {t.emoji} {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Fila de swatches para pintar la ficha seleccionada a gusto. */
export function SwatchRow({ letter, onPick }: { letter: string; onPick: (color: string) => void }) {
  const texts = useStudioTexts();
  // {letra} se interpola conservando el <span> display de la letra (roadmap B1).
  const titleParts = splitStudioText(texts.nombre.swatchTitulo, "letra");
  return (
    <div className="border-brand-purple/15 mt-4 rounded-xl border bg-white p-3">
      <p className="text-brand-purple-dark mb-2 text-center text-xs font-semibold">
        {titleParts ? (
          <>
            {titleParts[0]}
            <span className="font-display text-base">{letter}</span>
            {titleParts[1]}
          </>
        ) : (
          fillStudioText(texts.nombre.swatchTitulo, { letra: letter })
        )}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {LETTER_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            // #16 — aria-label con el nombre del color (no "este color" idéntico ×22) + área táctil
            // de 40px (antes 32px, bajo el mínimo recomendado) → menos toques al color vecino.
            aria-label={fillStudioText(texts.nombre.swatchAria, {
              color: LETTER_SWATCH_LABELS[c] ?? "este color",
            })}
            className="h-10 w-10 rounded-full ring-2 ring-black/5 transition hover:scale-110"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}
