/*
 * VariantForm — client component compartido (create + edit).
 *
 * Usa useActionState para mostrar errores. Maneja attributes con
 * helpers granulares (size, photoSlots, quantity, shape, finish,
 * color, aspectRatio).
 */

"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";
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

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      {isEdit && <input type="hidden" name="id" value={variant!.id} />}

      {state?.error && <AdminNotice tone="error">{state.error}</AdminNotice>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Nombre de la variante"
          name="name"
          defaultValue={variant?.name}
          required
          placeholder="Ej. Set 12 unidades"
          error={state?.fieldErrors?.name?.[0]}
          hint="Cómo se ve en el selector del PDP"
        />
        <Field
          label="SKU"
          name="sku"
          defaultValue={variant?.sku}
          required
          placeholder="POLAROID-12"
          mono
          error={state?.fieldErrors?.sku?.[0]}
          hint="Identificador único — solo letras/números/guion"
        />
        <Field
          label="Precio de esta opción"
          name="price"
          type="number"
          defaultValue={variant?.price != null ? Math.round(variant.price / 100).toString() : ""}
          placeholder="Ej: 45000"
          mono
          error={state?.fieldErrors?.price?.[0]}
          hint="En pesos (ej. 45000 = $45.000). Déjalo vacío para usar el precio del producto."
        />
        <Field
          label="Stock"
          name="stock"
          type="number"
          defaultValue={(variant?.stock ?? 0).toString()}
          mono
          hint="0 = sin enforcement (Fase 4 inventario real)"
        />
      </div>

      <Field
        label="Descripción interna"
        name="description"
        defaultValue={variant?.description ?? ""}
        placeholder="¿Por qué elegir esta variante vs otras? (uso futuro bot AI)"
        as="textarea"
      />

      {/* Attributes (lo que diferencia esta variante de las hermanas) */}
      <div className="border-brand-purple/10 rounded-lg border bg-white/60 p-4">
        <h4 className="text-brand-purple-dark mb-3 text-sm font-bold">
          Atributos diferenciadores
          <span className="text-brand-purple-dark/55 ml-2 text-xs font-normal">
            (qué hace que esta variante sea distinta)
          </span>
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            label="Cantidad de fotos"
            name="attr_photoSlots"
            type="number"
            defaultValue={attrs.photoSlots?.toString() ?? ""}
            mono
            hint="Slots para fotos del cliente"
          />
          <Field
            label="Cantidad unidades"
            name="attr_quantity"
            type="number"
            defaultValue={attrs.quantity?.toString() ?? ""}
            mono
            hint="Para packs/sets pre-armados"
          />
          <Field
            label="Tamaño físico"
            name="attr_sizeCm"
            defaultValue={attrs.sizeCm ?? ""}
            placeholder="7×9"
            hint="En centímetros"
          />
          <Field
            label="Color"
            name="attr_color"
            defaultValue={attrs.color ?? ""}
            placeholder="rosa, azul, etc."
          />
          <SelectField
            label="Forma"
            name="attr_shape"
            defaultValue={attrs.shape ?? ""}
            options={[
              { value: "", label: "— Heredar del producto —" },
              { value: "rectangle", label: "Rectángulo" },
              { value: "circle", label: "Círculo" },
              { value: "heart", label: "Corazón" },
              { value: "custom", label: "Personalizada" },
            ]}
          />
          <SelectField
            label="Acabado"
            name="attr_finish"
            defaultValue={attrs.finish ?? ""}
            options={[
              { value: "", label: "— Heredar del producto —" },
              { value: "matte", label: "Mate" },
              { value: "glossy", label: "Brillante" },
              { value: "soft-touch", label: "Soft touch" },
              { value: "glass", label: "Vidrio premium" },
            ]}
          />
          <Field
            label="Aspect ratio"
            name="attr_aspectRatio"
            defaultValue={attrs.aspectRatio ?? ""}
            placeholder="1:1, 4:5"
            hint="Override del producto"
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
        Activa (visible en selector del PDP)
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
          {isEdit ? "Guardar cambios" : "Crear variante"}
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

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required,
  mono,
  hint,
  error,
  as,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  mono?: boolean;
  hint?: string;
  error?: string;
  as?: "textarea";
}) {
  const InputEl = as === "textarea" ? "textarea" : Input;
  return (
    <div>
      <label htmlFor={name} className="text-brand-purple-dark mb-1 block text-xs font-semibold">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      <InputEl
        id={name}
        name={name}
        type={as === "textarea" ? undefined : type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        rows={as === "textarea" ? 2 : undefined}
        className={`border-brand-purple/20 focus-visible:ring-brand-purple/30 ${mono ? "font-mono text-sm" : ""} ${as === "textarea" ? "w-full rounded-md border bg-white px-3 py-2 text-sm" : ""}`}
      />
      {hint && !error && <p className="text-brand-purple-dark/55 mt-1 text-[11px]">{hint}</p>}
      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={name} className="text-brand-purple-dark mb-1 block text-xs font-semibold">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
