"use client";

/*
 * StudioIgPostFields — Fase 1B (owner 2026-09), REDISEÑO ASISTIDO (owner 2026-10-05).
 *
 * Diligenciamiento MASIVO de los textos de la Polaroid Instagram, el equivalente
 * al campo "Tu mensaje" de la Polaroid Clásica (StudioMessageField) pero con UN
 * CONTROL ASISTIDO POR CAPA editable: la Clásica tiene una sola capa y le bastaba
 * un input; Instagram tiene 5 y cada una imita su contraparte del post real:
 *
 *  - @usuario: la "@" es un prefijo FIJO fuera del valor editable; el input se
 *    sanitiza en vivo (sin espacios; solo letras, números, punto y guion bajo —
 *    caracteres válidos de usuario IG). El override se guarda CON "@" (se imprime
 *    tal cual).
 *  - Ubicación: combobox con búsqueda (Fase 2 · 2.7b — antes datalist nativo):
 *    filtra la lista curada "Ciudad, País" por ciudad Y país, navegable con
 *    teclado (flechas/Enter/Escape, aria-activedescendant) y sigue admitiendo
 *    ubicación libre — es asistencia de escritura, no validación.
 *  - «Me gusta»: OBLIGATORIO desde el rediseño (antes decorativo). El input es
 *    solo numérico y se muestra con separador de miles es-CO; la palabra
 *    "me gusta" es un sufijo FIJO fuera del valor editable (el override guarda
 *    "1.234 me gusta" y se imprime tal cual).
 *  - Título: contador de caracteres con límite (IG_CAPTION_MAX — el footer de la
 *    plantilla es una línea a 16px; más texto se saldría de la tarjeta impresa) y
 *    placeholder con ejemplo.
 *  - Hashtags: NO texto libre — UI de chips para agregar/quitar tags (máximo 3),
 *    "#" siempre prefijada y sin espacios dentro de cada tag, con aviso claro al
 *    llegar al tope.
 *
 * Espejo del patrón de "Tu mensaje", adaptado a N campos:
 *  - Cada campo escribe en TODOS los slots vía setTextOverrideAllSlots(layerId, …)
 *    POR TECLA/acción (mismo patrón de commit: sin draft local — el store ya hace
 *    undo + auto-save debounced).
 *  - Valor mostrado: el texto COMPARTIDO por todas las unidades; si difieren
 *    (alguien editó una foto en el modal), el campo vuelve a vacío con chip
 *    "Varía por foto" y al escribir se unifica.
 *  - Vacío → override null (no se imprime). Las 5 capas son REQUERIDAS para
 *    finalizar (el popover de «Vista previa» lista los faltantes).
 *  - La edición individual en el modal sigue intacta (y el botón «Aplicar a
 *    todas» por capa, complementario, no se retira).
 *
 * Se monta desde StudioMessageField (el sidebar ya lo renderiza cuando
 * allowText) → aparece SOLO con la plantilla Instagram (isInstagramTemplate),
 * nunca en las demás.
 */

import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { AtSign, Hash, X } from "lucide-react";
import { isInstagramTemplate } from "@/features/personalization/frame-palette";
import { IG_REQUIRED_TEXT_LAYER_IDS } from "@/features/personalization/instagram-template-spec";
import {
  IG_CAPTION_MAX,
  IG_HASHTAGS_MAX,
  IG_LIKES_SUFFIX,
  IG_USERNAME_MAX,
  filterIgLocationSuggestions,
  igHashtagsFromStored,
  igHashtagsOverride,
  igLikesDisplay,
  igLikesOverride,
  igUsernameDisplay,
  igUsernameOverride,
  sanitizeIgHashtag,
  sanitizeIgLikesInput,
  sanitizeIgUsernameInput,
} from "./lib/ig-post-fields";
import type { StudioStoreState } from "./lib/store";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText, type StudioTexts } from "./studio-texts";

const REQUIRED = new Set<string>(IG_REQUIRED_TEXT_LAYER_IDS);

const INPUT_CLASS =
  "border-brand-purple/15 text-brand-purple-dark focus:border-brand-turquoise focus:ring-brand-turquoise/30 w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-2 focus:outline-none";

