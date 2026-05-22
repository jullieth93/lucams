"use client";

import { Power, RotateCcw } from "lucide-react";
import { restoreProductAction, toggleProductActiveAction } from "./actions";

/**
 * Botones rápidos por fila: toggle activar/desactivar (si no archivado) +
 * restaurar (si archivado). Sin confirm modal — son acciones reversibles.
 */
export function ProductQuickActions({
  productId,
  isActive,
  isArchived,
}: {
  productId: string;
  isActive: boolean;
  isArchived: boolean;
}) {
  if (isArchived) {
    return (
      <form action={restoreProductAction} className="inline">
        <input type="hidden" name="id" value={productId} />
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
          title="Restaurar de papelera (quedará inactivo)"
        >
          <RotateCcw className="h-3 w-3" />
          Restaurar
        </button>
      </form>
    );
  }

  return (
    <form action={toggleProductActiveAction} className="inline">
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
      <button
        type="submit"
        className={
          isActive
            ? "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
            : "inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100"
        }
        title={isActive ? "Ocultar del storefront" : "Mostrar en storefront"}
      >
        <Power className="h-3 w-3" />
        {isActive ? "Desactivar" : "Activar"}
      </button>
    </form>
  );
}
