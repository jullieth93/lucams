/*
 * <VariantImages /> — fotos POR OPCIÓN (D1, Lucy 2026-06-27).
 *
 * Espejo de <ProductImages> pero sobre ProductVariant.images. Clave de UX:
 * si la opción NO tiene fotos propias, HEREDA las del producto (igual que el
 * precio). Por eso el empty state lo explica en vez de alarmar.
 *
 * Portadas por DISEÑO (Lucy 2026-08-25): las opciones del mismo diseño (mismo
 * tamaño/forma/color, distinta cantidad) comparten las fotos — groupSize /
 * groupNames / divergent los calcula el panel en servidor. Si el grupo está
 * divergente (datos viejos), subir/reordenar/borrar tocan SOLO esta opción y
 * el botón "Unificar" es el camino explícito.
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
  unifyVariantCoverGroupAction,
} from "./image-actions";

export function VariantImages({
  variantId,
  images,
  productImageCount,
  groupSize = 1,
  groupNames = [],
  divergent = false,
}: {
  variantId: string;
  images: string[];
  /** Cuántas fotos tiene el producto — para explicar la herencia. */
  productImageCount: number;
  /** Opciones que comparten este diseño (incluye esta). 1 = comportamiento clásico. */
  groupSize?: number;
  /** Nombres visibles de esas opciones ("Default" ya viene como "Única"). */
  groupNames?: string[];
  /** true si las opciones del diseño tienen fotos distintas entre sí (datos viejos). */
  divergent?: boolean;
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

  const handleUnify = () => {
    if (
      !confirm(
        "¿Usar las fotos de ESTA opción en todas las opciones de este diseño? " +
          "Las fotos que tengan las otras opciones se reemplazan por estas, y los " +
          "archivos que ya no use nadie se borran del almacenamiento. Esta acción " +
          "no se puede deshacer.",
      )
    )
      return;
    setError(null);
    const formData = new FormData();
    formData.set("variantId", variantId);
    startTransition(async () => {
      const res = await unifyVariantCoverGroupAction(formData);
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
              ? groupSize > 1
                ? `Si no subes ninguna, las ${groupSize} opciones de este diseño usan las ${productImageCount} foto${
                    productImageCount === 1 ? "" : "s"
                  } del producto. Sube fotos solo si este diseño se ve distinto.`
                : `Si no subes ninguna, esta opción usa las ${productImageCount} foto${
                    productImageCount === 1 ? "" : "s"
                  } del producto. Sube fotos solo si esta opción se ve distinta.`
              : groupSize > 1
                ? `Al elegir cualquiera de las ${groupSize} opciones de este diseño, el cliente verá SOLO estas fotos (reemplazan las ${productImageCount} del producto). La primera es la portada.`
                : `Al elegir esta opción, el cliente verá SOLO estas fotos (reemplazan las ${productImageCount} del producto). La primera es la portada.`}
          </p>
          {groupSize > 1 && (
            <p className="text-brand-muted mt-1 text-xs">
              📷 Estas fotos aplican a las {groupSize} opciones de este mismo diseño (
              {groupNames.join(", ")}). No hace falta subirlas en cada opción.
            </p>
          )}
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
            className="bg-brand-purple hover:bg-brand-purple-dark text-white"
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

      {/* Grupo divergente (datos viejos): cada opción del diseño tiene fotos
          distintas. Mientras no se unifiquen, subir/reordenar/borrar aquí toca
          SOLO esta opción (lo decide el servidor); el botón es el camino
          explícito para dejar un solo set de fotos en todo el diseño. */}
      {divergent && groupSize > 1 && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">
            ⚠️ Las opciones de este diseño tienen fotos distintas entre sí.
          </p>
          <p className="mt-0.5">
            Mientras no las unifiques, los cambios que hagas aquí solo aplican a ESTA opción. Si
            unificas, todas las opciones del diseño mostrarán las fotos de esta.
          </p>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-40"
            onClick={handleUnify}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
            Unificar: usar estas fotos en todas las opciones de este diseño
          </button>
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
              className={`group bg-brand-purple/5 relative overflow-hidden rounded-md border ${
                idx === 0
                  ? "border-brand-purple ring-brand-purple/30 ring-2"
                  : "border-brand-purple/15"
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
