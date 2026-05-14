"use client";

/*
 * StudioAssetPickerModal — modal "tap-on-slot" para asignar foto (M.3.b Capa 2).
 *
 * Flujo:
 *   1. Cliente click/tap en un slot del grid → padre abre este modal
 *   2. Modal muestra 2 tabs: "Mis fotos" (assets ya subidos) + "Subir nueva"
 *   3. Click en asset → asignAssetToSlot + cierra modal
 *   4. Click "Subir nueva" → input file nativo + subir + asignar al slot
 *
 * Accessibility:
 *   - role="dialog" + aria-labelledby + aria-modal="true"
 *   - Focus trap (Esc cierra, click outside cierra)
 *   - Focus inicial al primer asset (o al input file si vacío)
 *   - Tab cycle dentro del modal
 *
 * Animations:
 *   - Backdrop fade-in 200ms
 *   - Modal scale 0.95→1 + slide-up 12px (200ms ease-out)
 *   - Asset hover: scale 1.04
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { uploadDesignAssetAction } from "@/features/personalization/actions";
import type { StudioAsset } from "./types";

type StudioAssetPickerModalProps = {
  isOpen: boolean;
  slotIndex: number | null;
  totalSlots: number;
  assets: StudioAsset[];
  designId: string | null;
  onClose: () => void;
  onSelectAsset: (asset: StudioAsset) => void;
  onAssetUploaded: (asset: StudioAsset) => void;
};

export function StudioAssetPickerModal({
  isOpen,
  slotIndex,
  totalSlots,
  assets,
  designId,
  onClose,
  onSelectAsset,
  onAssetUploaded,
}: StudioAssetPickerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc cierra
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Focus inicial cuando abre
  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      firstFocusableRef.current?.focus();
    });
  }, [isOpen]);

  // Click outside cierra
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Subida server-side via Server Action
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        if (designId) formData.append("designId", designId);
        const result = await uploadDesignAssetAction(formData);
        if (result.ok) {
          const asset: StudioAsset = {
            id: result.assetId,
            signedUrl: result.signedUrl,
            width: result.width,
            height: result.height,
            validationLevel: result.validationLevel,
            validationMessage: result.validationMessage,
          };
          onAssetUploaded(asset);
          // M.3.b.B.2 — Si validación falló con error, mostrar warning prominente
          // pero NO auto-asignar (cliente decide).
          if (result.validationLevel === "error") {
            setError(
              result.validationMessage ??
                "La foto subida no cumple los requisitos mínimos de calidad.",
            );
            continue;
          }
          // Auto-asignar al slot si solo se subió 1 archivo (y no hay error)
          if (files.length === 1) {
            onSelectAsset(asset);
            onClose();
            break;
          }
        } else {
          setError(result.message);
          break;
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const titleId = "asset-picker-title";
  const descId = "asset-picker-desc";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-brand-purple-dark/40 fixed inset-0 z-40 backdrop-blur-sm"
            onClick={handleBackdropClick}
          >
            <div className="flex h-full items-center justify-center p-4">
              <motion.div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="shadow-brand-purple/30 w-full max-w-md rounded-2xl bg-white shadow-2xl"
              >
                {/* Header */}
                <div className="border-brand-purple/10 flex items-center justify-between border-b px-5 py-4">
                  <div>
                    <h2 id={titleId} className="text-brand-purple-dark font-display text-lg">
                      Foto para el imán {(slotIndex ?? 0) + 1} de {totalSlots}
                    </h2>
                    <p id={descId} className="text-brand-purple-dark/60 mt-0.5 text-xs">
                      Elegí una foto ya subida o sumá una nueva.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar"
                    className="text-brand-purple-dark/60 hover:text-brand-purple-dark hover:bg-brand-cream focus:ring-brand-purple rounded-md p-2 transition-colors focus:ring-2 focus:outline-none"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Body */}
                <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
                  {/* Tab: Subir nueva (primary action mobile-friendly) */}
                  <button
                    ref={firstFocusableRef}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="border-brand-purple/30 bg-brand-purple/5 text-brand-purple hover:bg-brand-purple/10 focus:ring-brand-purple flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed py-5 text-sm font-medium transition-colors focus:ring-2 focus:outline-none disabled:opacity-60"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Subiendo...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Subir foto desde tu dispositivo
                      </>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />

                  {error && (
                    <div
                      role="alert"
                      className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
                    >
                      ⚠️ {error}
                    </div>
                  )}

                  {/* Tab: Mis fotos (assets ya subidos) */}
                  {assets.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-brand-purple-dark mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                        <ImageIcon className="text-brand-purple h-3.5 w-3.5" />
                        Mis fotos ({assets.length})
                      </h3>
                      <div
                        role="grid"
                        aria-label="Tus fotos subidas"
                        className="grid grid-cols-3 gap-2"
                      >
                        {assets.map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            role="gridcell"
                            onClick={() => {
                              onSelectAsset(asset);
                              onClose();
                            }}
                            aria-label={
                              asset.validationMessage
                                ? `Asignar foto al slot. Aviso: ${asset.validationMessage}`
                                : "Asignar esta foto al slot"
                            }
                            title={asset.validationMessage}
                            className="border-brand-purple/20 hover:border-brand-purple focus:border-brand-turquoise focus:ring-brand-turquoise relative aspect-square overflow-hidden rounded-md border-2 transition-all hover:scale-105 focus:ring-2 focus:outline-none"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={asset.signedUrl}
                              alt="Foto subida"
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                            {/* M.3.b.B.2 — Badge de validación calidad foto */}
                            {asset.validationLevel === "warning-strong" && (
                              <div
                                className="absolute top-1 right-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 shadow"
                                aria-hidden
                              >
                                ⚠️
                              </div>
                            )}
                            {asset.validationLevel === "warning-soft" && (
                              <div
                                className="absolute top-1 right-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 shadow"
                                aria-hidden
                              >
                                ⓘ
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {assets.length === 0 && !uploading && (
                    <p className="text-brand-purple-dark/50 mt-4 text-center text-xs italic">
                      Todavía no subiste fotos. Empezá arriba.
                    </p>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
