"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
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

export function CreateBlockForm({ defaultCategory }: { defaultCategory?: string }) {
  const [state, formAction, pending] = useActionState<CmsActionState | null, FormData>(
    createCmsBlockAction,
    null,
  );

  // Tracking de campos para isDirty + reset.
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(defaultCategory ?? "");
  // Key para forzar remount del MarkdownEditor al limpiar.
  const [editorKey, setEditorKey] = useState(0);

  const isDirty =
    key.length > 0 ||
    title.length > 0 ||
    description.length > 0 ||
    body.length > 0 ||
    category !== (defaultCategory ?? "");

  // Aviso al cerrar pestaña con datos sin guardar.
  useEffect(() => {
    if (!isDirty || pending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, pending]);

  function clearForm() {
    if (!isDirty) return;
    if (!window.confirm("¿Limpiar el formulario? Perderás todo lo que escribiste hasta ahora.")) {
      return;
    }
    setKey("");
    setTitle("");
    setDescription("");
    setBody("");
    setCategory(defaultCategory ?? "");
    setEditorKey((k) => k + 1);
  }

  return (
    <form
      action={formAction}
      className="border-brand-purple/10 space-y-5 rounded-xl border bg-white p-5 shadow-sm"
    >
      <div className="space-y-1.5">
        <Label htmlFor="key" className="text-brand-purple-dark font-semibold">
          Identificador corto <span className="text-rose-600">*</span>
        </Label>
        <Input
          id="key"
          name="key"
          required
          placeholder="ej. legal.privacidad, faq.envios, home.banner-promo"
          disabled={pending}
          pattern="^[a-z][a-z0-9._-]*$"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30 font-mono"
        />
        <p className="text-brand-muted text-xs">
          Letras minúsculas, números, puntos y guiones. No se cambia después.
        </p>
        {state?.fieldErrors?.key && (
          <p className="text-xs text-rose-600">{state.fieldErrors.key[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="title" className="text-brand-purple-dark font-semibold">
            Título del bloque
          </Label>
          <Input
            id="title"
            name="title"
            placeholder="Ej. Aviso de Privacidad"
            disabled={pending}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category" className="text-brand-purple-dark font-semibold">
            Categoría <span className="text-rose-600">*</span>
          </Label>
          <select
            id="category"
            name="category"
            required
            disabled={pending}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-sm focus:ring-2 focus:outline-none"
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
        <Label htmlFor="description" className="text-brand-purple-dark font-semibold">
          ¿Dónde aparece?
        </Label>
        <Input
          id="description"
          name="description"
          placeholder="Ej. Página /legal/privacidad y enlace del footer"
          disabled={pending}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
        />
        <p className="text-brand-muted text-xs">
          Nota para acordarte en qué parte del sitio se usa.
        </p>
      </div>

      <input type="hidden" name="format" value="MARKDOWN" />

      <div className="space-y-1.5">
        <Label htmlFor="body" className="text-brand-purple-dark font-semibold">
          Contenido inicial <span className="text-rose-600">*</span>
        </Label>
        <MarkdownEditor
          key={editorKey}
          id="body"
          name="body"
          required
          rows={12}
          defaultValue={body}
          onChange={setBody}
          placeholder={`# Mi bloque\n\nEscribe el contenido aquí. Usa los botones de arriba para formato.\n\nPuedes editarlo después y ver una vista previa en el editor completo.`}
        />
        <p className="text-brand-muted text-xs">
          Usá los botones del toolbar para dar formato. Puedes editarlo después y ver una vista
          previa en el editor completo.
        </p>
        {state?.fieldErrors?.body && (
          <p className="text-xs text-rose-600">{state.fieldErrors.body[0]}</p>
        )}
      </div>

      {state?.error && !state.fieldErrors && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-brand-purple-dark/70 text-xs">
          {isDirty && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-amber-900">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              <b>Cambios sin guardar</b>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDirty && (
            <Button
              type="button"
              variant="ghost"
              onClick={clearForm}
              disabled={pending}
              className="text-brand-purple-dark hover:bg-brand-purple/10"
              title="Limpiar todo el formulario"
            >
              <Undo2 className="mr-1.5 h-4 w-4" />
              Limpiar formulario
            </Button>
          )}
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
              "Crear bloque (queda en borrador)"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
