"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, X, ExternalLink } from "lucide-react";
import type { AdminTemplate } from "@/features/personalization/admin-templates";
import { useDialogA11y } from "./use-dialog-a11y";

/**
 * Botón + modal de vista previa de una plantilla en el admin.
 * Muestra el previewUrl real y un link al producto asociado para probarla en el Estudio.
 * A11y: role=dialog, aria-modal, foco inicial, trampa de foco, Escape y retorno de foco.
 */
export function TemplatePreviewButton({
  template,
}: {
  template: AdminTemplate;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose: () => setOpen(false), active: open });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-brand-purple/20 text-brand-purple hover:bg-brand-purple/5 focus:ring-brand-turquoise inline-flex w-full items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors focus:ring-2 focus:outline-none"
        aria-haspopup="dialog"
      >
        <Eye className="h-3.5 w-3.5" />
        Vista previa
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.button
              type="button"
              aria-label="Cerrar vista previa"
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
              aria-labelledby="template-preview-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="ring-brand-purple/10 fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h2
                  id="template-preview-title"
                  className="text-brand-purple-dark text-sm font-bold"
                >
                  Vista previa de la plantilla
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
              <div className="px-5 py-4">
                <p className="text-brand-purple-dark mb-3 text-sm font-semibold">
                  {template.name}
                </p>
                <div className="bg-brand-cream/50 ring-brand-purple/10 relative aspect-[3/4] w-full overflow-hidden rounded-xl ring-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={template.previewUrl}
                    alt={`Preview de ${template.name}`}
                    className="h-full w-full object-contain p-2"
                  />
                </div>
                <p className="text-brand-muted mt-3 text-xs">
                  Así se ve el imán con la plantilla seleccionada. Para probarla con
                  tus fotos, abre el producto asociado en el Estudio.
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-brand-purple-dark/70 hover:bg-brand-purple/10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  Cerrar
                </button>
                {template.productSlug && (
                  <a
                    href={`/producto/${template.productSlug}`}
                    className="bg-brand-purple hover:bg-brand-purple/90 focus:ring-brand-turquoise inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors focus:ring-2 focus:outline-none"
                  >
                    Probar en el Estudio
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
