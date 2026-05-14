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
import { Upload, Image as ImageIcon, Sparkles, Wand2, Loader2, Check } from "lucide-react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { uploadDesignAssetAction } from "@/features/personalization/actions";
import { selectFilledSlotCount, selectTotalSlotCount, type StudioStoreState } from "./lib/store";
import type { StudioAsset, StudioTemplate } from "./types";

type StudioSidebarProps = {
  store: StoreApi<StudioStoreState>;
  productName: string;
  productSku: string;
};

export function StudioSidebar({ store, productName, productSku }: StudioSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(files.length);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        if (designId) formData.append("designId", designId);
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
                "La foto tiene problemas de calidad. Revisá la sugerencia.",
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
        <p className="text-brand-purple/60 mt-0.5 text-xs">SKU {productSku}</p>
      </div>

      {/* Progress bar X/N — el feedback más importante del editor */}
      <ProgressBar filled={filledSlots} total={totalSlots} />

      {/* ──────── Mis fotos ──────── */}
      <section aria-labelledby="sidebar-mis-fotos">
        <div
          id="sidebar-mis-fotos"
          className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-semibold"
        >
          <ImageIcon className="text-brand-purple h-4 w-4" />
          Mis fotos
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading > 0}
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

        {/* Lista de assets con drag handle */}
        {assets.length > 0 && (
          <div role="list" aria-label="Fotos subidas" className="mt-3 grid grid-cols-3 gap-2">
            <AnimatePresence>
              {assets.map((asset, idx) => (
                <motion.div
                  key={asset.id}
                  role="listitem"
                  draggable
                  onDragStart={(e) =>
                    onDragStartAsset(e as unknown as React.DragEvent<HTMLDivElement>, asset)
                  }
                  title={
                    asset.validationMessage ??
                    "Arrastrá al canvas o tocá un slot vacío para asignar"
                  }
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.2, delay: idx * 0.04 }}
                  className="border-brand-purple/20 hover:border-brand-purple focus-within:ring-brand-turquoise relative aspect-square cursor-grab overflow-hidden rounded-md border-2 focus-within:ring-2 active:cursor-grabbing"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.signedUrl}
                    alt={`Foto subida ${idx + 1}`}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  {/* M.3.b.B.2 — Badge validación calidad foto */}
                  {asset.validationLevel === "warning-strong" && (
                    <div className="absolute top-1 right-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 shadow">
                      ⚠️
                    </div>
                  )}
                  {asset.validationLevel === "warning-soft" && (
                    <div className="absolute top-1 right-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 shadow">
                      ⓘ
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {assets.length === 0 && uploading === 0 && (
          <p className="text-brand-purple-dark/50 mt-3 text-xs italic">
            Tip: subí tus fotos primero, después usá el botón mágico para repartirlas en los slots.
          </p>
        )}
      </section>

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
          <span className="text-brand-purple-dark/40 text-xs font-normal">
            ({templates.length})
          </span>
        </div>

        {templates.length === 0 ? (
          <p className="text-brand-purple-dark/50 text-xs italic">
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
                onClick={() => applyTemplate(tpl)}
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
      <p className="text-brand-purple-dark/60 mt-1.5 text-xs">
        {isComplete
          ? "¡Listo! Todas las fotos están cargadas."
          : isEmpty
            ? "Cargá fotos para empezar."
            : `Faltan ${total - filled} ${total - filled === 1 ? "foto" : "fotos"} para terminar.`}
      </p>
    </div>
  );
}

function TemplateCard({
  template,
  isSelected,
  onClick,
}: {
  template: StudioTemplate;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={`Plantilla ${template.name}`}
      onClick={onClick}
      className={[
        "flex flex-col gap-1.5 rounded-md p-1.5 text-left transition-all focus:ring-2 focus:outline-none",
        isSelected
          ? "bg-brand-purple/10 ring-brand-purple ring-2"
          : "hover:bg-brand-purple/5 ring-brand-purple/10 focus:ring-brand-turquoise ring-1",
      ].join(" ")}
    >
      <div className="bg-brand-purple/5 aspect-square overflow-hidden rounded">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={template.previewUrl}
          alt={template.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <p className="text-brand-purple-dark line-clamp-2 text-xs font-medium">{template.name}</p>
    </button>
  );
}
