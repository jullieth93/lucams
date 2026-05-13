"use client";

/*
 * <EditModeToolbar> — barra fija bottom-right con toggle.
 *
 * Botón único: cuando OFF muestra "✏️ Editar este sitio" (morado),
 * cuando ON muestra "✓ Salir del modo edición" (verde). Solo visible
 * para admins (el provider server-side lo decide).
 *
 * Diseño minimalista para no competir con la UI del storefront. El
 * mascote LucamsLogo no aparece acá — es una herramienta interna,
 * no parte de la experiencia kawaii.
 */

import { Pencil, Check } from "lucide-react";

export function EditModeToolbar({
  enabled,
  adminEmail,
  onToggle,
}: {
  enabled: boolean;
  adminEmail: string;
  onToggle: () => void;
}) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[9999] flex flex-col items-end gap-2">
      {enabled && (
        <div className="bg-brand-purple-dark/90 pointer-events-auto rounded-full px-3 py-1 text-xs font-medium text-white shadow-lg backdrop-blur">
          Modo edición ON · {adminEmail}
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        className={
          "pointer-events-auto flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:scale-105 " +
          (enabled
            ? "bg-emerald-600 hover:bg-emerald-700"
            : "bg-brand-purple hover:bg-brand-purple-dark")
        }
        aria-label={enabled ? "Salir del modo edición" : "Activar modo edición"}
      >
        {enabled ? (
          <>
            <Check className="size-4" />
            Salir del modo edición
          </>
        ) : (
          <>
            <Pencil className="size-4" />
            Editar este sitio
          </>
        )}
      </button>
    </div>
  );
}
