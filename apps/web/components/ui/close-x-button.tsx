"use client";

/*
 * CloseXButton — botón de cierre «X» canónico de la marca (2026-10-29, owner):
 * TODAS las X de cerrar (diálogos, sheets, modales propios del Estudio,
 * lightboxes, popovers) llevan fondo morado de marca con la X en blanco, para
 * que el cierre sea visible y consistente en cualquier contexto (antes eran
 * ghost grises que se perdían sobre imágenes y previews).
 *
 * `CLOSE_X_CLASS` se exporta para los casos que ya traen su propio posicionamiento
 * (absolute top-right dentro del modal) y solo necesitan las clases visuales.
 */

import * as React from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const CLOSE_X_CLASS =
  "bg-brand-purple hover:bg-brand-purple-dark focus:ring-brand-purple inline-flex items-center justify-center rounded-full text-white shadow-md transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none";

export function CloseXButton({
  className,
  label = "Cerrar",
  ...props
}: React.ComponentProps<"button"> & { label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(CLOSE_X_CLASS, "h-8 w-8", className)}
      {...props}
    >
      <XIcon className="h-4 w-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </button>
  );
}
