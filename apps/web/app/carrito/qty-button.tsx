"use client";

/*
 * Botones +/− y "quitar" del carrito, con feedback de envío.
 *
 * Cada uno vive en su propio `<form action={serverAction}>`, así que al pulsarlos hay ida y vuelta
 * al servidor sin nada visible: el número no cambia hasta que la acción vuelve, y la reacción
 * natural es volver a pulsar (reporte de Lucy, 2026-07-25). En un control de cantidad eso no es
 * solo incómodo — cada pulsación extra suma una unidad más.
 *
 * `useFormStatus()` lee el estado del form ancestro, así que el spinner y el bloqueo salen solos.
 */

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useSubmitPending } from "@/components/ui/use-submit-pending";

export function IconSubmitButton({
  children,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  "aria-label": string;
}) {
  const pending = useSubmitPending();

  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-label={ariaLabel}
      aria-busy={pending}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : children}
    </button>
  );
}
