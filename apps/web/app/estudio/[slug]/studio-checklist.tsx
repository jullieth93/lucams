"use client";

/*
 * StudioChecklist — 5.1 (2026-10-22, owner): checklist persistente «Tu diseño».
 *
 * Por qué existe: en móvil todo lo que no es el lienzo vive tras el FAB «Editar»
 * (fotos en lote, prediseñados, mensaje, datos de la publicación IG) y pasaba
 * desapercibido — el cliente llegaba a «Ver diseño» sin saber qué podía/debía
 * hacer. El checklist enuncia los pasos derivados de las features del producto
 * con su estado (Listo / Pendiente / Opcional) y cada paso lleva a su sección.
 *
 * Superficies: sección al tope del StudioSidebar (desktop aside + sheet móvil —
 * es el MISMO componente) y badge con el conteo de pendientes sobre el FAB
 * «Editar» (lo monta studio-editor con `useStudioChecklist`).
 *
 * Cuentan como PENDIENTES: la elección de plantilla (5.1, owner 2026-10-22 —
 * ninguna viene seleccionada por defecto; el paso solo aparece con >1
 * plantilla, con 1 la elección es trivial y se auto-selecciona en el boot),
 * las fotos requeridas y los datos IG. Prediseñados y mensaje son
 * descubribibles pero opcionales (no suman al badge — nunca agobian).
 */

import type { LucideIcon } from "lucide-react";
import { AtSign, Camera, Check, LayoutTemplate, MessageSquareHeart, Sparkles } from "lucide-react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { igMissingRequiredTextLayersPerSlot } from "@/features/personalization/instagram-template-spec";
import { isInstagramTemplate } from "@/features/personalization/frame-palette";
import {
  selectFilledSlotCount,
  selectMissingSlotIndexesKey,
  selectTotalSlotCount,
  type StudioStoreState,
} from "./lib/store";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

export type StudioChecklistStepId =
  "plantillas" | "fotos" | "predisenados" | "mensaje" | "publicacion";

export type StudioChecklistStep = {
  id: StudioChecklistStepId;
  label: string;
  detail?: string;
  /** complete = Listo; pending = bloquea «Ver diseño»; optional = descubrible, no bloquea. */
  state: "complete" | "pending" | "optional";
};

const STEP_ICONS: Record<StudioChecklistStepId, LucideIcon> = {
  plantillas: LayoutTemplate,
  fotos: Camera,
  predisenados: Sparkles,
  mensaje: MessageSquareHeart,
  publicacion: AtSign,
};

/**
 * Pasos del checklist + conteo de pendientes (los que bloquean «Ver diseño»).
 * Suscripciones atómicas (patrón del store) → sin re-render en cascada.
 */
export function useStudioChecklist(
  store: StoreApi<StudioStoreState>,
  opts: { allowText?: boolean; hasPredesigned?: boolean; backOptional?: boolean },
): { steps: StudioChecklistStep[]; pendingCount: number } {
  const texts = useStudioTexts();
  // «Elige tu plantilla» (5.1, 2026-10-22) — primera decisión del flujo: sin
  // plantilla seleccionada por defecto, el paso nace pendiente y se completa
  // al aplicar una (applyTemplate fija selectedTemplateId). Con 0 o 1
  // plantilla no aplica: 0 = nada que elegir; 1 = elección trivial que el
  // boot auto-selecciona (resolveBootTemplate).
  const selectedTemplateId = useStore(store, (s) => s.selectedTemplateId);
  const templatesCount = useStore(store, (s) => s.templates.length);
  const filled = useStore(store, selectFilledSlotCount);
  const total = useStore(store, selectTotalSlotCount);
  const missingPhotos = useStore(
    store,
    (s) => selectMissingSlotIndexesKey(s, opts.backOptional ?? false) !== "",
  );
  // Capas de texto editables de la plantilla vigente: «Tu mensaje» aplica solo
  // con EXACTAMENTE 1 (la condición de StudioMessageField) y no-Instagram.
  const editableTextLayers = useStore(store, (s) => {
    const layers = s.canvasData?.unitTemplate?.layers ?? [];
    return layers.filter(
      (l) => l.type === "text" && (l as { editable?: boolean }).editable === true,
    ).length;
  });
  const isIg = useStore(store, (s) =>
    s.canvasData ? isInstagramTemplate(s.canvasData.unitTemplate.layers) : false,
  );
  const igMissing = useStore(store, (s) =>
    s.canvasData ? igMissingRequiredTextLayersPerSlot(s.canvasData).length > 0 : false,
  );
  // «Tu mensaje» es pack-level: mismo criterio de valor vigente que
  // StudioMessageField (packTextValues primero, slots como fallback).
  const messageLayerId = useStore(store, (s) => {
    const layers = s.canvasData?.unitTemplate?.layers ?? [];
    const editable = layers.filter(
      (l) => l.type === "text" && (l as { editable?: boolean }).editable === true,
    );
    return editable.length === 1 ? (editable[0] as { id?: string }).id : null;
  });
  const messageFilled = useStore(store, (s) => {
    if (!messageLayerId) return false;
    const pack = s.packTextValues[messageLayerId];
    if (typeof pack === "string") return pack.trim() !== "";
    for (const slot of s.canvasData?.slots ?? []) {
      const t = slot.textOverrides?.[messageLayerId]?.text;
      if (typeof t === "string" && t.trim() !== "") return true;
    }
    return false;
  });

  const steps: StudioChecklistStep[] = [];
  if (templatesCount > 1) {
    steps.push({
      id: "plantillas",
      label: texts.checklist.pasoPlantillas,
      state: selectedTemplateId ? "complete" : "pending",
    });
  }
  if (total > 0) {
    steps.push({
      id: "fotos",
      label: texts.checklist.pasoFotos,
      detail: fillStudioText(texts.checklist.pasoFotosDetalle, { n: filled, total }),
      state: missingPhotos ? "pending" : "complete",
    });
  }
  if (opts.hasPredesigned) {
    steps.push({ id: "predisenados", label: texts.checklist.pasoPredisenados, state: "optional" });
  }
  if (opts.allowText && !isIg && editableTextLayers === 1) {
    steps.push({
      id: "mensaje",
      label: texts.checklist.pasoMensaje,
      state: messageFilled ? "complete" : "optional",
    });
  }
  if (isIg) {
    steps.push({
      id: "publicacion",
      label: texts.checklist.pasoPublicacion,
      state: igMissing ? "pending" : "complete",
    });
  }
  const pendingCount = steps.filter((s) => s.state === "pending").length;
  return { steps, pendingCount };
}

