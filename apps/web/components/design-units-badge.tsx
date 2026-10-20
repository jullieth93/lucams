/*
 * Badge «N unidades» sobre la miniatura de una línea con diseño multi-unidad
 * (2026-10-13 — Fase 1 de maduración UX: el cliente ve de un vistazo que el
 * ítem trae varias piezas y que el «Ver»/clic pagina por unidad).
 *
 * Solo se renderiza con 2+ unidades (con 1 la imagen única no pagina y el
 * badge sería ruido). El rótulo llega resuelto por CMS desde la página server
 * (mismo patrón que las props de texto de DesignPreviewDialog: este
 * componente se usa en server y client por igual, así que no lee el CMS).
 * El número va FUERA del texto CMS para que la admin no lo borre editando.
 */

import type { ReactNode } from "react";

export function DesignUnitsBadge({ count, label }: { count: number; label: ReactNode }) {
  if (count < 2) return null;
  return (
    <span className="bg-brand-purple-dark/85 pointer-events-none absolute top-1 right-1 z-10 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold text-white tabular-nums">
      {count} {label}
    </span>
  );
}
