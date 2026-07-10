"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction, type ProfileActionState } from "./actions";

export function ProfileForm({
  initial,
}: {
  initial: { firstName: string; lastName: string; phone: string };
}) {
  const [state, formAction, pending] = useActionState<ProfileActionState | null, FormData>(
    updateProfileAction,
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="firstName"
          label="Nombre"
          defaultValue={initial.firstName}
          error={state?.fieldErrors?.firstName?.[0]}
          disabled={pending}
        />
        <Field
          id="lastName"
          label="Apellido"
          defaultValue={initial.lastName}
          error={state?.fieldErrors?.lastName?.[0]}
          disabled={pending}
        />
      </div>

      <Field
        id="phone"
        label="Teléfono"
        type="tel"
        placeholder="300 000 0000"
        defaultValue={initial.phone}
        error={state?.fieldErrors?.phone?.[0]}
        disabled={pending}
      />

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending}
          className="bg-brand-purple hover:bg-brand-purple-dark font-semibold text-white"
        >
          {pending ? "Guardando..." : "Guardar cambios"}
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
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
