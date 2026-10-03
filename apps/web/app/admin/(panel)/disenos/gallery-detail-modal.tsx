"use client";

/*
 * Paquete A (2026-10-02) — Modal de DETALLE de un diseño prediseñado del
 * admin (/admin/disenos): cara A y cara B lado a lado (mismo markup del
 * preview del corte de tira del upload), nombre, producto (tag), orden y
 * estado, con la acción de borrar existente. Sin cara B muestra solo la A con
 * la nota de la regla única: se imprime espejo de la cara A (producción:
 * expandMissingBackFaces — misma promesa del texto de ayuda del upload).
 * Fase 5b (2026-10-02) — edición del "Aplica a": la ficha muestra el
 * variantFilter actual y un selector lo persiste (updateGalleryVariantFilterAction).
 * B-5 (2026-10-02) — toggle de visibilidad ("Visible en el Estudio"/"Pausada"):
 * pausar ya no exige borrar el diseño (toggleGalleryImageActiveAction).
 * A11y: patrón de template-preview-button (role=dialog + useDialogA11y).
 */

import { useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, X, Loader2, Check, Eye, EyeOff } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { useDialogA11y } from "../plantillas/use-dialog-a11y";
import {
  describeVariantFilter,
  type VariantFilterOption,
} from "@/features/personalization/design-gallery-filter";

export type GalleryDetailItem = {
  id: string;
  tag: string;
  name: string;
  imageUrl: string;
  imageUrlB?: string | null;
  /** Fase 5 — filtro por atributo de variante (null = todas las variantes). */
  variantFilter?: Record<string, string | number | boolean> | null;
  isActive: boolean;
  order: number;
};

