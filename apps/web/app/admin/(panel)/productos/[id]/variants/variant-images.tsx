/*
 * <VariantImages /> — fotos POR OPCIÓN (D1, Lucy 2026-06-27).
 *
 * Espejo de <ProductImages> pero sobre ProductVariant.images. Clave de UX:
 * si la opción NO tiene fotos propias, HEREDA las del producto (igual que el
 * precio). Por eso el empty state lo explica en vez de alarmar.
 *
 * Server actions en ./image-actions.ts.
 */

"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Star, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  uploadVariantImagesAction,
  reorderVariantImagesAction,
  deleteVariantImageAction,
} from "./image-actions";

export function VariantImages({
  variantId,
  images,
  productImageCount,
}: {
  variantId: string;
  images: string[];
  /** Cuántas fotos tiene el producto — para explicar la herencia. */
  productImageCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const formData = new FormData();
    formData.set("variantId", variantId);
    for (const f of Array.from(files)) formData.append("files", f);
    startTransition(async () => {
      const res = await uploadVariantImagesAction(formData);
      if (res?.error) setError(res.error);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= images.length) return;
    setError(null);
    const newOrder = [...images];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    const formData = new FormData();
    formData.set("variantId", variantId);
    formData.set("order", JSON.stringify(newOrder));
    startTransition(async () => {
      const res = await reorderVariantImagesAction(formData);
      if (res?.error) setError(res.error);
    });
  };

  const handleDelete = (url: string) => {
    if (!confirm("¿Borrar esta foto de la opción? Esta acción no se puede deshacer.")) return;
    setError(null);
    const formData = new FormData();
    formData.set("variantId", variantId);
    formData.set("url", url);
    startTransition(async () => {
      const res = await deleteVariantImageAction(formData);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <section className="border-brand-purple/15 rounded-lg border bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-brand-purple-dark text-base font-semibold">Fotos de esta opción</h3>
          <p className="text-brand-muted mt-0.5 text-xs">
            {images.length === 0
              ? `Si no subes ninguna, esta opción usa las ${productImageCount} foto${
                  productImageCount === 1 ? "" : "s"
                } del producto. Sube fotos solo si esta opción se ve distinta.`
              : `Al elegir esta opción, el cliente verá SOLO estas fotos (reemplazan las ${productImageCount} del producto). La primera es la portada.`}
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
            disabled={pending}
          />
          <Button
            type="button"
            size="sm"
            className="bg-brand-purple text-white hover:bg-brand-purple-dark"
            disabled={pending}
            onClick={() => fileInputRef.current?.click()}
          >
            {pending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Subir fotos
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {images.length === 0 ? (
        <div className="border-brand-purple/25 rounded-md border border-dashed px-4 py-8 text-center">
          <ImageIcon className="text-brand-purple-dark/30 mx-auto mb-2 h-6 w-6" />
          <p className="text-brand-purple-dark/70 text-sm font-medium">
            Esta opción hereda las fotos del producto.
          </p>
          <p className="text-brand-muted mt-1 text-xs">
            Sube fotos solo si esta opción luce diferente (otro formato, color, cantidad).
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {images.map((url, idx) => (
            <li
              key={url}
              className={`group relative overflow-hidden rounded-md border bg-brand-purple/5 ${
                idx === 0 ? "border-brand-purple ring-2 ring-brand-purple/30" : "border-brand-purple/15"
              }`}
            >
              <div className="aspect-square w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover" />
              </div>
              {idx === 0 ? (
                <span className="bg-brand-purple absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  <Star className="h-2.5 w-2.5 fill-current" /> Portada
                </span>
              ) : (
                <button
                  type="button"
                  className="text-brand-purple-dark absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm hover:bg-white disabled:opacity-40"
                  onClick={() => handleReorder(idx, 0)}
                  disabled={pending}
                  title="Usar esta foto como portada de la opción"
                >
                  <Star className="h-2.5 w-2.5" /> Hacer portada
                </button>
              )}
              <div className="absolute right-1.5 bottom-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  className="text-brand-purple-dark/80 rounded bg-white/95 p-1.5 hover:bg-white disabled:opacity-40"
                  onClick={() => handleReorder(idx, idx - 1)}
                  disabled={pending || idx === 0}
                  aria-label="Mover arriba"
                  title="Mover una posición arriba"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="text-brand-purple-dark/80 rounded bg-white/95 p-1.5 hover:bg-white disabled:opacity-40"
                  onClick={() => handleReorder(idx, idx + 1)}
                  disabled={pending || idx === images.length - 1}
                  aria-label="Mover abajo"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded bg-white/95 p-1.5 text-red-700 hover:bg-red-50"
                  onClick={() => handleDelete(url)}
                  disabled={pending}
                  aria-label="Borrar foto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
