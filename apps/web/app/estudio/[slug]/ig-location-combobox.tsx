"use client";

/*
 * IgLocationCombobox — combobox de UBICACIÓN con búsqueda de la Polaroid
 * Instagram (Fase 2 · 2.7b, reemplaza el datalist nativo; extraído de
 * studio-ig-post-fields.tsx en QA ronda 2 para reutilizarlo en la edición
 * INDIVIDUAL por slot — studio-ig-slot-fields.tsx).
 *
 * Filtra las sugerencias "Ciudad, País" por ciudad Y país (insensible a
 * tildes), con teclado accesible (flechas mueven la opción activa vía
 * aria-activedescendant, Enter elige, Escape cierra) y texto libre — sin
 * coincidencias la ubicación igual se imprime tal cual (no es validación).
 *
 * El commit es por tecla (mismo patrón del bloque: sin draft local, el store
 * hace undo + auto-save); elegir una sugerencia la escribe completa.
 */

import { useEffect, useState } from "react";
import { filterIgLocationSuggestions } from "./lib/ig-post-fields";
import { useStudioTexts } from "./studio-texts-provider";

/** Clase de input compartida por los controles asistidos de los campos IG. */
export const IG_INPUT_CLASS =
  "border-brand-purple/15 text-brand-purple-dark focus:border-brand-turquoise focus:ring-brand-turquoise/30 w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-2 focus:outline-none";

export function IgLocationCombobox({
  inputId,
  value,
  placeholder,
  onCommit,
}: {
  inputId: string;
  value: string;
  placeholder?: string;
  onCommit: (text: string) => void;
}) {
  const texts = useStudioTexts();
  const listboxId = `${inputId}-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const matches = filterIgLocationSuggestions(value);
  // Texto idéntico a una sugerencia (recién elegida): no reabrir el dropdown.
  const exactMatch = matches.length === 1 && matches[0] === value;
  const showList = open && !exactMatch && matches.length > 0;

  // La opción activa por teclado puede quedar fuera del área visible.
  useEffect(() => {
    if (!showList || activeIdx < 0) return;
    const el = document.getElementById(`${listboxId}-opt-${activeIdx}`);
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [activeIdx, showList, listboxId]);

  const select = (suggestion: string) => {
    onCommit(suggestion);
    setOpen(false);
    setActiveIdx(-1);
  };

  return (
    <div className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined
        }
        value={value}
        maxLength={80}
        placeholder={placeholder}
        onChange={(e) => {
          onCommit(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActiveIdx(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!showList) {
              setOpen(true);
              setActiveIdx(0);
            } else {
              setActiveIdx((i) => Math.min(i + 1, matches.length - 1));
            }
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (showList) setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && showList && activeIdx >= 0) {
            const chosen = matches[activeIdx];
            if (chosen) {
              e.preventDefault();
              select(chosen);
            }
          } else if (e.key === "Escape" && showList) {
            e.preventDefault();
            setOpen(false);
            setActiveIdx(-1);
          }
        }}
        className={IG_INPUT_CLASS}
        autoComplete="off"
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={texts.texto.igCampoUbicacion}
          className="border-brand-purple/15 absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-white py-1 shadow-lg"
          // onMouseDown preventDefault: conserva el foco en el input — sin esto
          // el blur cerraría la lista ANTES del click en la opción.
          onMouseDown={(e) => e.preventDefault()}
        >
          {matches.map((s, i) => (
            <li
              key={s}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => select(s)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === activeIdx
                  ? "bg-brand-purple/10 text-brand-purple-dark font-semibold"
                  : "text-brand-purple-dark/80"
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
      <p className="text-brand-muted mt-1 text-xs">{texts.texto.igUbicacionHint}</p>
      {/* Texto libre: sin coincidencias la ubicación igual se imprime tal cual. */}
      {open && value.trim() !== "" && matches.length === 0 && (
        <p role="status" className="text-brand-muted mt-1 text-xs">
          {texts.texto.igUbicacionSinResultados}
        </p>
      )}
    </div>
  );
}
