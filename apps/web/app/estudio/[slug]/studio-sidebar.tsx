"use client";

/*
 * StudioSidebar — Mis fotos + Plantillas + Auto-fill (M.3.b Capa 2).
 *
 * Diferencias vs sidebar M.3:
 *   - Progress bar X/N + indicador visual completo
 *   - Botón "🪄 Llenar slots con mis fotos" con stagger animation
 *   - Lista assets con drag handle nativo + click-to-assign al slot seleccionado
 *   - Plantillas con preview card + ring on selected + click apply
 *
 * El sidebar es store-aware: lee de zustand selectivamente.
 */

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Image as ImageIcon,
  Sparkles,
  Wand2,
  Loader2,
  Check,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { uploadDesignAssetAction } from "@/features/personalization/actions";
import {
  applyPredesignedToSlot,
  applyPredesignedVarietyToEmptySlots,
  PREDESIGNED_DRAG_MIME,
} from "./lib/apply-predesigned";
import { predesignedFaceBadge } from "./lib/predesigned-variety";
import { StudioMessageField } from "./studio-message-field";
import { ConsentText } from "./studio-consent-text";
import {
  selectAssetIsUsed,
  selectFilledSlotCount,
  selectTotalSlotCount,
  type StudioStoreState,
} from "./lib/store";
import { STUDIO_ACCEPTED_IMAGE_TYPES, uploadGuidanceText } from "./lib/upload-guidance";
import { processPhotoFiles } from "./lib/upload-photo-pipeline";
import type { StudioAsset, StudioTemplate } from "./types";
import { PhotoQualityModal } from "./photo-quality-modal";
import { Hint } from "@/components/ui/tooltip";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

type StudioSidebarProps = {
  store: StoreApi<StudioStoreState>;
  productName: string;
  productSku: string;
  /** P0.7 — tamaño físico del producto para mostrar bajo cada plantilla. */
  productSizeCm?: string;
  /** P0.7 — forma física para borde redondeado realista de la card. */
  productShape?: "rectangle" | "circle" | "heart" | "custom";
  /** Ola 3 — el producto admite texto editable (Polaroid). Habilita el campo "Tu mensaje". */
  allowText?: boolean;
  /** Ola 21 — diseños prediseñados aplicables por slot (galería admin). */
  predesigned?: import("./studio-asset-picker-modal").PredesignedItem[];
  /** Paquete A (2026-10-02) — caras del producto: badges 1/2 caras de los
   *  prediseñados y llenado variado por pares A/B (default 1). */
  facesPerUnit?: number;
};

