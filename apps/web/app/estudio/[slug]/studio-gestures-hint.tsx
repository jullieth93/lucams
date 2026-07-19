"use client";

/*
 * StudioGesturesHint — M.3.b.UX.v11 (Lucy 2026-05-15).
 *
 * Banner instructivo de gestos del editor de foto. Se muestra:
 *   - Automáticamente la PRIMERA vez que el cliente carga una foto
 *     (gestionado por el editor con localStorage check).
 *   - Manualmente cuando el cliente clickea el botón "?" del toolbar
 *     (Lucy v12 — accesibilidad: poder re-ver las instrucciones).
 *
 * Componente "controlled": open + onClose props. El parent maneja toda
 * la lógica de persistencia (localStorage) y auto-trigger. Acá solo
 * renderea el banner cuando open=true + permite auto-dismiss tras 6.5s.
 *
 * UX rules:
 *   - Auto-detecta device (touch vs mouse) y muestra gestos relevantes.
 *   - Auto-dismiss tras 6.5 segundos (o manual con X / overlay click).
 *   - Animación slide-up sutil para no asustar.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Move, ZoomIn, MousePointer2, Hand } from "lucide-react";

export const GESTURES_HINT_STORAGE_KEY = "lucams_studio_gestures_hint_v1";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Si true, NO auto-cierra a los 6.5s. Útil para el modo manual ("?")
   *  donde el cliente quiere leer con calma. */
  persistent?: boolean;
};

export function StudioGesturesHint({ open, onClose, persistent = false }: Props) {
  // Lazy state initializer — calculado UNA VEZ en el primer render.
  // Evita el setState-in-effect antipattern de React 19.
  const [isTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      "ontouchstart" in window || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
    );
  });

  // Auto-dismiss tras 6.5 segundos (solo cuando NO es persistent).
  useEffect(() => {
    if (!open || persistent) return;
    const t = window.setTimeout(() => onClose(), 6500);
    return () => window.clearTimeout(t);
  }, [open, persistent, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-4 sm:bottom-6"
          role="status"
          aria-live="polite"
        >
          <div className="border-brand-purple/20 bg-brand-purple-dark/95 flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-white shadow-2xl backdrop-blur sm:max-w-lg">
            <div className="flex-1">
              <p className="text-sm font-bold">¡Tip! Cómo editar tu foto:</p>
              <ul className="mt-1.5 space-y-1 text-[12px]">
                {isTouch ? (
                  <>
                    <li className="flex items-center gap-2">
                      <Hand className="text-brand-turquoise h-3.5 w-3.5" aria-hidden />
                      <span>
                        <strong>1 dedo arrastra</strong> para mover la foto
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ZoomIn className="text-brand-turquoise h-3.5 w-3.5" aria-hidden />
                      <span>
                        <strong>Pellizca con 2 dedos</strong> para zoom
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Move className="text-brand-turquoise h-3.5 w-3.5" aria-hidden />
                      <span>
                        <strong>Doble tap</strong> para volver al centro
                      </span>
                    </li>
                  </>
                ) : (
                  <>
                    <li className="flex items-center gap-2">
                      <MousePointer2 className="text-brand-turquoise h-3.5 w-3.5" aria-hidden />
                      <span>
                        <strong>Arrastra con el mouse</strong> para mover la foto
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ZoomIn className="text-brand-turquoise h-3.5 w-3.5" aria-hidden />
                      <span>
                        <strong>Scroll</strong> sobre la foto para zoom in/out
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Move className="text-brand-turquoise h-3.5 w-3.5" aria-hidden />
                      <span>
                        <strong>Doble click</strong> para volver al centro
                      </span>
                    </li>
                  </>
                )}
              </ul>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar este tip"
              className="text-white/70 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
