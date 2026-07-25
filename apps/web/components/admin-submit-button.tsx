"use client";

/*
 * Variante cliente de <AdminButton> para los submits del panel.
 *
 * `AdminButton` vive en un server component, así que no puede saber si su formulario está en vuelo.
 * Este envoltorio sí: lee `useFormStatus()` del form ancestro y, mientras la Server Action corre,
 * cambia el ícono por un spinner y deshabilita el botón. Sin esto el botón se veía idéntico al
 * pulsarlo y la reacción natural era volver a pulsarlo (reporte de Lucy, 2026-07-25).
 *
 * Deshabilitar no es solo cosmético: evita el doble envío de acciones que mutan datos.
 */

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useSubmitPending } from "@/components/ui/use-submit-pending";

export function AdminSubmitButton({
  className,
  children,
  disabled,
  /** Texto mientras procesa. Si se omite se conserva el original (útil en botones con solo ícono). */
  pendingLabel,
}: {
  className: string;
  children: ReactNode;
  disabled?: boolean;
  pendingLabel?: string;
}) {
  const pending = useSubmitPending();

  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