export function StudioSidebar({
  store,
  productName,
  productSku,
  productSizeCm,
  productShape,
  allowText = false,
  predesigned = [],
  facesPerUnit = 1,
}: StudioSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Consentimiento de derechos de imagen (Ley 1581): obligatorio antes de subir.
  const [rightsAccepted, setRightsAccepted] = useState(false);
  // P0.2 — Toggle "ocultar usadas" tipo Mixbook Hide Used.
  const [hideUsed, setHideUsed] = useState(false);
  // C2 (owner 2026-09-15) — fotos ajustadas automáticamente al subir (upscale
  // local, client-photo-upscale): Set de assetIds para el badge "✨ Optimizada"
  // del thumb (el servidor recibe la versión ya ajustada y no puede saberlo).
  // Alcance de sesión del Estudio, suficiente para el badge.
  const [improvedAssetIds, setImprovedAssetIds] = useState<ReadonlySet<string>>(new Set());
  const texts = useStudioTexts();

  // Suscripciones selectivas zustand
  const assets = useStore(store, (s) => s.assets);
  const templates = useStore(store, (s) => s.templates);
  const selectedTemplateId = useStore(store, (s) => s.selectedTemplateId);
  const designId = useStore(store, (s) => s.designId);
  // Suscripciones atómicas — evita re-render infinito por shallow compare de array nested.
  const filledSlots = useStore(store, selectFilledSlotCount);
  const totalSlots = useStore(store, selectTotalSlotCount);
  const addAsset = useStore(store, (s) => s.addAsset);
  const autoFillSlots = useStore(store, (s) => s.autoFillSlots);
  const applyTemplate = useStore(store, (s) => s.applyTemplate);
  const selectedSlotIndex = useStore(store, (s) => s.selectedSlotIndex);
  const [applyingPredesignedId, setApplyingPredesignedId] = useState<string | null>(null);

  // Ola 21 — aplicar un diseño prediseñado al slot seleccionado (o al primer slot vacío).
  // 2026-09-22 — la aplicación vive en applyPredesignedToSlot (helper compartido
  // con el drop del lienzo): misma vía para clic y drag & drop.
  const handleApplyPredesigned = async (
    item: import("./studio-asset-picker-modal").PredesignedItem,
  ) => {
    if (!designId || applyingPredesignedId) return;
    const targetSlot =
      selectedSlotIndex ??
      store.getState().canvasData?.slots.find((s) => !s.assetUrl)?.slotIndex ??
      null;
    if (targetSlot === null) {
      toast.error(texts.plantillas.toastSinSlot);
      return;
    }
    setApplyingPredesignedId(item.id);
    try {
      const res = await applyPredesignedToSlot({ store, item, targetSlot, facesPerUnit });
      if (!res.ok) {
        toast.error(res.message || texts.plantillas.toastError);
        return;
      }
      toast.success(fillStudioText(texts.plantillas.toastPredisenado, { nombre: item.name }));
      // Paquete A — la cara B no se descarta en silencio: si su slot estaba
      // ocupado se avisa (no se pisa el contenido del usuario).
      if (res.bBlocked) toast.warning(texts.plantillas.toastCaraBOcupada);
    } catch (err) {
      toast.error(texts.plantillas.toastError);
      void err;
    } finally {
      setApplyingPredesignedId(null);
    }
  };

  // Paquete A (2026-10-02) — llenado VARIADO: recorre el catálogo del tag sin
  // repetir diseño mientras haya variedad (bug: 20 slots con el mismo diseño).
  // Las caras B ocupadas se respetan y se avisan en una sola pasada.
  const [applyingVariety, setApplyingVariety] = useState(false);
  const handleFillWithVariety = async () => {
    if (!designId || applyingVariety || applyingPredesignedId) return;
    setApplyingVariety(true);
    try {
      const res = await applyPredesignedVarietyToEmptySlots({
        store,
        items: predesigned,
        facesPerUnit,
      });
      if (res.failed) toast.error(texts.plantillas.toastError);
      if (res.applied > 0) {
        toast.success(fillStudioText(texts.plantillas.toastPredisenadoVarios, { n: res.applied }));
      }
      if (res.bBlockedCount > 0) toast.warning(texts.plantillas.toastCaraBOcupada);
    } catch {
      toast.error(texts.plantillas.toastError);
    } finally {
      setApplyingVariety(false);
    }
  };

  // Fix STG (2026-10-05, "subir fotos es demorado") — pipeline UNIFICADO con el
  // picker modal (lib/upload-photo-pipeline): misma secuencia upscale →
  // compresión → upload por archivo, con hasta 3 archivos en vuelo (antes era
  // estrictamente secuencial). Los resultados se publican EN ORDEN de selección:
  // el orden de "Mis fotos" define la asignación de «Llenar slots», así que no
  // puede depender de cuál foto terminó primero.
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(files.length);
    setUploadError(null);
    try {
      await processPhotoFiles(Array.from(files), {
        productSizeCm,
        designId,
        rightsAccepted,
        upload: uploadDesignAssetAction,
        onReady: (outcome) => {
          setUploading((n) => Math.max(0, n - 1));
          if (!outcome.ok) {
            setUploadError(
              outcome.kind === "too-big"
                ? `No pudimos subir "${outcome.fileName}": es muy grande para el servidor. Prueba con una foto de menos de ~4 MB (o baja la resolución en tu cámara).`
                : outcome.kind === "server"
                  ? (outcome.serverMessage ?? texts.fotos.errorCalidad)
                  : `No pudimos subir "${outcome.fileName}". Revisa tu conexión e inténtalo de nuevo.`,
            );
            return;
          }
          addAsset(outcome.asset);
          // C2 — la foto se re-muestreó en el navegador antes de subir: marcarla
          // para el badge "✨ Optimizada" del thumb (el servidor recibe la versión
          // ya ajustada y no puede saberlo).
          if (outcome.improved) {
            const { id } = outcome.asset;
            setImprovedAssetIds((prev) => new Set(prev).add(id));
          }
          // M.3.b.B.2 — Si la foto subió con calidad insuficiente, mostrar
          // banner naranja persistente con el mensaje (cliente decide si usarla).
          // C2 — si ya la mejoramos automáticamente y AÚN así quedó bajo el
          // mínimo para imprimir, el aviso lo explica (mensaje mejorado).
          if (outcome.improvedButLow) {
            setUploadError(
              fillStudioText(texts.fotos.avisoMejoraAuto, { size: productSizeCm ?? "" }),
            );
          } else if (
            outcome.asset.validationLevel === "warning-strong" ||
            outcome.asset.validationLevel === "error"
          ) {
            setUploadError(outcome.asset.validationMessage ?? texts.fotos.errorCalidad);
          }
        },
      });
    } finally {
      setUploading(0);
    }
  };

  const onDragStartAsset = (e: React.DragEvent<HTMLDivElement>, asset: StudioAsset) => {
    e.dataTransfer.setData("application/lucams-asset", JSON.stringify(asset));
    e.dataTransfer.effectAllowed = "copy";
  };

  const emptySlots = totalSlots - filledSlots;
  // Botón mágico: con 1+ fotos alcanza para mostrarlo — autoFillSlots llena los slots
  // vacíos que pueda con lo subido, sin repetir fotos (el resto queda vacío). La regla
  // Ola 21 (exigir fotos para TODOS los vacíos) se retiró: en un calendario de 12 slots
  // obligaba a subir las 12 fotos antes de siquiera ver el botón.
  const canAutoFill = assets.length > 0 && emptySlots > 0;

  return (
    <div className="flex h-full flex-col gap-6 p-5">
      {/* Producto info */}
      <div>
        <p className="text-brand-purple-dark text-sm font-semibold">{productName}</p>
        <p className="text-brand-muted mt-0.5 text-xs">SKU {productSku}</p>
      </div>

      {/* Progress bar X/N — el feedback más importante del editor */}
      <ProgressBar filled={filledSlots} total={totalSlots} />

      {/* ──────── Mis fotos ──────── */}
      <section aria-labelledby="sidebar-mis-fotos">
        <div
          id="sidebar-mis-fotos"
          className="text-brand-purple-dark mb-3 flex items-center justify-between gap-2 text-sm font-semibold"
        >
          <span className="flex items-center gap-2">
            <ImageIcon className="text-brand-purple h-4 w-4" />
            {texts.fotos.titulo}
            {assets.length > 0 && (
              <span className="text-brand-muted text-[10px] font-medium tabular-nums">
                ({assets.length})
              </span>
            )}
          </span>
          {/* P0.2 — Toggle "Solo no usadas" (Mixbook Hide Used) — solo visible si hay fotos */}
          {assets.length > 1 && (
            <Hint
              content={hideUsed ? texts.fotos.toggleTitleTodas : texts.fotos.toggleTitleOcultar}
            >
              <button
                type="button"
                onClick={() => setHideUsed((v) => !v)}
                aria-pressed={hideUsed}
                className={[
                  "text-[10px] font-bold tracking-wide uppercase transition-colors",
                  hideUsed
                    ? "text-brand-turquoise"
                    : "text-brand-muted hover:text-brand-purple-dark/70",
                ].join(" ")}
              >
                {hideUsed ? texts.fotos.toggleOcultar : texts.fotos.toggleTodas}
              </button>
            </Hint>
          )}
        </div>

        <label className="text-brand-purple-dark/80 mb-2 flex items-start gap-2 text-xs leading-snug">
          <input
            type="checkbox"
            checked={rightsAccepted}
            onChange={(e) => setRightsAccepted(e.target.checked)}
            className="accent-brand-purple mt-0.5 h-4 w-4 flex-shrink-0"
          />
          <span>
            <ConsentText template={texts.fotos.consentimiento} />
          </span>
        </label>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading > 0 || !rightsAccepted}
          aria-label={texts.fotos.subirAria}
          className="border-brand-purple/30 bg-brand-purple/5 text-brand-purple hover:bg-brand-purple/10 focus:ring-brand-purple flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed py-4 text-sm font-medium transition-colors focus:ring-2 focus:outline-none disabled:opacity-60"
        >
          {uploading > 0 ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {fillStudioText(texts.fotos.subiendo, { n: uploading })}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {texts.fotos.subirCta}
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={STUDIO_ACCEPTED_IMAGE_TYPES}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {/* Ola 4 (Lucy 2026-07-23) — formatos y resolución recomendada, visibles junto
            al punto de subida (texto centralizado en lib/upload-guidance.ts). */}
        <p className="text-brand-muted mt-2 text-[11px] leading-snug">
          {uploadGuidanceText(productSizeCm, {
            formats: texts.fotos.formatos,
            withPx: texts.fotos.guiaPx,
            generic: texts.fotos.guiaGenerica,
          })}
        </p>

        {uploadError && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            ⚠️ {uploadError}
          </p>
        )}

        {/* Auto-fill button — superhero del editor */}
        {canAutoFill && (
          <motion.button
            type="button"
            onClick={autoFillSlots}
            aria-label={fillStudioText(texts.fotos.autofillAria, {
              n: Math.min(emptySlots, assets.length),
            })}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-brand-turquoise/15 text-brand-purple-dark hover:bg-brand-turquoise/25 focus:ring-brand-turquoise mt-3 flex w-full items-center justify-center gap-1.5 rounded-md py-2.5 text-sm font-semibold transition-colors focus:ring-2 focus:outline-none"
          >
            <Wand2 className="text-brand-purple h-4 w-4" />
            {texts.fotos.autofillCta}
          </motion.button>
        )}

        {/* Lista de assets con drag handle + checkmark "usada" + filtro Hide Used */}
        {assets.length > 0 && (
          <div
            role="list"
            aria-label={texts.fotos.listaAria}
            className="mt-3 grid grid-cols-3 gap-2"
          >
            <AnimatePresence>
              {assets.map((asset, idx) => (
                <AssetThumb
                  key={asset.id}
                  store={store}
                  asset={asset}
                  idx={idx}
                  hideUsed={hideUsed}
                  autoImproved={improvedAssetIds.has(asset.id)}
                  onDragStart={(e) => onDragStartAsset(e, asset)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {assets.length === 0 && uploading === 0 && (
          <p className="text-brand-muted mt-3 text-xs italic">{texts.fotos.tipVacio}</p>
        )}

        {/* M.3.b.UX.6 — Microcopy cuando todos los slots están llenos pero
            hay fotos sin asignar: explicar que se pueden cambiar arrastrando. */}
        {assets.length > 0 && emptySlots === 0 && totalSlots > 0 && (
          <p className="text-brand-muted bg-brand-turquoise/10 mt-3 rounded-md px-2.5 py-2 text-xs">
            {texts.fotos.todoLleno}
          </p>
        )}
      </section>

      {/* ──────── Tu mensaje (Ola 3c — Polaroid Clásica: campo directo en la sidebar;
          tocar el texto del canvas sigue abriendo el editor completo como atajo) ──────── */}
      {allowText && <StudioMessageField store={store} />}

      {/* ──────── Plantillas ──────── */}
      <section
        aria-labelledby="sidebar-plantillas"
        className="border-brand-purple/10 border-t pt-5"
      >
        <div
          id="sidebar-plantillas"
          className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-semibold"
        >
          <Sparkles className="text-brand-purple h-4 w-4" />
          {texts.plantillas.titulo}
          <span className="text-brand-muted text-xs font-normal">({templates.length})</span>
        </div>

        {templates.length === 0 ? (
          <p className="text-brand-muted text-xs italic">{texts.plantillas.vacio}</p>
        ) : (
          <div
            role="radiogroup"
            aria-label={texts.plantillas.elegirAria}
            className="grid grid-cols-2 gap-2"
          >
            {templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                isSelected={tpl.id === selectedTemplateId}
                productSizeCm={productSizeCm}
                productShape={productShape}
                onClick={() => {
                  if (tpl.id === selectedTemplateId) return; // no-op si ya está
                  applyTemplate(tpl);
                  // A2.7 — Toast premium feedback
                  toast.success(
                    fillStudioText(texts.plantillas.toastAplicada, { nombre: tpl.name }),
                    {
                      duration: 2200,
                      icon: "✨",
                    },
                  );
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* ──────── Diseños prediseñados (galería admin) ──────── */}
      {predesigned.length > 0 && (
        <section
          aria-labelledby="sidebar-predisenados"
          className="border-brand-purple/10 border-t pt-5"
        >
          <div
            id="sidebar-predisenados"
            className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-semibold"
          >
            <Sparkles className="text-brand-purple h-4 w-4" />
            {texts.plantillas.predisenadosTitulo}
            <span className="text-brand-muted text-xs font-normal">({predesigned.length})</span>
          </div>
          <p className="text-brand-muted mb-2 text-[11px]">{texts.plantillas.predisenadosHint}</p>
          {/* Paquete A — llenado VARIADO de los slots vacíos (round-robin del
              catálogo: nunca N slots con el mismo diseño habiendo variedad). */}
          {emptySlots > 0 && (
            <button
              type="button"
              onClick={handleFillWithVariety}
              disabled={applyingVariety || applyingPredesignedId !== null}
              aria-label={texts.plantillas.predisenadosLlenarAria}
              className="bg-brand-turquoise/15 text-brand-purple-dark hover:bg-brand-turquoise/25 focus:ring-brand-turquoise mb-2 flex w-full items-center justify-center gap-1.5 rounded-md py-2.5 text-sm font-semibold transition-colors focus:ring-2 focus:outline-none disabled:opacity-60"
            >
              {applyingVariety ? (
                <Loader2 className="text-brand-purple h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="text-brand-purple h-4 w-4" />
              )}
              {texts.plantillas.predisenadosLlenarCta}
            </button>
          )}
          <div className="grid grid-cols-3 gap-2">
            {predesigned.map((item) => {
              const faceBadge = predesignedFaceBadge(facesPerUnit, item.imageUrlB);
              return (
                <Hint key={item.id} content={item.name}>
                  <button
                    type="button"
                    onClick={() => handleApplyPredesigned(item)}
                    disabled={applyingPredesignedId !== null || applyingVariety}
                    aria-label={fillStudioText(texts.plantillas.aplicarDisenoAria, {
                      nombre: item.name,
                    })}
                    // 2026-09-22 — drag & drop al lienzo (desktop): la tarjeta se
                    // arrastra hasta un slot (highlight de drop target ya existe en
                    // el slot). El clic sigue aplicando al slot seleccionado/vacío.
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        PREDESIGNED_DRAG_MIME,
                        JSON.stringify({ id: item.id, name: item.name }),
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="border-brand-purple/20 hover:border-brand-purple focus:border-brand-turquoise focus:ring-brand-turquoise relative aspect-square cursor-grab overflow-hidden rounded-md border-2 transition-all hover:scale-105 focus:ring-2 focus:outline-none active:cursor-grabbing disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      // La imagen interna no debe secuestrar el drag del botón.
                      draggable={false}
                    />
                    {/* Paquete A — badge 1/2 caras (solo productos de 2 caras):
                      "1 cara" = el respaldo se imprime espejo del frente (regla
                      única de cara B vacía — ver predesigned-variety.ts). */}
                    {faceBadge && (
                      <Hint
                        content={
                          faceBadge === "two"
                            ? texts.plantillas.badgeDosCarasTitle
                            : texts.plantillas.badgeUnaCaraTitle
                        }
                      >
                        {/* stopPropagation: el badge vive DENTRO del botón con su
                            propio Hint — sin esto el hover abriría ambos tooltips. */}
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
                    {applyingPredesignedId === item.id && (
                      <div className="bg-brand-purple-dark/40 absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                  </button>
                </Hint>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const texts = useStudioTexts();
  const pct = total > 0 ? (filled / total) * 100 : 0;
  const isComplete = filled === total && total > 0;
  const isEmpty = filled === 0;
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-brand-purple-dark text-xs font-semibold tracking-wider uppercase">
          {texts.fotos.progresoTitulo}
        </span>
        <span
          className={[
            "text-sm font-bold tabular-nums",
            // red-600 (#dc2626 ≈ 4.8:1 sobre crema) en vez de red-500 (#ef4444 ≈ 3.9:1):
            // el contador de progreso vacío no cumplía AA de contraste (auditoría experto 2026-07-26).
            isComplete ? "text-emerald-600" : isEmpty ? "text-red-600" : "text-brand-purple-dark",
          ].join(" ")}
        >
          {filled}/{total} {isComplete && <Check className="ml-0.5 inline h-4 w-4" aria-hidden />}
        </span>
      </div>
      <div className="bg-brand-purple/10 relative h-2 overflow-hidden rounded-full">
        <motion.div
          className={[
            "absolute inset-y-0 left-0 rounded-full",
            isComplete ? "bg-emerald-500" : "bg-brand-purple",
          ].join(" ")}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <p className="text-brand-muted mt-1.5 text-xs">
        {isComplete
          ? texts.fotos.progresoCompleto
          : isEmpty
            ? texts.fotos.progresoVacio
            : fillStudioText(texts.fotos.progresoFaltan, {
                n: total - filled,
                fotos: total - filled === 1 ? "foto" : "fotos",
              })}
      </p>
    </div>
  );
}

function TemplateCard({
  template,
  isSelected,
  productSizeCm,
  productShape,
  onClick,
}: {
  template: StudioTemplate;
  isSelected: boolean;
  productSizeCm?: string;
  productShape?: "rectangle" | "circle" | "heart" | "custom";
  onClick: () => void;
}) {
  const texts = useStudioTexts();
  // P0.7 — Card que renderea el imán físico real con la plantilla aplicada,
  // no un SVG plano flotando. Patrón Casetify: el cliente ve EXACTAMENTE cómo
  // se verá el producto físico (proporción real + sombra de grosor + forma).
  //
  // Mejoras vs A1.3:
  // - cornerRadius según productShape (rectangle = 8%, circle = full)
  // - Sombra exterior realista (multi-layer) simulando grosor 3mm
  // - Medida física visible bajo el nombre
  // - Aspect ratio del thumb deriva del aspect ratio del template (no siempre cuadrado)

  // Derivar aspect del template canvasData
  const templateAspect =
    template.canvasData?.stage?.width && template.canvasData.stage.height
      ? template.canvasData.stage.width / template.canvasData.stage.height
      : 1;
  const aspectClass =
    templateAspect > 1.1 ? "aspect-[4/3]" : templateAspect < 0.9 ? "aspect-[3/4]" : "aspect-square";

  // cornerRadius según shape físico
  const shapeRadiusClass =
    productShape === "circle"
      ? "rounded-full"
      : productShape === "rectangle"
        ? "rounded-md"
        : "rounded-md";

  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={`${fillStudioText(texts.plantillas.itemAria, { nombre: template.name })}${isSelected ? ` ${texts.plantillas.itemSeleccionada}` : ""}${productSizeCm ? ` ${fillStudioText(texts.plantillas.itemTamano, { size: productSizeCm })}` : ""}`}
      onClick={onClick}
      whileHover={{ scale: isSelected ? 1 : 1.03, y: isSelected ? 0 : -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className={[
        "group relative flex flex-col gap-1.5 overflow-hidden rounded-lg p-2 text-left transition-shadow focus:outline-none",
        isSelected
          ? "from-brand-turquoise/10 to-brand-purple/10 ring-brand-turquoise bg-gradient-to-br shadow-md ring-2"
          : "ring-brand-purple/15 hover:ring-brand-purple/40 focus-visible:ring-brand-turquoise ring-1 hover:shadow-md focus-visible:ring-2",
      ].join(" ")}
    >
      {/* Stage cream que simula la superficie sobre la que reposa el imán */}
      <div className="from-brand-cream/40 to-brand-cream/80 relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-gradient-to-br p-2">
        {/* "Imán físico" — thumb del SVG con sombra realista + cornerRadius físico */}
        <div
          className={[
            "relative overflow-hidden bg-white transition-transform duration-300 group-hover:scale-105",
            aspectClass,
            shapeRadiusClass,
          ].join(" ")}
          style={{
            maxWidth: "92%",
            maxHeight: "92%",
            // Sombra multi-capa simulando grosor 3mm del imán físico
            boxShadow:
              "0 1px 2px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.10), 0 8px 16px rgba(124,106,173,0.12)",
          }}
        >
          {/* FIX-4 — Dummy photo placeholder DEBAJO del SVG asset.
              Sin esto, plantillas tipo "Polaroid Romántica" (marco blanco
              sobre fondo blanco) eran invisibles en la card. El gradient
              pastel simula que hay una foto ahí. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, #F4ECFF 0%, #FFE5EC 35%, #FFF2D9 70%, #DDF5F3 100%)",
            }}
            aria-hidden
          />
          {/* Silueta pequeña tipo mascote en el centro del placeholder */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30">
            <span className="text-3xl" aria-hidden>
              💜
            </span>
          </div>
          {/* SVG marco — va ENCIMA del placeholder */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={template.previewUrl}
            alt=""
            aria-hidden
            className="relative h-full w-full object-contain"
            loading="lazy"
          />
          {/* Glossy overlay sutil simulando laminado del imán */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%)",
            }}
            aria-hidden
          />
        </div>

        {/* Check ✓ overlay al seleccionar */}
        {isSelected && (
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}
            className="bg-brand-turquoise absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full shadow-md ring-2 ring-white"
            aria-hidden
          >
            {/* A11Y — el ✓ es el único indicador de "elegida": blanco sobre turquesa daba 1.71:1
              y WCAG 1.4.11 (no-text contrast) pide 3:1. En brand-purple-dark queda 7.06:1. */}
            <Check className="text-brand-purple-dark h-3.5 w-3.5" strokeWidth={3} />
          </motion.div>
        )}
      </div>

      {/* Nombre + medida física */}
      <div className="flex flex-col gap-0.5 px-0.5">
        <p
          className={[
            "line-clamp-2 text-xs leading-tight font-semibold transition-colors",
            isSelected ? "text-brand-purple-dark" : "text-brand-purple-dark/80",
          ].join(" ")}
        >
          {template.name}
        </p>
        {productSizeCm && (
          <p className="text-brand-muted text-[10px] font-medium tabular-nums">
            📐 {productSizeCm} cm
          </p>
        )}
      </div>
    </motion.button>
  );
}

// ──────────────────────────────────────────────────────────────────
//  P0.2 — AssetThumb: thumb + green checkmark "usada" + hide filter
// ──────────────────────────────────────────────────────────────────
//
// Patrón Mixbook: cada foto del tray muestra un check verde si ya está pegada
// en algún slot. Filtro "Solo no usadas" oculta las usadas para que el cliente
// se enfoque solo en las pendientes. Reduce fricción y confusión.
//
// Implementación con selector ATÓMICO `selectAssetIsUsed(id)` (memoria
// feedback_react_atomic_selectors_no_arrays): cada thumb se suscribe solo a
// su propio bit boolean → no re-render cuando otro slot cambia.

function AssetThumb({
  store,
  asset,
  idx,
  hideUsed,
  autoImproved = false,
  onDragStart,
}: {
  store: StoreApi<StudioStoreState>;
  asset: StudioAsset;
  idx: number;
  hideUsed: boolean;
  /** C2 — la foto se mejoró automáticamente al subir (upscale local): badge "✨ Mejorada". */
  autoImproved?: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const isUsed = useStore(store, selectAssetIsUsed(asset.id));
  // P0.3 — Estado del modal de warning calidad (al click sobre thumb problemático)
  const [showQualityModal, setShowQualityModal] = useState(false);
  const texts = useStudioTexts();
  const hasWarning =
    asset.validationLevel === "warning-strong" || asset.validationLevel === "warning-soft";

  // Hide Used filter
  if (hideUsed && isUsed) return null;

  return (
    <>
      <Hint
        content={
          isUsed
            ? texts.fotos.thumbUsada
            : hasWarning
              ? texts.fotos.thumbAviso
              : texts.fotos.thumbArrastrar
        }
      >
        {/* 2026-10-02 — los badges de texto ("⚠️ Revisar" / "✨ Optimizada" /
          "✓ Agregada") ya NO flotan absolute sobre la imagen: el thumb es ~77px
          y los cubrían. El elemento animado del grid es ahora un wrapper
          vertical (conserva role="listitem", drag y las animaciones de
          AnimatePresence); la imagen queda limpia (solo el drag-handle
          hover-only dentro) y los chips viven en una fila-caption debajo.
          El click-to-quality-modal sigue en el wrapper: cubre el thumb Y los
          chips (click en "Revisar" también abre el modal por burbuja). */}
        <motion.div
          role="listitem"
          draggable
          onDragStart={(e) => onDragStart(e as unknown as React.DragEvent<HTMLDivElement>)}
          onClick={hasWarning ? () => setShowQualityModal(true) : undefined}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.2, delay: idx * 0.04 }}
          className="group/thumb flex cursor-grab flex-col gap-1 active:cursor-grabbing"
        >
          <div
            className={[
              "relative aspect-square overflow-hidden rounded-md border-2 transition-all focus-within:ring-2 hover:shadow-md",
              asset.validationLevel === "warning-strong"
                ? "border-red-300/70 focus-within:ring-red-400 hover:border-red-500"
                : asset.validationLevel === "warning-soft"
                  ? "border-amber-300/70 focus-within:ring-amber-400 hover:border-amber-500"
                  : isUsed
                    ? "border-emerald-400/70 focus-within:ring-emerald-400 hover:border-emerald-500"
                    : "border-brand-purple/20 hover:border-brand-purple focus-within:ring-brand-turquoise",
            ].join(" ")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.signedUrl}
              alt={`Foto subida ${idx + 1}`}
              className={[
                "h-full w-full object-cover transition-opacity",
                isUsed ? "opacity-75" : "",
              ].join(" ")}
              draggable={false}
            />

            {/* M.3.b.UX.6 — Drag handle visual top-left, sutil, visible solo en hover.
              Indica al cliente "esta foto se puede arrastrar al imán". */}
            <div
              className="bg-brand-purple/85 pointer-events-none absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-md text-white opacity-0 shadow-sm transition-opacity group-hover/thumb:opacity-100"
              aria-hidden
            >
              <GripVertical className="h-3 w-3" />
            </div>
          </div>

          {/* Fila-caption de chips (text-[9px], fondos suaves con texto oscuro —
            A11Y: contraste sobre fondo claro, decisión Paquete C de badges
            legibles se mantiene; solo cambian de lugar). */}
          {(hasWarning || autoImproved || isUsed) && (
            <div className="flex flex-wrap items-center gap-1">
              {asset.validationLevel === "warning-strong" && (
                <span
                  className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-800"
                  aria-label={texts.fotos.resolucionBajaAria}
                >
                  ⚠️ {texts.fotos.badgeRevisar}
                </span>
              )}
              {asset.validationLevel === "warning-soft" && (
                <span
                  className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900"
                  aria-label={texts.fotos.avisoCalidadAria}
                >
                  ⚠️ {texts.fotos.badgeRevisar}
                </span>
              )}

              {/* C2 (owner 2026-09-15) — "✨ Optimizada": la foto se re-muestreó
                en el navegador al subir (NO crea detalle — el título lo dice
                explícito, auditoría 2026-09-24). */}
              {autoImproved && (
                <Hint content={texts.fotos.badgeMejoradaTitle}>
                  {/* stopPropagation: el chip tiene su propio Hint — sin esto el
                      hover abriría ambos tooltips. */}
                  <span
                    onPointerMove={(e) => e.stopPropagation()}
                    className="bg-brand-turquoise/20 text-brand-purple-dark rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                    aria-label={texts.fotos.badgeMejoradaTitle}
                  >
                    {texts.fotos.badgeMejorada}
                  </span>
                </Hint>
              )}

              {/* P0.2 — la foto ya está asignada a al menos 1 slot (antes un
                check ✓ flotante bottom-left sobre la imagen). */}
              {isUsed && (
                <span
                  className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800"
                  aria-label={texts.fotos.usadaAria}
                >
                  {texts.fotos.badgeAgregada}
                </span>
              )}
            </div>
          )}
        </motion.div>
      </Hint>

      {/* P0.3 — Modal de calidad: explica el problema + sugerencia accionable */}
      <PhotoQualityModal
        open={showQualityModal}
        onClose={() => setShowQualityModal(false)}
        asset={asset}
      />
    </>
  );
}
