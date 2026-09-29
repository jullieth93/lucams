"use client";

/*
 * StudioIgPostFields — Fase 1B (owner 2026-09) — diligenciamiento MASIVO de los
 * textos de la Polaroid Instagram, el equivalente al campo "Tu mensaje" de la
 * Polaroid Clásica (StudioMessageField) pero con UN CAMPO POR CAPA editable
 * (@usuario, ubicación, "me gusta", título, hashtags): la Clásica tiene una sola
 * capa editable y por eso le bastaba un campo; Instagram tiene 5 y hasta ahora
 * solo se podían editar foto por foto en el modal del slot.
 *
 * Espejo del patrón de "Tu mensaje", adaptado a N campos:
 *  - Cada campo escribe en TODOS los slots vía setTextOverrideAllSlots(layerId, …)
 *    POR TECLA (mismo patrón de commit del campo de mensaje: sin draft local —
 *    el store ya hace undo + auto-save debounced).
 *  - Valor mostrado: el texto COMPARTIDO por todas las unidades; si difieren
 *    (alguien editó una foto en el modal), el campo vuelve a "" con chip
 *    "Varía por foto" y al escribir se unifica.
 *  - Vacío → override null (no se imprime). user_name/location/caption/hashtags
 *    son REQUERIDOS para finalizar (el popover de «Vista previa» lista los
 *    faltantes); likes_count es decorativo/opcional.
 *  - La edición individual en el modal sigue intacta (y el botón «Aplicar a
 *    todas» por capa, complementario, no se retira).
 *
 * Se monta desde StudioMessageField (el sidebar ya lo renderiza cuando
 * allowText) → aparece SOLO con la plantilla Instagram (isInstagramTemplate),
 * nunca en las demás.
 */

import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { AtSign } from "lucide-react";
import { isInstagramTemplate } from "@/features/personalization/frame-palette";
import { IG_REQUIRED_TEXT_LAYER_IDS } from "@/features/personalization/instagram-template-spec";
import type { StudioStoreState } from "./lib/store";
import { useStudioTexts } from "./studio-texts-provider";
import type { StudioTexts } from "./studio-texts";

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
              <input
                id={inputId}
                type="text"
                value={f.value}
                maxLength={120}
                placeholder={f.varies ? texts.texto.igVariaPlaceholder : f.defaultText}
                onChange={(e) => {
                  const text = e.target.value;
                  // Vacío → sin override (no se imprime nada; los requeridos los
                  // cobra el popover de «Vista previa»). Texto → se imprime tal
                  // cual en TODAS las fotos del set (commit por tecla, mismo
                  // patrón de "Tu mensaje").
                  setTextOverrideAllSlots(f.id, text.trim() === "" ? null : { text });
                }}
                className="border-brand-purple/15 text-brand-purple-dark focus:border-brand-turquoise focus:ring-brand-turquoise/30 w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-2 focus:outline-none"
              />
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
