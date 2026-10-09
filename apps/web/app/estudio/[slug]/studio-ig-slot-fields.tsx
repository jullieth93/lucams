"use client";

/*
 * StudioIgSlotFields — QA ronda 2 (owner 2026-10-07, F3): los 5 campos de la
 * Polaroid Instagram (@usuario, Ubicación, «Me gusta», Título, Hashtags)
 * también en la edición INDIVIDUAL por canvas.
 *
 * Hasta acá esos campos solo existían en el panel GLOBAL (pack-level,
 * StudioIgPostFields — escriben en TODAS las fotos vía
 * setTextOverrideAllSlots). Esta sección vive en la pestaña Texto del editor
 * unificado por slot (StudioSlotEditModal) y escribe el override de ESE
 * canvas únicamente (onApply → setSlotTextOverride del store; no toca los
 * demás slots ni el valor pack-level vigente).
 *
 *  - Mismos controles asistidos del bloque pack-level (mismos helpers puros
 *    de lib/ig-post-fields y los componentes compartidos IgLocationCombobox /
 *    IgHashtagsEditor) y mismas etiquetas amigables (igCampo* del CMS) en vez
 *    de los ids de capa crudos.
 *  - Valor mostrado: el override del slot si existe; si no, el valor
 *    pack-level vigente (packTextValues — el último aplicado masivamente);
 *    si tampoco hay, vacío con el default de la capa como placeholder.
 *  - Vacío → override null: el campo vuelve a mostrar el valor pack-level
 *    (si lo hay) y el guard de requeridos de «Ver diseño» cobra el faltante.
 *
 * Datos del store: el modal se renderiza desde studio-canvas-grid (archivo
 * congelado) y no recibe el store por props, así que se lee el store ACTIVO
 * registrado por createStudioStore (lib/active-studio-store.ts). En tests se
 * inyecta por la prop `store`. Sin store (o plantilla no-IG) no se renderiza.
 */

import { useStore } from "zustand";
import { AtSign } from "lucide-react";
import { isInstagramTemplate } from "@/features/personalization/frame-palette";
import { IG_REQUIRED_TEXT_LAYER_IDS } from "@/features/personalization/instagram-template-spec";
import {
  IG_CAPTION_MAX,
  IG_LIKES_SUFFIX,
  IG_USERNAME_MAX,
  igHashtagsFromStored,
  igHashtagsOverride,
  igLikesDisplay,
  igLikesOverride,
  igUsernameDisplay,
  igUsernameOverride,
  sanitizeIgLikesInput,
  sanitizeIgUsernameInput,
} from "./lib/ig-post-fields";
import { getActiveStudioStore } from "./lib/active-studio-store";
import type { StudioStore } from "./lib/store";
import { IG_INPUT_CLASS as INPUT_CLASS, IgLocationCombobox } from "./ig-location-combobox";
import { IgHashtagsEditor, igFieldLabel } from "./studio-ig-post-fields";
import { useStudioTexts } from "./studio-texts-provider";
import type { TextOverride } from "./types";

const REQUIRED = new Set<string>(IG_REQUIRED_TEXT_LAYER_IDS);

type StudioIgSlotFieldsProps = {
  slotIndex: number | null;
  /** Overrides de texto del slot vigente (del canvasData del store). */
  currentOverrides: Record<string, TextOverride> | undefined;
  /** Commit del override INDIVIDUAL del slot (null = limpiar la capa). */
  onApply: (layerId: string, override: TextOverride | null | undefined) => void;
  /** Inyección para tests; en producción se usa el store activo registrado. */
  store?: StudioStore;
};

type IgSlotLayer = { id: string; text: string };

export function StudioIgSlotFields(props: StudioIgSlotFieldsProps) {
  const store = props.store ?? getActiveStudioStore();
  if (!store || props.slotIndex === null) return null;
  return <StudioIgSlotFieldsInner {...props} slotIndex={props.slotIndex} store={store} />;
}

