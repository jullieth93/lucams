"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { MapPin, Plus, Star, Pencil, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  StructuredAddressFields,
  EMPTY_STRUCTURED_ADDRESS,
  type StructuredAddressValue,
} from "@/components/address/structured-address-fields";
import { PhoneInput } from "@/components/phone-input";
import { getDepartmentByName, getCityByDeptAndName } from "@/lib/dane-divipola";
import { getZone, getZoneCityByCode } from "@/lib/lucams-zones";
import { asDestinationType, DESTINATION_PLAIN_LABELS } from "@/features/checkout/destination-types";
import {
  saveAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  type AddressActionState,
} from "./actions";
import type { AccountTexts } from "../account-texts";

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

/** "Localidad: Chapinero" para la tarjeta, cuando la dirección tiene zona del
 *  catálogo (lib/lucams-zones). null si no aplica o el id ya no es válido. */
function zoneLine(structured: Record<string, unknown> | null): string | null {
  if (!structured) return null;
  const cityCode = typeof structured.cityCode === "string" ? structured.cityCode : null;
  const localityId = typeof structured.localityId === "string" ? structured.localityId : null;
  const zone = getZone(cityCode, localityId);
  if (!zone) return null;
  const label = getZoneCityByCode(cityCode)?.zoneLabel ?? "Zona";
  return `${label}: ${zone.name}`;
}

/** Título de la tarjeta: label limpio (sin emoji) del tipo de destino cuando la
 *  dirección estructurada lo tiene; fallback a `name` para filas legacy/rurales. */
function cardTitle(address: AddressView): string {
  const type = asDestinationType(address.structured?.destinationType);
  return type ? DESTINATION_PLAIN_LABELS[type] : address.name;
}

export function AddressManager({
  addresses,
  texts,
}: {
  addresses: AddressView[];
  texts: AccountTexts["address"];
}) {
  // null = form cerrado; "new" = agregar; AddressView = editar esa dirección.
  const [editing, setEditing] = useState<AddressView | "new" | null>(null);

  return (
    <div className="space-y-4">
      {addresses.length === 0 && !editing && (
        <div className="border-brand-purple/15 rounded-2xl border border-dashed bg-white p-8 text-center">
          <MapPin className="text-brand-purple/60 mx-auto h-8 w-8" />
          <p className="text-brand-purple-dark mt-3 font-semibold">{texts.emptyTitle}</p>
          <p className="text-brand-muted mt-1 text-sm">{texts.emptySub}</p>
        </div>
      )}

      {addresses.length > 0 && (
        <ul className="space-y-3">
          {addresses.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              texts={texts}
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
          texts={texts}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditing("new")}
          className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 w-full border-dashed"
        >
          <Plus className="h-4 w-4" /> {texts.add}
        </Button>
      )}
    </div>
  );
}

function AddressCard({
  address,
  texts,
  onEdit,
  editingThis,
}: {
  address: AddressView;
  texts: AccountTexts["address"];
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
            <span className="text-brand-purple-dark font-semibold">{cardTitle(address)}</span>
            {address.isDefault && (
              <span className="bg-brand-purple/15 text-brand-purple-dark inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold">
                <Star className="h-3 w-3" /> {texts.defaultBadge}
              </span>
            )}
          </div>
          <p className="text-brand-muted mt-1 text-sm">
            {address.line1} · {address.city}, {address.department}
          </p>
          {zoneLine(address.structured) && (
            <p className="text-brand-muted text-xs">{zoneLine(address.structured)}</p>
          )}
          {typeof address.structured?.neighborhood === "string" &&
            address.structured.neighborhood && (
              <p className="text-brand-muted text-xs">Barrio {address.structured.neighborhood}</p>
            )}
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
            <Check className="h-3.5 w-3.5" /> {texts.makeDefault}
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="text-brand-muted hover:text-brand-purple-dark ml-auto inline-flex items-center gap-1 text-xs font-medium"
        >
          <Pencil className="h-3.5 w-3.5" /> {texts.edit}
        </button>
        {confirmDelete ? (
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="text-brand-muted">{texts.confirm}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteAddressAction(address.id))}
              className="font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
            >
              {texts.confirmYes}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-brand-muted"
            >
              {texts.confirmNo}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-700"
          >
            <Trash2 className="h-3.5 w-3.5" /> {texts.delete}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </li>
  );
}