type IgField = {
  id: string;
  /** Texto base de la plantilla (placeholder gris cuando el campo está vacío). */
  defaultText: string;
  /** Valor compartido por TODAS las unidades ("" si ninguna lo tiene o si varía). */
  value: string;
  /** true = las unidades difieren en esta capa (edición individual posterior). */
  varies: boolean;
};

/** Etiqueta visible de cada capa IG (textos CMS). Fallback: el default de la capa. */
function fieldLabel(texts: StudioTexts, layerId: string, fallback: string): string {
  switch (layerId) {
    case "user_name":
      return texts.texto.igCampoUsuario;
    case "location":
      return texts.texto.igCampoUbicacion;
    case "likes_count":
      return texts.texto.igCampoLikes;
    case "caption":
      return texts.texto.igCampoTitulo;
    case "hashtags":
      return texts.texto.igCampoHashtags;
    default:
      return fallback;
  }
}

export function StudioIgPostFields({ store }: { store: StoreApi<StudioStoreState> }) {
  // UN solo selector que devuelve JSON estable (patrón atómico del message-field):
  // capas editables de la plantilla + valor compartido/estado "varía" por capa.
  const fieldsJson = useStore(store, (s) => {
    const cd = s.canvasData;
    if (!cd) return null;
    const layers = cd.unitTemplate?.layers ?? [];
    if (!isInstagramTemplate(layers)) return null;
    const editable = layers.filter(
      (l) => l.type === "text" && (l as { editable?: boolean }).editable === true,
    ) as { id: string; text: string }[];
    if (editable.length === 0) return null;
    const fields: IgField[] = editable.map((l) => {
      // QA 1.2 (2026-10-07) — si la capa tiene un valor PACK-LEVEL vigente (el
      // último aplicado masivamente), ese es el valor del campo y NO hay chip:
      // las ediciones individuales posteriores pisan solo su slot y el campo
      // masivo conserva el valor vigente (antes el valor se derivaba de los
      // slots: editar/limpiar UNA foto hacía "saltar" el campo o marcaba
      // "Varía por foto" aunque el masivo seguía aplicando). El chip se
      // reserva para cuando NUNCA hubo masivo y las unidades difieren.
      const pack = s.packTextValues[l.id];
      if (typeof pack === "string") {
        return { id: l.id, defaultText: l.text, value: pack, varies: false };
      }
      const seen = new Set<string>();
      for (const slot of cd.slots) {
        const t = slot.textOverrides?.[l.id]?.text;
        if (typeof t === "string" && t.trim() !== "") seen.add(t);
      }
      return {
        id: l.id,
        defaultText: l.text,
        value: seen.size === 1 ? [...seen][0]! : "",
        varies: seen.size > 1,
      };
    });
    return JSON.stringify(fields);
  });
  const setTextOverrideAllSlots = useStore(store, (s) => s.setTextOverrideAllSlots);
  const texts = useStudioTexts();

  const fields = fieldsJson ? (JSON.parse(fieldsJson) as IgField[]) : null;
  if (!fields) return null;

  // Vacío → sin override (no se imprime nada; los requeridos los cobra el
  // popover de «Vista previa»). Texto → se imprime tal cual en TODAS las fotos
  // del set (commit por tecla, mismo patrón de "Tu mensaje").
  const commitText = (layerId: string, text: string | null) =>
    setTextOverrideAllSlots(layerId, text === null || text.trim() === "" ? null : { text });

  const renderControl = (f: IgField) => {
    const inputId = `studio-ig-field-${f.id}`;
    const variesPlaceholder = f.varies ? texts.texto.igVariaPlaceholder : undefined;

    switch (f.id) {
      case "user_name": {
        const display = f.varies ? "" : igUsernameDisplay(f.value);
        return (
          <>
            <div className="relative">
              <span
                aria-hidden
                className="text-brand-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold"
              >
                @
              </span>
              <input
                id={inputId}
                type="text"
                value={display}
                maxLength={IG_USERNAME_MAX}
                placeholder={variesPlaceholder ?? igUsernameDisplay(f.defaultText)}
                onChange={(e) =>
                  commitText(f.id, igUsernameOverride(sanitizeIgUsernameInput(e.target.value)))
                }
                className={`${INPUT_CLASS} pl-7`}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <p className="text-brand-muted mt-1 text-xs">{texts.texto.igUsuarioHint}</p>
          </>
        );
      }

      case "location":
        return (
          <IgLocationCombobox
            inputId={inputId}
            value={f.value}
            placeholder={variesPlaceholder ?? f.defaultText}
            onCommit={(text) => commitText(f.id, text)}
          />
        );

      case "likes_count": {
        const display = f.varies ? "" : igLikesDisplay(f.value);
        return (
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="text"
              inputMode="numeric"
              value={display}
              placeholder={variesPlaceholder ?? igLikesDisplay(f.defaultText)}
              onChange={(e) =>
                commitText(f.id, igLikesOverride(sanitizeIgLikesInput(e.target.value)))
              }
              className={INPUT_CLASS}
              aria-describedby={`${inputId}-suffix`}
            />
            {/* Sufijo FIJO fuera del valor editable: siempre se imprime. */}
            <span id={`${inputId}-suffix`} className="text-brand-purple-dark shrink-0 text-sm">
              {IG_LIKES_SUFFIX}
            </span>
          </div>
        );
      }

      case "caption": {
        const length = f.value.length;
        return (
          <>
            <input
              id={inputId}
              type="text"
              value={f.value}
              maxLength={IG_CAPTION_MAX}
              placeholder={variesPlaceholder ?? texts.texto.igTituloPlaceholder}
              onChange={(e) => commitText(f.id, e.target.value.slice(0, IG_CAPTION_MAX))}
              className={INPUT_CLASS}
              aria-describedby={`${inputId}-count`}
            />
            <p
              id={`${inputId}-count`}
              className={`mt-1 text-right text-xs tabular-nums ${
                length >= IG_CAPTION_MAX ? "font-semibold text-red-600" : "text-brand-muted"
              }`}
            >
              {length}/{IG_CAPTION_MAX}
            </p>
          </>
        );
      }

      case "hashtags":
        return (
          <IgHashtagsEditor
            field={f}
            inputId={inputId}
            onCommit={(tags) => commitText(f.id, igHashtagsOverride(tags))}
          />
        );

      default:
        return (
          <input
            id={inputId}
            type="text"
            value={f.value}
            maxLength={120}
            placeholder={variesPlaceholder ?? f.defaultText}
            onChange={(e) => commitText(f.id, e.target.value)}
            className={INPUT_CLASS}
          />
        );
    }
  };

  return (
    <section aria-labelledby="sidebar-ig-datos" className="border-brand-purple/10 border-t pt-5">
      <p
        id="sidebar-ig-datos"
        className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-semibold"
      >
        <AtSign className="text-brand-purple h-4 w-4" aria-hidden />
        {texts.texto.igDatosTitulo}{" "}
        <span className="text-brand-muted text-xs font-normal">{texts.texto.igDatosSub}</span>
      </p>
      <div className="space-y-3">
        {fields.map((f) => {
          const required = REQUIRED.has(f.id);
          const inputId = `studio-ig-field-${f.id}`;
          const label = fieldLabel(texts, f.id, f.defaultText);
          return (
            <div key={f.id}>
              <label
                htmlFor={inputId}
                className="text-brand-purple-dark mb-1 flex items-center gap-2 text-xs font-semibold"
              >
                {label}
                <span className="text-brand-muted font-normal">
                  {required ? texts.texto.igCampoRequerido : texts.texto.igCampoOpcional}
                </span>
                {f.varies && (
                  <span className="bg-brand-turquoise/15 text-brand-purple-dark rounded-full px-2 py-0.5 text-[10px] font-bold">
                    {texts.texto.igVariaPorFoto}
                  </span>
                )}
              </label>
              {renderControl(f)}
            </div>
          );
        })}
      </div>
      {/* Mismo estilo de aviso pack-level que "Tu mensaje" (caja destacada, no el
          gris del hint): estos datos se imprimen igual en TODAS las fotos. */}
      <p
        role="note"
        className="bg-brand-yellow/15 border-brand-yellow/40 text-brand-purple-dark mt-3 rounded-md border px-3 py-2 text-xs leading-snug font-medium"
      >
        {texts.texto.igGlobalAviso}
      </p>
    </section>
  );
}

