"use client";

/*
 * CustomColorPicker — selector de color completo SIN dependencias (reemplaza al
 * <input type="color"> nativo: su diálogo en Android/Linux es una rejilla fija
 * de ~9-20 colores y solo macOS ofrece el picker completo del SO — paridad de
 * "cientos de colores" en TODAS las plataformas, táctil incluido).
 *
 * Punto de entrada = swatch circular con el conic-gradient de marca (idéntico
 * affordance al input nativo anterior). 2026-10-19 — el gradiente NO se pierde
 * al elegir un color: el hex elegido va en un disco interior sobre el anillo
 * arcoíris, así el trigger siempre comunica que el picker se puede re-abrir.
 * Al abrirse despliega INLINE un panel con:
 *   - área saturación/luminosidad (pointer events con pointer-capture: arrastre
 *     táctil y de mouse; + flechas de teclado, role="slider"),
 *   - slider de TONO nativo (<input type="range">: táctil y teclado gratis),
 *   - campo HEX con validación (acepta #rgb/#rrggbb, minúsculas o no).
 *
 * El panel es INLINE (sin portal ni popover) a propósito: dos de los usos viven
 * dentro de Radix Dialog con focus-trap (un popover portaled quedaría fuera del
 * scope de foco) y la toolbar del estudio usa overflow-x-auto en móvil (recortaría
 * un dropdown absoluto). En flujo basta con que el padre le dé sitio vía
 * `panelClassName` ("col-span-full" en grids, "w-full basis-full" en flex-wrap).
 *
 * El estado que sale por onChange es SIEMPRE HEX #RRGGBB en mayúsculas — el mismo
 * formato que persistían los presets y el input nativo (compatibilidad total con
 * diseños guardados y CMS). Los textos internos van fijos en español (el label
 * accesible del trigger sigue viniendo del CMS por la prop `label`).
 */

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, X } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { hexToHsl, hslToHex, isLightHex, normalizeHex, type Hsl } from "@/lib/color";

/** Gradiente arcoíris del swatch «Personalizado» (el mismo que usaban los inputs nativos). */
export const CUSTOM_COLOR_GRADIENT = "conic-gradient(#E85B9F, #FFD93D, #5DD9D1, #7C6AAD, #E85B9F)";

const clamp100 = (v: number) => Math.min(100, Math.max(0, v));

export type ColorPickerPanelProps = {
  /** HEX actual (válido — el wrapper garantiza fallback). */
  value: string;
  onChange: (hex: string) => void;
  onClose: () => void;
  /** aria-label del grupo (reusa el label CMS del trigger). */
  label: string;
  className?: string;
};

