"use client";

import { useActionState } from "react";
import { Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { AdminNotice } from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteOcasionAction,
  restoreOcasionAction,
  updateOcasionAction,
  type OcasionActionState,
} from "../actions";

const MONTH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo (Día de la Mujer)" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo (Día de la Madre)" },
  { value: 6, label: "Junio (Día del Padre)" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre (Amor y Amistad)" },
  { value: 10, label: "Octubre (Halloween)" },
  { value: 11, label: "Noviembre (Grados)" },
  { value: 12, label: "Diciembre (Navidad)" },
];

type Props = {
  ocasion: {
    id: string;
    slug: string;
    name: string;
    description: string;
    monthHint: number | null;
    suggestedQuantityRange: { min: number; ideal: number; max: number } | null;
    order: number;
    isActive: boolean;
    deletedAt: string | null;
  };
};

export function EditOcasionForm({ ocasion }: Props) {
  const [state, formAction, isPending] = useActionState<OcasionActionState | null, FormData>(
    updateOcasionAction,
    null,
  );
  const isArchived = Boolean(ocasion.deletedAt);

  return (
    <>
      {isArchived && (
        <div className="mb-4">
          <AdminNotice tone="warning">
            Esta ocasión está <strong>archivada</strong> y no aparece en la tienda ni en filtros.
            Puedes restaurarla abajo cuando quieras volver a usarla.
          </AdminNotice>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={ocasion.id} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label
              htmlFor="edit-name"
              className="text-brand-purple-dark mb-1 block text-sm font-medium"
            >
              Nombre <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={ocasion.name}
              required
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            {state?.fieldErrors?.name && (
              <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.name[0]}</p>
            )}
          </div>
          <div>
            <Label
              htmlFor="edit-slug"
              className="text-brand-purple-dark mb-1 block text-sm font-medium"
            >
              Slug <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="edit-slug"
              name="slug"
              defaultValue={ocasion.slug}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 font-mono text-sm"
            />
            <p className="text-brand-muted mt-1 text-[11px]">
              Si cambias el slug, creamos automáticamente un redirect 301 desde{" "}
              <code>/ocasion/{ocasion.slug}</code> para no romper enlaces existentes.
            </p>
            {state?.fieldErrors?.slug && (
              <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.slug[0]}</p>
            )}
          </div>
        </div>

        <div>
          <Label
            htmlFor="edit-description"
            className="text-brand-purple-dark mb-1 block text-sm font-medium"
          >
            Descripción semántica y SEO <span className="text-rose-600">*</span>
          </Label>
          <p className="text-brand-muted mb-2 text-xs">
            Se muestra y utiliza en <code>/ocasion/{ocasion.slug}</code>, en filtros de catálogo y
            en el motor de recomendación (<code>/api/catalog/recommend</code>).
          </p>
          <Textarea
            id="edit-description"
            name="description"
            defaultValue={ocasion.description}
            required
            rows={5}
            minLength={20}
            maxLength={2000}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 text-sm"
          />
          {state?.fieldErrors?.description && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.description[0]}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label
              htmlFor="edit-monthHint"
              className="text-brand-purple-dark mb-1 block text-sm font-medium"
            >
              Mes destacado
            </Label>
            <select
              id="edit-monthHint"
              name="monthHint"
              defaultValue={ocasion.monthHint ?? ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Todo el año (sin mes fijo)</option>
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {state?.fieldErrors?.monthHint && (
              <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.monthHint[0]}</p>
            )}
          </div>
          <div>
            <Label
              htmlFor="edit-order"
              className="text-brand-purple-dark mb-1 block text-sm font-medium"
            >
              Orden de aparición
            </Label>
            <Input
              id="edit-order"
              name="order"
              type="number"
              min="0"
              defaultValue={ocasion.order}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            {state?.fieldErrors?.order && (
              <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.order[0]}</p>
            )}
          </div>
        </div>

        <fieldset className="border-brand-purple/15 rounded-xl border bg-slate-50/50 p-3.5">
          <legend className="text-brand-purple-dark px-2 text-sm font-semibold">
            Cantidad sugerida (opcional)
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label
                htmlFor="edit-rangeMin"
                className="text-brand-purple-dark/80 mb-1 block text-xs"
              >
                Mínimo
              </Label>
              <Input
                id="edit-rangeMin"
                name="rangeMin"
                type="number"
                min="1"
                defaultValue={ocasion.suggestedQuantityRange?.min ?? ""}
                className="border-brand-purple/20 bg-white text-sm"
              />
            </div>
            <div>
              <Label
                htmlFor="edit-rangeIdeal"
                className="text-brand-purple-dark/80 mb-1 block text-xs"
              >
                Ideal
              </Label>
              <Input
                id="edit-rangeIdeal"
                name="rangeIdeal"
                type="number"
                min="1"
                defaultValue={ocasion.suggestedQuantityRange?.ideal ?? ""}
                className="border-brand-purple/20 bg-white text-sm"
              />
            </div>
            <div>
              <Label
                htmlFor="edit-rangeMax"
                className="text-brand-purple-dark/80 mb-1 block text-xs"
              >
                Máximo
              </Label>
              <Input
                id="edit-rangeMax"
                name="rangeMax"
                type="number"
                min="1"
                defaultValue={ocasion.suggestedQuantityRange?.max ?? ""}
                className="border-brand-purple/20 bg-white text-sm"
              />
            </div>
          </div>
        </fieldset>

        {!isArchived && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={ocasion.isActive}
              className="accent-brand-purple h-4 w-4 rounded border-slate-300"
            />
            <span className="text-brand-purple-dark font-medium">
              Activa (visible en tienda y filtros)
            </span>
          </label>
        )}

        {state?.error && <AdminNotice tone="error">{state.error}</AdminNotice>}

        <Button
          type="submit"
          disabled={isPending}
          className="bg-gradient-brand text-white hover:brightness-110"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-4 w-4" />
              Guardar cambios
            </>
          )}
        </Button>
      </form>

      {isArchived ? (
        <form action={restoreOcasionAction} className="border-brand-purple/10 mt-6 border-t pt-5">
          <input type="hidden" name="id" value={ocasion.id} />
          <Button type="submit" variant="outline" size="sm" className="text-brand-purple-dark">
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Restaurar ocasión (como inactiva)
          </Button>
        </form>
      ) : (
        <ConfirmAction
          action={deleteOcasionAction}
          message="¿Archivar esta ocasión? Dejará de mostrarse en la tienda y filtros hasta que la restaures."
          className="border-brand-purple/10 mt-6 border-t pt-5"
        >
          <input type="hidden" name="id" value={ocasion.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-700 hover:text-rose-900"
          >
            <Trash2 className="h-4 w-4" />
            Archivar ocasión
          </button>
        </ConfirmAction>
      )}
    </>
  );
}
