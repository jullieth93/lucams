"use client";

/*
 * <PendingSubmitButton> — botón submit con feedback de "procesando" para los
 * forms inline de los listados admin (toggles de estado, flechas de orden,
 * acciones por fila). Usa React 19 useFormStatus → spinner + disabled mientras
 * el server action está pending. Debe vivir DENTRO de un <form action={...}>.
 *
 * Lucy 2026-06-27: "al presionar, que se vea que está procesando (ruedita)".
 * Mantiene el estilo propio del botón (className), solo cambia el ícono por un
 * spinner mientras procesa.
 */

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function PendingSubmitButton({
  className,
  title,
  ariaLabel,
  idleIcon,
  children,
  spinnerClass = "h-3.5 w-3.5",
}: {
  className?: string;
  title?: string;
  ariaLabel?: string;
  /** Ícono cuando NO está procesando; se reemplaza por el spinner al enviar. */
  idleIcon?: ReactNode;
  children?: ReactNode;
  spinnerClass?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-label={ariaLabel}
      aria-busy={pending}
      className={`${className ?? ""} disabled:opacity-60`}
    >
      {pending ? <Loader2 className={`${spinnerClass} animate-spin`} /> : idleIcon}
      {children}
    </button>
  );
}
