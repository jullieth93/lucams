"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { createCmsBlockAction, type CmsActionState } from "@/app/admin/(panel)/contenido/actions";

const CATEGORIES = [
  { value: "LEGAL", label: "📋 Textos legales" },
  { value: "HOME", label: "🏠 Página de inicio" },
  { value: "FOOTER", label: "👇 Pie de página" },
  { value: "EMPTY_STATE", label: "🦝 Mensajes cuando no hay contenido" },
  { value: "COOKIES", label: "🍪 Banner de cookies" },
  { value: "FAQ", label: "❓ Preguntas frecuentes" },
  { value: "SUPPORT", label: "💬 Soporte y contacto" },
  { value: "MAINTENANCE", label: "🛠️ Página de mantenimiento" },
  { value: "EMAIL", label: "📧 Correos automáticos" },
  { value: "MARKETING", label: "📢 Banners promocionales" },
];

export function CreateBlockForm() {
  const [state, formAction, pending] = useActionState<CmsActionState | null, FormData>(
    createCmsBlockAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div className="space-y-1.5">
        <Label htmlFor="key">
          Identificador corto <span className="text-red-600">*</span>
        </Label>
        <Input
          id="key"
          name="key"
          required
          placeholder="ej. legal.privacidad, faq.envios, home.banner-promo"
          disabled={pending}
          pattern="^[a-z][a-z0-9._-]*$"
        />
        <p className="text-xs text-slate-500">
          Letras minúsculas, números, puntos y guiones. No se cambia después.
        </p>
        {state?.fieldErrors?.key && (
          <p className="text-xs text-red-600">{state.fieldErrors.key[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="title">Título del bloque</Label>
          <Input id="title" name="title" placeholder="Ej. Aviso de Privacidad" disabled={pending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">
            Categoría <span className="text-red-600">*</span>
          </Label>
          <select
            id="category"
            name="category"
            required
            disabled={pending}
            defaultValue=""
            className="border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
          >
            <option value="" disabled>
              Elige una categoría...
            </option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">¿Dónde aparece?</Label>
        <Input
          id="description"
          name="description"
          placeholder="Ej. Página /legal/privacidad y enlace del footer"
          disabled={pending}
        />
        <p className="text-xs text-slate-500">Nota para acordarte en qué parte del sitio se usa.</p>
      </div>

      <input type="hidden" name="format" value="MARKDOWN" />

      <div className="space-y-1.5">
        <Label htmlFor="body">
          Contenido inicial <span className="text-red-600">*</span>
        </Label>
        <MarkdownEditor
          id="body"
          name="body"
          required
          rows={10}
          placeholder={`# Mi bloque\n\nEscribe el contenido aquí. Puedes editar después.\n\nUsa **negrita**, *cursiva*, listas con - y enlaces como [texto](url).`}
        />
        <p className="text-xs text-slate-500">
          Puedes editarlo después y ver una vista previa en el editor completo.
        </p>
        {state?.fieldErrors?.body && (
          <p className="text-xs text-red-600">{state.fieldErrors.body[0]}</p>
        )}
      </div>

      {state?.error && !state.fieldErrors && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="bg-slate-900 text-white hover:bg-slate-800"
      >
        {pending ? "Creando..." : "Crear bloque (queda en borrador)"}
      </Button>
    </form>
  );
}
