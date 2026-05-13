"use client";

/*
 * StudioSidebar — Mis fotos + Plantillas (M.3).
 *
 * Layout vertical en desktop, horizontal scroll en mobile.
 *
 * Mis fotos: drag handle nativo — el cliente arrastra cualquier asset al
 * canvas y `studio-canvas.tsx` lo asigna al image-placeholder más cercano.
 *
 * Plantillas: click para aplicar. Preserva fotos ya cargadas si los slot
 * IDs coinciden entre plantillas (`layer.id`).
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, Image as ImageIcon, Sparkles } from "lucide-react";
import { uploadDesignAssetAction } from "@/features/personalization/actions";
import type { StudioAsset, StudioProduct, StudioTemplate } from "./types";

type StudioSidebarProps = {
  product: StudioProduct;
  templates: StudioTemplate[];
  selectedTemplateId: string | null;
  assets: StudioAsset[];
  designId: string | null;
  onSelectTemplate: (template: StudioTemplate) => void;
  onAssetUploaded: (asset: StudioAsset) => void;
};

export function StudioSidebar({
  product,
  templates,
  selectedTemplateId,
  assets,
  designId,
  onSelectTemplate,
  onAssetUploaded,
}: StudioSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<{ pending: number; error: string | null }>({
    pending: 0,
    error: null,
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadProgress({ pending: files.length, error: null });
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      if (designId) formData.append("designId", designId);
      const result = await uploadDesignAssetAction(formData);
      if (result.ok) {
        onAssetUploaded({
          id: result.assetId,
          signedUrl: result.signedUrl,
          width: result.width,
          height: result.height,
        });
      } else {
        setUploadProgress((p) => ({ ...p, error: result.message }));
      }
      setUploadProgress((p) => ({ ...p, pending: Math.max(0, p.pending - 1) }));
    }
  };

  const onDragStartAsset = (e: React.DragEvent<HTMLDivElement>, asset: StudioAsset) => {
    e.dataTransfer.setData("application/lucams-asset", JSON.stringify(asset));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="flex h-full flex-col gap-6 p-5">
      <div>
        <p className="text-brand-purple-dark text-sm font-semibold">{product.name}</p>
        <p className="text-brand-purple/60 mt-0.5 text-xs">SKU {product.sku}</p>
      </div>

      {/* ──────── Mis fotos ──────── */}
      <section>
        <div className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-semibold">
          <ImageIcon className="text-brand-purple h-4 w-4" />
          Mis fotos
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="border-brand-purple/30 bg-brand-purple/5 text-brand-purple hover:bg-brand-purple/10 flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed py-4 text-sm font-medium transition-colors"
        >
          <Upload className="h-4 w-4" />
          Subir foto
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {uploadProgress.pending > 0 && (
          <p className="text-brand-purple/70 mt-2 text-xs">
            Subiendo {uploadProgress.pending} archivo(s)...
          </p>
        )}
        {uploadProgress.error && (
          <p className="mt-2 text-xs text-red-600">⚠️ {uploadProgress.error}</p>
        )}

        {assets.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {assets.map((asset) => (
              <div
                key={asset.id}
                draggable
                onDragStart={(e) => onDragStartAsset(e, asset)}
                className="border-brand-purple/20 hover:border-brand-purple aspect-square cursor-grab overflow-hidden rounded-md border-2 active:cursor-grabbing"
                title="Arrastrá al canvas"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.signedUrl}
                  alt="Foto subida"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </div>
            ))}
          </div>
        )}

        {assets.length === 0 && uploadProgress.pending === 0 && (
          <p className="text-brand-purple-dark/50 mt-3 text-xs italic">
            Sube tus fotos y arrastrálas al lienzo para personalizar.
          </p>
        )}
      </section>

      {/* ──────── Plantillas ──────── */}
      <section className="border-brand-purple/10 border-t pt-5">
        <div className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="text-brand-purple h-4 w-4" />
          Plantillas
        </div>

        {templates.length === 0 ? (
          <p className="text-brand-purple-dark/50 text-xs italic">
            Aún no hay plantillas para este producto.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {templates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onSelectTemplate(tpl)}
                  className={`flex flex-col gap-1.5 rounded-md p-1.5 text-left transition-all ${
                    isSelected
                      ? "bg-brand-purple/10 ring-brand-purple ring-2"
                      : "hover:bg-brand-purple/5 ring-brand-purple/10 ring-1"
                  }`}
                >
                  <div className="bg-brand-purple/5 aspect-square overflow-hidden rounded">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tpl.previewUrl}
                      alt={tpl.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="text-brand-purple-dark line-clamp-2 text-xs font-medium">
                    {tpl.name}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
