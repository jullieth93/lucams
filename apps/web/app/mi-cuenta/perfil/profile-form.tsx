"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/phone-input";
import {
  DOCUMENT_TYPE_LABELS,
  calculateNitDV,
  capitalizeName,
  countWords,
  getDocumentHelp,
  normalizePhoneWithDial,
  validateDocument,
  validateName,
  type DocumentType,
} from "@/lib/colombia-validators";
import type { AccountTexts } from "../account-texts";
import { updateProfileAction, type ProfileActionState } from "./actions";

// Topes de palabras acordados (misma regla en el server): nombre máx 3,
// apellido máx 2. capitalizeName al blur respeta de/del/la/las…
const MAX_FIRST_NAME_WORDS = 3;
const MAX_LAST_NAME_WORDS = 2;

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

  // Controlados para aplicar transformación (capitalizeName al blur) y
  // validación live con los mismos validadores del checkout.
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [docType, setDocType] = useState(initial.documentType);
  const [docNumber, setDocNumber] = useState(initial.documentNumber);
  const [phone, setPhone] = useState({ national: "", dial: "57" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const srv = (k: keyof NonNullable<ProfileActionState["fieldErrors"]>) =>
    state?.fieldErrors?.[k]?.[0];

  // ─── Errores efectivos (cliente tras tocar ?? server) — patrón del checkout ───
  const nameError = (value: string, maxWords: number): string | null => {
    if (!value.trim()) return null;
    if (!validateName(value)) return "Solo letras, sin números ni símbolos (mínimo 2 caracteres).";
    if (countWords(value) > maxWords) return `Máximo ${maxWords} palabras.`;
    return null;
  };
  const firstNameErr =
    (touched.firstName ? nameError(firstName, MAX_FIRST_NAME_WORDS) : null) ?? srv("firstName");
  const lastNameErr =
    (touched.lastName ? nameError(lastName, MAX_LAST_NAME_WORDS) : null) ?? srv("lastName");

  const phoneClientErr =
    phone.national &&
    touched.phone &&
    normalizePhoneWithDial(`+${phone.dial} ${phone.national}`) === null
      ? phone.dial === "57"
        ? "Móvil colombiano: 10 dígitos empezando con 3"
        : "Revisa el número: entre 6 y 15 dígitos."
      : null;
  const phoneErr = phoneClientErr ?? srv("phone");

  const docTyped = docType as DocumentType | "";
  const docClientErr =
    docTyped && docNumber.trim() && touched.documentNumber && !validateDocument(docTyped, docNumber)
      ? `Formato inválido. ${getDocumentHelp(docTyped)}`
      : null;
  const docNumberErr = docClientErr ?? srv("documentNumber");
  // NIT sin DV: mostramos el dígito de verificación que se agregará al guardar.
  const nitDv =
    docTyped === "NIT" && /^\d{9}$/.test(docNumber.trim()) ? calculateNitDV(docNumber) : "";

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
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          onBlur={() => {
            if (firstName.trim()) setFirstName(capitalizeName(firstName));
            markTouched("firstName");
          }}
          error={firstNameErr}
          disabled={pending}
          autoComplete="given-name"
          maxLength={60}
        />
        <Field
          id="lastName"
          label="Apellido"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          onBlur={() => {
            if (lastName.trim()) setLastName(capitalizeName(lastName));
            markTouched("lastName");
          }}
          error={lastNameErr}
          disabled={pending}
          autoComplete="family-name"
          maxLength={60}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Teléfono</Label>
        <PhoneInput
          id="phone"
          name="phone"
          defaultValue={initial.phone}
          disabled={pending}
          error={phoneErr}
          onChange={(national, dial) => setPhone({ national, dial })}
          onBlur={() => markTouched("phone")}
        />
      </div>

      {/* Documento DIAN (T7): mismo enum + validador del checkout, con ayuda
          por tipo (CC solo números, Pasaporte alfanumérico, NIT con DV). */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="documentType">{texts.docTypeLabel}</Label>
          <select
            id="documentType"
            name="documentType"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
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
            inputMode={docTyped === "PP" ? "text" : "numeric"}
            value={docNumber}
            onChange={(e) =>
              setDocNumber(
                docTyped === "PP"
                  ? e.target.value.replace(/[^\da-zA-Z]/g, "").slice(0, 12)
                  : e.target.value.replace(/[^\d-]/g, "").slice(0, 11),
              )
            }
            onBlur={() => markTouched("documentNumber")}
            error={docNumberErr}
            disabled={pending}
            maxLength={docTyped === "PP" ? 12 : 11}
          />
          <p className="text-brand-muted text-xs">
            {docTyped ? getDocumentHelp(docTyped) : texts.docHint}
          </p>
          {nitDv && (
            <p className="text-brand-muted text-xs">
              Dígito de verificación: <strong>{nitDv}</strong> — lo agregamos al guardar.
            </p>
          )}
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
  error?: string | null;
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
