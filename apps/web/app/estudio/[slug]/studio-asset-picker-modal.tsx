"use client";

/*
 * StudioAssetPickerModal — modal "tap-on-slot" para asignar foto (M.3.b Capa 2).
 *
 * Flujo:
 *   1. Cliente click/tap en un slot del grid → padre abre este modal
 *   2. Zona fija arriba: consentimiento + "Subir nueva" (siempre accesible)
 *   3. Tabs sticky (Fase 2 · 2.5): "Mis fotos" PRIMERO + "Diseños prediseñados"
 *      segundo (solo si hay prediseñados y mode !== "profile" — para la foto de
 *      perfil IG no aplican). Antes era UN solo scroll con los prediseñados
 *      primero y "Mis fotos" sepultada al fondo.
 *   4. Click en asset → asignAssetToSlot + cierra modal
 *   5. Click "Subir nueva" → input file nativo + subir + asignar al slot
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
import { processPhotoFiles } from "./lib/upload-photo-pipeline";
import { predesignedFaceBadge } from "./lib/predesigned-variety";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";
import { ConsentText } from "./studio-consent-text";
import { PhotoQualityModal } from "./photo-quality-modal";
import { Hint } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Niveles de validación que abren el modal de calidad antes de asignar. */
function hasQualityWarning(asset: StudioAsset): boolean {
  return (
    asset.validationLevel === "warning-soft" ||
    asset.validationLevel === "warning-strong" ||
    asset.validationLevel === "error"
  );
}

/** Fase 2 · 2.5 — estilo segmented-control de los tabs del picker. */
const PICKER_TAB_TRIGGER_CLASS =
  "text-brand-muted data-[state=active]:text-brand-purple-dark flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-colors data-[state=active]:bg-white data-[state=active]:shadow-sm";

