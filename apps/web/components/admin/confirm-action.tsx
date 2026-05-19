"use client";

/*
 * <ConfirmAction> — wrapper para forms admin con acciones destructivas
 * (archivar/eliminar). Muestra modal de confirmación nativo (window.confirm)
 * o un dialog Radix si la decisión requiere más explicación.
 *
 * Patrón shadcn AlertDialog tendría más UX pero requiere agregar la
 * primitive. Para ahora usamos window.confirm() que es 100% nativo,
 * accesible y satisface el caso: prevenir clicks accidentales.
 *
 * Uso:
 *   <ConfirmAction
 *     action={deleteProductAction}
 *     message="¿Archivar este producto? Quedará oculto del storefront."
 *   >
 *     <input type="hidden" name="id" value={id} />
 *     <Button type="submit" variant="ghost" className="...">
 *       <Trash2 className="h-4 w-4" /> Archivar
 *     </Button>
 *   </ConfirmAction>
 */

import type { FormEvent, ReactNode } from "react";

export function ConfirmAction({
  action,
  message,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  children: ReactNode;
  className?: string;
}) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // window.confirm es síncrono y bloquea hasta respuesta.
    // Si cliente cancela, prevenimos el submit.
    if (!window.confirm(message)) {
      e.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className={className}>
      {children}
    </form>
  );
}
