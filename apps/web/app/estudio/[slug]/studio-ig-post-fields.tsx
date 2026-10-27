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
 *  - Ubicación: INPUT DE TEXTO simple (owner 2026-10-12 — se retiró el combobox
 *    con sugerencias de Fase 2 · 2.7b: la asistencia + el commit por tecla
 *    hacían MUY LENTA la plantilla). 2026-10-26 (bug "no deja poner espacios"):
 *    formato «Ciudad, País» — hasta 2 segmentos separados por coma, cada uno
 *    MULTI-PALABRA, con inicial mayúscula por palabra ("santa marta, colombia"
 *    → "Santa Marta, Colombia"); el commit transforma y el input lleva eco de
 *    display para que una pausa a mitad de escritura no resetee el draft
 *    (lib/ig-post-fields.ts + lib/use-debounced-commit.ts).
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
 *    con commit DEBOUNCED (owner 2026-10-12): estado local inmediato en el
 *    input + commit al store tras ~350ms sin teclear o al blur
 *    (IgDebouncedInput → lib/use-debounced-commit.ts). Antes el commit era POR
 *    TECLA y ponía la aplicación muy lenta (cada tecla reescribía los N slots
 *    + undo + auto-save).
 *  - Valor mostrado: el texto COMPARTIDO por todas las unidades; si difieren
 *    (alguien editó una foto en el modal), el campo vuelve a vacío con chip
 *    "Varía por foto" y al escribir se unifica.
 *  - Vacío → override null (no se imprime). Las 5 capas son REQUERIDAS para
 *    finalizar (el popover de «Vista previa» lista los faltantes).
 *  - La edición individual en el modal sigue intacta (y el botón «Aplicar a
 *    todas» por capa, complementario, no se retira). QA ronda 2 (2026-10-07):
 *    el editor de slot suma la sección «Campos de Instagram»
 *    (studio-ig-slot-fields.tsx) con los MISMOS 5 controles asistidos para el
 *    canvas individual.
 *  - 2026-10-19 — botón de re-aplicado EXPLÍCITO (texts.texto.igReaplicarCta):
 *    re-escribe los valores con contenido en TODOS los slots actuales aunque el
 *    texto no haya cambiado (el commit debounced sería no-op). Los slots de
 *    packs agregados después ya heredan el valor pack-level al crearse (store);
 *    este botón cubre el re-alineo manual.
 *
 * Se monta desde StudioMessageField (el sidebar ya lo renderiza cuando
 * allowText) → aparece SOLO con la plantilla Instagram (isInstagramTemplate),
 * nunca en las demás.
 */

import { useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { AtSign, Hash, X } from "lucide-react";
import { isInstagramTemplate } from "@/features/personalization/frame-palette";
import { IG_REQUIRED_TEXT_LAYER_IDS } from "@/features/personalization/instagram-template-spec";
import {
  IG_CAPTION_MAX,
  IG_HASHTAGS_MAX,
  IG_LIKES_SUFFIX,
  IG_LOCATION_MAX_LENGTH,
  IG_USERNAME_MAX,
  igHashtagsFromStored,
  igHashtagsOverride,
  igLikesDisplay,
  igLikesOverride,
  igLocationFormatIsValid,
  igLocationOverride,
  igUsernameDisplay,
  igUsernameOverride,
  sanitizeIgHashtag,
  sanitizeIgLikesInput,
  sanitizeIgLocationInput,
  sanitizeIgUsernameInput,
} from "./lib/ig-post-fields";
import { IG_INPUT_CLASS as INPUT_CLASS, IgDebouncedInput } from "./ig-debounced-input";
import type { StudioStoreState } from "./lib/store";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText, type StudioTexts } from "./studio-texts";

