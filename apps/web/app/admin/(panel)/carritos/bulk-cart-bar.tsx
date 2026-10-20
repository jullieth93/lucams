"use client";

/*
 * <BulkCartBar> — bar flotante de envío masivo de recordatorios (Fase 4,
 * 2026-10-13). Patrón espejo del BulkReviewBar de reseñas: checkboxes con
 * name="cartIds" en la tabla; la bar cuenta los seleccionados y lleva a la
 * pantalla de confirmación /admin/carritos/enviar?ids=... (que muestra el
 * preview del correo ANTES de enviar — requisito del módulo).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, X } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";

export function BulkCartBar() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => {
      const checkboxes = document.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][name="cartIds"]',
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
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="cartIds"]')
      .forEach((c) => {
        c.checked = false;
      });
    document
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-bulk-select-all-carts]')
      .forEach((c) => {
        c.checked = false;
        c.indeterminate = false;
      });
    setCount(0);
  };

  if (count === 0) return null;

  const goToConfirm = () => {
    const ids = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="cartIds"]:checked'),
    ).map((c) => c.value);
    router.push(`/admin/carritos/enviar?ids=${ids.join(",")}`);
  };

  return (
    <div
      role="region"
      aria-label="Acciones masivas de carritos abandonados"
      className="fixed inset-x-0 bottom-0 z-30 px-3 pt-2 pb-4 sm:px-6"
    >
      <div className="border-brand-purple/20 bg-brand-purple-dark/95 mx-auto flex max-w-5xl flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-white shadow-xl backdrop-blur">
        <div className="flex flex-1 items-center gap-2">
          <Mail className="h-4 w-4 text-emerald-300" />
          <span className="text-sm font-semibold">
            {count} carrito{count === 1 ? "" : "s"} seleccionado{count === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Hint content="Ver el correo y confirmar el envío a todos los seleccionados">
            <span tabIndex={0} className="inline-flex">
              <button
                type="button"
                onClick={goToConfirm}
                className="inline-flex h-9 items-center gap-1 rounded-md bg-emerald-500 px-3 text-xs font-semibold text-white hover:bg-emerald-600"
              >
                <Mail className="h-3.5 w-3.5" />
                Enviar recordatorios
              </button>
            </span>
          </Hint>

          <Hint content="Limpiar selección">
            <span tabIndex={0} className="ml-2 inline-flex">
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-white/40 bg-white/20 px-3 text-xs font-semibold text-white hover:bg-white/30"
              >
                <X className="h-3.5 w-3.5" />
                Limpiar
              </button>
            </span>
          </Hint>
        </div>
      </div>
    </div>
  );
}

export function BulkSelectAllCartsCheckbox() {
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    document
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="cartIds"]')
      .forEach((c) => {
        c.checked = checked;
      });
    document.dispatchEvent(new Event("change"));
  };
  return (
    <input
      type="checkbox"
      data-bulk-select-all-carts
      onChange={onChange}
      aria-label="Seleccionar todos los carritos visibles"
      className="text-brand-purple focus:ring-brand-purple/40 border-brand-purple/30 h-4 w-4 cursor-pointer rounded"
    />
  );
}
