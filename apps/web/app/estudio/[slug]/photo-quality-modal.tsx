"use client";

/*
 * PhotoQualityModal — explica problemas de baja resolución/brillo/blur (P0.3).
 *
 * Patrón Mixbook: cuando el cliente intenta usar una foto con problemas
 * de calidad, popup explicativo con sugerencia accionable. Reduce la
 * frustración post-compra ("llegó pixelado") + da al cliente alternativas.
 *
 * Componente COMPARTIDO del Estudio (extraído del sidebar 2026-10-02 para
 * paridad desktop/móvil): lo abren
 *   1. AssetThumb del sidebar (click en foto con warning),
 *   2. StudioAssetPickerModal (click en foto con warning — con CTA
 *      "Usar de todos modos" que asigna igual vía onAction),
 *   3. El chip de calidad del slot en canvas (datos de checkPhotoQuality,
 *      pasados por props severity/message/imageUrl en vez de asset).
 *
 * Stacking (fix STG 2026-10-06): el modal y su backdrop se renderizan en
 * PORTAL a document.body (misma estrategia de los Radix Dialog del estudio).
 * Montado inline dentro del StudioSlot quedaba atrapado en el stacking
 * context de la celda (motion.div con transform de la animación de entrada):
 * el `fixed z-50` pasaba a ser relativo a esa celda y las tarjetas del grid
 * (p.ej. la grilla del calendario) se pintaban ENCIMA del modal y del
 * backdrop. z-50 se conserva: queda por encima del picker (z-40), que es
 * quien lo abre en el caso 2.
 */

import { useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDialogA11y } from "./use-dialog-a11y";
import { useStudioTexts } from "./studio-texts-provider";
import type { StudioAsset } from "./types";

export type PhotoQualityModalProps = {
  open: boolean;
  onClose: () => void;
  /** Asset subido (sidebar / picker): severidad, mensaje, recomendación y thumb vienen del asset. */
  asset?: StudioAsset | null;
  /** Severidad sin asset (chip del slot: "warn"→"warning-soft", "error"→"error"). */
  severity?: "warning-strong" | "warning-soft" | "error";
  /** Mensaje principal override (chip del slot: px reales vs requeridos). */
  message?: string;
  /** Recomendación específica override (default: la del asset). */
  recommendation?: string | null;
  /** Thumbnail override (chip del slot usa la URL de la foto asignada). */
  imageUrl?: string | null;
  /**
   * CTA opcional (picker: "Usar de todos modos"), en estilo outline junto al
   * "Entendido" primario morado. Si hay actionLabel + onAction, el footer
   * muestra ambos botones; quién llama decide si también cierra el modal.
   */
  actionLabel?: string;
  onAction?: () => void;
};

