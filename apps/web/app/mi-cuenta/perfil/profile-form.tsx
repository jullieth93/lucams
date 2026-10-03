"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/colombia-validators";
import type { AccountTexts } from "../account-texts";
import { updateProfileAction, type ProfileActionState } from "./actions";

export function ProfileForm({
  initial,
  texts,
}: {
  initial: {
    firstName: string;
    lastName: string;
    phone: string;
    documentType: string;
    documentNumber: string;
  };
  /** Textos CMS de la sección perfil (los resuelve el padre server, regla CMS). */
  texts: AccountTexts["perfil"];
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

      {/* Documento DIAN (T7): mismo enum + validador del checkout. Las
          etiquetas llegan por props (CMS) — cero literales nuevos acá. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="documentType">{texts.docTypeLabel}</Label>
          <select
            id="documentType"
            name="documentType"
            defaultValue={initial.documentType}
            disabled={pending}
            aria-invalid={Boolean(state?.fieldErrors?.documentType?.[0])}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-3 text-sm focus:ring-2 focus:outline-none disabled:opacity-50"
          >
            <option value="">{texts.docTypePlaceholder}</option>
            {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {state?.fieldErrors?.documentType?.[0] && (
            <p className="text-destructive text-sm">{state.fieldErrors.documentType[0]}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Field
            id="documentNumber"
            label={texts.docNumberLabel}
            inputMode="numeric"
            defaultValue={initial.documentNumber}
            error={state?.fieldErrors?.documentNumber?.[0]}
            disabled={pending}
          />
          <p className="text-brand-muted text-xs">{texts.docHint}</p>
        </div>
      </div>

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
