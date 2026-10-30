"use client";

/*
 * StudioFaceChoiceModal — regla de caras (2026-10-12).
 *
 * Al aplicar desde la GRILLA de prediseñados del sidebar un diseño de 1 cara
 * en un producto de 2 caras, el destino es ambiguo: antes caía SIEMPRE en cara
 * A. Ahora se pregunta primero "¿En qué cara quieres aplicarlo? Cara A / Cara B".
 * 2026-10-19 ("pregunta SIEMPRE", owner): el clic de la grilla pregunta incluso
 * con un slot seleccionado — assignAssetToSlot auto-selecciona el slot recién
 * asignado y eso hacía que los clics siguientes sobrescribieran sin preguntar.
 * Si la cara elegida no tiene lienzo libre, el flujo continúa en el modal de
 * reemplazo (StudioReplaceSlotModal) en vez de un toast de error.
 *
 * No aplica (sin pregunta): productos de 1 cara, prediseños con imageUrlB
 * (llenan ambas caras automáticamente) y aplicación sobre un slot específico
 * (tap en la grilla del lienzo / drag & drop — no pasan por la tarjeta del
 * sidebar).
 *
 * Mismo patrón visual y de accesibilidad del PhotoQualityModal: portal a
 * document.body (sin stacking contexts del sidebar), backdrop, useDialogA11y
 * (foco inicial + trap + Escape). Textos CMS: plantillas.caraPregunta*; los
 * botones de elección reusan lienzo.unitCaraA/unitCaraB ("Cara A"/"Cara B").
 */

import { useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDialogA11y } from "./use-dialog-a11y";
import { CloseXButton } from "@/components/ui/close-x-button";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

export type StudioFaceChoiceModalProps = {
  open: boolean;
  /** Nombre del diseño a aplicar (va en el cuerpo de la pregunta). */
  designName: string;
  onPick: (face: "A" | "B") => void;
  onClose: () => void;
};

export function StudioFaceChoiceModal({
  open,
  designName,
  onPick,
  onClose,
}: StudioFaceChoiceModalProps) {
  const texts = useStudioTexts();
  const dialogRef = useRef<HTMLDivElement>(null);
  // #15 — foco inicial + trap + Escape + retorno de foco.
  useDialogA11y(dialogRef, { onClose, active: open });

  // Guard SSR: el portal necesita document (el modal solo abre por interacción).
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label={texts.comun.cerrar}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 cursor-default bg-black/40 backdrop-blur-sm"
            tabIndex={-1}
          />
          {/* Wrapper de centrado (el transform de la animación vive en el panel;
              ver PhotoQualityModal). */}
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="face-choice-title"
              aria-describedby="face-choice-desc"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="ring-brand-purple/10 pointer-events-auto flex w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1"
            >
              <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
                <div>
                  <h2
                    id="face-choice-title"
                    className="text-brand-purple-dark text-base leading-tight font-bold"
                  >
                    {texts.plantillas.caraPreguntaTitulo}
                  </h2>
                  <p id="face-choice-desc" className="text-brand-muted mt-1 text-xs leading-snug">
                    {fillStudioText(texts.plantillas.caraPreguntaCuerpo, { nombre: designName })}
                  </p>
                </div>
                <CloseXButton onClick={onClose} label={texts.comun.cerrar} className="shrink-0" />
              </div>
              <div className="border-brand-purple/10 flex shrink-0 flex-col gap-2 border-t px-5 py-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onPick("A")}
                    className="bg-brand-purple hover:bg-brand-purple-dark focus:ring-brand-turquoise flex-1 rounded-md px-3 py-2 text-sm font-semibold text-white transition-colors focus:ring-2 focus:outline-none"
                  >
                    {texts.lienzo.unitCaraA}
                  </button>
                  <button
                    type="button"
                    onClick={() => onPick("B")}
                    className="bg-brand-turquoise/25 text-brand-purple-dark hover:bg-brand-turquoise/40 focus:ring-brand-turquoise flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus:ring-2 focus:outline-none"
                  >
                    {texts.lienzo.unitCaraB}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="border-brand-purple/40 text-brand-purple-dark hover:bg-brand-purple/10 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  {texts.plantillas.caraPreguntaCancelar}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
