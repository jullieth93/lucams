"use client";

/*
 * Form compartido para crear y editar productos.
 *
 * Recibe `initialProduct` opcional. Si no hay, modo crear (action =
 * createProductAction). Si hay, modo editar (action = updateProductAction,
 * con `id` hidden en el form).
 *
 * Conversión de precio: el user tipea PESOS (ej. 15000), el form envía
 * CENTAVOS (1500000) — multiplicación inline + visualización con thousand
 * separator para legibilidad.
 */

import Link from "next/link";
import { useActionState, useState } from "react";
import type {
  createProductAction,
  ProductActionState,
  updateProductAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Category = { id: string; name: string; slug: string };

type Props = {
  categories: Category[];
  initialProduct?: {
    id: string;
    name: string;
    slug: string;
    description: string;
    basePrice: number;
    compareAtPrice: number | null;
    cost: number | null;
    sku: string;
    categoryId: string;
    isPersonalizable: boolean;
    isActive: boolean;
    isFeatured: boolean;
    seoTitle: string | null;
    seoDescription: string | null;
  };
  action: typeof createProductAction | typeof updateProductAction;
  submitLabel: string;
};

export function ProductForm({
  categories,
  initialProduct,
  action,
  submitLabel,
}: Props) {
  const [state, formAction, pending] = useActionState<
    ProductActionState | null,
    FormData
  >(action, null);

  const isEdit = Boolean(initialProduct);
  const [name, setName] = useState(initialProduct?.name ?? "");
  const [slug, setSlug] = useState(initialProduct?.slug ?? "");

  // Auto-generar slug a partir del nombre solo si es modo CREAR
  // y el user no tocó el slug aún.
  const [slugTouched, setSlugTouched] = useState(false);
  const onNameChange = (v: string) => {
    setName(v);
    if (!isEdit && !slugTouched) {
      setSlug(slugify(v));
    }
  };

  return (
    <form action={formAction} className="space-y-6">
      {initialProduct && <input type="hidden" name="id" value={initialProduct.id} />}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Información básica</CardTitle>
          <CardDescription className="text-slate-600">
            Datos visibles para el cliente final.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            id="name"
            label="Nombre"
            error={state?.fieldErrors?.name?.[0]}
          >
            <Input
              id="name"
              name="name"
              required
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Imán de foto personalizado A4"
              disabled={pending}
            />
          </Field>

          <Field
            id="slug"
            label="Slug (URL)"
            hint="solo minúsculas, números y guiones — aparece en la URL del producto"
            error={state?.fieldErrors?.slug?.[0]}
          >
            <Input
              id="slug"
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              placeholder="iman-foto-personalizado-a4"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              disabled={pending}
            />
          </Field>

          <Field
            id="description"
            label="Descripción"
            error={state?.fieldErrors?.description?.[0]}
          >
            <Textarea
              id="description"
              name="description"
              required
              rows={5}
              defaultValue={initialProduct?.description ?? ""}
              placeholder="Imán personalizado con tu foto favorita. Impresión alta resolución, acabado mate, ideal para nevera o casillero..."
              disabled={pending}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field
              id="sku"
              label="SKU"
              hint="código interno — mayúsculas, números, guiones"
              error={state?.fieldErrors?.sku?.[0]}
            >
              <Input
                id="sku"
                name="sku"
                required
                defaultValue={initialProduct?.sku ?? ""}
                placeholder="IMAN-FOTO-A4"
                className="font-mono uppercase"
                disabled={pending}
              />
            </Field>

            <Field
              id="categoryId"
              label="Categoría"
              error={state?.fieldErrors?.categoryId?.[0]}
            >
              <select
                id="categoryId"
                name="categoryId"
                required
                defaultValue={initialProduct?.categoryId ?? ""}
                disabled={pending}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>
                  Selecciona...
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {categories.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  No hay categorías. Crea una primero o corre{" "}
                  <code className="text-xs">make seed-products</code>.
                </p>
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Precio (en pesos COP)</CardTitle>
          <CardDescription className="text-slate-600">
            Se guarda internamente en centavos. Aquí se digita en pesos
            enteros (sin decimales).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <PriceField
              id="basePrice"
              label="Precio venta"
              required
              defaultPesos={initialProduct ? initialProduct.basePrice / 100 : null}
              error={state?.fieldErrors?.basePrice?.[0]}
              pending={pending}
            />
            <PriceField
              id="compareAtPrice"
              label="Precio antes"
              hint="opcional — si está, se muestra tachado"
              defaultPesos={initialProduct?.compareAtPrice ? initialProduct.compareAtPrice / 100 : null}
              error={state?.fieldErrors?.compareAtPrice?.[0]}
              pending={pending}
            />
            <PriceField
              id="cost"
              label="Costo interno"
              hint="opcional — no visible al cliente"
              defaultPesos={initialProduct?.cost ? initialProduct.cost / 100 : null}
              error={state?.fieldErrors?.cost?.[0]}
              pending={pending}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Visibilidad y flags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Checkbox
            name="isActive"
            label="Activo (visible en el storefront)"
            defaultChecked={initialProduct?.isActive ?? true}
            disabled={pending}
          />
          <Checkbox
            name="isFeatured"
            label="Destacado (aparece en home y prioridad en listings)"
            defaultChecked={initialProduct?.isFeatured ?? false}
            disabled={pending}
          />
          <Checkbox
            name="isPersonalizable"
            label="Personalizable (incluye el estudio de personalización en vivo)"
            defaultChecked={initialProduct?.isPersonalizable ?? false}
            disabled={pending}
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">SEO (opcional)</CardTitle>
          <CardDescription className="text-slate-600">
            Si no se completan, se usan name y description como fallback.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="seoTitle" label="SEO Title" error={state?.fieldErrors?.seoTitle?.[0]}>
            <Input
              id="seoTitle"
              name="seoTitle"
              maxLength={70}
              defaultValue={initialProduct?.seoTitle ?? ""}
              placeholder="Imán de foto personalizado — Lucams_shop"
              disabled={pending}
            />
          </Field>
          <Field
            id="seoDescription"
            label="SEO Description"
            error={state?.fieldErrors?.seoDescription?.[0]}
          >
            <Textarea
              id="seoDescription"
              name="seoDescription"
              rows={2}
              maxLength={160}
              defaultValue={initialProduct?.seoDescription ?? ""}
              placeholder="Descripción para resultados de Google. Máx 160 chars."
              disabled={pending}
            />
          </Field>
        </CardContent>
      </Card>

      {state?.error && !state.fieldErrors && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          className="bg-slate-900 hover:bg-slate-800 text-white font-semibold"
          disabled={pending}
        >
          {pending ? "Guardando..." : submitLabel}
        </Button>
        <Link
          href="/admin/productos"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-slate-700">
        {label}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function PriceField({
  id,
  label,
  hint,
  required,
  defaultPesos,
  error,
  pending,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  defaultPesos: number | null;
  error?: string;
  pending: boolean;
}) {
  const [pesos, setPesos] = useState<string>(
    defaultPesos !== null ? String(defaultPesos) : "",
  );
  const centavos = pesos === "" ? "" : String(Math.round(Number(pesos) * 100));
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">
          $
        </span>
        <Input
          id={`${id}__display`}
          type="number"
          min={0}
          step={1}
          required={required}
          value={pesos}
          onChange={(e) => setPesos(e.target.value)}
          placeholder="0"
          className="pl-6 tabular-nums"
          disabled={pending}
        />
        <input type="hidden" name={id} value={centavos} />
      </div>
    </Field>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-700"
      />
      <span>{label}</span>
    </label>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
