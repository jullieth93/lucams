"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveDatosAction, type DatosActionState } from "./actions";
import type { CheckoutState } from "@/lib/checkout-session";

export function DatosForm({ initial }: { initial: CheckoutState }) {
  const [state, formAction, pending] = useActionState<DatosActionState | null, FormData>(
    saveDatosAction,
    null,
  );
  const [wantsInvoice, setWantsInvoice] = useState<boolean>(initial.billing?.wantsInvoice ?? false);

  function err(field: string): string | null {
    return state?.fieldErrors?.[field]?.[0] ?? null;
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* CONTACTO */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-4 text-lg font-bold">1. Contacto</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="fullName"
            label="Nombre completo"
            required
            defaultValue={initial.contact?.fullName ?? ""}
            error={err("fullName")}
            placeholder="Ej. Lucy Hurtado"
          />
          <Field
            id="email"
            type="email"
            label="Email"
            required
            defaultValue={initial.contact?.email ?? ""}
            error={err("email")}
            placeholder="ej. tu@correo.com"
            help="Aquí te enviamos la confirmación + tracking."
          />
          <Field
            id="phone"
            type="tel"
            label="Teléfono"
            required
            defaultValue={initial.contact?.phone ?? ""}
            error={err("phone")}
            placeholder="Ej. 320 887 3826"
            help="El courier lo usa para coordinar entrega."
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label
                htmlFor="contactDocumentType"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                Documento (opcional)
              </Label>
              <select
                id="contactDocumentType"
                name="contactDocumentType"
                defaultValue={initial.contact?.documentType ?? ""}
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none"
              >
                <option value="">—</option>
                <option value="CC">CC</option>
                <option value="CE">CE</option>
                <option value="NIT">NIT</option>
                <option value="PP">Pasaporte</option>
                <option value="TI">TI</option>
              </select>
            </div>
            <div>
              <Label
                htmlFor="contactDocumentNumber"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                Número
              </Label>
              <Input
                id="contactDocumentNumber"
                name="contactDocumentNumber"
                defaultValue={initial.contact?.documentNumber ?? ""}
                placeholder="1.234.567.890"
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-9"
              />
            </div>
          </div>
        </div>
      </section>

      {/* DIRECCIÓN */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-4 text-lg font-bold">
          2. Dirección de envío
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <Field
              id="city"
              label="Ciudad"
              required
              defaultValue={initial.address?.city ?? ""}
              error={err("city")}
              placeholder="Ej. Medellín"
            />
          </div>
          <div className="sm:col-span-3">
            <Field
              id="department"
              label="Departamento"
              required
              defaultValue={initial.address?.department ?? ""}
              error={err("department")}
              placeholder="Ej. Antioquia"
            />
          </div>
          <div className="sm:col-span-4">
            <Field
              id="addressLine1"
              label="Dirección"
              required
              defaultValue={initial.address?.addressLine1 ?? ""}
              error={err("addressLine1")}
              placeholder="Calle 100 # 15-20"
            />
          </div>
          <div className="sm:col-span-2">
            <Field
              id="zip"
              label="Código postal (opcional)"
              defaultValue={initial.address?.zip ?? ""}
              error={err("zip")}
              placeholder="050001"
            />
          </div>
          <div className="sm:col-span-6">
            <Field
              id="addressLine2"
              label="Complemento (opcional)"
              defaultValue={initial.address?.addressLine2 ?? ""}
              error={err("addressLine2")}
              placeholder="Apto 401, casa color rosa, conjunto Lucams"
            />
          </div>
          <div className="sm:col-span-6">
            <Label
              htmlFor="notes"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Notas para el courier (opcional)
            </Label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={initial.address?.notes ?? ""}
              maxLength={500}
              placeholder="Ej. timbre 2, dejar con portería"
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            {err("notes") && <p className="mt-1 text-xs text-rose-600">{err("notes")}</p>}
          </div>
        </div>
      </section>

      {/* FACTURACIÓN */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-2 text-lg font-bold">
          3. Facturación electrónica
        </h2>
        <p className="text-brand-purple-dark/65 mb-4 text-sm">
          Si necesitás factura DIAN para tu empresa, marcá la casilla. Si es compra personal, dejala
          desmarcada.
        </p>

        <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="wantsInvoice"
            checked={wantsInvoice}
            onChange={(e) => setWantsInvoice(e.target.checked)}
            className="accent-brand-purple h-4 w-4"
          />
          Quiero factura electrónica
        </label>

        {wantsInvoice && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <Label
                htmlFor="billingDocumentType"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                Tipo doc <span className="text-rose-600">*</span>
              </Label>
              <select
                id="billingDocumentType"
                name="billingDocumentType"
                defaultValue={initial.billing?.documentType ?? "NIT"}
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none"
              >
                <option value="NIT">NIT</option>
                <option value="CC">CC</option>
                <option value="CE">CE</option>
                <option value="PP">Pasaporte</option>
              </select>
            </div>
            <div className="sm:col-span-4">
              <Field
                id="billingDocumentNumber"
                label="Número documento"
                required
                defaultValue={initial.billing?.documentNumber ?? ""}
                error={err("billingDocumentNumber")}
                placeholder="900.123.456-7"
              />
            </div>
            <div className="sm:col-span-6">
              <Field
                id="billingName"
                label="Razón social o nombre"
                required
                defaultValue={initial.billing?.name ?? ""}
                error={err("billingName")}
                placeholder="Ej. Lucams S.A.S."
              />
            </div>
          </div>
        )}
        {err("wantsInvoice") && <p className="mt-2 text-xs text-rose-600">{err("wantsInvoice")}</p>}
      </section>

      {state?.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          ⚠️ {state.error}
        </div>
      )}

      <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          disabled={pending}
          size="lg"
          className="bg-gradient-brand w-full text-white hover:brightness-110 sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…
            </>
          ) : (
            "Continuar al envío →"
          )}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  defaultValue,
  error,
  placeholder,
  help,
  type = "text",
}: {
  id: string;
  label: string;
  required?: boolean;
  defaultValue?: string;
  error?: string | null;
  placeholder?: string;
  help?: string;
  type?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-brand-purple-dark mb-1 block text-xs font-semibold">
        {label}
        {required && <span className="text-rose-600"> *</span>}
      </Label>
      <Input
        id={id}
        name={id}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
      />
      {help && !error && <p className="text-brand-purple-dark/55 mt-1 text-xs">{help}</p>}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
