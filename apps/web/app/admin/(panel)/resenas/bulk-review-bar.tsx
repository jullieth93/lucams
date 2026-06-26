"use client";

/*
 * <BulkReviewBar> — bar flotante con acciones masivas para reseñas.
 *
 * Lucy 2026-06-26 — Opción C backlog: cuando llega una racha de reseñas
 * legítimas en una promo (Día Madre, lanzamiento producto), Lucy quiere
 * aprobarlas en lote. O cuando aparece spam, mandar al archivo en bloque.
 *
 * Patrón espejo del BulkActionBar de productos:
 *  - Checkboxes con name="reviewIds" en la tabla
 *  - Bar lee el document por querySelector, escucha "change" para count
 *  - 2 acciones: Aprobar (verde) / Archivar (amber)
 *  - Padding-bottom 96px en body cuando count > 0 (no tapar paginación)
 */

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Archive, X, Loader2 } from "lucide-react";
import {
  bulkApproveReviewsAction,
  bulkArchiveReviewsAction,
} from "./actions";

export function BulkReviewBar() {
  const [count, setCount] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const update = () => {
      const checkboxes = document.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][name="reviewIds"]',
      );
      const checked = Array.from(checkboxes).filter((c) => c.checked);
      setCount(checked.length);
    };
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (count > 0) {
      document.body.style.paddingBottom = "96px";
    } else {
      document.body.style.paddingBottom = "";
    }
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [count]);

  const clearSelection = () => {
    document
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="reviewIds"]')
      .forEach((c) => {
        c.checked = false;
      });
    document
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-bulk-select-all-reviews]')
      .forEach((c) => {
        c.checked = false;
        c.indeterminate = false;
      });
    setCount(0);
  };

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label="Acciones masivas de reseñas"
      className="fixed inset-x-0 bottom-0 z-30 px-3 pb-4 pt-2 sm:px-6"
    >
      <div className="border-brand-purple/20 bg-brand-purple-dark/95 mx-auto flex max-w-5xl flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-white shadow-xl backdrop-blur">
        <div className="flex flex-1 items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          <span className="text-sm font-semibold">
            {count} reseña{count === 1 ? "" : "s"} seleccionada{count === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BulkSubmit
            action={bulkApproveReviewsAction}
            label="Aprobar"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            tone="emerald"
            title="Aprobar y publicar en las páginas de producto"
            disabled={pending}
            onSubmit={() => startTransition(() => clearSelection())}
          />
          <BulkSubmit
            action={bulkArchiveReviewsAction}
            label="Archivar"
            icon={<Archive className="h-3.5 w-3.5" />}
            tone="amber"
            title="Archivar (no aparecen en la tienda). Reversible."
            disabled={pending}
            onSubmit={() => startTransition(() => clearSelection())}
          />

          <button
            type="button"
            onClick={clearSelection}
            disabled={pending}
            className="ml-2 inline-flex h-9 items-center gap-1 rounded-md border border-white/40 bg-white/20 px-3 text-xs font-semibold text-white hover:bg-white/30 disabled:opacity-50"
            title="Limpiar selección"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        </div>

        {pending && (
          <Loader2 className="ml-1 h-4 w-4 animate-spin text-white/70" aria-label="Procesando" />
        )}
      </div>
    </div>
  );
}

function BulkSubmit({
  action,
  label,
  icon,
  tone,
  title,
  disabled,
  onSubmit,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  icon: React.ReactNode;
  tone: "emerald" | "amber";
  title: string;
  disabled: boolean;
  onSubmit?: () => void;
}) {
  const tones = {
    emerald: "bg-emerald-500 text-white hover:bg-emerald-600",
    amber: "bg-amber-500 text-white hover:bg-amber-600",
  };
  return (
    <form
      action={(fd: FormData) => {
        document
          .querySelectorAll<HTMLInputElement>(
            'input[type="checkbox"][name="reviewIds"]:checked',
          )
          .forEach((c) => fd.append("reviewIds", c.value));
        if (onSubmit) onSubmit();
        return action(fd);
      }}
      className="inline-flex"
    >
      <button
        type="submit"
        disabled={disabled}
        title={title}
        className={`inline-flex h-9 items-center gap-1 rounded-md px-3 text-xs font-semibold disabled:opacity-50 ${tones[tone]}`}
      >
        {icon}
        {label}
      </button>
    </form>
  );
}

export function BulkSelectAllReviewsCheckbox() {
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    document
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="reviewIds"]')
      .forEach((c) => {
        c.checked = checked;
      });
    document.dispatchEvent(new Event("change"));
  };
  return (
    <input
      type="checkbox"
      data-bulk-select-all-reviews
      onChange={onChange}
      aria-label="Seleccionar todas las reseñas visibles"
      className="text-brand-purple focus:ring-brand-purple/40 h-4 w-4 cursor-pointer rounded border-brand-purple/30"
    />
  );
}
