"use client";

/*
 * Preview del diseño en la cola de moderación, con ASPECTO NATURAL + zoom (Paquete D,
 * 2026-10-02 — WYSIWYG: el moderador compara contra lo que el cliente aprobó).
 *
 * Antes la grilla encerraba el preview en un `aspect-square w-40` fijo: una tira
 * de separador 2×12 (alta y angosta) quedaba diminuta, ilegible para moderar.
 * Ahora la imagen manda con su proporción real (misma idea que la Vista Previa
 * del cliente, studio-preview-modal: se capa por alto, nunca se letterboxea en
 * un cuadrado) y un click/tap abre el zoom a tamaño de viewport.
 *
 * <img> directa (no next/image): el aspecto natural exige dejar que el navegador
 * resuelva las dimensiones; el archivo ya es un WebP liviano del bucket público.
 *
 * A11y: role=dialog, aria-modal, foco inicial, trampa de foco, Escape y retorno
 * de foco (useDialogA11y, mismo patrón que ProductionPiecesButton).
 */

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn } from "lucide-react";
import { useDialogA11y } from "../plantillas/use-dialog-a11y";

export function ModerationPreviewZoom({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose: () => setOpen(false), active: open });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${alt} — ampliar vista previa`}
        title="Ampliar vista previa"
        className="bg-brand-cream/40 border-brand-purple/10 hover:ring-brand-purple/40 focus:ring-brand-turquoise group relative block w-full overflow-hidden rounded-lg border hover:ring-2 focus:ring-2 focus:outline-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- aspecto natural: next/image exige dimensiones fijas o fill en un cuadro */}
        <img
          src={src}
          alt={alt}
          className="mx-auto max-h-56 w-auto max-w-full object-contain p-1"
        />
        <span className="bg-brand-purple-dark/80 absolute right-1 bottom-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
          <ZoomIn className="h-3 w-3" aria-hidden />
          Zoom
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.button
              type="button"
              aria-label="Cerrar vista previa ampliada"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 cursor-default bg-black/60 backdrop-blur-sm"
              tabIndex={-1}
            />

            {/* Modal de zoom: la imagen manda — crece hasta el viewport sin recorte. */}
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label={alt}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4 outline-none sm:p-8"
            >
              <div className="pointer-events-auto relative flex max-h-full max-w-full items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- zoom a tamaño natural capado al viewport */}
                <img
                  src={src}
                  alt={alt}
                  className="max-h-[85dvh] w-auto max-w-full rounded-lg bg-white object-contain shadow-2xl"
                />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar"
                  className="absolute -top-3 -right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-800 shadow-lg transition-colors hover:bg-gray-100 focus:ring-2 focus:ring-white focus:outline-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
