"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { MapPin, Plus, Star, Pencil, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  StructuredAddressFields,
  EMPTY_STRUCTURED_ADDRESS,
  type StructuredAddressValue,
} from "@/components/address/structured-address-fields";
import {
  saveAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  type AddressActionState,
} from "./actions";

export type AddressView = {
  id: string;
  name: string;
  line1: string;
  city: string;
  department: string;
  phone: string;
  isDefault: boolean;
  structured: Record<string, unknown> | null;
};

export function AddressManager({ addresses }: { addresses: AddressView[] }) {
  // null = form cerrado; "new" = agregar; AddressView = editar esa dirección.
  const [editing, setEditing] = useState<AddressView | "new" | null>(null);

  return (
    <div className="space-y-4">
      {addresses.length === 0 && !editing && (
        <div className="border-brand-purple/15 rounded-2xl border border-dashed bg-white p-8 text-center">
          <MapPin className="text-brand-purple/60 mx-auto h-8 w-8" />
          <p className="text-brand-purple-dark mt-3 font-semibold">
            Aún no tienes direcciones guardadas
          </p>
          <p className="text-brand-muted mt-1 text-sm">
            Guarda una para que tu próximo checkout sea más rápido.
          </p>
        </div>
      )}

      {addresses.length > 0 && (
        <ul className="space-y-3">
          {addresses.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              onEdit={() => setEditing(a)}
              editingThis={editing !== null && editing !== "new" && editing.id === a.id}
            />
          ))}
        </ul>
      )}

      {editing ? (
        <AddressForm
          key={editing === "new" ? "new" : editing.id}
          address={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditing("new")}
          className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 w-full border-dashed"
        >
          <Plus className="h-4 w-4" /> Agregar dirección
        </Button>
      )}
    </div>
  );
}

function AddressCard({
  address,
  onEdit,
  editingThis,
}: {
  address: AddressView;
  onEdit: () => void;
  editingThis: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError("No pudimos actualizar la dirección. Recarga e intenta de nuevo.");
    });

  return (
    <li
      className={`border-brand-purple/15 rounded-2xl border bg-white p-4 shadow-sm ${
        editingThis ? "ring-brand-purple/30 ring-2" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-brand-purple-dark font-semibold">{address.name}</span>
            {address.isDefault && (
              <span className="bg-brand-purple/15 text-brand-purple-dark inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold">
                <Star className="h-3 w-3" /> Predeterminada
              </span>
            )}
          </div>
          <p className="text-brand-muted mt-1 text-sm">
            {address.line1} · {address.city}, {address.department}
          </p>
          <p className="text-brand-muted text-xs">Tel: {address.phone}</p>
        </div>
      </div>

      <div className="border-brand-purple/10 mt-3 flex flex-wrap gap-2 border-t pt-3">
        {!address.isDefault && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setDefaultAddressAction(address.id))}
            className="text-brand-muted hover:text-brand-purple-dark inline-flex items-center gap-1 text-xs font-medium disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> Hacer predeterminada
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="text-brand-muted hover:text-brand-purple-dark ml-auto inline-flex items-center gap-1 text-xs font-medium"
        >
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
        {confirmDelete ? (
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="text-brand-muted">¿Seguro?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteAddressAction(address.id))}
              className="font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
            >
              Sí, eliminar
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-brand-muted"
            >
              No
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-700"
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </li>
  );
}

function AddressForm({ address, onDone }: { address: AddressView | null; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<AddressActionState | null, FormData>(
    saveAddressAction,
    null,
  );
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  // Al guardar con éxito, cerrar el formulario (la lista se refresca vía revalidatePath).
  useEffect(() => {
    if (state?.success) doneRef.current();
  }, [state?.success]);

  // Dirección ESTRUCTURADA (mismo formato que el checkout). En edición se hidrata
  // desde `structured`; las legacy (sin structured) arrancan vacías.
  const [addr, setAddr] = useState<StructuredAddressValue>(() =>
    address?.structured
      ? ({ ...EMPTY_STRUCTURED_ADDRESS, ...address.structured } as StructuredAddressValue)
      : EMPTY_STRUCTURED_ADDRESS,
  );

  return (
    <form
      action={formAction}
      className="border-brand-purple/20 space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
    >
      <h3 className="text-brand-purple-dark font-display text-lg">
        {address ? "Editar dirección" : "Nueva dirección"}
      </h3>
      {address && <input type="hidden" name="id" value={address.id} />}
      {state?.error && !state.fieldErrors && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          {state.error}
        </div>
      )}

      <F
        id="name"
        label="Etiqueta (ej. Casa, Oficina)"
        def={address?.name}
        err={state?.fieldErrors?.name}
        disabled={pending}
      />

      <StructuredAddressFields
        value={addr}
        onChange={(patch) => setAddr((prev) => ({ ...prev, ...patch }))}
        errors={state?.fieldErrors}
        disabled={pending}
      />

      <F
        id="phone"
        label="Teléfono"
        type="tel"
        placeholder="300 000 0000"
        def={address?.phone}
        err={state?.fieldErrors?.phone}
        disabled={pending}
      />

      <label className="text-brand-purple-dark flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.isDefault ?? false}
          className="accent-brand-purple h-4 w-4 rounded"
        />
        Usar como dirección predeterminada
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={pending}
          className="bg-brand-purple hover:bg-brand-purple-dark font-semibold text-white"
        >
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

function F({
  id,
  label,
  err,
  def,
  ...props
}: {
  id: string;
  label: string;
  err?: string[];
  def?: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} defaultValue={def} aria-invalid={Boolean(err)} {...props} />
      {err?.[0] && <p className="text-destructive text-sm">{err[0]}</p>}
    </div>
  );
}
