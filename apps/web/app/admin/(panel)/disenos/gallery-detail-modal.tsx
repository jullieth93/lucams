"use client";

/*
 * Paquete A (2026-10-02) — Modal de DETALLE de un diseño prediseñado del
 * admin (/admin/disenos): cara A y cara B lado a lado (mismo markup del
 * preview del corte de tira del upload), nombre, producto (tag), orden y
 * estado, con la acción de borrar existente. Sin cara B muestra solo la A con
 * la nota de la regla única: se imprime espejo de la cara A (producción:
 * expandMissingBackFaces — misma promesa del texto de ayuda del upload).
 * A11y: patrón de template-preview-button (role=dialog + useDialogA11y).
 */

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, X, Loader2 } from "lucide-react";
import { useDialogA11y } from "../plantillas/use-dialog-a11y";

export type GalleryDetailItem = {
  id: string;
  tag: string;
  name: string;
  imageUrl: string;
  imageUrlB?: string | null;
  isActive: boolean;
  order: number;
};

export function GalleryDetailModal({
  item,
  productLabel,
  pending,
  onClose,
  onDelete,
}: {
  item: GalleryDetailItem | null;
  /** Nombre visible del producto dueño del tag (tagOptions). */
  productLabel: string;
  pending: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose, active: item !== null });

  return (
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Cerrar detalle"
            onClick={onClose}
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
            aria-labelledby="gallery-detail-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="ring-brand-purple/10 fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 id="gallery-detail-title" className="text-brand-purple-dark text-sm font-bold">
                {item.name}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="text-brand-purple-dark/70 hover:text-brand-purple-dark focus:ring-brand-turquoise rounded-md p-1 focus:ring-2 focus:outline-none"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — caras lado a lado (markup del preview del corte de tira) */}
            <div className="px-5 py-4">
              <div className={item.imageUrlB ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público */}
                  <img
                    src={item.imageUrl}
                    alt={`${item.name} — cara A`}
                    className="max-h-72 w-full rounded-lg bg-white object-contain ring-brand-purple/10 ring-1"
                  />
                  <figcaption className="text-brand-purple-dark mt-1 text-center text-xs font-semibold">
                    Cara A (frente)
                  </figcaption>
                </figure>
                {item.imageUrlB && (
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público */}
                    <img
                      src={item.imageUrlB}
                      alt={`${item.name} — cara B`}
                      className="max-h-72 w-full rounded-lg bg-white object-contain ring-brand-purple/10 ring-1"
                    />
                    <figcaption className="text-brand-purple-dark mt-1 text-center text-xs font-semibold">
                      Cara B (respaldo)
                    </figcaption>
                  </figure>
                )}
              </div>
              {!item.imageUrlB && (
                <p className="text-brand-muted mt-2 text-xs italic">
                  Sin cara B — se imprime espejo de la cara A (la misma imagen por ambos lados).
                </p>
              )}

              {/* Ficha: producto, orden, estado */}
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="bg-brand-purple/5 rounded-lg px-2 py-1.5">
                  <dt className="text-brand-muted text-[10px] font-semibold tracking-wide uppercase">
                    Producto
                  </dt>
                  <dd className="text-brand-purple-dark truncate text-xs font-semibold" title={productLabel}>
                    {productLabel}
                  </dd>
                </div>
                <div className="bg-brand-purple/5 rounded-lg px-2 py-1.5">
                  <dt className="text-brand-muted text-[10px] font-semibold tracking-wide uppercase">
                    Orden
                  </dt>
                  <dd className="text-brand-purple-dark text-xs font-semibold tabular-nums">
                    #{item.order + 1}
                  </dd>
                </div>
                <div className="bg-brand-purple/5 rounded-lg px-2 py-1.5">
                  <dt className="text-brand-muted text-[10px] font-semibold tracking-wide uppercase">
                    Estado
                  </dt>
                  <dd
                    className={
                      "text-xs font-semibold " +
                      (item.isActive ? "text-emerald-700" : "text-brand-muted")
                    }
                  >
                    {item.isActive ? "Activo" : "Inactivo"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Borrar diseño
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-brand-purple-dark/70 hover:bg-brand-purple/10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
