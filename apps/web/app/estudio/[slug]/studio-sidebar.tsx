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
import { useDialogA11y } from "./use-dialog-a11y";
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
import { frameColorById } from "@/features/personalization/frame-palette";
import {
  selectAssetIsUsed,
  selectFilledSlotCount,
  selectTotalSlotCount,
  type StudioStoreState,
} from "./lib/store";
import type { StudioAsset, StudioTemplate } from "./types";

type StudioSidebarProps = {
  store: StoreApi<StudioStoreState>;
  productName: string;
  productSku: string;
  /** P0.7 — tamaño físico del producto para mostrar bajo cada plantilla. */
  productSizeCm?: string;
  /** P0.7 — forma física para borde redondeado realista de la card. */
  productShape?: "rectangle" | "circle" | "heart" | "custom";
  /** Ola 2A — ids de marco de color disponibles (personalizationSchema.frameOptions).
   * Si trae opciones, se muestra el selector "Marco" (borde de color alrededor de la foto). */
  frameOptions?: string[];
};

export function StudioSidebar({
  store,
  productName,
  productSku,
  productSizeCm,
  productShape,
  frameOptions,
}: StudioSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Consentimiento de derechos de imagen (Ley 1581): obligatorio antes de subir.
  const [rightsAccepted, setRightsAccepted] = useState(false);
  // P0.2 — Toggle "ocultar usadas" tipo Mixbook Hide Used.
  const [hideUsed, setHideUsed] = useState(false);

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
  // Ola 2A — marco de color (diseño-level, aplica a todas las fotos del pack).
  const borderColor = useStore(store, (s) => s.canvasData?.borderColor ?? null);
  const setBorderColor = useStore(store, (s) => s.setBorderColor);
  // Ids válidos contra la paleta de marca (descarta ids desconocidos del schema).
  const frameColors = (frameOptions ?? [])
    .map((id) => frameColorById(id))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(files.length);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        if (designId) formData.append("designId", designId);
        formData.append("rightsAccepted", rightsAccepted ? "true" : "false");
        const result = await uploadDesignAssetAction(formData);
        if (result.ok) {
          addAsset({
            id: result.assetId,
            signedUrl: result.signedUrl,
            width: result.width,
            height: result.height,
            validationLevel: result.validationLevel,
            validationMessage: result.validationMessage,
          });
          // M.3.b.B.2 — Si la foto subió con calidad insuficiente, mostrar
          // banner naranja persistente con el mensaje (cliente decide si usarla).
          if (result.validationLevel === "warning-strong" || result.validationLevel === "error") {
            setUploadError(
              result.validationMessage ??
                "La foto tiene problemas de calidad. Revisa la sugerencia.",
            );
          }
        } else {
          setUploadError(result.message);
        }
        setUploading((n) => Math.max(0, n - 1));
      }
    } finally {
      setUploading(0);
    }
  };

  const onDragStartAsset = (e: React.DragEvent<HTMLDivElement>, asset: StudioAsset) => {
    e.dataTransfer.setData("application/lucams-asset", JSON.stringify(asset));
    e.dataTransfer.effectAllowed = "copy";
  };

  const emptySlots = totalSlots - filledSlots;
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
            Mis fotos
            {assets.length > 0 && (
              <span className="text-brand-muted text-[10px] font-medium tabular-nums">
                ({assets.length})
              </span>
            )}
          </span>
          {/* P0.2 — Toggle "Solo no usadas" (Mixbook Hide Used) — solo visible si hay fotos */}
          {assets.length > 1 && (
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
              title={
                hideUsed ? "Mostrar todas las fotos" : "Ocultar fotos que ya pegaste en algún imán"
              }
            >
              {hideUsed ? "✓ Solo no usadas" : "Ver todas"}
            </button>
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
            Tengo derecho a usar esta foto y autorizo imprimirla (
            <a
              href="/legal/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Ley 1581
            </a>
            ).
          </span>
        </label>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading > 0 || !rightsAccepted}
          aria-label="Subir foto desde el dispositivo"
          className="border-brand-purple/30 bg-brand-purple/5 text-brand-purple hover:bg-brand-purple/10 focus:ring-brand-purple flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed py-4 text-sm font-medium transition-colors focus:ring-2 focus:outline-none disabled:opacity-60"
        >
          {uploading > 0 ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Subiendo ({uploading})...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Subir foto
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

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
            aria-label={`Llenar ${Math.min(emptySlots, assets.length)} slots vacíos con mis fotos`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-brand-turquoise/15 text-brand-purple-dark hover:bg-brand-turquoise/25 focus:ring-brand-turquoise mt-3 flex w-full items-center justify-center gap-1.5 rounded-md py-2.5 text-sm font-semibold transition-colors focus:ring-2 focus:outline-none"
          >
            <Wand2 className="text-brand-purple h-4 w-4" />
            Llenar slots con mis fotos
          </motion.button>
        )}

        {/* Lista de assets con drag handle + checkmark "usada" + filtro Hide Used */}
        {assets.length > 0 && (
          <div role="list" aria-label="Fotos subidas" className="mt-3 grid grid-cols-3 gap-2">
            <AnimatePresence>
              {assets.map((asset, idx) => (
                <AssetThumb
                  key={asset.id}
                  store={store}
                  asset={asset}
                  idx={idx}
                  hideUsed={hideUsed}
                  onDragStart={(e) => onDragStartAsset(e, asset)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {assets.length === 0 && uploading === 0 && (
          <p className="text-brand-muted mt-3 text-xs italic">
            Tip: sube tus fotos primero, después usa el botón mágico para repartirlas en los slots.
          </p>
        )}

        {/* M.3.b.UX.6 — Microcopy cuando todos los slots están llenos pero
            hay fotos sin asignar: explicar que se pueden cambiar arrastrando. */}
        {assets.length > 0 && emptySlots === 0 && totalSlots > 0 && (
          <p className="text-brand-muted bg-brand-turquoise/10 mt-3 rounded-md px-2.5 py-2 text-xs">
            ✨ Todos los imanes tienen foto. Toca un imán para cambiarle la foto (o arrástrale otra
            en computador).
          </p>
        )}
      </section>

      {/* ──────── Marco (Ola 2A — el "Estilo"/"Marco" de la PDP ahora es una plantilla
          visual del Estudio: borde de color alrededor de la foto; viaja con el diseño) ──────── */}
      {frameColors.length > 0 && (
        <section aria-labelledby="sidebar-marco" className="border-brand-purple/10 border-t pt-5">
          <div
            id="sidebar-marco"
            className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-semibold"
          >
            <Sparkles className="text-brand-purple h-4 w-4" />
            Marco de tus fotos
          </div>
          <div role="radiogroup" aria-label="Color del marco" className="flex flex-wrap gap-2">
            {/* Sin marco */}
            <button
              type="button"
              role="radio"
              aria-checked={borderColor === null}
              aria-label="Sin marco"
              title="Sin marco"
              onClick={() => setBorderColor(null)}
              className={[
                "focus:ring-brand-turquoise relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white transition-all focus:ring-2 focus:outline-none",
                borderColor === null
                  ? "ring-brand-turquoise shadow-md ring-2 ring-offset-2"
                  : "ring-brand-purple/20 hover:ring-brand-purple/50 ring-1",
              ].join(" ")}
            >
              <span className="text-brand-muted text-lg leading-none" aria-hidden>
                ∅
              </span>
            </button>
            {frameColors.map((c) => {
              const active = borderColor === c.hex;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`Marco ${c.label.toLowerCase()}`}
                  title={c.label}
                  onClick={() => setBorderColor(c.hex)}
                  className={[
                    "focus:ring-brand-turquoise relative h-10 w-10 cursor-pointer rounded-full transition-all focus:ring-2 focus:outline-none",
                    active
                      ? "ring-brand-turquoise shadow-md ring-2 ring-offset-2"
                      : "ring-brand-purple/20 hover:ring-brand-purple/50 ring-1",
                  ].join(" ")}
                  style={{ backgroundColor: c.hex }}
                >
                  {active && (
                    <Check
                      className="absolute inset-0 m-auto h-4 w-4"
                      strokeWidth={3}
                      // Check visible sobre cualquier color (blanco incluido).
                      style={{
                        color: c.id === "blanco" || c.id === "amarillo" ? "#3D2E5C" : "#FFFFFF",
                        filter: "drop-shadow(0 0 2px rgba(0,0,0,0.35))",
                      }}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-brand-muted mt-2 text-xs">
            El borde de color se imprime alrededor de cada foto.
          </p>
        </section>
      )}

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
          Plantillas
          <span className="text-brand-muted text-xs font-normal">({templates.length})</span>
        </div>

        {templates.length === 0 ? (
          <p className="text-brand-muted text-xs italic">
            Aún no hay plantillas para este producto.
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label="Selecciona plantilla del imán"
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
                  toast.success(`Plantilla "${tpl.name}" aplicada`, {
                    duration: 2200,
                    icon: "✨",
                  });
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? (filled / total) * 100 : 0;
  const isComplete = filled === total && total > 0;
  const isEmpty = filled === 0;
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-brand-purple-dark text-xs font-semibold tracking-wider uppercase">
          Progreso
        </span>
        <span
          className={[
            "text-sm font-bold tabular-nums",
            isComplete ? "text-emerald-600" : isEmpty ? "text-red-500" : "text-brand-purple-dark",
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
          ? "¡Listo! Todas las fotos están cargadas."
          : isEmpty
            ? "Carga fotos para empezar."
            : `Faltan ${total - filled} ${total - filled === 1 ? "foto" : "fotos"} para terminar.`}
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
      aria-label={`Plantilla ${template.name}${isSelected ? " (seleccionada)" : ""}${productSizeCm ? ` para imán ${productSizeCm} cm` : ""}`}
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
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
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
  onDragStart,
}: {
  store: StoreApi<StudioStoreState>;
  asset: StudioAsset;
  idx: number;
  hideUsed: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const isUsed = useStore(store, selectAssetIsUsed(asset.id));
  // P0.3 — Estado del modal de warning calidad (al click sobre thumb problemático)
  const [showQualityModal, setShowQualityModal] = useState(false);
  const hasWarning =
    asset.validationLevel === "warning-strong" || asset.validationLevel === "warning-soft";

  // Hide Used filter
  if (hideUsed && isUsed) return null;

  return (
    <>
      <motion.div
        role="listitem"
        draggable
        onDragStart={(e) => onDragStart(e as unknown as React.DragEvent<HTMLDivElement>)}
        onClick={hasWarning ? () => setShowQualityModal(true) : undefined}
        title={
          isUsed
            ? "Ya está pegada en algún imán. Puedes arrastrar otra foto."
            : hasWarning
              ? "Click para ver detalles del problema de calidad."
              : "Arrastra al canvas o toca un slot vacío para asignar"
        }
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: 0.2, delay: idx * 0.04 }}
        className={[
          "group/thumb relative aspect-square cursor-grab overflow-hidden rounded-md border-2 transition-all focus-within:ring-2 hover:shadow-md active:cursor-grabbing",
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

        {/* P0.2 — Green checkmark cuando foto está usada en al menos 1 slot */}
        {isUsed && (
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow ring-2 ring-white"
            aria-label="Foto ya usada en un imán"
          >
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </motion.div>
        )}

        {/* M.3.b.B.2 — Badge validación calidad foto (top-right) */}
        {asset.validationLevel === "warning-strong" && (
          <div
            className="absolute top-1 right-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 shadow"
            aria-label="Resolución baja"
          >
            ⚠️
          </div>
        )}
        {asset.validationLevel === "warning-soft" && (
          <div
            className="absolute top-1 right-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 shadow"
            aria-label="Aviso de calidad"
          >
            ⓘ
          </div>
        )}
      </motion.div>

      {/* P0.3 — Modal de calidad: explica el problema + sugerencia accionable */}
      <PhotoQualityModal
        open={showQualityModal}
        onClose={() => setShowQualityModal(false)}
        asset={asset}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
//  P0.3 — PhotoQualityModal: explica problemas de baja resolución/brillo/blur
// ──────────────────────────────────────────────────────────────────
//
// Patrón Mixbook: cuando el cliente intenta usar una foto con problemas
// de calidad, popup explicativo con sugerencia accionable. Reduce la
// frustración post-compra ("llegó pixelado") + da al cliente alternativas.

function PhotoQualityModal({
  open,
  onClose,
  asset,
}: {
  open: boolean;
  onClose: () => void;
  asset: StudioAsset;
}) {
  const isStrong = asset.validationLevel === "warning-strong";
  const isSoft = asset.validationLevel === "warning-soft";
  const message =
    asset.validationMessage ?? "La foto tiene un detalle de calidad que vale la pena revisar.";
  // #15 — foco inicial + trap + Escape + retorno de foco.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose, active: open });

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 cursor-default bg-black/40 backdrop-blur-sm"
            tabIndex={-1}
          />
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
            className="ring-brand-purple/10 fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1"
          >
            {/* Header con icono según severidad */}
            <div
              className={[
                "flex items-start gap-3 px-5 pt-5 pb-3",
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
                  {isStrong ? "Cuidado con esta foto" : "Aviso sobre esta foto"}
                </h2>
                <p
                  className={[
                    "mt-1 text-xs",
                    isStrong ? "text-red-700/85" : "text-amber-800/85",
                  ].join(" ")}
                >
                  {isSoft ? "Se puede usar igual, pero" : "Recomendamos revisarla:"}
                </p>
              </div>
            </div>

            {/* Body con thumbnail + mensaje */}
            <div className="flex gap-3 px-5 py-4">
              {/* Thumb grande */}
              <div className="ring-brand-purple/10 h-24 w-24 shrink-0 overflow-hidden rounded-md ring-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.signedUrl}
                  alt="Foto en revisión"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col justify-center text-sm">
                <p className="text-brand-purple-dark leading-snug font-medium">{message}</p>
                <div className="text-brand-muted mt-2 space-y-1 text-xs">
                  <p className="font-semibold">¿Qué puedes hacer?</p>
                  <ul className="ml-3 list-disc space-y-0.5">
                    <li>Subir una foto de mayor resolución (la original, no la de WhatsApp)</li>
                    <li>Si la foto ya es la mejor que tienes, igual la podemos imprimir</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="border-brand-purple/10 flex items-center justify-end gap-2 border-t px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="text-brand-purple-dark/70 hover:bg-brand-purple/10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Entendido
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