export function PhotoQualityModal({
  open,
  onClose,
  asset,
  severity,
  message,
  recommendation,
  imageUrl,
  actionLabel,
  onAction,
}: PhotoQualityModalProps) {
  const texts = useStudioTexts();
  const level = severity ?? asset?.validationLevel;
  // "error" (upload rechazado / chip del slot) comparte el tratamiento fuerte.
  const isStrong = level === "warning-strong" || level === "error";
  const isSoft = level === "warning-soft";
  const resolvedMessage = message ?? asset?.validationMessage ?? texts.fotos.calidadMensajeFallback;
  const resolvedRecommendation =
    recommendation !== undefined ? recommendation : asset?.validationRecommendation;
  const thumbUrl = imageUrl ?? asset?.signedUrl;
  // #15 — foco inicial + trap + Escape + retorno de foco.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose, active: open });

  // Guard SSR: el portal necesita document; en server no se renderiza nada
  // (el modal solo abre por interacción del cliente, ya hidratado).
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
          {/* Wrapper de centrado (fix STG 2026-10-07): el centrado vive AQUÍ
              y no en clases -translate-x/y-1/2 del panel — framer-motion
              escribe `transform` inline en el panel para la animación
              (scale/y) y no debe competir con el centrado. Además el panel
              pasa a flex-col con max-h en dvh: en viewports bajos (móvil
              HORIZONTAL, p.ej. 844×390) el contenido antes se salía de
              pantalla y el footer con "Entendido" quedaba INALCANZABLE.
              pointer-events-none en el wrapper: los clics fuera del panel
              caen en el backdrop (cierra el modal). */}
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Modal */}
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="photo-quality-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="ring-brand-purple/10 pointer-events-auto flex max-h-[90dvh] w-[92vw] max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1"
            >
              {/* Header con icono según severidad — shrink-0: siempre visible,
                  no lo comprime el scroll del body. */}
              <div
                className={[
                  "flex shrink-0 items-start gap-3 px-5 pt-5 pb-3",
                  isStrong ? "bg-red-50" : "bg-amber-50",
                ].join(" ")}
              >
                <div
                  className={[
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl shadow ring-2 ring-white",
                    isStrong ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800",
                  ].join(" ")}
                  aria-hidden
                >
                  {isStrong ? "⚠️" : "ⓘ"}
                </div>
                <div className="flex-1">
                  <h2
                    id="photo-quality-title"
                    className={[
                      "text-base leading-tight font-bold",
                      isStrong ? "text-red-800" : "text-amber-900",
                    ].join(" ")}
                  >
                    {isStrong ? texts.fotos.calidadTituloFuerte : texts.fotos.calidadTituloSuave}
                  </h2>
                  <p
                    className={[
                      "mt-1 text-xs",
                      isStrong ? "text-red-700/85" : "text-amber-800/85",
                    ].join(" ")}
                  >
                    {isSoft ? texts.fotos.calidadSubSuave : texts.fotos.calidadSubFuerte}
                  </p>
                </div>
              </div>

              {/* Body con thumbnail + mensaje — zona SCROLLEABLE: es la única
                que cede altura (min-h-0) cuando el viewport es bajo. */}
              <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto px-5 py-4">
                {/* Thumb grande (opcional: el chip del slot siempre la tiene) */}
                {thumbUrl && (
                  <div className="ring-brand-purple/10 h-24 w-24 shrink-0 overflow-hidden rounded-md ring-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl}
                      alt={texts.fotos.fotoRevisionAlt}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col justify-center text-sm">
                  <p className="text-brand-purple-dark leading-snug font-medium">
                    {resolvedMessage}
                  </p>
                  {/* Paquete C (2026-10-02) — la recomendación ESPECÍFICA del caso
                    (resolución / nitidez / luz, generada por el servidor) es el
                    contenido principal; los tips generales CMS quedan secundarios. */}
                  {resolvedRecommendation && (
                    <div
                      className={[
                        "mt-2 rounded-lg px-3 py-2 text-xs leading-snug",
                        isStrong ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900",
                      ].join(" ")}
                    >
                      <p className="font-bold">{texts.fotos.calidadRecomendacionTitulo}</p>
                      <p className="mt-0.5">{resolvedRecommendation}</p>
                    </div>
                  )}
                  <div className="text-brand-muted mt-2 space-y-1 text-xs">
                    <p className="font-semibold">{texts.fotos.calidadAccionesTitulo}</p>
                    <ul className="ml-3 list-disc space-y-0.5">
                      <li>{texts.fotos.calidadTip1}</li>
                      <li>{texts.fotos.calidadTip2}</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Footer actions — "Entendido" es el CTA primario (morado sólido,
                feedback STG 2026-10: el ghost pasaba desapercibido); la acción
                secundaria ("Usar de todos modos") va en outline. */}
              <div className="border-brand-purple/10 flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3">
                {actionLabel && onAction && (
                  <button
                    type="button"
                    onClick={onAction}
                    className="border-brand-purple/40 text-brand-purple-dark hover:bg-brand-purple/10 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors"
                  >
                    {actionLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-brand-purple hover:bg-brand-purple-dark focus:ring-brand-turquoise rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors focus:ring-2 focus:outline-none"
                >
                  {texts.fotos.calidadCerrar}
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
