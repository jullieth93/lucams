"use client";

/*
 * useAdminConfirm — confirmación de marca para acciones destructivas/sensibles
 * del panel admin (ADR-192; supersede el `window.confirm` nativo, patrón
 * stopgap documentado en confirm-action.tsx desde 2026-06).
 *
 * Por qué: el confirm nativo bloquea el hilo, no lleva tono Lucams, no se
 * puede testear con Testing Library y en móvil se ve genérico. El Dialog
 * Radix ya es la superficie de confirmación del storefront (Mis diseños,
 * Estudio) — el admin habla el mismo idioma.
 *
 * API promise-based para no reescribir la lógica de los callers:
 *
 *   const { confirm, confirmDialog } = useAdminConfirm();
 *   async function onDelete() {
 *     if (!(await confirm("¿Borrar esta imagen? No se puede deshacer."))) return;
 *     await deleteAction(id);
 *   }
 *   return (<>…{confirmDialog}</>);
 *
 * Una confirmación a la vez por instancia (suficiente para los flujos admin:
 * la acción destructiva nunca se encadena sin respuesta).
 */

import { useCallback, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AdminConfirmOptions = {
  /** Título del diálogo. Default «¿Confirmar acción?». */
  title?: string;
  /** Texto del botón confirmador. Default «Confirmar». */
  confirmLabel?: string;
  /** Texto del botón de cancelar. Default «Cancelar». */
  cancelLabel?: string;
  /**
   * Confirmación FUERTE (irreversibles): exige escribir esta palabra (ej.
   * "ELIMINAR") para habilitar el botón — mismo patrón destructivo de
   * mi-cuenta/eliminar. Supersede el `window.prompt` nativo.
   */
  requireTyped?: string;
};

export function useAdminConfirm(): {
  confirm: (message: string, opts?: AdminConfirmOptions) => Promise<boolean>;
  confirmDialog: ReactNode;
} {
  const [state, setState] = useState<(AdminConfirmOptions & { message: string }) | null>(null);
  const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(null);
  const [typed, setTyped] = useState("");

  const confirm = useCallback((message: string, opts?: AdminConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
      setTyped("");
      setState({ message, ...opts });
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver?.(ok);
    setResolver(null);
    setState(null);
  };

  const requiredWord = state?.requireTyped?.trim();
  const typedOk = !requiredWord || typed.trim().toUpperCase() === requiredWord.toUpperCase();

  const confirmDialog = (
    <Dialog
      open={state !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-brand-purple-dark">
            {state?.title ?? (requiredWord ? "Acción irreversible" : "¿Confirmar acción?")}
          </DialogTitle>
          <DialogDescription>{state?.message}</DialogDescription>
        </DialogHeader>
        {requiredWord && (
          <label className="text-brand-purple-dark block text-xs font-semibold">
            Escribe {requiredWord} para confirmar
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
              className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 mt-1.5 block w-full rounded-md border bg-white px-3 py-2 text-sm font-normal focus:ring-2 focus:outline-none"
            />
          </label>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => settle(false)}>
            {state?.cancelLabel ?? "Cancelar"}
          </Button>
          <Button type="button" variant="destructive" disabled={!typedOk} onClick={() => settle(true)}>
            {state?.confirmLabel ?? "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, confirmDialog };
}
