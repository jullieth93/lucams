"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { AdminNotice } from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/format";
import { createOcasionAction, type OcasionActionState } from "./actions";

export function CreateOcasionForm() {
  const [state, formAction, isPending] = useActionState<OcasionActionState | null, FormData>(
    createOcasionAction,
    null,
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const onNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="name" className="text-brand-purple-dark mb-1 block text-sm font-medium">
            Nombre <span className="text-rose-600">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="ej. Cumpleaños"
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
          />
          {state?.fieldErrors?.name && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.name[0]}</p>
          )}
        </div>

        <div>
          <Label htmlFor="slug" className="text-brand-purple-dark mb-1 block text-sm font-medium">
            Slug <span className="text-rose-600">*</span>{" "}
            <span className="text-brand-muted text-xs font-normal">
              (URL: /ocasion/<em>{slug || "slug"}</em>)
            </span>
          </Label>
          <Input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            placeholder="ej. cumpleanos"
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 font-mono text-sm"
          />
          {state?.fieldErrors?.slug && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.slug[0]}</p>
          )}
        </div>
      </div>

      <div>
        <Label
          htmlFor="description"
          className="text-brand-purple-dark mb-1 block text-sm font-medium"
        >
          Descripción semántica y SEO <span className="text-rose-600">*</span>
        </Label>
        <p className="text-brand-muted mb-2 text-xs">
          Alimenta la página pública <code>/ocasion/[slug]</code>, el filtro del catálogo y el
          recomendador inteligente (<code>/api/catalog/recommend</code>). Mínimo 20 caracteres;
          describe cuándo se celebra en Colombia y qué detalles personalizados buscan los clientes.
        </p>
        <Textarea
          id="description"
          name="description"
          required
          rows={4}
          minLength={20}
          maxLength={2000}
          placeholder="ej. Cumpleaños en Colombia es una fecha clave para regalos personalizados con fotos, nombre y edad del homenajeado..."
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30 text-sm"
        />
        {state?.fieldErrors?.description && (
          <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.description[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label
            htmlFor="monthHint"
            className="text-brand-purple-dark mb-1 block text-sm font-medium"
          >
            Mes destacado{" "}
            <span className="text-brand-muted text-xs font-normal">
              (opcional — prioriza en vitrinas de temporada)
            </span>
          </Label>
          <select
            id="monthHint"
            name="monthHint"
            defaultValue=""
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="">Todo el año (sin mes fijo)</option>
            <option value="1">Enero</option>
            <option value="2">Febrero</option>
            <option value="3">Marzo (Día de la Mujer)</option>
            <option value="4">Abril</option>
            <option value="5">Mayo (Día de la Madre)</option>
            <option value="6">Junio (Día del Padre)</option>
            <option value="7">Julio</option>
            <option value="8">Agosto</option>
            <option value="9">Septiembre (Amor y Amistad)</option>
            <option value="10">Octubre (Halloween)</option>
            <option value="11">Noviembre (Grados)</option>
            <option value="12">Diciembre (Navidad)</option>
          </select>
        </div>

        <div>
          <Label htmlFor="order" className="text-brand-purple-dark mb-1 block text-sm font-medium">
            Orden de aparición
          </Label>
          <Input
            id="order"
            name="order"
            type="number"
            min="0"
            defaultValue="0"
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
          />
        </div>
      </div>

      <fieldset className="border-brand-purple/15 rounded-xl border bg-slate-50/50 p-3.5">
        <legend className="text-brand-purple-dark px-2 text-sm font-semibold">
          Cantidad sugerida (opcional)
        </legend>
        <p className="text-brand-muted mb-2.5 text-xs">
          Rango orientativo de unidades para eventos o recordatorios. Ayuda al recomendador a
          sugerir packs acordes al tamaño de la celebración.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="rangeMin" className="text-brand-purple-dark/80 mb-1 block text-xs">
              Mínimo
            </Label>
            <Input
              id="rangeMin"
              name="rangeMin"
              type="number"
              min="1"
              placeholder="ej. 10"
              className="border-brand-purple/20 bg-white text-sm"
            />
          </div>
          <div>
            <Label htmlFor="rangeIdeal" className="text-brand-purple-dark/80 mb-1 block text-xs">
              Ideal
            </Label>
            <Input
              id="rangeIdeal"
              name="rangeIdeal"
              type="number"
              min="1"
              placeholder="ej. 20"
              className="border-brand-purple/20 bg-white text-sm"
            />
          </div>
          <div>
            <Label htmlFor="rangeMax" className="text-brand-purple-dark/80 mb-1 block text-xs">
              Máximo
            </Label>
            <Input
              id="rangeMax"
              name="rangeMax"
              type="number"
              min="1"
              placeholder="ej. 40"
              className="border-brand-purple/20 bg-white text-sm"
            />
          </div>
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked
          className="accent-brand-purple h-4 w-4 rounded border-slate-300"
        />
        <span className="text-brand-purple-dark font-medium">
          Activa (visible en tienda y filtros)
        </span>
      </label>

      {state?.error && <AdminNotice tone="error">{state.error}</AdminNotice>}

      <Button
        type="submit"
        disabled={isPending}
        className="bg-gradient-brand text-white hover:brightness-110"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            Creando…
          </>
        ) : (
          <>
            <Plus className="mr-1.5 h-4 w-4" />
            Crear ocasión
          </>
        )}
      </Button>
    </form>
  );
}