export function GalleryDetailModal({
  item,
  productLabel,
  variantFilterOptions,
  pending,
  onClose,
  onDelete,
  onSaveVariantFilter,
  onToggleActive,
}: {
  item: GalleryDetailItem | null;
  /** Nombre visible del producto dueño del tag (tagOptions). */
  productLabel: string;
  /**
   * Opciones "Aplica a" del producto del diseño (tagOptions). [] = el producto
   * no varía por atributos filtrables → no se muestra el editor.
   */
  variantFilterOptions: VariantFilterOption[];
  pending: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  /** Persiste el filtro elegido; devuelve el mensaje de error o null si ok. */
  onSaveVariantFilter: (id: string, filterJson: string) => Promise<string | null>;
  /** B-5 — pausa/reactiva sin borrar; devuelve el mensaje de error o null si ok. */
  onToggleActive: (id: string, nextActive: boolean) => Promise<string | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose, active: item !== null });

  // Editor "Aplica a": JSON.stringify del filtro elegido ("" = todas). Se
  // reinicia al cambiar de diseño (o al persistirse el filtro) con el patrón
  // "adjust state during render" — setState en effect está prohibido por lint.
  const currentFilterJson = item?.variantFilter ? JSON.stringify(item.variantFilter) : "";
  const itemKey = `${item?.id ?? ""}:${currentFilterJson}`;
  const [filterJson, setFilterJson] = useState(currentFilterJson);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [prevItemKey, setPrevItemKey] = useState(itemKey);
  const [savingFilter, startSaveFilter] = useTransition();
  // B-5 — toggle de visibilidad: error propio + transition aparte del filtro.
  const [activeError, setActiveError] = useState<string | null>(null);
  const [togglingActive, startToggleActive] = useTransition();
  if (itemKey !== prevItemKey) {
    setPrevItemKey(itemKey);
    setFilterJson(currentFilterJson);
    setFilterError(null);
    setActiveError(null);
  }

  const filterDirty = filterJson !== currentFilterJson;

  function saveVariantFilter() {
    if (!item) return;
    setFilterError(null);
    startSaveFilter(async () => {
      const error = await onSaveVariantFilter(item.id, filterJson);
      if (error) setFilterError(error);
    });
  }

  function toggleActive() {
    if (!item) return;
    setActiveError(null);
    startToggleActive(async () => {
      const error = await onToggleActive(item.id, !item.isActive);
      if (error) setActiveError(error);
    });
  }

  return (
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Cerrar detalle"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 cursor-default bg-black/50 backdrop-blur-sm"
            tabIndex={-1}
          />

          {/* Modal */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-detail-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="ring-brand-purple/10 fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 id="gallery-detail-title" className="text-brand-purple-dark text-sm font-bold">
                {item.name}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="text-brand-purple-dark/70 hover:text-brand-purple-dark focus:ring-brand-turquoise rounded-md p-1 focus:ring-2 focus:outline-none"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — caras lado a lado (markup del preview del corte de tira) */}
            <div className="px-5 py-4">
              <div className={item.imageUrlB ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público */}
                  <img
                    src={item.imageUrl}
                    alt={`${item.name} — cara A`}
                    className="ring-brand-purple/10 max-h-72 w-full rounded-lg bg-white object-contain ring-1"
                  />
                  <figcaption className="text-brand-purple-dark mt-1 text-center text-xs font-semibold">
                    Cara A (frente)
                  </figcaption>
                </figure>
                {item.imageUrlB && (
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público */}
                    <img
                      src={item.imageUrlB}
                      alt={`${item.name} — cara B`}
                      className="ring-brand-purple/10 max-h-72 w-full rounded-lg bg-white object-contain ring-1"
                    />
                    <figcaption className="text-brand-purple-dark mt-1 text-center text-xs font-semibold">
                      Cara B (respaldo)
                    </figcaption>
                  </figure>
                )}
              </div>
              {!item.imageUrlB && (
                <p className="text-brand-muted mt-2 text-xs italic">
                  Sin cara B — se imprime espejo de la cara A (la misma imagen por ambos lados).
                </p>
              )}

              {/* Ficha: producto, orden, estado, aplica a */}
              <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <div className="bg-brand-purple/5 rounded-lg px-2 py-1.5">
                  <dt className="text-brand-muted text-[10px] font-semibold tracking-wide uppercase">
                    Producto
                  </dt>
                  <dd className="text-brand-purple-dark text-xs font-semibold">
                    <Hint content={productLabel}>
                      <span className="block truncate">{productLabel}</span>
                    </Hint>
                  </dd>
                </div>
                <div className="bg-brand-purple/5 rounded-lg px-2 py-1.5">
                  <dt className="text-brand-muted text-[10px] font-semibold tracking-wide uppercase">
                    Aplica a
                  </dt>
                  <dd className="text-brand-purple-dark text-xs font-semibold">
                    {describeVariantFilter(item.variantFilter)}
                  </dd>
                </div>
                <div className="bg-brand-purple/5 rounded-lg px-2 py-1.5">
                  <dt className="text-brand-muted text-[10px] font-semibold tracking-wide uppercase">
                    Orden
                  </dt>
                  <dd className="text-brand-purple-dark text-xs font-semibold tabular-nums">
                    #{item.order + 1}
                  </dd>
                </div>
                <div className="bg-brand-purple/5 rounded-lg px-2 py-1.5">
                  <dt className="text-brand-muted text-[10px] font-semibold tracking-wide uppercase">
                    Estado
                  </dt>
                  <dd
                    className={
                      "text-xs font-semibold " +
                      (item.isActive ? "text-emerald-700" : "text-brand-muted")
                    }
                  >
                    {item.isActive ? "Visible" : "Pausada"}
                  </dd>
                </div>
              </dl>

              {/* B-5 — pausar/reactivar SIN borrar: el diseño pausado sale del
                  Estudio pero sigue en el admin (atenuado) para reactivarlo. */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={toggleActive}
                  disabled={togglingActive || pending}
                  aria-pressed={item.isActive}
                  className={
                    "inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 " +
                    (item.isActive
                      ? "border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/5 bg-white"
                      : "bg-brand-purple hover:bg-brand-purple-dark border-transparent text-white")
                  }
                >
                  {togglingActive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : item.isActive ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {item.isActive ? "Pausar en el Estudio" : "Reactivar en el Estudio"}
                </button>
                <p className="text-brand-muted mt-1 text-[11px]">
                  {item.isActive
                    ? "Visible en el Estudio: el cliente puede aplicar este diseño."
                    : "Pausada: no aparece en el Estudio, pero sigue aquí para reactivarla."}
                </p>
                {activeError && <p className="mt-1 text-xs text-rose-600">{activeError}</p>}
              </div>

              {/* Editor "Aplica a" — corrige el filtro de diseños existentes
                  (ej. los subidos antes del selector del upload). */}
              {variantFilterOptions.length > 0 && (
                <div className="mt-3">
                  <label className="text-brand-purple-dark block text-xs font-semibold">
                    Cambiar «Aplica a»
                    <select
                      value={filterJson}
                      onChange={(e) => setFilterJson(e.target.value)}
                      disabled={savingFilter || pending}
                      className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none disabled:opacity-60"
                    >
                      <option value="">Todas las variantes</option>
                      {variantFilterOptions.map((o) => (
                        <option key={JSON.stringify(o.filter)} value={JSON.stringify(o.filter)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {filterDirty && (
                    <button
                      type="button"
                      onClick={saveVariantFilter}
                      disabled={savingFilter || pending}
                      className="bg-brand-purple hover:bg-brand-purple-dark mt-2 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {savingFilter ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Guardar «Aplica a»
                    </button>
                  )}
                  {filterError && <p className="mt-1 text-xs text-rose-600">{filterError}</p>}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Borrar diseño
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-brand-purple-dark/70 hover:bg-brand-purple/10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
