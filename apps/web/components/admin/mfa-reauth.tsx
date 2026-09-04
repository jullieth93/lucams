"use client";

/*
 * Re-autenticación MFA (step-up) para acciones admin destructivas (F-10,
 * auditoría pre-lanzamiento 2026-09-04). Server-side vive lib/admin-reauth.ts
 * (requireRecentMfa) y la verifyAdminMfaReauthAction de /admin/seguridad.
 *
 * Piezas:
 *   - <MfaReauthModal>: diálogo que pide el código TOTP de 6 dígitos y llama a
 *     la Server Action de verificación (rate-limited + auditada server-side).
 *     Al verificar, el JWT quedó con aal2 fresco en cookies → onVerified().
 *   - useMfaReauthAction(action): drop-in de useActionState para acciones que
 *     devuelven `{ reauthRequired?: boolean }`. Si la respuesta lo pide, abre
 *     el modal y, tras verificar, reintenta la acción UNA vez con el mismo
 *     FormData. Devuelve [state, dispatch, pending, modal].
 *   - <ReauthForm>: wrapper de <form> para acciones estilo void+redirect (las
 *     que no usan useActionState, ej. cambiar rol / desactivar admin). Soporta
 *     confirmMessage (mismo window.confirm que <ConfirmAction>).
 *
 * Patrón del input copiado de MfaChallenge (admin/login/mfa) para que el reto
 * se vea igual en todo el panel.
 */

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  verifyAdminMfaReauthAction,
  type MfaReauthState,
} from "@/app/admin/(panel)/seguridad/actions";

export function MfaReauthModal({
  onVerified,
  onCancel,
}: {
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [state, formAction, pending] = useActionState<MfaReauthState | null, FormData>(
    verifyAdminMfaReauthAction,
    null,
  );
  // onVerified se invoca UNA sola vez cuando la verificación pasa (el ref
  // protege de re-disparos si el padre re-renderiza antes de desmontar).
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (state?.success && !notifiedRef.current) {
      notifiedRef.current = true;
      onVerified();
    }
  }, [state, onVerified]);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-brand-purple-dark flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Confirma tu identidad
          </DialogTitle>
          <DialogDescription>
            Esta acción es sensible. Escribe el código de 6 dígitos de tu app de autenticación para
            continuar.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="mfa-reauth-code"
              className="text-brand-purple-dark mb-1 block text-sm font-semibold"
            >
              Código de tu app de autenticación
            </label>
            <input
              id="mfa-reauth-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 h-12 w-full rounded-md border bg-white px-3 text-center font-mono text-2xl tracking-[0.4em] focus:ring-2 focus:outline-none"
            />
          </div>
          {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <button
            type="submit"
            disabled={pending || code.length !== 6}
            className="bg-gradient-brand inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {pending ? "Verificando…" : "Confirmar y continuar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-brand-purple-dark hover:text-brand-purple w-full text-center text-xs font-semibold"
          >
            Cancelar
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Drop-in de useActionState para acciones protegidas con requireRecentMfa.
 * Cuando la acción responde `{ reauthRequired: true }` abre el modal TOTP; al
 * verificar (JWT ya fresco en cookies) reintenta la acción con el MISMO
 * FormData. Si el usuario cancela, el estado de la acción conserva el error.
 */
export function useMfaReauthAction<State extends { reauthRequired?: boolean }>(
  action: (prev: State | null, formData: FormData) => Promise<State | null>,
): [State | null, (formData: FormData) => void, boolean, ReactNode] {
  const [retryData, setRetryData] = useState<FormData | null>(null);
  const [state, dispatch, isPending] = useActionState<State | null, FormData>(
    async (prev, formData) => {
      const res = await action(prev, formData);
      if (res?.reauthRequired) setRetryData(formData);
      return res;
    },
    null,
  );

  const modal = retryData ? (
    <MfaReauthModal
      onVerified={() => {
        const fd = retryData;
        setRetryData(null);
        startTransition(() => dispatch(fd));
      }}
      onCancel={() => setRetryData(null)}
    />
  ) : null;

  return [state, dispatch, isPending, modal];
}

/**
 * <form> con re-autenticación MFA para acciones void+redirect (sin useActionState
 * en la página). La acción debe devolver `{ reauthRequired: true }` cuando
 * requireRecentMfa bote; en cualquier otro caso su redirect/return sigue igual.
 */
export function ReauthForm({
  action,
  confirmMessage,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<{ reauthRequired?: boolean } | void>;
  /** Confirmación previa estilo <ConfirmAction> (window.confirm nativo). */
  confirmMessage?: string;
  className?: string;
  children: ReactNode;
}) {
  const [, formAction, , reauthModal] = useMfaReauthAction<{ reauthRequired?: boolean }>(
    async (_prev, fd) => {
      const res = await action(fd);
      return res ?? null;
    },
  );

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      e.preventDefault();
    }
  }

  return (
    <>
      <form action={formAction} onSubmit={handleSubmit} className={className}>
        {children}
      </form>
      {reauthModal}
    </>
  );
}