export function ColorPickerPanel({
  value,
  onChange,
  onClose,
  label,
  className,
}: ColorPickerPanelProps) {
  // HSL interno (el panel piensa en tono/saturación/luminosidad); se re-sincroniza
  // desde `value` solo cuando el hex externo NO coincide con el derivado del estado
  // interno — así el arrastre no sufre jitter por el redondeo HEX↔HSL. Patrón
  // "adjust state during render" (docs React): comparación con valor previo.
  const [hsl, setHsl] = useState<Hsl>(() => hexToHsl(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const normalized = normalizeHex(value);
    if (normalized && normalized !== hslToHex(hsl.h, hsl.s, hsl.l)) {
      setHsl(hexToHsl(normalized));
    }
  }

  const hex = hslToHex(hsl.h, hsl.s, hsl.l);
  // Borrador del campo HEX: se resincroniza con el color vivo salvo que lo que
  // está tecleando el usuario ya sea ese mismo color (no reescribir minúsculas
  // ni un borrador inválido a medio escribir).
  const [draft, setDraft] = useState(hex);
  const [prevHex, setPrevHex] = useState(hex);
  if (hex !== prevHex) {
    setPrevHex(hex);
    if (normalizeHex(draft) !== hex) setDraft(hex);
  }
  const draftInvalid = normalizeHex(draft) === null;

  const apply = (next: Hsl) => {
    setHsl(next);
    onChange(hslToHex(next.h, next.s, next.l));
  };

  const updateFromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    apply({
      ...hsl,
      s: clamp100(((e.clientX - rect.left) / rect.width) * 100),
      l: clamp100(100 - ((e.clientY - rect.top) / rect.height) * 100),
    });
  };

  const onAreaKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = 5;
    let next: Hsl | null = null;
    if (e.key === "ArrowLeft") next = { ...hsl, s: clamp100(hsl.s - step) };
    else if (e.key === "ArrowRight") next = { ...hsl, s: clamp100(hsl.s + step) };
    else if (e.key === "ArrowUp") next = { ...hsl, l: clamp100(hsl.l + step) };
    else if (e.key === "ArrowDown") next = { ...hsl, l: clamp100(hsl.l - step) };
    else if (e.key === "PageUp") next = { ...hsl, l: clamp100(hsl.l + 10) };
    else if (e.key === "PageDown") next = { ...hsl, l: clamp100(hsl.l - 10) };
    if (next) {
      e.preventDefault();
      apply(next);
    }
  };

  return (
    <div
      role="group"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className={cn(
        "ring-brand-purple/15 mt-2 w-full rounded-xl bg-white p-3 shadow-lg ring-1",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          aria-hidden
          className="h-6 w-6 shrink-0 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: hex }}
        />
        <span className="text-brand-purple-dark/75 font-mono text-xs">{hex}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar selector de color"
          className="focus:ring-brand-turquoise text-brand-muted hover:bg-brand-purple/10 ml-auto flex h-7 w-7 items-center justify-center rounded-md transition-colors focus:ring-2 focus:outline-none"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Área saturación (x) / luminosidad (y) sobre el tono actual. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Saturación y luminosidad"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsl.s)}
        aria-valuetext={`${hex} — saturación ${Math.round(hsl.s)}%, luminosidad ${Math.round(hsl.l)}%`}
        onPointerDown={(e) => {
          // jsdom no implementa pointer capture; en browser retiene el arrastre
          // aunque el dedo/puntero salga del área.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* noop en jsdom */
          }
          updateFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) updateFromPointer(e);
        }}
        onKeyDown={onAreaKeyDown}
        className="focus-visible:ring-brand-turquoise relative h-36 w-full cursor-crosshair touch-none rounded-lg ring-1 ring-black/10 select-none focus-visible:ring-2 focus-visible:outline-none"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${Math.round(hsl.h)}, 100%, 50%))`,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/20"
          style={{ left: `${hsl.s}%`, top: `${100 - hsl.l}%`, backgroundColor: hex }}
        />
      </div>

      {/* Tono — slider nativo: táctil, teclado y lectores de pantalla gratis. */}
      <div className="mt-3">
        <span className="text-brand-muted mb-1 block text-[11px] font-semibold">Tono</span>
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          value={Math.round(hsl.h)}
          aria-label="Tono del color"
          aria-valuetext={hex}
          onChange={(e) => apply({ ...hsl, h: Number(e.target.value) })}
          className={cn(
            "focus-visible:ring-brand-turquoise h-3.5 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2",
            "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black/15 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md",
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-black/15 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md",
          )}
          style={{
            background:
              "linear-gradient(to right, #FF0000 0%, #FFFF00 17%, #00FF00 33%, #00FFFF 50%, #0000FF 67%, #FF00FF 83%, #FF0000 100%)",
          }}
        />
      </div>

      {/* HEX con validación en vivo (acepta #rgb, #rrggbb, con o sin '#'). */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-brand-muted text-[11px] font-semibold">Hex</span>
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const normalized = normalizeHex(e.target.value);
            if (normalized) {
              setHsl(hexToHsl(normalized));
              onChange(normalized);
            }
          }}
          aria-label="Código de color hexadecimal"
          aria-invalid={draftInvalid || undefined}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          placeholder="#7C6AAD"
          className={cn(
            "border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 text-brand-purple-dark w-24 rounded-md border bg-white px-2 py-1 font-mono text-xs focus:ring-2 focus:outline-none",
            draftInvalid && "border-rose-400 ring-1 ring-rose-300",
          )}
        />
        {draftInvalid && (
          <span role="alert" className="text-[11px] text-rose-600">
            Hex inválido (ej. #E85B9F)
          </span>
        )}
      </div>
    </div>
  );
}

export type CustomColorPickerProps = {
  /** HEX personalizado actual; null = aún no hay color libre (swatch arcoíris). */
  value: string | null;
  onChange: (hex: string) => void;
  /** aria-label del trigger y del panel (texto CMS en el estudio). */
  label: string;
  disabled?: boolean;
  /** true = el valor vigente ES personalizado (anillo de selección + check). */
  active?: boolean;
  /** Tooltip de marca sobre el trigger (mismo patrón Hint del estudio). */
  hint?: string;
  /** Tamaño/forma del trigger — ej. "h-7 w-7" (default), "h-9 w-12 rounded-md". */
  className?: string;
  /** Colocación del panel inline: "col-span-full" en grids, "w-full basis-full" en flex-wrap. */
  panelClassName?: string;
  /** HEX con el que arranca el panel si aún no hay color personalizado. */
  fallbackHex?: string;
};

export function CustomColorPicker({
  value,
  onChange,
  label,
  disabled = false,
  active = false,
  hint,
  className,
  panelClassName,
  fallbackHex = "#7C6AAD",
}: CustomColorPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-label={label}
      aria-expanded={open}
      disabled={disabled}
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "focus:ring-brand-turquoise relative h-7 w-7 cursor-pointer rounded-full transition-all hover:scale-110 focus:ring-2 focus:outline-none",
        active
          ? "ring-brand-turquoise scale-110 ring-2 ring-offset-2"
          : "ring-brand-purple/15 hover:ring-brand-purple/40 ring-1",
        disabled && "cursor-not-allowed opacity-60 hover:scale-100",
        className,
      )}
      // 2026-10-19 — el trigger conserva SIEMPRE el gradiente multicolor como
      // affordance ("acá puedes elegir otro color"): antes pintaba el hex plano
      // (background: value) y al elegir un personalizado el arcoíris desaparecía
      // — el usuario ya no veía que podía re-abrir el picker. Con color elegido,
      // el hex va en un DISCO INTERIOR sobre el anillo arcoíris.
      style={{ background: CUSTOM_COLOR_GRADIENT }}
    >
      {value ? (
        <span
          aria-hidden
          className="absolute inset-[3px] shadow-inner ring-1 ring-black/10"
          style={{ backgroundColor: value, borderRadius: "inherit" }}
        />
      ) : null}
      {active && value ? (
        <Check
          aria-hidden
          strokeWidth={3}
          className="absolute inset-0 m-auto h-4 w-4"
          style={{
            color: isLightHex(value) ? "#3D2E5C" : "#FFFFFF",
            filter: "drop-shadow(0 0 2px rgba(0,0,0,0.35))",
          }}
        />
      ) : null}
    </button>
  );

  return (
    <>
      {hint ? (
        <Hint content={hint}>
          {/* Botón disabled no recibe hover/foco: el tooltip va en el wrapper
              (mismo patrón que ColorButton de studio-style-toolbar). */}
          {disabled ? (
            <span tabIndex={0} className="inline-flex">
              {trigger}
            </span>
          ) : (
            trigger
          )}
        </Hint>
      ) : (
        trigger
      )}
      {open && !disabled ? (
        <ColorPickerPanel
          value={normalizeHex(value ?? "") ?? fallbackHex}
          onChange={onChange}
          onClose={close}
          label={label}
          className={panelClassName}
        />
      ) : null}
    </>
  );
}
