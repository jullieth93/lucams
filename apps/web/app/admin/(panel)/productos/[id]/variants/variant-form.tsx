/*
 * VariantForm — client component compartido (create + edit).
 *
 * Usa useActionState para mostrar errores. Maneja attributes con
 * helpers granulares (size, photoSlots, quantity, shape, finish,
 * color, aspectRatio).
 */

"use client";

import { useActionState, useState } from "react";
import { Loader2, Save, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdminNotice } from "@/components/admin-page";
import { createVariantAction, updateVariantAction, type VariantActionState } from "./actions";
import type { ProductVariantAttributes } from "@/features/products/variant-schemas";

type VariantInput = {
  id?: string;
  name?: string;
  sku?: string;
  description?: string | null;
  price?: number | null;
  stock?: number;
  isActive?: boolean;
  attributes?: ProductVariantAttributes;
};

export function VariantForm({
  productId,
  variant,
  onClose,
}: {
  productId: string;
  variant?: VariantInput;
  onClose?: () => void;
}) {
  const isEdit = !!variant?.id;
  const [state, formAction, pending] = useActionState<VariantActionState | null, FormData>(
    isEdit ? updateVariantAction : createVariantAction,
    null,
  );
  const attrs = variant?.attributes ?? {};

  // Estado controlado para SUGERIR el nombre en vivo desde las características (D3).
  const [name, setName] = useState(variant?.name ?? "");
  const [photoSlots, setPhotoSlots] = useState(attrs.photoSlots?.toString() ?? "");
  const [quantity, setQuantity] = useState(attrs.quantity?.toString() ?? "");
  const [sizeCm, setSizeCm] = useState(attrs.sizeCm ?? "");
  const [color, setColor] = useState(attrs.color ?? "");

  const suggestedName = buildSuggestedName({ photoSlots, quantity, sizeCm, color });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      {isEdit && <input type="hidden" name="id" value={variant!.id} />}
      {/* D2 (Lucy 2026-06-27): forma / acabado / proporción ya no se muestran
          (nunca los usa). Se preservan ocultos para NO perder datos de opciones
          que sí los tuvieran. */}
      <input type="hidden" name="attr_shape" value={attrs.shape ?? ""} />
      <input type="hidden" name="attr_finish" value={attrs.finish ?? ""} />
      <input type="hidden" name="attr_aspectRatio" value={attrs.aspectRatio ?? ""} />

      {state?.error && <AdminNotice tone="error">{state.error}</AdminNotice>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Field
            label="Nombre de la opción"
            name="name"
            value={name}
            onChange={setName}
            required
            placeholder="Ej. Set 12 fotos"
            error={state?.fieldErrors?.name?.[0]}
            hint="Como lo verá el cliente al elegir esta opción."
          />
          {suggestedName && suggestedName !== name && (
            <button
              type="button"
              onClick={() => setName(suggestedName)}
              className="text-brand-purple hover:text-brand-purple-dark mt-1 inline-flex items-center gap-1 text-[11px] font-semibold"
              title="Usar esta sugerencia como nombre"
            >
              <Sparkles className="h-3 w-3" />
              Sugerencia: “{suggestedName}” · usar
            </button>
          )}
        </div>
        <Field
          label="Código (SKU)"
          name="sku"
          defaultValue={variant?.sku}
          required
          placeholder="POLAROID-12"
          mono
          error={state?.fieldErrors?.sku?.[0]}
          hint="Identificador interno único — solo letras, números y guion."
        />
        <Field
          label="Precio de esta opción (COP)"
          name="price"
          type="number"
          prefix="$"
          defaultValue={variant?.price != null ? Math.round(variant.price / 100).toString() : ""}
          placeholder="45000"
          mono
          error={state?.fieldErrors?.price?.[0]}
          hint="En pesos colombianos (ej. 45000 = $45.000). Vacío = usa el precio del producto."
        />
        {/* El stock se edita con el botón rápido del listado de opciones y en
            Inventario, no acá — para no tenerlo en dos lados. */}
      </div>

      <Field
        label="Nota interna (opcional)"
        name="description"
        defaultValue={variant?.description ?? ""}
        placeholder="Solo para ti / el equipo. El cliente no la ve."
        as="textarea"
      />

      {/* Características de la opción — lenguaje llano (Lucy 2026-06-27). */}
      <div className="border-brand-purple/10 rounded-lg border bg-white/60 p-4">
        <h4 className="text-brand-purple-dark text-sm font-bold">¿En qué se diferencia esta opción?</h4>
        <p className="text-brand-purple-dark/55 mt-0.5 mb-3 text-xs">
          Llena solo lo que aplique. Con esto armamos la sugerencia de nombre y, en productos
          personalizables, sabemos cuántas fotos pedirle al cliente.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="¿Cuántas fotos lleva?"
            name="attr_photoSlots"
            type="number"
            value={photoSlots}
            onChange={setPhotoSlots}
            placeholder="Ej: 12"
            hint="Espacios para fotos que sube el cliente."
          />
          <Field
            label="¿Cuántas unidades trae?"
            name="attr_quantity"
            type="number"
            value={quantity}
            onChange={setQuantity}
            placeholder="Ej: 6"
            hint="Para packs o sets ya armados."
          />
          <Field
            label="Tamaño"
            name="attr_sizeCm"
            value={sizeCm}
            onChange={setSizeCm}
            placeholder="Ej: 7×9 cm"
          />
          <Field
            label="Color"
            name="attr_color"
            value={color}
            onChange={setColor}
            placeholder="Ej: rosa, azul…"
          />
        </div>
      </div>

      {/* isActive */}
      <label className="text-brand-purple-dark flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={variant?.isActive ?? true}
          className="accent-brand-purple h-4 w-4"
        />
        Visible para el cliente (aparece como opción en la tienda)
      </label>

      <div className="flex items-center gap-2 pt-2">
        <Button
          type="submit"
          disabled={pending}
          className="bg-gradient-brand text-white hover:brightness-110"
        >
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          {isEdit ? "Guardar cambios" : "Crear opción"}
        </Button>
        {onClose && (
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

/** Sugerencia de nombre de opción a partir de sus características (D3). */
function buildSuggestedName(a: {
  photoSlots: string;
  quantity: string;
  sizeCm: string;
  color: string;
}): string {
  const parts: string[] = [];
  if (a.photoSlots.trim()) parts.push(`${a.photoSlots.trim()} fotos`);
  if (a.quantity.trim()) parts.push(`${a.quantity.trim()} unidades`);
  if (a.sizeCm.trim()) parts.push(a.sizeCm.trim());
  if (a.color.trim()) parts.push(a.color.trim());
  return parts.join(" · ");
}

function Field({
  label,
  name,
  defaultValue,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  mono,
  hint,
  error,
  as,
  prefix,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  /** Si se pasa value+onChange, el input es controlado (para sugerencias en vivo). */
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  mono?: boolean;
  hint?: string;
  error?: string;
  as?: "textarea";
  /** Adorno a la izquierda del input (ej. "$" para precios). */
  prefix?: string;
}) {
  const controlled = value !== undefined && onChange !== undefined;
  const baseClass = `border-brand-purple/20 focus-visible:ring-brand-purple/30 ${
    mono ? "font-mono text-sm" : ""
  }`;
  return (
    <div>
      <label htmlFor={name} className="text-brand-purple-dark mb-1 block text-xs font-semibold">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {as === "textarea" ? (
        <textarea
          id={name}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          rows={2}
          className={`${baseClass} w-full rounded-md border bg-white px-3 py-2 text-sm`}
        />
      ) : (
        <div className="relative">
          {prefix && (
            <span className="text-brand-purple-dark/50 pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
              {prefix}
            </span>
          )}
          <Input
            id={name}
            name={name}
            type={type}
            placeholder={placeholder}
            required={required}
            className={`${baseClass} ${prefix ? "pl-7" : ""}`}
            {...(controlled
              ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange!(e.target.value) }
              : { defaultValue })}
          />
        </div>
      )}
      {hint && !error && <p className="text-brand-purple-dark/55 mt-1 text-[11px]">{hint}</p>}
      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
