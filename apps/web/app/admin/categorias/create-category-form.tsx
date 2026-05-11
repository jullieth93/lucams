"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createCategoryAction,
  type CategoryActionState,
} from "./actions";

export function CreateCategoryForm() {
  const [state, formAction, pending] = useActionState<
    CategoryActionState | null,
    FormData
  >(createCategoryAction, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) {
      setSlug(slugify(v));
    }
  };

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-slate-700 text-sm">
            Nombre
          </Label>
          <Input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Magnéticos foto"
            disabled={pending}
          />
          {state?.fieldErrors?.name && (
            <p className="text-xs text-red-600">{state.fieldErrors.name[0]}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug" className="text-slate-700 text-sm">
            Slug
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
          />
          {state?.fieldErrors?.slug && (
            <p className="text-xs text-red-600">{state.fieldErrors.slug[0]}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-slate-700 text-sm">
          Descripción (opcional)
        </Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          placeholder="Texto corto que se muestra en la página de la categoría..."
          disabled={pending}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="order" className="text-slate-700 text-sm">
            Orden
          </Label>
          <Input
            id="order"
            name="order"
            type="number"
            min={0}
            max={9999}
            defaultValue={0}
            disabled={pending}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 self-end pb-2 col-span-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked
            disabled={pending}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-700"
          />
          <span>Activa (visible en el storefront)</span>
        </label>
      </div>

      {state?.error && !state.fieldErrors && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <Button
        type="submit"
        className="bg-slate-900 hover:bg-slate-800 text-white font-semibold"
        disabled={pending}
      >
        {pending ? "Creando..." : "Crear categoría"}
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
