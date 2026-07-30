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
import { useDialogA11y } from "./use-dialog-a11y";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import {
  uploadDesignAssetAction,
  assignPredesignedToDesignAction,
} from "@/features/personalization/actions";
import type { StudioAsset } from "./types";
import { STUDIO_ACCEPTED_IMAGE_TYPES, uploadGuidanceText } from "./lib/upload-guidance";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";
import { ConsentText } from "./studio-consent-text";

/** Diseño prediseñado de la galería (ADR-057 B2). */
export type PredesignedItem = {
  id: string;
  name: string;
  imageUrl: string;
  /** Ola 21 — URL opcional de la cara B (pares A/B para separadores). */
  imageUrlB?: string | null;
};

type StudioAssetPickerModalProps = {
  isOpen: boolean;
  slotIndex: number | null;
  totalSlots: number;
  assets: StudioAsset[];
  designId: string | null;
  /** Diseños prediseñados que el cliente puede aplicar al slot (vacío = solo subir foto). */
  predesigned?: PredesignedItem[];
  /** Ola 4 — tamaño físico del producto para la recomendación de resolución del uploader. */
  productSizeCm?: string;
  /** Ola 21 — separadores de 2 caras: permite aplicar el par A/B a la unidad. */
  facesPerUnit?: number;
  onClose: () => void;
  /** Ola 21 — ahora recibe el slot target para poder reubicar A/B en separadores. */
  onSelectAsset: (slotIndex: number, asset: StudioAsset) => void;
  /** Ola 21 — callback opcional para asignar el asset de la cara B en separadores. */
  onSelectAssetB?: (slotIndex: number, asset: StudioAsset) => void;
  onAssetUploaded: (asset: StudioAsset) => void;
};

