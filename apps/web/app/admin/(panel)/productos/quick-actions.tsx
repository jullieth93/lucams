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
  // Hotfix P0-9: touch targets antes eran ~22-24px (text-[10px] + px-2 py-1
  // + icon h-3 w-3) — muy lejos del estándar 44px y desproporcionados con
  // el botón "Editar" hermano. Ahora h-9 (~36px) + text-xs + icon h-3.5 +
  // padding px-3 — consistente con CompactStockEditor y resto del admin.
  if (isArchived) {
    return (
      <form action={restoreProductAction} className="inline">
        <input type="hidden" name="id" value={productId} />
        <button
          type="submit"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          title="Restaurar de la papelera (queda pausado)"
        >
          <RotateCcw className="h-3.5 w-3.5" />
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
            ? "inline-flex h-9 items-center gap-1.5 rounded-md border border-brand-purple/20 bg-white px-3 text-xs font-semibold text-brand-purple-dark/80 hover:bg-brand-purple/5"
            : "inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
        }
        title={isActive ? "Ocultar de tu tienda" : "Mostrar en tu tienda"}
      >
        <Power className="h-3.5 w-3.5" />
        {isActive ? "Pausar" : "Activar"}
      </button>
    </form>
  );
}