const REQUIRED = new Set<string>(IG_REQUIRED_TEXT_LAYER_IDS);

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
export function igFieldLabel(texts: StudioTexts, layerId: string, fallback: string): string {
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
  // 2026-10-19 — feedback aria-live del re-aplicado explícito (ver abajo).
  const [reapplied, setReapplied] = useState(false);

  const fields = fieldsJson ? (JSON.parse(fieldsJson) as IgField[]) : null;
  if (!fields) return null;

  // Vacío → sin override (no se imprime nada; los requeridos los cobra el
  // popover de «Vista previa»). Texto → se imprime tal cual en TODAS las fotos
  // del set. El commit llega DEBOUNCED desde IgDebouncedInput (no por tecla).
  const commitText = (layerId: string, text: string | null) =>
    setTextOverrideAllSlots(layerId, text === null || text.trim() === "" ? null : { text });

  // 2026-10-19 — re-aplicado EXPLÍCITO de los datos masivos a todos los slots
  // actuales (bug: al agregar un pack DESPUÉS de llenar los campos, los slots
  // nuevos nacían sin los textos y re-commit del MISMO texto era no-op del
  // debounce, así que no había forma de alcanzarlos). Los slots nuevos ya
  // heredan el valor pack-level al crearse (store.setPhotoSlotsPerUnit /
  // setUnitCount); este botón queda como vía explícita de re-aplicar a mano
  // (p.ej. tras editar una foto individual y querer unificar de nuevo).
  // `f.value` ya viene en formato GUARDADO (con "@", con " me gusta", hashtags
  // con "#") → se re-aplica tal cual, sin re-transformar. Las capas que "varían
  // por foto" sin valor pack-level no tienen nada que re-aplicar.
  const reappliableFields = fields.filter((f) => !f.varies && f.value.trim() !== "");
  const handleReapplyAll = () => {
    for (const f of reappliableFields) setTextOverrideAllSlots(f.id, { text: f.value });
    setReapplied(true);
  };

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
              <IgDebouncedInput
                inputId={inputId}
                value={display}
                maxLength={IG_USERNAME_MAX}
                placeholder={variesPlaceholder ?? igUsernameDisplay(f.defaultText)}
                sanitize={sanitizeIgUsernameInput}
                onCommit={(draft) => commitText(f.id, igUsernameOverride(draft))}
                className={`${INPUT_CLASS} pl-7`}
                autoCapitalize="none"
              />
            </div>
            <p className="text-brand-muted mt-1 text-xs">{texts.texto.igUsuarioHint}</p>
          </>
        );
      }

      case "location":
        return (
          <>
            <IgDebouncedInput
              inputId={inputId}
              value={f.varies ? "" : f.value}
              maxLength={IG_LOCATION_MAX_LENGTH}
              placeholder={variesPlaceholder ?? f.defaultText}
              sanitize={sanitizeIgLocationInput}
              onCommit={(draft) => commitText(f.id, igLocationOverride(draft))}
              // El commit TRANSFORMA (capitaliza + normaliza la coma): sin el
              // eco en formato display el draft se reseteaba a media escritura
              // y se comía los espacios (2026-10-26).
              commitEcho={(committed) => igLocationOverride(committed) ?? ""}
              // 2026-10-27 (owner) — aviso inline del formato «Ciudad, País»
              // (orientativo: nunca bloquea guardar ni finalizar; vacío = OK).
              warningFor={(d) =>
                igLocationFormatIsValid(d) ? null : texts.texto.igUbicacionFormato
              }
            />
            <p className="text-brand-muted mt-1 text-xs">{texts.texto.igUbicacionHint}</p>
          </>
        );

      case "likes_count": {
        const display = f.varies ? "" : igLikesDisplay(f.value);
        return (
          <div className="flex items-center gap-2">
            <IgDebouncedInput
              inputId={inputId}
              value={display}
              inputMode="numeric"
              placeholder={variesPlaceholder ?? igLikesDisplay(f.defaultText)}
              sanitize={sanitizeIgLikesInput}
              onCommit={(draft) => commitText(f.id, igLikesOverride(draft))}
              describedBy={`${inputId}-suffix`}
              // El commit formatea los miles ("1234" → display "1.234"): sin el
              // eco el draft se reseteaba a media escritura (2026-10-26).
              commitEcho={(committed) => igLikesDisplay(igLikesOverride(committed) ?? "")}
            />
            {/* Sufijo FIJO fuera del valor editable: siempre se imprime. */}
            <span id={`${inputId}-suffix`} className="text-brand-purple-dark shrink-0 text-sm">
              {IG_LIKES_SUFFIX}
            </span>
          </div>
        );
      }

      case "caption":
        return (
          <IgDebouncedInput
            inputId={inputId}
            value={f.varies ? "" : f.value}
            maxLength={IG_CAPTION_MAX}
            placeholder={variesPlaceholder ?? texts.texto.igTituloPlaceholder}
            sanitize={(raw) => raw.slice(0, IG_CAPTION_MAX)}
            onCommit={(draft) => commitText(f.id, draft)}
            describedBy={`${inputId}-count`}
            footer={(draft) => (
              <p
                id={`${inputId}-count`}
                className={`mt-1 text-right text-xs tabular-nums ${
                  draft.length >= IG_CAPTION_MAX ? "font-semibold text-red-600" : "text-brand-muted"
                }`}
              >
                {draft.length}/{IG_CAPTION_MAX}
              </p>
            )}
          />
        );

      case "hashtags":
        return (
          <IgHashtagsEditor
            inputId={inputId}
            tags={f.varies ? [] : igHashtagsFromStored(f.value)}
            placeholder={variesPlaceholder ?? texts.texto.igHashtagsPlaceholder}
            onCommit={(tags) => commitText(f.id, igHashtagsOverride(tags))}
          />
        );

      default:
        return (
          <IgDebouncedInput
            inputId={inputId}
            value={f.varies ? "" : f.value}
            maxLength={120}
            placeholder={variesPlaceholder ?? f.defaultText}
            onCommit={(draft) => commitText(f.id, draft)}
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
          const label = igFieldLabel(texts, f.id, f.defaultText);
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
      {/* 2026-10-19 — re-aplicado explícito a TODOS los slots actuales (incluidos
          los de packs agregados después): el commit debounced del input es no-op
          cuando el texto no cambió, así que sin este botón no había forma de
          re-alcanzar slots que quedaran atrás. */}
      {reappliableFields.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={handleReapplyAll}
            className="border-brand-purple/30 text-brand-purple-dark hover:border-brand-purple/60 hover:bg-brand-purple/5 focus-visible:ring-brand-turquoise inline-flex items-center gap-1.5 rounded-full border-2 bg-white px-3.5 py-2 text-xs font-bold transition-all focus-visible:ring-2 focus-visible:outline-none active:scale-95"
          >
            {texts.texto.igReaplicarCta}
          </button>
          <span aria-live="polite" role="status" className="sr-only">
            {reapplied ? texts.texto.igReaplicarFeedback : ""}
          </span>
        </div>
      )}
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
 * Editor de hashtags por CHIPS (no texto libre): agregar con Enter/coma/espacio,
 * quitar con la × de cada chip, máximo IG_HASHTAGS_MAX tags con aviso claro al
 * llegar al tope. Cada tag se sanitiza (sin "#" ni espacios dentro) y el override
 * se guarda como "#tag1 #tag2" (se imprime tal cual).
 *
 * Compartido: lo usa el bloque MASIVO del sidebar (acá arriba) y la edición
 * INDIVIDUAL por slot (studio-ig-slot-fields.tsx) — por eso recibe los tags ya
 * parseados y un placeholder resuelto, no el IgField pack-level.
 */
export function IgHashtagsEditor({
  inputId,
  tags,
  placeholder,
  onCommit,
}: {
  inputId: string;
  /** Tags actuales (sin "#"), ya parseados del texto guardado. */
  tags: string[];
  placeholder?: string;
  onCommit: (tags: string[]) => void;
}) {
  const texts = useStudioTexts();
  const [draft, setDraft] = useState("");
  const [maxReached, setMaxReached] = useState(false);

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
        <ul
          className="mb-2 flex flex-wrap gap-1.5"
          aria-label={igFieldLabel(texts, "hashtags", "")}
        >
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
        placeholder={placeholder ?? texts.texto.igHashtagsPlaceholder}
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
