"use client";

/*
 * StudioFramePicker — Ola 3b (Lucy 2026-07-22).
 *
 * Selector del COLOR de la tarjeta/marco de las fotos. Antes: 6 swatches fijos de la
 * paleta de marca. Feedback Lucy: selector de color LIBRE. Diseño final:
 *
 *   - "Sin marco" (∅): la tarjeta queda del fondo de la plantilla (blanco clásico).
 *   - 6 chips de marca como ATAJOS (blanco/negro/pasteles) — un toque y listo.
 *   - Picker libre (input type="color" nativo): cualquier hex #RRGGBB. El chip del
 *     picker muestra el color personalizado activo (o un gradiente si no hay).
 *
 * El valor viaja igual que antes: canvasData.borderColor (hex) → cotización y render
 * de producción (que ya dibuja por hex). Con color elegido y producto con frameOptions,
 * la tarjeta se imprime ENTERA del color y la foto va inserta (full-bleed).
 *
 * Componente controlado y puro (sin store) → testeable en jsdom.
 */

import { Check, Palette } from "lucide-react";
import { isValidFrameHex, type FrameColor } from "@/features/personalization/frame-palette";

type StudioFramePickerProps = {
  /** Chips de atajo (paleta de marca filtrada por frameOptions del producto). */
  colors: readonly FrameColor[];
  /** Hex activo (#RRGGBB) o null = sin marco. */
  value: string | null;
  onChange: (hex: string | null) => void;
  /**
   * Ola 4 (Lucy 2026-07-23) — false oculta el picker LIBRE: la Polaroid Instagram solo
   * admite fondo blanco/negro (los pasteles no aplican a su chrome). Default true.
   */
  allowCustom?: boolean;
};

/** Check legible sobre cualquier color: oscuro con halo sobre colores claros. */
function ActiveCheck({ dark }: { dark: boolean }) {
  return (
    <Check
      className="absolute inset-0 m-auto h-4 w-4"
      strokeWidth={3}
      style={{
        color: dark ? "#3D2E5C" : "#FFFFFF",
        filter: "drop-shadow(0 0 2px rgba(0,0,0,0.35))",
      }}
      aria-hidden
    />
  );
}

const LIGHT_HEXES = new Set(["#FFFFFF", "#FFD93D"]);

export function StudioFramePicker({
  colors,
  value,
  onChange,
  allowCustom = true,
}: StudioFramePickerProps) {
  const normalized = value?.toUpperCase() ?? null;
  const isCustom =
    allowCustom && normalized !== null && !colors.some((c) => c.hex.toUpperCase() === normalized);
  // El input type="color" exige #rrggbb (minúsculas); default rosa de marca.
  const inputValue = isValidFrameHex(normalized) ? normalized.toLowerCase() : "#e85b9f";

  return (
    <div>
      <div role="radiogroup" aria-label="Color del marco" className="flex flex-wrap gap-2">
        {/* Sin marco */}
        <button
          type="button"
          role="radio"
          aria-checked={normalized === null}
          aria-label="Sin marco"
          title="Sin marco"
          onClick={() => onChange(null)}
          className={[
            "focus:ring-brand-turquoise relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white transition-all focus:ring-2 focus:outline-none",
            normalized === null
              ? "ring-brand-turquoise shadow-md ring-2 ring-offset-2"
              : "ring-brand-purple/20 hover:ring-brand-purple/50 ring-1",
          ].join(" ")}
        >
          <span className="text-brand-muted text-lg leading-none" aria-hidden>
            ∅
          </span>
        </button>

        {/* Atajos de marca */}
        {colors.map((c) => {
          const active = normalized === c.hex.toUpperCase();
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Marco ${c.label.toLowerCase()}`}
              title={c.label}
              onClick={() => onChange(c.hex)}
              className={[
                "focus:ring-brand-turquoise relative h-10 w-10 cursor-pointer rounded-full transition-all focus:ring-2 focus:outline-none",
                active
                  ? "ring-brand-turquoise shadow-md ring-2 ring-offset-2"
                  : "ring-brand-purple/20 hover:ring-brand-purple/50 ring-1",
              ].join(" ")}
              style={{ backgroundColor: c.hex }}
            >
              {active && <ActiveCheck dark={LIGHT_HEXES.has(c.hex.toUpperCase())} />}
            </button>
          );
        })}

        {/* Picker LIBRE — el input nativo ocupa todo el chip (invisible pero clicable);
            el chip muestra el color personalizado o un gradiente "cualquier color".
            Ola 4 — se oculta cuando la plantilla no admite color libre (Instagram:
            fondo solo blanco/negro). */}
        {allowCustom && (
          <label
            role="radio"
            aria-checked={isCustom}
            aria-label="Elegir otro color"
            title="Elegir otro color"
            className={[
              "focus-within:ring-brand-turquoise relative h-10 w-10 cursor-pointer overflow-hidden rounded-full transition-all focus-within:ring-2",
              isCustom
                ? "ring-brand-turquoise shadow-md ring-2 ring-offset-2"
                : "ring-brand-purple/20 hover:ring-brand-purple/50 ring-1",
            ].join(" ")}
            style={{
              background: isCustom
                ? (normalized ?? undefined)
                : "conic-gradient(#E85B9F, #FFD93D, #5DD9D1, #7C6AAD, #E85B9F)",
            }}
          >
            <input
              type="color"
              value={inputValue}
              aria-label="Elegir otro color de marco"
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            {isCustom ? (
              <ActiveCheck dark={LIGHT_HEXES.has(normalized ?? "")} />
            ) : (
              <Palette
                className="absolute inset-0 m-auto h-4 w-4 text-white"
                style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.45))" }}
                aria-hidden
              />
            )}
          </label>
        )}
      </div>
      {isCustom && normalized && (
        <p className="text-brand-muted mt-1.5 text-[11px] font-medium tabular-nums">
          Color personalizado {normalized}
        </p>
      )}
    </div>
  );
}
