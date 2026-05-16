/*
 * Editor de un CmsBlock — split: textarea (izq) + preview live (der).
 *
 * Pensado para no-técnico:
 *  - Cheatsheet markdown SIEMPRE visible bajo el textarea
 *  - Preview live a la derecha, se actualiza al tipear
 *  - Botones grandes y claros: "Guardar borrador" + "Publicar"
 *  - Confirmaciones antes de publicar / archivar
 *  - Tip: cómo se ve cuando se publica
 */

"use client";

import { useActionState, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Loader2, Save, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import {
  saveCmsBlockDraftAction,
  type CmsActionState,
} from "@/app/admin/(panel)/contenido/actions";

export type BlockEditorBlock = {
  id: string;
  key: string;
  title: string | null;
  body: string;
  format: "MARKDOWN" | "HTML" | "TEXT" | "JSON";
  category: string;
  description: string | null;
  isPublished: boolean;
};

export function BlockEditorForm({ block }: { block: BlockEditorBlock }) {
  const [body, setBody] = useState(block.body);
  const [title, setTitle] = useState(block.title ?? "");
  const [description, setDescription] = useState(block.description ?? "");
  const [state, formAction, pending] = useActionState<CmsActionState | null, FormData>(
    saveCmsBlockDraftAction,
    null,
  );

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state && !state.error && !state.fieldErrors) {
      toast.success("Borrador guardado. Cuando estés lista, dale a Publicar.");
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={block.id} />
      <input type="hidden" name="format" value={block.format} />

      {/* Encabezado del form: title + description */}
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="title">Título del bloque</Label>
          <Input
            id="title"
            name="title"
            placeholder="Ej. Aviso de Privacidad"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
          />
          <p className="text-xs text-slate-500">
            Es el título que se ve dentro del bloque (no en el menú).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">¿Dónde aparece este bloque?</Label>
          <Input
            id="description"
            name="description"
            placeholder="Ej. Página /legal/privacidad y enlace del footer"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
          />
          <p className="text-xs text-slate-500">
            Una nota para acordarte dónde se usa este bloque en el sitio.
          </p>
        </div>
      </div>

      {/* Editor split */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Izq: textarea + cheatsheet */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="body" className="text-base font-semibold">
              Contenido
            </Label>
            <span className="text-xs text-slate-500">Lo que escribas se ve a la derecha →</span>
          </div>
          <MarkdownEditor
            id="body"
            name="body"
            defaultValue={body}
            rows={20}
            placeholder={EXAMPLE_PLACEHOLDER}
            onChange={setBody}
          />

          {/* Cheatsheet — SIEMPRE visible, no colapsado */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-slate-700">
            <div className="mb-2 flex items-center gap-1.5 font-semibold text-amber-900">
              <Lightbulb className="h-3.5 w-3.5" />
              Cómo escribir contenido con formato
            </div>
            <ul className="grid grid-cols-1 gap-y-1 sm:grid-cols-2">
              <li>
                <code className="rounded bg-white px-1 py-0.5"># Título</code> → título grande
              </li>
              <li>
                <code className="rounded bg-white px-1 py-0.5">## Subtítulo</code> → subtítulo
              </li>
              <li>
                <code className="rounded bg-white px-1 py-0.5">**negrita**</code> → <b>negrita</b>
              </li>
              <li>
                <code className="rounded bg-white px-1 py-0.5">*cursiva*</code> → <i>cursiva</i>
              </li>
              <li>
                <code className="rounded bg-white px-1 py-0.5">- item</code> → lista con puntos
              </li>
              <li>
                <code className="rounded bg-white px-1 py-0.5">1. item</code> → lista numerada
              </li>
              <li className="sm:col-span-2">
                <code className="rounded bg-white px-1 py-0.5">[texto](https://url)</code> → enlace
              </li>
            </ul>
            <p className="mt-2 text-amber-900/70">
              Para hacer un salto entre párrafos: deja una línea vacía en el medio.
            </p>
          </div>
        </div>

        {/* Der: preview live */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-base font-semibold">Vista previa</Label>
            <span className="text-xs text-slate-500">Así se va a ver en el sitio</span>
          </div>
          <div className="prose prose-sm min-h-[500px] max-w-none rounded-md border border-slate-200 bg-white p-5">
            {body.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {body}
              </ReactMarkdown>
            ) : (
              <p className="text-slate-400 italic">Empieza a escribir a la izquierda...</p>
            )}
          </div>
        </div>
      </div>

      {/* Errores */}
      {state?.error && !state.fieldErrors && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs text-slate-600">
          {block.isPublished ? (
            <>
              🟢 Este bloque <b>está publicado</b> en el sitio. Al guardar cambios queda en
              borrador. Para que se vean, pulsa <b>Publicar nueva versión</b>.
            </>
          ) : (
            <>
              🟡 Este bloque <b>está en borrador</b> (no se ve en el sitio público). Cuando estés
              lista, pulsa <b>Publicar</b>.
            </>
          )}
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="bg-slate-900 text-white hover:bg-slate-800"
        >
          {pending ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Guardando...
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-4 w-4" /> Guardar borrador
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

const EXAMPLE_PLACEHOLDER = `# Mi título

Acá va el contenido del bloque. Puedes usar **negrita** o *cursiva*.

## Subtítulo

- Puedes hacer listas
- Con varios elementos
- Como esta

También puedes poner [un enlace](https://lucamsshop.co) y deja una línea vacía para separar párrafos.`;
