"use client";

/*
 * CategoryForm — form compartido para crear (nuevo) y editar (existente).
 *
 * Detecta el modo según `initialCategory`. Auto-genera slug del name al
 * tipear (modo crear; en edit el slug es bloqueado salvo override
 * explícito, porque cambiar el slug invalida URLs públicas).
 *
 * Brand 2026-05-18: tokens brand-purple, AdminNotice para errores.
 */

import { useActionState, useState, createElement } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminNotice } from "@/components/admin-page";
import {
  CATEGORY_GRADIENT_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  DEFAULT_CATEGORY_GRADIENT,
  resolveCategoryIcon,
} from "@/lib/category-visuals";
import { createCategoryAction, updateCategoryAction, type CategoryActionState } from "./actions";

type CategoryInput = {
  id?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  isActive?: boolean;
  order?: number;
  parentId?: string | null;
  icon?: string | null;
  gradient?: string | null;
};

export function CategoryForm({
  initialCategory,
  parentOptions = [],
}: {
  initialCategory?: CategoryInput;
  /** Categorías de primer nivel para elegir como "madre" (sub-categorías). */
  parentOptions?: { id: string; name: string }[];
}) {
  const isEdit = !!initialCategory?.id;
  const [state, formAction, pending] = useActionState<CategoryActionState | null, FormData>(
    isEdit ? updateCategoryAction : createCategoryAction,
    null,
  );

  const [name, setName] = useState(initialCategory?.name ?? "");
  const [slug, setSlug] = useState(initialCategory?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit); // en edit, ya viene "touched"

  // Roadmap B3 — visual de catálogo. Estado local para la vista previa en vivo
  // (icono + swatch del gradiente) mientras Lucy edita. Vacío = fallback por slug.
  const [icon, setIcon] = useState(initialCategory?.icon ?? "");
  const [gradient, setGradient] = useState(initialCategory?.gradient ?? "");
  const previewGradient = gradient.trim() || DEFAULT_CATEGORY_GRADIENT;

  const onNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={initialCategory!.id} />}

      {state?.error && !state.fieldErrors && <AdminNotice tone="error">{state.error}</AdminNotice>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-brand-purple-dark text-sm font-semibold">
            Nombre <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Magnéticos foto"
            disabled={pending}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
          />
          {state?.fieldErrors?.name && (
            <p className="text-xs text-rose-600">{state.fieldErrors.name[0]}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug" className="text-brand-purple-dark text-sm font-semibold">
            Slug <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="slug"
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            placeholder="magneticos-foto"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            disabled={pending}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 font-mono text-sm"
          />
          {state?.fieldErrors?.slug && (
            <p className="text-xs text-rose-600">{state.fieldErrors.slug[0]}</p>
          )}
          {isEdit && (
            <p className="text-brand-muted text-[11px]">
              Cambiar el slug rompe URLs públicas. Solo cambialo si vas a generar redirect 301.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-brand-purple-dark text-sm font-semibold">
          Descripción
        </Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={initialCategory?.description ?? ""}
          placeholder="Texto corto que se muestra en la página de la categoría…"
          disabled={pending}
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
        />
      </div>

      {/* Roadmap B3 — visual de la categoría (dato de catálogo, no CMS).
          Pickers con vista previa en vivo: datalist de opciones curadas +
          input libre. Vacío = la tienda usa el fallback por slug / default. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="icon" className="text-brand-purple-dark text-sm font-semibold">
            Ícono (home y menú)
          </Label>
          <div className="flex items-center gap-2">
            <span className="bg-brand-purple/10 inline-flex shrink-0 rounded-md p-2" aria-hidden>
              {/* El ícono de preview resuelve igual que la tienda: valor escrito
                  → fallback por slug → default. createElement inline porque la
                  regla react-hooks/static-components prohíbe asignar el resultado
                  de resolveCategoryIcon a una variable componente en el body. */}
              {createElement(resolveCategoryIcon(icon || null, slug || ""), {
                className: "text-brand-purple h-4 w-4",
              })}
            </span>
            <Input
              id="icon"
              name="icon"
              list="category-icon-options"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="Camera"
              disabled={pending}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 font-mono text-sm"
            />
            <datalist id="category-icon-options">
              {CATEGORY_ICON_OPTIONS.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          {state?.fieldErrors?.icon && (
            <p className="text-xs text-rose-600">{state.fieldErrors.icon[0]}</p>
          )}
          <p className="text-brand-muted text-[11px]">
            Nombre del ícono lucide en PascalCase (ej. PartyPopper). Déjalo vacío para usar el ícono
            por defecto. El ícono solo se pinta si está en la lista curada.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gradient" className="text-brand-purple-dark text-sm font-semibold">
            Gradiente (card de la home)
          </Label>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={
                "border-brand-purple/10 h-9 w-12 shrink-0 rounded-md border bg-gradient-to-br " +
                previewGradient
              }
            />
            <Input
              id="gradient"
              name="gradient"
              list="category-gradient-options"
              value={gradient}
              onChange={(e) => setGradient(e.target.value)}
              placeholder={DEFAULT_CATEGORY_GRADIENT}
              disabled={pending}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 font-mono text-xs"
            />
            <datalist id="category-gradient-options">
              {CATEGORY_GRADIENT_OPTIONS.map((g) => (
                <option key={g.value} value={g.value} label={g.label} />
              ))}
            </datalist>
          </div>
          {state?.fieldErrors?.gradient && (
            <p className="text-xs text-rose-600">{state.fieldErrors.gradient[0]}</p>
          )}
          <p className="text-brand-muted text-[11px]">
            Clases tailwind del gradiente (from-… via-… to-…). Vacío = gradiente por defecto. La
            vista previa usa el default mientras el campo esté vacío.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="parentId" className="text-brand-purple-dark text-sm font-semibold">
            Categoría madre
          </Label>
          <select
            id="parentId"
            name="parentId"
            defaultValue={initialCategory?.parentId ?? ""}
            disabled={pending}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-2 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="">— Ninguna (categoría principal) —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="text-brand-muted text-[11px]">
            Déjalo en “Ninguna” para una categoría principal. Elige una madre para crear una
            sub-categoría (ej. madre “Magnéticos” → “Magnéticos foto”).
          </p>
        </div>

        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={initialCategory?.isActive ?? true}
            disabled={pending}
            className="accent-brand-purple h-4 w-4"
          />
          <span className="text-brand-purple-dark">Visible en la tienda</span>
        </label>
      </div>

      <Button
        type="submit"
        className="bg-gradient-brand font-semibold text-white hover:brightness-110"
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-1.5 h-4 w-4" />
        )}
        {isEdit ? "Guardar cambios" : "Crear categoría"}
      </Button>
    </form>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
