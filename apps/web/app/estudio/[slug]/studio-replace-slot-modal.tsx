"use client";

/*
 * StudioReplaceSlotModal — reemplazo EXPLÍCITO de lienzo (owner 2026-10-19).
 *
 * Al aplicar un diseño prediseñado cuando TODOS los lienzos ya tienen diseño
 * (firstFreeSlotOfFace / resolveFaceAAnchor → null), antes salía un toast de
 * error ("Todos los lienzos ya tienen un diseño… bórralo primero") y el
 * cliente se quedaba sin camino. Ahora se abre esta ventana con los lienzos
 * OCUPADOS (numerados, con miniatura del diseño actual de cada uno) y el
 * cliente elige cuál reemplazar — el reemplazo es una decisión explícita,
 * nunca una sobreescritura en silencio.
 *
 * Se compone con el modal de cara (StudioFaceChoiceModal): primero se pregunta
 * la cara cuando es ambigua y, si la cara elegida no tiene lienzo libre, se
 * abre este modal filtrado a los lienzos DE ESA cara.
 *
 * Mismo patrón visual y de accesibilidad del StudioFaceChoiceModal: portal a
 * document.body, backdrop, useDialogA11y (foco inicial + trap + Escape).
 * Textos CMS: plantillas.reemplazo*; los rótulos de cara reusan
 * lienzo.unitCaraA/unitCaraB.
 */

import { useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ImageOff } from "lucide-react";
import { useDialogA11y } from "./use-dialog-a11y";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

export type ReplaceSlotOption = {
  slotIndex: number;
  /** Rótulo visible numerado ("Lienzo 2"). */
  label: string;
  /** Chip de cara para productos de 2 caras ("Cara A" / "Cara B"); null en 1 cara. */
  faceLabel?: string | null;
  /** Miniatura del diseño actual del lienzo (assetUrl del slot); null = sin imagen. */
  thumbUrl?: string | null;
};

export type StudioReplaceSlotModalProps = {
  open: boolean;
  /** Nombre del diseño a aplicar (va en el cuerpo de la pregunta). */
  designName: string;
  /** Lienzos ocupados candidatos a reemplazar (ya filtrados por el caller). */
  options: ReplaceSlotOption[];
  onPick: (slotIndex: number) => void;
  onClose: () => void;
};

export function StudioReplaceSlotModal({
  open,
  designName,
  options,
  onPick,
  onClose,
}: StudioReplaceSlotModalProps) {
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
              aria-labelledby="replace-slot-title"
              aria-describedby="replace-slot-desc"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="ring-brand-purple/10 pointer-events-auto flex max-h-[85vh] w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1"
            >
              <div className="px-5 pt-5 pb-3">
                <h2
                  id="replace-slot-title"
                  className="text-brand-purple-dark text-base leading-tight font-bold"
                >
                  {texts.plantillas.reemplazoTitulo}
                </h2>
                <p id="replace-slot-desc" className="text-brand-muted mt-1 text-xs leading-snug">
                  {fillStudioText(texts.plantillas.reemplazoCuerpo, { nombre: designName })}
                </p>
              </div>
              {/* Lista de lienzos ocupados: scroll propio para no romper el modal
                  con muchos slots (calendario de 12, pack de 6 separadores…). */}
              <div className="grid shrink grid-cols-3 gap-2 overflow-y-auto px-5 pb-3">
                {options.map((opt) => (
                  <button
                    key={opt.slotIndex}
                    type="button"
                    onClick={() => onPick(opt.slotIndex)}
                    aria-label={fillStudioText(texts.plantillas.reemplazoLienzoAria, {
                      n: opt.slotIndex + 1,
                    })}
                    className="border-brand-purple/20 hover:border-brand-purple focus:ring-brand-turquoise group flex flex-col gap-1 rounded-md border-2 p-1.5 transition-colors focus:ring-2 focus:outline-none"
                  >
                    <span className="bg-brand-cream/50 relative block aspect-square w-full overflow-hidden rounded-sm">
                      {opt.thumbUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={opt.thumbUrl}
                          alt=""
                          aria-hidden
                          className="h-full w-full object-cover"
                          loading="lazy"
                          draggable={false}
                        />
                      ) : (
                        <span className="text-brand-muted flex h-full items-center justify-center">
                          <ImageOff className="h-4 w-4" aria-hidden />
                        </span>
                      )}
                    </span>
                    <span className="text-brand-purple-dark text-center text-[10px] leading-tight font-bold">
                      {opt.label}
                    </span>
                    {opt.faceLabel && (
                      <span className="text-brand-muted text-center text-[9px] leading-tight font-semibold">
                        {opt.faceLabel}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="border-brand-purple/10 shrink-0 border-t px-5 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="border-brand-purple/40 text-brand-purple-dark hover:bg-brand-purple/10 w-full rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  {texts.plantillas.reemplazoCancelar}
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