export function StudioAssetPickerModal({
  isOpen,
  slotIndex,
  totalSlots,
  assets,
  designId,
  predesigned = [],
  productSizeCm,
  facesPerUnit,
  onClose,
  onSelectAsset,
  onSelectAssetB,
  onAssetUploaded,
}: StudioAssetPickerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Consentimiento de derechos de imagen (Ley 1581): obligatorio antes de subir.
  const [rightsAccepted, setRightsAccepted] = useState(false);
  const texts = useStudioTexts();

  // ADR-057 B2 — aplicar un diseño prediseñado: lo subimos como asset del diseño y lo asignamos
  // al slot (reusando el pipeline de foto: encuadre, finalize, render server-side).
  // Ola 21 — separadores 2 caras: si el diseño trae imageUrlB, asignamos A/B a la unidad física.
  const handleApplyPredesigned = async (item: PredesignedItem) => {
    if (!designId || applyingId || slotIndex === null) return;
    setApplyingId(item.id);
    setError(null);
    try {
      const res = await assignPredesignedToDesignAction({ designId, galleryImageId: item.id });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const assetA: StudioAsset = {
        id: res.assetId,
        signedUrl: res.signedUrl,
        width: res.width,
        height: res.height,
      };
      onAssetUploaded(assetA);

      const isTwoFace = facesPerUnit === 2 && res.assetB;
      if (isTwoFace && res.assetB) {
        const assetB: StudioAsset = {
          id: res.assetB.assetId,
          signedUrl: res.assetB.signedUrl,
          width: res.assetB.width,
          height: res.assetB.height,
        };
        onAssetUploaded(assetB);

        const isCurrentB = slotIndex % 2 === 1;
        const slotA = isCurrentB ? Math.max(0, slotIndex - 1) : slotIndex;
        const slotB = isCurrentB ? slotIndex : slotIndex + 1;
        onSelectAsset(slotA, assetA);
        onSelectAssetB?.(slotB, assetB);
      } else {
        onSelectAsset(slotIndex, assetA);
      }
      onClose();
    } catch {
      setError(texts.plantillas.toastError);
    } finally {
      setApplyingId(null);
    }
  };

  // #15 — foco inicial + trap + Escape + retorno de foco (reutiliza modalRef; activo si isOpen).
  useDialogA11y(modalRef, { onClose, active: isOpen });

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
        formData.append("rightsAccepted", rightsAccepted ? "true" : "false");
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
            setError(result.validationMessage ?? texts.fotos.errorCalidadMinima);
            continue;
          }
          // Auto-asignar al slot si solo se subió 1 archivo (y no hay error)
          if (files.length === 1) {
            if (slotIndex !== null) onSelectAsset(slotIndex, asset);
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
                tabIndex={-1}
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
                      {fillStudioText(texts.fotos.pickerTitulo, {
                        n: (slotIndex ?? 0) + 1,
                        total: totalSlots,
                      })}
                    </h2>
                    <p id={descId} className="text-brand-muted mt-0.5 text-xs">
                      {texts.fotos.pickerDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={texts.comun.cerrar}
                    className="text-brand-muted hover:text-brand-purple-dark hover:bg-brand-cream focus:ring-brand-purple rounded-md p-2 transition-colors focus:ring-2 focus:outline-none"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Body */}
                <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
                  {/* Consentimiento de derechos de imagen (Ley 1581): obligatorio
                      antes de subir. Foco inicial acá (primera acción requerida). */}
                  <label className="text-brand-purple-dark/80 mb-3 flex items-start gap-2 text-xs leading-snug">
                    <input
                      ref={firstFocusableRef}
                      type="checkbox"
                      checked={rightsAccepted}
                      onChange={(e) => setRightsAccepted(e.target.checked)}
                      className="accent-brand-purple mt-0.5 h-4 w-4 flex-shrink-0"
                    />
                    <span>
                      <ConsentText template={texts.fotos.consentimiento} />
                    </span>
                  </label>

                  {/* Tab: Subir nueva (primary action mobile-friendly) */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || !rightsAccepted}
                    className="border-brand-purple/30 bg-brand-purple/5 text-brand-purple hover:bg-brand-purple/10 focus:ring-brand-purple flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed py-5 text-sm font-medium transition-colors focus:ring-2 focus:outline-none disabled:opacity-60"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {texts.fotos.subiendoPicker}
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        {texts.fotos.subirCtaPicker}
                      </>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={STUDIO_ACCEPTED_IMAGE_TYPES}
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                  {/* Ola 4 (Lucy 2026-07-23) — formatos y resolución recomendada, visibles
                      junto al punto de subida (texto centralizado en lib/upload-guidance). */}
                  <p className="text-brand-muted mt-2 text-[11px] leading-snug">
                    {uploadGuidanceText(productSizeCm, {
                      formats: texts.fotos.formatos,
                      withPx: texts.fotos.guiaPx,
                      generic: texts.fotos.guiaGenerica,
                    })}
                  </p>

                  {error && (
                    <div
                      role="alert"
                      className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
                    >
                      ⚠️ {error}
                    </div>
                  )}

                  {/* ADR-057 B2 — Diseños prediseñados: aplica uno listo al slot */}
                  {predesigned.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-brand-purple-dark mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                        <Sparkles className="text-brand-purple h-3.5 w-3.5" />
                        {texts.plantillas.predisenadosTitulo}
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {predesigned.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleApplyPredesigned(item)}
                            disabled={applyingId !== null}
                            aria-label={fillStudioText(texts.plantillas.aplicarDisenoAria, {
                              nombre: item.name,
                            })}
                            title={item.name}
                            className="border-brand-purple/20 hover:border-brand-purple focus:border-brand-turquoise focus:ring-brand-turquoise relative aspect-square overflow-hidden rounded-md border-2 transition-all hover:scale-105 focus:ring-2 focus:outline-none disabled:opacity-50"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                            {applyingId === item.id && (
                              <div className="bg-brand-purple-dark/40 absolute inset-0 flex items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-white" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tab: Mis fotos (assets ya subidos) */}
                  {assets.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-brand-purple-dark mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                        <ImageIcon className="text-brand-purple h-3.5 w-3.5" />
                        {texts.fotos.titulo} ({assets.length})
                      </h3>
                      <div
                        role="grid"
                        aria-label={texts.fotos.tusFotosAria}
                        className="grid grid-cols-3 gap-2"
                      >
                        {assets.map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            role="gridcell"
                            onClick={() => {
                              if (slotIndex !== null) onSelectAsset(slotIndex, asset);
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
                              alt={texts.fotos.fotoSubidaAlt}
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
                    <p className="text-brand-muted mt-4 text-center text-xs italic">
                      {texts.fotos.pickerVacio}
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