/** Diseño prediseñado de la galería (ADR-057 B2). */
export type PredesignedItem = {
  id: string;
  name: string;
  imageUrl: string;
  /** Ola 21 — URL opcional de la cara B (pares A/B para separadores). */
  imageUrlB?: string | null;
  /**
   * Fase 3 · 3.10 (2026-10-07) — miniatura ~800px WebP con watermark LUCAMS:
   * es lo que se exhibe (el original no debería llegar al navegador del
   * cliente — anti-copia + peso). null hasta que corra el backfill de las
   * filas históricas → fallback transitorio al imageUrl original.
   */
  thumbUrl?: string | null;
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
  /**
   * Ola 17 — propósito del picker: "photo" (default) asigna la foto principal del
   * slot; "profile" asigna la FOTO DE PERFIL del header del post (plantilla Polaroid
   * Instagram). En modo profile cambia título/bajada y oculta los diseños
   * prediseñados (no aplican a la foto de perfil).
   */
  mode?: "photo" | "profile";
  onClose: () => void;
  /** Ola 21 — ahora recibe el slot target para poder reubicar A/B en separadores. */
  onSelectAsset: (slotIndex: number, asset: StudioAsset) => void;
  /** Ola 21 — callback opcional para asignar el asset de la cara B en separadores. */
  onSelectAssetB?: (slotIndex: number, asset: StudioAsset) => void;
  onAssetUploaded: (asset: StudioAsset) => void;
  /**
   * Paquete A (2026-10-02) — DEDUPE de prediseñados: cache de sesión del
   * diseño (store). Si el mismo galleryImageId ya se subió, se reusan sus
   * assets en vez de crear una copia en el servidor por aplicación.
   */
  getCachedPredesigned?: (
    galleryImageId: string,
  ) => { a: StudioAsset; b?: StudioAsset } | undefined;
  rememberPredesigned?: (
    galleryImageId: string,
    entry: { a: StudioAsset; b?: StudioAsset },
  ) => void;
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
  mode = "photo",
  onClose,
  onSelectAsset,
  onSelectAssetB,
  onAssetUploaded,
  getCachedPredesigned,
  rememberPredesigned,
}: StudioAssetPickerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  // Lucy 2026-09-09 — estado de PROCESANDO al elegir una foto ya subida
  // ("Cambiar foto"): el commit al store es instantáneo pero el re-render
  // Konva de la grilla tarda un frame largo; sin feedback el pick parecía
  // no haber funcionado. Spinner sobre la miniatura + resto deshabilitado,
  // mismo patrón Loader2 del botón «Aplicar» (texto/filtros).
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const assigningTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (assigningTimerRef.current !== null) window.clearTimeout(assigningTimerRef.current);
    },
    [],
  );
  // Fix STG (2026-10-05) — el componente vive SIEMPRE montado (el editor solo lo
  // oculta con isOpen), así que el estado "procesando" sobrevivía al cierre:
  // reabrir el picker para otro slot dejaba TODAS las miniaturas deshabilitadas
  // y el spinner para siempre. Al cerrar se limpian ambos estados de progreso
  // (patrón "ajustar estado durante el render" — setState directo en efecto
  // dispara renders en cascada, react-hooks/set-state-in-effect) y cualquier
  // timer pendiente.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setAssigningId(null);
      setApplyingId(null);
    }
  }
  useEffect(() => {
    if (isOpen) return;
    if (assigningTimerRef.current !== null) {
      window.clearTimeout(assigningTimerRef.current);
      assigningTimerRef.current = null;
    }
  }, [isOpen]);
  const [error, setError] = useState<string | null>(null);
  // Paridad desktop/móvil (2026-10-02) — click en foto con warning NO asigna
  // directo: abre el PhotoQualityModal (mismo del sidebar) con CTA "Usar de
  // todos modos" que sí asigna. Fotos sin warning mantienen 1-click.
  const [qualityAsset, setQualityAsset] = useState<StudioAsset | null>(null);
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
      // Paquete A — dedupe: el mismo diseño ya aplicado en esta sesión reusa
      // sus assets (no se sube una copia al servidor por aplicación).
      const cached = getCachedPredesigned?.(item.id);
      let assetA: StudioAsset;
      let assetB: StudioAsset | undefined;
      if (cached) {
        assetA = cached.a;
        assetB = cached.b;
      } else {
        const res = await assignPredesignedToDesignAction({ designId, galleryImageId: item.id });
        if (!res.ok) {
          setError(res.message);
          return;
        }
        assetA = {
          id: res.assetId,
          signedUrl: res.signedUrl,
          width: res.width,
          height: res.height,
        };
        assetB = res.assetB
          ? {
              id: res.assetB.assetId,
              signedUrl: res.assetB.signedUrl,
              width: res.assetB.width,
              height: res.assetB.height,
            }
          : undefined;
        onAssetUploaded(assetA);
        if (assetB) onAssetUploaded(assetB);
        rememberPredesigned?.(item.id, assetB ? { a: assetA, b: assetB } : { a: assetA });
      }

      const isTwoFace = facesPerUnit === 2 && assetB;
      if (isTwoFace && assetB) {
        const isCurrentB = slotIndex % 2 === 1;
        const slotA = isCurrentB ? Math.max(0, slotIndex - 1) : slotIndex;
        const slotB = isCurrentB ? slotIndex : slotIndex + 1;
        onSelectAsset(slotA, assetA);
        // Paquete A — la cara B NO pisa un slot ocupado: el guard vive en el
        // callback del editor (handleAssetBSelected), que avisa con toast CMS.
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

  // Elegir una foto ya subida: el commit va un frame DESPUÉS para que el
  // spinner pinte primero (mismo motivo que «Aplicar»: commit + repaint pesado
  // en el mismo tick = spinner invisible). El cierre espera un mínimo visible
  // para que el feedback se perciba antes de que la modal desaparezca.
  const handlePickAsset = (asset: StudioAsset) => {
    if (assigningId || slotIndex === null) {
      if (slotIndex === null) onClose();
      return;
    }
    setAssigningId(asset.id);
    requestAnimationFrame(() => {
      onSelectAsset(slotIndex, asset);
      assigningTimerRef.current = window.setTimeout(() => {
        assigningTimerRef.current = null;
        setAssigningId(null);
        onClose();
      }, 450);
    });
  };

  // #15 — foco inicial + trap + Escape + retorno de foco (reutiliza modalRef; activo si isOpen).
  // Mientras el PhotoQualityModal está abierto ENCIMA (z-50), este trap se
  // desactiva: Escape/foco los maneja el modal de calidad (si no, Escape
  // cerraría ambos modales de una).
  useDialogA11y(modalRef, { onClose, active: isOpen && qualityAsset === null });

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

  // Fix STG (2026-10-05) — pipeline UNIFICADO con el sidebar "Mis fotos"
  // (lib/upload-photo-pipeline): antes este camino subía el archivo CRUDO
  // (fotos de iPhone de 5-8 MB) sin upscale ni compresión → más lento y
  // candidato al 413 de Vercel (~4.5 MB por request). Misma secuencia
  // upscale → compresión → upload y concurrencia tope 3; los assets se
  // publican en orden de selección (misma regla del sidebar).
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploading(true);
    setError(null);
    try {
      await processPhotoFiles(list, {
        productSizeCm,
        designId,
        rightsAccepted,
        upload: uploadDesignAssetAction,
        onReady: (outcome) => {
          if (!outcome.ok) {
            // El loop viejo cortaba en el PRIMER error (break): con el pipeline
            // paralelo no se frena el resto, pero el mensaje visible sigue
            // siendo el primero.
            setError((prev) =>
              prev !== null
                ? prev
                : outcome.kind === "too-big"
                  ? `No pudimos subir "${outcome.fileName}": es muy grande para el servidor. Prueba con una foto de menos de ~4 MB (o baja la resolución en tu cámara).`
                  : outcome.kind === "server"
                    ? (outcome.serverMessage ?? texts.fotos.errorCalidadMinima)
                    : `No pudimos subir "${outcome.fileName}". Revisa tu conexión e inténtalo de nuevo.`,
            );
            return;
          }
          onAssetUploaded(outcome.asset);
          // M.3.b.B.2 — Si validación falló con error, mostrar warning prominente
          // pero NO auto-asignar (cliente decide).
          if (outcome.asset.validationLevel === "error") {
            setError(outcome.asset.validationMessage ?? texts.fotos.errorCalidadMinima);
            return;
          }
          // C2 — mejorada localmente y AÚN bajo el mínimo: mismo aviso del
          // sidebar. Solo multi-archivo: con 1 foto la modal cierra abajo y el
          // aviso no se vería (ese caso lo cubre el chip de calidad del slot).
          if (outcome.improvedButLow && list.length > 1) {
            setError(fillStudioText(texts.fotos.avisoMejoraAuto, { size: productSizeCm ?? "" }));
          }
          // Auto-asignar al slot si solo se subió 1 archivo (y no hay error)
          if (list.length === 1) {
            if (slotIndex !== null) onSelectAsset(slotIndex, outcome.asset);
            onClose();
          }
        },
      });
    } finally {
      setUploading(false);
    }
  };

  const titleId = "asset-picker-title";
  const descId = "asset-picker-desc";
  // Fase 2 · 2.5 — el tab "Prediseñados" solo existe cuando aplica (hay diseños
  // y NO es el picker de foto de perfil IG: ahí los prediseñados no aplican).
  const showPredesignedTab = mode !== "profile" && predesigned.length > 0;

  // Click en una foto ya subida: con aviso de calidad abre el modal compartido;
  // sin aviso asigna directo (1 click). Handler nombrado — inline en el JSX del
  // helper dispara el análisis de refs de react-hooks (handlePickAsset usa un ref).
  const handleAssetCellClick = (asset: StudioAsset) => {
    if (hasQualityWarning(asset)) {
      setQualityAsset(asset);
    } else {
      handlePickAsset(asset);
    }
  };

  /* ADR-057 B2 — Diseños prediseñados: aplica uno listo al slot. En tabs ya no
    lleva encabezado propio (el tab lo rotula). Elemento const (no función):
    los handlers quedan en el cuerpo del componente — como función llamada
    durante render, el análisis de react-hooks/refs marca falsos positivos. */
  const predesignedContent = (
    <div className="grid grid-cols-3 gap-2">
      {predesigned.map((item) => {
        const faceBadge = predesignedFaceBadge(facesPerUnit, item.imageUrlB);
        return (
          <Hint key={item.id} content={item.name}>
            <button
              type="button"
              onClick={() => handleApplyPredesigned(item)}
              disabled={applyingId !== null}
              aria-label={fillStudioText(texts.plantillas.aplicarDisenoAria, {
                nombre: item.name,
              })}
              className="border-brand-purple/20 hover:border-brand-purple focus:border-brand-turquoise focus:ring-brand-turquoise relative aspect-square overflow-hidden rounded-md border-2 transition-all hover:scale-105 focus:ring-2 focus:outline-none disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.thumbUrl ?? item.imageUrl}
                alt={item.name}
                className="h-full w-full object-cover"
                loading="lazy"
                // 3.10 — disuasión anti-copia: sin drag al escritorio ni menú
                // contextual ("Guardar imagen como…") sobre la miniatura.
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
              {/* Paquete A — badge 1/2 caras (solo productos de
              2 caras): "1 cara" = respaldo EN BLANCO (regla única
              de cara B vacía, owner 2026-10-07). */}
              {faceBadge && (
                <Hint
                  content={
                    faceBadge === "two"
                      ? texts.plantillas.badgeDosCarasTitle
                      : texts.plantillas.badgeUnaCaraTitle
                  }
                >
                  {/* stopPropagation: el badge vive DENTRO del botón
                    con su propio Hint — sin esto el hover abriría
                    ambos tooltips. */}
                  <span
                    onPointerMove={(e) => e.stopPropagation()}
                    className="text-brand-purple-dark absolute top-1 left-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-bold shadow"
                  >
                    {faceBadge === "two"
                      ? texts.plantillas.badgeDosCaras
                      : texts.plantillas.badgeUnaCara}
                  </span>
                </Hint>
              )}
              {applyingId === item.id && (
                <div className="bg-brand-purple-dark/40 absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </button>
          </Hint>
        );
      })}
    </div>
  );

  /* Tab "Mis fotos" (assets ya subidos) — elemento const, sin encabezado: con
    tabs el propio tab rotula el panel; sin tabs el encabezado se pone en el
    sitio de uso (ver rama `showPredesignedTab` del cuerpo). */
  const misFotosContent = (
    <>
      {assets.length > 0 && (
        <div role="grid" aria-label={texts.fotos.tusFotosAria} className="grid grid-cols-3 gap-2">
          {assets.map((asset) => (
            // 2026-10-02 — misma decisión que la sidebar: los badges
            // de texto van en una fila-caption DEBAJO del thumbnail
            // (fuera del overflow-hidden), no flotando sobre la imagen.
            <button
              key={asset.id}
              type="button"
              role="gridcell"
              onClick={() => handleAssetCellClick(asset)}
              disabled={assigningId !== null}
              aria-busy={assigningId === asset.id}
              aria-label={
                asset.validationMessage
                  ? `Asignar foto al slot. Aviso: ${asset.validationMessage}`
                  : "Asignar esta foto al slot"
              }
              className="focus:ring-brand-turquoise flex flex-col gap-1 rounded-md focus:ring-2 focus:outline-none disabled:opacity-50"
            >
              <div className="border-brand-purple/20 hover:border-brand-purple focus-within:border-brand-turquoise relative aspect-square overflow-hidden rounded-md border-2 transition-all hover:scale-105 disabled:scale-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.signedUrl}
                  alt={texts.fotos.fotoSubidaAlt}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {/* Lucy 2026-09-09 — spinner sobre la miniatura elegida
                    mientras el commit + re-render Konva corren. */}
                {assigningId === asset.id && (
                  <div className="bg-brand-purple-dark/40 absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
              </div>
              {/* M.3.b.B.2 — Badge de validación calidad foto.
                  Paquete C (2026-10-02): badge con texto corto y
                  color por severidad (antes solo un emoji 10px).
                  A11Y: aria-hidden — el aviso ya va en el
                  aria-label del botón. */}
              {(asset.validationLevel === "warning-strong" ||
                asset.validationLevel === "warning-soft") && (
                <div className="flex flex-wrap items-center gap-1">
                  {asset.validationLevel === "warning-strong" && (
                    <span
                      className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-800"
                      aria-hidden
                    >
                      ⚠️ {texts.fotos.badgeRevisar}
                    </span>
                  )}
                  {asset.validationLevel === "warning-soft" && (
                    <span
                      className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900"
                      aria-hidden
                    >
                      ⚠️ {texts.fotos.badgeRevisar}
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {assets.length === 0 && !uploading && (
        <p className="text-brand-muted mt-4 text-center text-xs italic">
          {texts.fotos.pickerVacio}
        </p>
      )}
    </>
  );

  return (
    <>
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
                  className="shadow-brand-purple/30 flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl"
                >
                  {/* Header */}
                  <div className="border-brand-purple/10 flex shrink-0 items-center justify-between border-b px-5 py-4">
                    <div>
                      <h2 id={titleId} className="text-brand-purple-dark font-display text-lg">
                        {mode === "profile"
                          ? texts.texto.perfilPickerTitulo
                          : fillStudioText(texts.fotos.pickerTitulo, {
                              n: (slotIndex ?? 0) + 1,
                              total: totalSlots,
                            })}
                      </h2>
                      <p id={descId} className="text-brand-muted mt-0.5 text-xs">
                        {mode === "profile" ? texts.texto.perfilPickerDesc : texts.fotos.pickerDesc}
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

                  {/* Zona fija (Fase 2 · 2.5): consentimiento + "Subir nueva" NO
                    scrollean — quedan accesibles desde cualquier tab. */}
                  <div className="shrink-0 px-5 pt-4">
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
                  </div>

                  {/* Zona scrolleable: tabs sticky (Fase 2 · 2.5) — "Mis fotos"
                    PRIMERO. Sin prediseñados (o modo profile) no hay tabs: el
                    grid de Mis fotos va directo, como antes. */}
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-4">
                    {showPredesignedTab ? (
                      <Tabs defaultValue="fotos">
                        {/* Sticky: en móvil los tabs quedan visibles mientras el
                          grid scrollea. El wrapper blanco (-mx-5) tapa el
                          contenido que pasa por debajo. */}
                        <div className="sticky top-0 z-10 -mx-5 bg-white px-5 pb-2">
                          <TabsList
                            aria-label={texts.fotos.pickerTabsAria}
                            className="bg-brand-purple/5 flex w-full gap-1 rounded-lg p-1"
                          >
                            <TabsTrigger value="fotos" className={PICKER_TAB_TRIGGER_CLASS}>
                              <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                              {texts.fotos.pickerTabFotos}
                              <span className="tabular-nums">({assets.length})</span>
                            </TabsTrigger>
                            <TabsTrigger value="predisenados" className={PICKER_TAB_TRIGGER_CLASS}>
                              <Sparkles className="h-3.5 w-3.5" aria-hidden />
                              {texts.fotos.pickerTabPredisenados}
                              <span className="tabular-nums">({predesigned.length})</span>
                            </TabsTrigger>
                          </TabsList>
                        </div>
                        <TabsContent value="fotos" className="mt-3">
                          {misFotosContent}
                        </TabsContent>
                        <TabsContent value="predisenados" className="mt-3">
                          {predesignedContent}
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <>
                        {assets.length > 0 && (
                          <h3 className="text-brand-purple-dark mt-5 mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                            <ImageIcon className="text-brand-purple h-3.5 w-3.5" />
                            {texts.fotos.titulo} ({assets.length})
                          </h3>
                        )}
                        {misFotosContent}
                      </>
                    )}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Paridad desktop/móvil (2026-10-02) — el click en una foto con warning
        abre este modal (z-50, encima del picker z-40) en vez de asignar
        directo. "Usar de todos modos" confirma la asignación por el mismo
        handlePickAsset del flujo sin warning. */}
      <PhotoQualityModal
        open={qualityAsset !== null}
        onClose={() => setQualityAsset(null)}
        asset={qualityAsset}
        actionLabel={texts.fotos.calidadUsarDeTodosModos}
        onAction={() => {
          const pending = qualityAsset;
          setQualityAsset(null);
          if (pending) handlePickAsset(pending);
        }}
      />
    </>
  );
}
