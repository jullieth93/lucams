"use client";

/*
 * StudioGesturesHint — M.3.b.UX.v11 (Lucy 2026-05-15).
 *
 * Banner instructivo que aparece una sola vez cuando el cliente carga su
 * primera foto en cualquier producto Fotoimanes. Explica los gestos de
 * edición (drag, zoom wheel/pinch, doble click) para que no descubra por
 * accidente.
 *
 * Persiste en localStorage tras dismiss → no vuelve a aparecer.
 *
 * Patrón: similar al tutorial de onboarding (StudioOnboarding) pero más
 * focused — solo gestos de foto, mostrado cuando ya hay foto cargada.
 *
 * UX rules:
 *   - Auto-detecta device (touch vs mouse) y muestra solo gestos relevantes.
 *   - Auto-dismiss tras 6 segundos (o manual con X).
 *   - Animación slide-up sutil para no asustar.
 *   - localStorage key versionada (v1) para resetear si cambiamos los gestos.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Move, ZoomIn, MousePointer2, Hand } from "lucide-react";

const STORAGE_KEY = "lucams_studio_gestures_hint_v1";

type Props = {
  /** Mostrar el hint cuando este flag se vuelve true (ej: hay al menos 1 foto cargada). */
  trigger: boolean;
};

export function StudioGesturesHint({ trigger }: Props) {
  const [open, setOpen] = useState(false);
  // Lazy state initializer — calculado UNA VEZ en el primer render. Evita el
  // setState-in-effect antipattern de React 19.
  const [isTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      "ontouchstart" in window || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
    );
  });

  // Trigger logic — solo abrir si nunca se mostró antes
  useEffect(() => {
    if (!trigger) return;
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(STORAGE_KEY);
    if (seen === "true") return;
    // Pequeño delay para que el cliente vea primero la foto cargada
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [trigger]);

  // Auto-dismiss tras 6 segundos
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => handleClose(), 6500);
    return () => window.clearTimeout(t);
  }, [open]);

  function handleClose() {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // localStorage puede no estar disponible (incognito en algunos browsers).
      // No crítico — el hint volverá a aparecer en próxima sesión.
    }
  }

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
                        <strong>Pellizcá con 2 dedos</strong> para zoom
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
                        <strong>Arrastrá con el mouse</strong> para mover la foto
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
              onClick={handleClose}
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
