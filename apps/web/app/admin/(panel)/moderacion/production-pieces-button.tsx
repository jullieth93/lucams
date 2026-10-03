"use client";

/*
 * Botón + modal "Ver piezas reales" de la cola de moderación (T4, ADR-063 T2 revisitado).
 *
 * La grilla muestra el previewUrl (mosaico público liviano); los PNGs reales de producción
 * (300 DPI, 2-5 MB c/u) solo se firman y descargan cuando Lucy abre este modal — la server
 * action firma ÚNICAMENTE los paths de ese diseño (antes la página firmaba TODOS los diseños
 * pendientes al renderizar y el navegador bajaba cientos de MB por visita).
 *
 * Las signed URLs apuntan a /storage/v1/object/sign/production-assets/… (bucket PRIVADO) y no
 * están cubiertas por los remotePatterns de next/image (que solo permiten buckets públicos),
 * así que se sirven con <img> directa — igual que hacía la grilla antes del cambio.
 *
 * A11y: role=dialog, aria-modal, foco inicial, trampa de foco, Escape y retorno de foco
 * (useDialogA11y, mismo patrón que TemplatePreviewButton).
 */

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, Loader2, X } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { useDialogA11y } from "../plantillas/use-dialog-a11y";
import { getDesignProductionSignedUrlsAction, type SignedProductionPiece } from "./actions";

export function ProductionPiecesButton({
  designId,
  pieceCount,
  productName,
}: {
  designId: string;
  pieceCount: number;
  productName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pieces, setPieces] = useState<SignedProductionPiece[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose: () => setOpen(false), active: open });

  async function openModal() {
    setOpen(true);
    if (pieces !== null || error !== null) return; // ya cargadas (o falló) en esta sesión
    try {
      setPieces(await getDesignProductionSignedUrlsAction(designId));
    } catch {
      setError("No pudimos cargar las piezas. Cierra e intenta de nuevo.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="border-brand-purple/20 text-brand-purple hover:bg-brand-purple/5 focus:ring-brand-turquoise mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors focus:ring-2 focus:outline-none"
        aria-haspopup="dialog"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden />
        Ver piezas reales ({pieceCount})
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.button
              type="button"
              aria-label="Cerrar piezas de producción"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 cursor-default bg-black/50 backdrop-blur-sm"
              tabIndex={-1}
            />

            {/* Modal */}
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="production-pieces-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="ring-brand-purple/10 fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[94vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h2
                  id="production-pieces-title"
                  className="text-brand-purple-dark text-sm font-bold"
                >
                  Piezas de producción — {productName}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-brand-purple-dark/70 hover:text-brand-purple-dark focus:ring-brand-turquoise rounded-md p-1 focus:ring-2 focus:outline-none"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto px-5 py-4">
                {pieces === null && error === null && (
                  <div className="text-brand-muted flex items-center justify-center gap-2 py-16 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Firmando y cargando las piezas…
                  </div>
                )}
                {error !== null && (
                  <p className="py-16 text-center text-sm text-rose-700">{error}</p>
                )}
                {pieces !== null && pieces.length === 0 && (
                  <p className="text-brand-muted py-16 text-center text-sm">
                    No se pudieron firmar las piezas de este diseño.
                  </p>
                )}
                {pieces !== null && pieces.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {pieces.map((piece, i) => (
                      <Hint key={piece.path} content={`Pieza ${i + 1} — abrir a tamaño completo`}>
                        <a
                          href={piece.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-brand-cream/40 border-brand-purple/10 hover:ring-brand-purple/40 focus:ring-brand-turquoise relative block aspect-square overflow-hidden rounded-md border hover:ring-2 focus:ring-2 focus:outline-none"
                        >
                          {/* Paquete D (2026-10-02 — WYSIWYG): object-CONTAIN sobre
                            fondo neutro — la pieza (tira 2×12 alta) se ve ENTERA,
                            como la imprime producción; object-cover la recortaba
                            y el moderador no podía compararla con el preview. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={piece.url}
                            alt={`Pieza ${i + 1} de ${productName}`}
                            className="h-full w-full object-contain p-1"
                            loading="lazy"
                          />
                          <span className="bg-brand-purple-dark/80 absolute right-0 bottom-0 px-1 text-[9px] font-bold text-white">
                            {i + 1}
                          </span>
                        </a>
                      </Hint>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
                <p className="text-brand-muted text-xs">
                  Toca una pieza para abrirla a tamaño completo. Los enlaces caducan en 1 hora.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-brand-purple-dark/70 hover:bg-brand-purple/10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