export function StudioChecklist({
  steps,
  onSelect,
}: {
  steps: StudioChecklistStep[];
  /** Tap en un paso: el padre navega a su sección (scroll/expand/focus). */
  onSelect?: (id: StudioChecklistStepId) => void;
}) {
  const texts = useStudioTexts();
  if (steps.length === 0) return null;
  return (
    <section aria-labelledby="sidebar-checklist" className="bg-brand-cream/60 rounded-xl p-3">
      <h3 id="sidebar-checklist" className="text-brand-purple-dark mb-2 text-sm font-semibold">
        {texts.checklist.titulo}
      </h3>
      <ul className="flex flex-col gap-1">
        {steps.map((step) => {
          const Icon = STEP_ICONS[step.id];
          const stateText =
            step.state === "complete"
              ? texts.checklist.completo
              : step.state === "pending"
                ? texts.checklist.pendiente
                : texts.checklist.opcional;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect?.(step.id)}
                // WCAG 2.5.3 (axe label-content-name-mismatch, nightly 2026-10-31):
                // SIN aria-label — el nombre accesible sale del contenido visible
                // (label + detalle + estado), con espacios REALES entre spans para
                // que el texto computado lleve separación (sin ellos textContent
                // pegaba "…plantillaPendiente" y el aria-label no calzaba).
                className="hover:bg-brand-purple/5 focus:ring-brand-turquoise flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors focus:ring-2 focus:outline-none"
              >
                <span
                  aria-hidden
                  className={[
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    step.state === "complete"
                      ? "bg-emerald-100 text-emerald-700"
                      : step.state === "pending"
                        ? "bg-brand-yellow/40 text-brand-purple-dark"
                        : "bg-brand-purple/10 text-brand-muted",
                  ].join(" ")}
                >
                  {step.state === "complete" ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-brand-purple-dark block truncate text-xs font-semibold">
                    {step.label}
                  </span>
                  {step.detail && (
                    <span className="text-brand-muted block text-[10px] tabular-nums">
                      {step.detail}
                    </span>
                  )}
                </span>
                <span
                  className={[
                    "shrink-0 text-[10px] font-bold tracking-wide",
                    // SIN `uppercase` (WCAG 2.5.3 / axe label-content-name-mismatch,
                    // nightly 2026-10-31): el text-transform cambia el texto RENDERIZADO
                    // ("PENDIENTE") y axe lo compara con el nombre accesible ("Pendiente")
                    // → mismatch. Negrita + tracking conservan la lectura de etiqueta.
                    step.state === "complete"
                      ? "text-emerald-600"
                      : step.state === "pending"
                        ? "text-brand-purple"
                        : "text-brand-muted",
                  ].join(" ")}
                >
                  {stateText}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