function StudioIgSlotFieldsInner({
  slotIndex,
  currentOverrides,
  onApply,
  store,
}: StudioIgSlotFieldsProps & { slotIndex: number; store: StudioStore }) {
  const texts = useStudioTexts();
  // UN solo selector con JSON estable (mismo patrón atómico del bloque
  // pack-level): capas de texto editables de la plantilla + valores pack-level.
  const dataJson = useStore(store, (s) => {
    const cd = s.canvasData;
    if (!cd) return null;
    const layers = cd.unitTemplate?.layers ?? [];
    if (!isInstagramTemplate(layers)) return null;
    const editable = layers.filter(
      (l) => l.type === "text" && (l as { editable?: boolean }).editable === true,
    ) as IgSlotLayer[];
    if (editable.length === 0) return null;
    return JSON.stringify({
      layers: editable.map((l) => ({ id: l.id, text: l.text })),
      pack: s.packTextValues,
    });
  });

  const data = dataJson
    ? (JSON.parse(dataJson) as { layers: IgSlotLayer[]; pack: Record<string, string> })
    : null;
  if (!data) return null;

  // Vacío → override null (la capa queda sin texto propio: se imprime el valor
  // pack-level si lo hay, o nada — los requeridos los cobra el popover de «Ver
  // diseño»). Commit por tecla, mismo patrón del bloque pack-level (el store
  // ya hace undo + auto-save debounced).
  const commitText = (layerId: string, text: string | null) =>
    onApply(layerId, text === null || text.trim() === "" ? null : { text });

  /** Valor del campo: override del slot → valor pack-level vigente → vacío. */
  const fieldValue = (layerId: string): string => {
    const stored = currentOverrides?.[layerId]?.text;
    if (typeof stored === "string") return stored;
    return data.pack[layerId] ?? "";
  };

  const renderControl = (layer: IgSlotLayer) => {
    const inputId = `studio-ig-slot-${slotIndex}-field-${layer.id}`;
    const value = fieldValue(layer.id);

    switch (layer.id) {
      case "user_name":
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
                value={igUsernameDisplay(value)}
                maxLength={IG_USERNAME_MAX}
                placeholder={igUsernameDisplay(layer.text)}
                onChange={(e) =>
                  commitText(layer.id, igUsernameOverride(sanitizeIgUsernameInput(e.target.value)))
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

      case "location":
        return (
          <IgLocationCombobox
            inputId={inputId}
            value={value}
            placeholder={layer.text}
            onCommit={(text) => commitText(layer.id, text)}
          />
        );

      case "likes_count":
        return (
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="text"
              inputMode="numeric"
              value={igLikesDisplay(value)}
              placeholder={igLikesDisplay(layer.text)}
              onChange={(e) =>
                commitText(layer.id, igLikesOverride(sanitizeIgLikesInput(e.target.value)))
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

      case "caption": {
        const length = value.length;
        return (
          <>
            <input
              id={inputId}
              type="text"
              value={value}
              maxLength={IG_CAPTION_MAX}
              placeholder={texts.texto.igTituloPlaceholder}
              onChange={(e) => commitText(layer.id, e.target.value.slice(0, IG_CAPTION_MAX))}
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
            inputId={inputId}
            tags={igHashtagsFromStored(value)}
            onCommit={(tags) => commitText(layer.id, igHashtagsOverride(tags))}
          />
        );

      default:
        return (
          <input
            id={inputId}
            type="text"
            value={value}
            maxLength={120}
            placeholder={layer.text}
            onChange={(e) => commitText(layer.id, e.target.value)}
            className={INPUT_CLASS}
          />
        );
    }
  };

  return (
    <section
      aria-labelledby={`ig-slot-campos-titulo-${slotIndex}`}
      className="border-brand-purple/10 border-b pb-5"
    >
      <p
        id={`ig-slot-campos-titulo-${slotIndex}`}
        className="text-brand-purple-dark mb-1 flex items-center gap-2 text-sm font-semibold"
      >
        <AtSign className="text-brand-purple h-4 w-4" aria-hidden />
        {texts.texto.igSlotCamposTitulo}
      </p>
      <p className="text-brand-muted mb-3 text-xs leading-snug">{texts.texto.igSlotCamposHint}</p>
      <div className="space-y-3">
        {data.layers.map((layer) => {
          const inputId = `studio-ig-slot-${slotIndex}-field-${layer.id}`;
          return (
            <div key={layer.id}>
              <label
                htmlFor={inputId}
                className="text-brand-purple-dark mb-1 flex items-center gap-2 text-xs font-semibold"
              >
                {igFieldLabel(texts, layer.id, layer.text)}
                <span className="text-brand-muted font-normal">
                  {REQUIRED.has(layer.id)
                    ? texts.texto.igCampoRequerido
                    : texts.texto.igCampoOpcional}
                </span>
              </label>
              {renderControl(layer)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
