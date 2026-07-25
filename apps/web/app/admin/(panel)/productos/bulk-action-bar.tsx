"use client";

/*
 * <BulkActionBar> — barra flotante con acciones masivas para productos.
 *
 * Patrón pragmático sin Context:
 *  - La tabla del page renderea checkboxes con name="productIds" y form="bulk-form"
 *    (atributo HTML que asocia el input a un form distinto al que lo envuelve).
 *  - Este componente envuelve sus buttons en <form id="bulk-form"> con action prop.
 *  - Escucha eventos `change` en inputs con name="productIds" en el documento
 *    para mostrar count en vivo.
 *
 * UX:
 *  - Por default oculta (count=0).
 *  - Aparece sticky bottom con animación cuando count >= 1.
 *  - Tooltip explica cada acción antes de submitir (zero-confirm para activar/destacar;
 *    para acciones reversibles no necesitamos modal).
 *  - "Limpiar selección" deselecciona todos.
 */

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, EyeOff, Star, StarOff, X, Loader2 } from "lucide-react";
import {
  bulkActivateProductsAction,
  bulkDeactivateProductsAction,
  bulkFeatureProductsAction,
  bulkUnfeatureProductsAction,
} from "./bulk-actions";

export function BulkActionBar() {
  const [count, setCount] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const update = () => {
      const checkboxes = document.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][name="productIds"]',
      );
      const checked = Array.from(checkboxes).filter((c) => c.checked);
      setCount(checked.length);
    };
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, []);

  // Hotfix P0-11: cuando la bar es visible (count > 0), agregamos un
  // padding-bottom al body para que la paginación y la última fila no
  // queden tapadas. La bar mide ~64px de alto + 16px de margen → 96px
  // de espacio reservado. Lo aplicamos al <body> para que el scroll
  // también lo respete.
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
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="productIds"]')
      .forEach((c) => {
        c.checked = false;
      });
    // También desmarca el "select all" del header si existe.
    document
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-bulk-select-all]')
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
      aria-label="Acciones masivas"
      className="fixed inset-x-0 bottom-0 z-30 px-3 pt-2 pb-4 sm:px-6"
    >
      <div className="border-brand-purple/20 bg-brand-purple-dark/95 mx-auto flex max-w-5xl flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-white shadow-xl backdrop-blur">
        <div className="flex flex-1 items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          <span className="text-sm font-semibold">
            {count} producto{count === 1 ? "" : "s"} seleccionado{count === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
           * IMPORTANTE: cada button tiene form="bulk-form" para asociarse al
           * <form id="bulk-form"> que renderea su action propia. Pero React
           * no soporta button.formAction con server actions de forma estable
           * en Next 16 — entonces renderamos 4 <form> ocultos cada uno con su
           * action distinta. Es verboso pero confiable.
           */}
          <BulkSubmitButton
            action={bulkActivateProductsAction}
            label="Activar"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            tone="emerald"
            title="Mostrar en tu tienda"
            disabled={pending}
            onSubmit={() => startTransition(() => clearSelection())}
          />
          <BulkSubmitButton
            action={bulkDeactivateProductsAction}
            label="Pausar"
            icon={<EyeOff className="h-3.5 w-3.5" />}
            tone="amber"
            title="Ocultar de tu tienda (reversible)"
            disabled={pending}
            onSubmit={() => startTransition(() => clearSelection())}
          />
          <BulkSubmitButton
            action={bulkFeatureProductsAction}
            label="Destacar"
            icon={<Star className="h-3.5 w-3.5" />}
            tone="pink"
            title="Mostrar en home como destacados"
            disabled={pending}
            onSubmit={() => startTransition(() => clearSelection())}
          />
          <BulkSubmitButton
            action={bulkUnfeatureProductsAction}
            label="Quitar destacado"
            icon={<StarOff className="h-3.5 w-3.5" />}
            tone="muted"
            title="Sacar de la lista de destacados"
            disabled={pending}
            onSubmit={() => startTransition(() => clearSelection())}
          />

          <button
            type="button"
            onClick={clearSelection}
            disabled={pending}
            className="ml-2 inline-flex h-9 items-center gap-1 rounded-md border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-50"
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

function BulkSubmitButton({
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
  tone: "emerald" | "amber" | "pink" | "muted";
  title: string;
  disabled: boolean;
  onSubmit?: () => void;
}) {
  const tones: Record<typeof tone, string> = {
    emerald: "bg-emerald-500 text-white hover:bg-emerald-600",
    amber: "bg-amber-500 text-white hover:bg-amber-600",
    // A11Y (WCAG 1.4.3 AA): blanco sobre brand-pink da 3.27:1, bajo el 4.5:1 que exige el texto
    // normal. Se pasa al tono de tinta que ya existe en la paleta: 5.31:1. No se cambia la paleta.
    pink: "bg-brand-pink-ink text-white hover:brightness-110",
    muted: "bg-white/15 text-white hover:bg-white/25",
  };
  return (
    <form
      action={(fd: FormData) => {
        // Copiar los productIds seleccionados del documento al FormData (el form
        // del bulk-action-bar no envuelve los checkboxes — viven en la tabla).
        document
          .querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="productIds"]:checked')
          .forEach((c) => fd.append("productIds", c.value));
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

/**
 * <BulkSelectAllCheckbox> — checkbox del header de tabla que marca/desmarca
 * todos los visibles de la página.
 */
export function BulkSelectAllCheckbox() {
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    document
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="productIds"]')
      .forEach((c) => {
        c.checked = checked;
      });
    // Disparamos evento change para que BulkActionBar actualice su count.
    document.dispatchEvent(new Event("change"));
  };
  return (
    <input
      type="checkbox"
      data-bulk-select-all
      onChange={onChange}
      aria-label="Seleccionar todos los productos visibles"
      className="text-brand-purple focus:ring-brand-purple/40 border-brand-purple/30 h-4 w-4 cursor-pointer rounded"
    />
  );
}
