"use client";

/*
 * <CreateFieldForm> — "Agregar campo" dentro de una sección (editor de página).
 *
 * Colapsable con <details> para no dominar la pantalla: lo normal es que el
 * contenido venga pre-cargado y esto se use una vez cada tanto. Crea el
 * campo vía createCmsFieldAction y redirige a su editor completo
 * (/admin/contenido/campos/[id]?created=1).
 *
 * Sin jerga para la administradora: la key se pide como "identificador",
 * kind se explica por su comportamiento ("se publica cuando tú decidas" vs
 * "se aplica al guardar") y category va oculta (la hereda de la sección).
 */

import { useActionState, useState } from "react";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCmsFieldAction, type CmsActionState } from "@/app/admin/(panel)/contenido/actions";

const FIELD_TYPES = [
  { value: "TEXT", label: "Texto corto (una línea)" },
  { value: "TEXTAREA", label: "Texto largo (varios párrafos)" },
  { value: "MARKDOWN", label: "Texto con formato (negritas, listas, enlaces)" },
  { value: "EMAIL", label: "Correo electrónico" },
  { value: "URL", label: "Enlace (URL)" },
  { value: "PHONE", label: "Teléfono" },
  { value: "NUMBER", label: "Número" },
  { value: "COLOR", label: "Color" },
  { value: "BOOLEAN", label: "Sí / No" },
  { value: "HTML", label: "HTML (avanzado)" },
  { value: "JSON", label: "Datos estructurados JSON (avanzado)" },
] as const;

export function CreateFieldForm({
  sectionId,
  suggestedKeyPrefix,
  defaultCategory,
}: {
  sectionId: string;
  /** Prefijo sugerido para la key (ej. "home.hero."), derivado de la sección. */
  suggestedKeyPrefix: string;
  /** Categoría legacy heredada de los demás campos de la sección (oculta). */
  defaultCategory: string;
}) {
  const [state, formAction, pending] = useActionState<CmsActionState | null, FormData>(
    createCmsFieldAction,
    null,
  );
  const [open, setOpen] = useState(false);

  return (
    <details
      className="group"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="text-brand-purple-dark hover:bg-brand-purple/5 flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors [&::-webkit-details-marker]:hidden">
        <Plus className="h-4 w-4" />
        Agregar campo a esta sección
        <ChevronDown className="text-brand-muted ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>

      <form
        action={formAction}
        className="border-brand-purple/10 space-y-4 border-t bg-white px-4 py-4"
      >
        <input type="hidden" name="sectionId" value={sectionId} />
        <input type="hidden" name="category" value={defaultCategory} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`key-${sectionId}`} className="text-brand-purple-dark font-semibold">
              Identificador <span className="text-rose-600">*</span>
            </Label>
            <Input
              id={`key-${sectionId}`}
              name="key"
              required
              placeholder={`${suggestedKeyPrefix}nombre-del-campo`}
              disabled={pending}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 font-mono text-sm"
            />
            <p className="text-brand-muted text-xs">
              Letras, números, puntos y guiones. Sugerencia: empieza con «{suggestedKeyPrefix}». No
              se puede cambiar después.
            </p>
            {state?.fieldErrors?.key && (
              <p className="text-xs text-rose-600">{state.fieldErrors.key[0]}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`label-${sectionId}`} className="text-brand-purple-dark font-semibold">
              Nombre visible <span className="text-rose-600">*</span>
            </Label>
            <Input
              id={`label-${sectionId}`}
              name="label"
              required
              placeholder="Ej. Título de la sección"
              disabled={pending}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            <p className="text-brand-muted text-xs">El nombre que verás en este panel.</p>
            {state?.fieldErrors?.label && (
              <p className="text-xs text-rose-600">{state.fieldErrors.label[0]}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`kind-${sectionId}`} className="text-brand-purple-dark font-semibold">
              ¿Cuándo se aplica el cambio?
            </Label>
            <select
              id={`kind-${sectionId}`}
              name="kind"
              defaultValue="BLOCK"
              disabled={pending}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-sm focus:ring-2 focus:outline-none"
            >
              <option value="BLOCK">Cuando yo decida (guardar como borrador y publicar)</option>
              <option value="SETTING">Apenas guarde (ajustes del sitio)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`type-${sectionId}`} className="text-brand-purple-dark font-semibold">
              Tipo de contenido
            </Label>
            <select
              id={`type-${sectionId}`}
              name="type"
              defaultValue="TEXT"
              disabled={pending}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-sm focus:ring-2 focus:outline-none"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`body-${sectionId}`} className="text-brand-purple-dark font-semibold">
            Contenido inicial <span className="text-rose-600">*</span>
          </Label>
          <textarea
            id={`body-${sectionId}`}
            name="body"
            required
            rows={3}
            disabled={pending}
            placeholder="Escribe el texto inicial. Podrás cambiarlo cuando quieras."
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 text-brand-purple-dark w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
          />
          {state?.fieldErrors?.body && (
            <p className="text-xs text-rose-600">{state.fieldErrors.body[0]}</p>
          )}
        </div>

        {state?.error && !state.fieldErrors && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={pending}
            className="bg-gradient-brand text-white hover:brightness-110"
          >
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Creando...
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-4 w-4" /> Crear campo
              </>
            )}
          </Button>
        </div>
      </form>
    </details>
  );
}
