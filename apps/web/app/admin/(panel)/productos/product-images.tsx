/*
 * <ProductImages /> — UI admin para subir/reordenar/borrar imágenes
 * de un producto.
 *
 * Patrón:
 *   - Lista las imágenes actuales (URLs del array Product.images).
 *   - Botón "Subir imágenes" abre file picker multi.
 *   - Cada imagen tiene controles: subir/bajar orden + borrar.
 *   - Drag-drop nativo no necesario para v1 — buttons ↑/↓ alcanzan.
 *   - Submit a server action en upload/reorder/delete; revalidate
 *     en el server.
 *
 * Server actions están en app/admin/productos/image-actions.ts
 * para no inflar actions.ts del CRUD.
 */

"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  uploadProductImagesAction,
  reorderProductImagesAction,
  deleteProductImageAction,
} from "./image-actions";

export function ProductImages({ productId, images }: { productId: string; images: string[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const formData = new FormData();
    formData.set("productId", productId);
    for (const f of Array.from(files)) {
      formData.append("files", f);
    }
    startTransition(async () => {
      const res = await uploadProductImagesAction(formData);
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
    formData.set("productId", productId);
    formData.set("order", JSON.stringify(newOrder));
    startTransition(async () => {
      const res = await reorderProductImagesAction(formData);
      if (res?.error) setError(res.error);
    });
  };

  const handleDelete = (url: string) => {
    if (!confirm("¿Borrar esta imagen? Esta acción no se puede deshacer.")) return;
    setError(null);
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("url", url);
    startTransition(async () => {
      const res = await deleteProductImageAction(formData);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <section className="rounded-lg border border-brand-purple/15 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-brand-purple-dark">Imágenes</h2>
          <p className="mt-0.5 text-xs text-brand-purple-dark/55">
            La primera imagen es la principal. JPG/PNG/WebP/AVIF · máx 5 MB c/u.
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
            Subir imágenes
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {images.length === 0 ? (
        <div className="rounded-md border border-dashed border-brand-purple/25 px-4 py-10 text-center">
          <p className="text-sm font-medium text-brand-purple-dark/80">
            Aún no hay imágenes para este producto.
          </p>
          <p className="mt-1 text-xs text-brand-purple-dark/55">
            Sube 1-5 imágenes. La primera será la principal en el catálogo.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {images.map((url, idx) => (
            <li
              key={url}
              className="group relative overflow-hidden rounded-md border border-brand-purple/15 bg-brand-purple/5"
            >
              <div className="aspect-square w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Imagen ${idx + 1}`} className="h-full w-full object-cover" />
              </div>
              {idx === 0 && (
                <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  <Star className="h-2.5 w-2.5" /> Principal
                </span>
              )}
              <div className="absolute right-1.5 bottom-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  className="rounded bg-white/95 p-1.5 text-brand-purple-dark/80 hover:bg-white disabled:opacity-40"
                  onClick={() => handleReorder(idx, idx - 1)}
                  disabled={pending || idx === 0}
                  aria-label="Mover arriba"
                  title="Mover arriba (será imagen principal)"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded bg-white/95 p-1.5 text-brand-purple-dark/80 hover:bg-white disabled:opacity-40"
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
                  aria-label="Borrar imagen"
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
