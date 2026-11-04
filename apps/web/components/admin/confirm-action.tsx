"use client";

/*
 * <ConfirmAction> — wrapper para forms admin con acciones destructivas
 * (archivar/eliminar). Muestra el diálogo de confirmación de MARCA
 * (useAdminConfirm, ADR-192 — antes window.confirm nativo, patrón stopgap).
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

import { useRef, type FormEvent, type ReactNode } from "react";
import { useAdminConfirm } from "./use-admin-confirm";

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
  const { confirm, confirmDialog } = useAdminConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  // requestSubmit() re-dispara onSubmit: la bandera deja pasar ese segundo
  // submit (ya confirmado) sin reabrir el diálogo.
  const confirmedRef = useRef(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (confirmedRef.current) {
      confirmedRef.current = false;
      return;
    }
    e.preventDefault();
    if (await confirm(message)) {
      confirmedRef.current = true;
      formRef.current?.requestSubmit();
    }
  }

  return (
    <>
      <form ref={formRef} action={action} onSubmit={handleSubmit} className={className}>
        {children}
      </form>
      {confirmDialog}
    </>
  );
}
