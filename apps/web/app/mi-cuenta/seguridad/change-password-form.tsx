"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { changePasswordAction, type ChangePasswordState } from "./actions";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ChangePasswordState | null, FormData>(
    changePasswordAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state?.success && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {state.success}
        </div>
      )}
      {state?.error && !state.fieldErrors && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          {state.error}
        </div>
      )}

      <Field
        id="currentPassword"
        label="Contraseña actual"
        autoComplete="current-password"
        error={state?.fieldErrors?.currentPassword?.[0]}
        disabled={pending}
      />
      <Field
        id="newPassword"
        label="Nueva contraseña"
        autoComplete="new-password"
        error={state?.fieldErrors?.newPassword?.[0]}
        disabled={pending}
      />
      <Field
        id="confirmPassword"
        label="Confirmar nueva contraseña"
        autoComplete="new-password"
        error={state?.fieldErrors?.confirmPassword?.[0]}
        disabled={pending}
      />

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending}
          className="bg-brand-purple hover:bg-brand-purple-dark font-semibold text-white"
        >
          {pending ? "Guardando..." : "Cambiar contraseña"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  ...props
}: {
  id: string;
  label: string;
  error?: string;
} & React.ComponentProps<typeof PasswordInput>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <PasswordInput id={id} name={id} required aria-invalid={Boolean(error)} {...props} />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