function AddressForm({
  address,
  texts,
  onDone,
}: {
  address: AddressView | null;
  texts: AccountTexts["address"];
  onDone: () => void;
}) {
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
  // desde `structured`. Las legacy (sin structured) NO arrancan del todo vacías:
  // pre-sembramos depto/ciudad/CP desde los nombres flat (DANE por nombre) para que
  // editar una dirección vieja no abra en blanco ni bloquee el guardado (rev. #2/#5/#10).
  const [addr, setAddr] = useState<StructuredAddressValue>(() => {
    if (address?.structured) {
      const merged = {
        ...EMPTY_STRUCTURED_ADDRESS,
        ...address.structured,
      } as StructuredAddressValue;
      // Migración visual suave (2026-10): el `detail` libre legacy se muestra
      // como punto de referencia si la dirección no tiene tipo de destino —
      // mismo criterio que el checkout (referencePointFromStructured).
      const legacyDetail = (address.structured as Record<string, unknown>).detail;
      if (!merged.destinationType && !merged.referencePoint && typeof legacyDetail === "string") {
        merged.referencePoint = legacyDetail;
      }
      return merged;
    }
    if (address) {
      const dept = getDepartmentByName(address.department);
      const city = dept ? getCityByDeptAndName(dept.code, address.city) : null;
      return {
        ...EMPTY_STRUCTURED_ADDRESS,
        deptCode: dept?.code ?? "",
        cityCode: city?.code ?? "",
        zip: city?.zip ?? "",
      };
    }
    return EMPTY_STRUCTURED_ADDRESS;
  });
  // Una legacy solo trae depto/ciudad; el resto de la calle debe re-capturarse en el
  // formato nuevo. Avisamos para que no parezca que "se perdieron" datos.
  const isLegacyEdit = Boolean(address && !address.structured);

  return (
    <form
      action={formAction}
      className="border-brand-purple/20 space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
    >
      <h3 className="text-brand-purple-dark font-display text-lg">
        {address ? texts.editTitle : texts.newTitle}
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

      {isLegacyEdit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-semibold">{texts.legacyTitle}</p>
          <p className="mt-0.5 text-amber-700">{texts.legacyNote}</p>
          {address?.line1 && (
            <p className="mt-1 text-xs text-amber-600">
              {texts.legacyPrev} {address.line1}
            </p>
          )}
        </div>
      )}

      <StructuredAddressFields
        value={addr}
        onChange={(patch) => setAddr((prev) => ({ ...prev, ...patch }))}
        errors={state?.fieldErrors}
        disabled={pending}
        neighborhoodPlaceholder={texts.neighborhoodPlaceholder}
      />

      {/* Teléfono con indicativo (+57 🇨🇴 por defecto) — el server valida y
          normaliza con normalizePhoneWithDial (misma regla del checkout para
          Colombia: móvil de 10 dígitos empezando en 3). */}
      <div className="space-y-1.5">
        <Label htmlFor="phone">Teléfono *</Label>
        <PhoneInput
          id="phone"
          name="phone"
          required
          defaultValue={address?.phone ?? ""}
          disabled={pending}
          error={state?.fieldErrors?.phone?.[0]}
        />
      </div>

      <label className="text-brand-purple-dark flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.isDefault ?? false}
          className="accent-brand-purple h-4 w-4 rounded"
        />
        {texts.defaultCheck}
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {texts.cancel}
        </Button>
        <Button
          type="submit"
          disabled={pending}
          className="bg-brand-purple hover:bg-brand-purple-dark font-semibold text-white"
        >
          {pending ? texts.saving : texts.save}
        </Button>
      </div>
    </form>
  );
}
