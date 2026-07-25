"use client";

/*
 * Botón de submit con feedback automático de "procesando".
 *
 * `Button` es un componente de servidor, así que no puede saber si el formulario que lo contiene
 * está en vuelo: quien lo usa tiene que acordarse de pasarle `loading`. Este envoltorio lo resuelve
 * solo con `useFormStatus()`, que lee el estado del `<form>` ancestro.
 *
 * Motivo (reporte de Lucy, 2026-07-25): al pulsar un botón que dispara una Server Action no pasaba
 * nada visible durante la ida y vuelta al servidor, así que la reacción natural era volver a
 * pulsarlo. Además de la sensación de que "no cogió", el doble envío puede duplicar la mutación.
 */

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { useSubmitPending } from "@/components/ui/use-submit-pending";

export function SubmitButton({
  children,
  disabled,
  /** Texto mientras procesa. Si se omite, se conserva el original junto al spinner. */
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const pending = useSubmitPending();

  return (
    <Button {...props} type="submit" loading={pending} disabled={disabled} aria-busy={pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