/**
 * Combobox de UBICACIÓN con búsqueda (Fase 2 · 2.7b, reemplaza el datalist
 * nativo): filtra las sugerencias "Ciudad, País" por ciudad Y país (insensible
 * a tildes), con teclado accesible (flechas mueven la opción activa vía
 * aria-activedescendant, Enter elige, Escape cierra) y texto libre — sin
 * coincidencias la ubicación igual se imprime tal cual (no es validación).
 *
 * El commit es por tecla (mismo patrón del bloque: sin draft local, el store
 * hace undo + auto-save); elegir una sugerencia la escribe completa.
 */
function IgLocationCombobox({
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
        className={INPUT_CLASS}
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

/**
 * Editor de hashtags por CHIPS (no texto libre): agregar con Enter/coma/espacio,
 * quitar con la × de cada chip, máximo IG_HASHTAGS_MAX tags con aviso claro al
 * llegar al tope. Cada tag se sanitiza (sin "#" ni espacios dentro) y el override
 * se guarda como "#tag1 #tag2" (se imprime tal cual).
 */
function IgHashtagsEditor({
  field,
  inputId,
  onCommit,
}: {
  field: IgField;
  inputId: string;
  onCommit: (tags: string[]) => void;
}) {
  const texts = useStudioTexts();
  const [draft, setDraft] = useState("");
  const [maxReached, setMaxReached] = useState(false);

  const tags = field.varies ? [] : igHashtagsFromStored(field.value);
  const full = tags.length >= IG_HASHTAGS_MAX;

  const addTag = (raw: string) => {
    const tag = sanitizeIgHashtag(raw);
    if (tag === "") {
      setDraft("");
      return;
    }
    if (full) {
      setMaxReached(true);
      return;
    }
    setMaxReached(false);
    setDraft("");
    if (!tags.includes(tag)) onCommit([...tags, tag]);
  };

  return (
    <div>
      {tags.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={fieldLabel(texts, "hashtags", "")}>
          {tags.map((tag) => (
            <li
              key={tag}
              className="bg-brand-turquoise/10 text-brand-purple-dark flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs font-semibold"
            >
              <Hash className="h-3 w-3" aria-hidden />
              {tag}
              <button
                type="button"
                onClick={() => {
                  setMaxReached(false);
                  onCommit(tags.filter((t) => t !== tag));
                }}
                aria-label={fillStudioText(texts.texto.igHashtagsQuitarAria, { tag })}
                className="text-brand-purple-dark/60 hover:text-brand-purple-dark focus:ring-brand-turquoise flex h-5 w-5 items-center justify-center rounded-full transition-colors focus:ring-2 focus:outline-none"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={inputId}
        type="text"
        value={draft}
        placeholder={
          field.varies ? texts.texto.igVariaPlaceholder : texts.texto.igHashtagsPlaceholder
        }
        aria-invalid={maxReached || undefined}
        aria-describedby={maxReached ? `${inputId}-max` : undefined}
        onChange={(e) => {
          const v = e.target.value;
          // Coma o espacio CIERRAN el tag (los hashtags no llevan espacios).
          if (/[\s,]/.test(v)) {
            addTag(v);
          } else {
            setDraft(v.replace(/#/g, ""));
            setMaxReached(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag(draft);
          } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
            onCommit(tags.slice(0, -1));
            setMaxReached(false);
          }
        }}
        onBlur={() => addTag(draft)}
        className={INPUT_CLASS}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
      />
      {maxReached && (
        <p id={`${inputId}-max`} role="alert" className="mt-1 text-xs font-semibold text-red-600">
          {texts.texto.igHashtagsMaxAviso}
        </p>
      )}
    </div>
  );
}
