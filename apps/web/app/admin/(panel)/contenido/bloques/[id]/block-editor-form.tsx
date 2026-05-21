/*
 * Editor de un CmsBlock — split: textarea con toolbar visual (izq) +
 * preview live (der). Brand 2026-05-20.
 *
 * Pensado para no-técnico:
 *  - Toolbar visual prominente (botones B / I / títulos / listas / enlace)
 *  - Preview live a la derecha, se actualiza al tipear
 *  - Cheatsheet markdown plegable (no domina la pantalla)
 *  - Botones grandes y claros: "Guardar borrador"
 *  - Tip: cómo se ve cuando se publica
 */

"use client";

import { useActionState, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Loader2, Save, ChevronDown, Lightbulb, Undo2 } from "lucide-react";
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
  // Snapshot del "original" — lo que el usuario podría querer recuperar al
  // "Descartar". Lo guardamos en state para que se mantenga estable entre
  // renders (queda fijo desde mount; tras guardar exitoso lo actualizamos
  // explícitamente). useState con initializer asegura captura única.
  const [original, setOriginal] = useState(() => ({
    body: block.body,
    title: block.title ?? "",
    description: block.description ?? "",
  }));

  const [body, setBody] = useState(() => block.body);
  const [title, setTitle] = useState(() => block.title ?? "");
  const [description, setDescription] = useState(() => block.description ?? "");
  // Key para forzar remount del MarkdownEditor cuando descartamos
  // (el editor tiene state interno propio, defaultValue solo se lee en mount).
  const [editorKey, setEditorKey] = useState(0);

  const [state, formAction, pending] = useActionState<CmsActionState | null, FormData>(
    saveCmsBlockDraftAction,
    null,
  );

  const isDirty =
    body !== original.body || title !== original.title || description !== original.description;

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state && !state.error && !state.fieldErrors) {
      toast.success("Borrador guardado. Cuando estés lista, dale a Publicar.");
      // Tras guardado exitoso, lo "actual" pasa a ser el nuevo original.
      // queueMicrotask defiere el setState fuera del cuerpo síncrono del
      // effect (satisface react-hooks/set-state-in-effect — mismo patrón
      // que setting-row.tsx tras feedback Lucy 2026-05-18).
      queueMicrotask(() => setOriginal({ body, title, description }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Aviso al cerrar pestaña / navegar fuera con cambios sin guardar.
  // El navegador muestra su propio diálogo nativo ("¿Salir del sitio? Es
  // posible que no se guarden los cambios..."). No podemos customizar el
  // texto desde 2017 (spec security).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Algunos navegadores aún requieren returnValue para mostrar el diálogo.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function discardChanges() {
    if (!isDirty) return;
    if (!window.confirm("¿Descartar los cambios? Volverá al contenido que tenía guardado antes.")) {
      return;
    }
    setBody(original.body);
    setTitle(original.title);
    setDescription(original.description);
    setEditorKey((k) => k + 1); // remount editor → re-lee defaultValue
    toast.info("Cambios descartados.");
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={block.id} />
      <input type="hidden" name="format" value={block.format} />

      {/* Encabezado del form: title + description */}
      <div className="border-brand-purple/10 grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 shadow-sm md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="title" className="text-brand-purple-dark font-semibold">
            Título del bloque
          </Label>
          <Input
            id="title"
            name="title"
            placeholder="Ej. Aviso de Privacidad"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
          />
          <p className="text-brand-purple-dark/55 text-xs">
            Es el título que se ve dentro del bloque (no en el menú).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-brand-purple-dark font-semibold">
            ¿Dónde aparece este bloque?
          </Label>
          <Input
            id="description"
            name="description"
            placeholder="Ej. Página /legal/privacidad y enlace del footer"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
          />
          <p className="text-brand-purple-dark/55 text-xs">
            Una nota para acordarte dónde se usa este bloque en el sitio.
          </p>
        </div>
      </div>

      {/* Editor split */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Izq: editor con toolbar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="body" className="text-brand-purple-dark text-base font-semibold">
              Contenido
            </Label>
            <span className="text-brand-purple-dark/55 text-xs">
              Lo que escribas se ve a la derecha →
            </span>
          </div>
          <MarkdownEditor
            key={editorKey}
            id="body"
            name="body"
            defaultValue={body}
            rows={20}
            placeholder={EXAMPLE_PLACEHOLDER}
            onChange={setBody}
          />

          {/* Cheatsheet colapsable — el toolbar cubre lo más usado, esto es referencia */}
          <details className="border-brand-purple/15 group rounded-lg border bg-amber-50/50">
            <summary className="text-brand-purple-dark flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-amber-100/50">
              <span className="flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
                ¿Prefieres escribir el formato a mano? Ver atajos
              </span>
              <ChevronDown className="text-brand-purple-dark/50 h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="text-brand-purple-dark/75 px-3 pt-1 pb-3 text-xs">
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
                  <code className="rounded bg-white px-1 py-0.5">[texto](https://url)</code> →
                  enlace
                </li>
              </ul>
              <p className="text-brand-purple-dark/55 mt-2">
                Para separar párrafos: deja una línea vacía en el medio.
              </p>
            </div>
          </details>
        </div>

        {/* Der: preview live */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-brand-purple-dark text-base font-semibold">Vista previa</Label>
            <span className="text-brand-purple-dark/55 text-xs">Así se va a ver en el sitio</span>
          </div>
          <div className="prose prose-sm prose-headings:font-display prose-headings:text-brand-purple-dark prose-a:text-brand-purple border-brand-purple/15 min-h-[500px] max-w-none rounded-lg border bg-white p-5 shadow-sm">
            {body.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {body}
              </ReactMarkdown>
            ) : (
              <p className="text-brand-purple-dark/40 italic">
                Empieza a escribir a la izquierda...
              </p>
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
      <div
        className={
          "sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-md transition-colors " +
          (isDirty ? "border-amber-300 ring-2 ring-amber-200/60" : "border-brand-purple/10")
        }
      >
        <div className="text-brand-purple-dark/75 flex items-center gap-2 text-xs">
          {isDirty ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-amber-900">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              <b>Cambios sin guardar</b>
            </span>
          ) : block.isPublished ? (
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
        <div className="flex flex-wrap items-center gap-2">
          {isDirty && (
            <Button
              type="button"
              variant="ghost"
              onClick={discardChanges}
              disabled={pending}
              className="text-brand-purple-dark hover:bg-brand-purple/10"
              title="Volver al contenido guardado, perdiendo los cambios actuales"
            >
              <Undo2 className="mr-1.5 h-4 w-4" />
              Descartar cambios
            </Button>
          )}
          <Button
            type="submit"
            disabled={pending || !isDirty}
            className="bg-gradient-brand text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            title={isDirty ? "Guardar como nueva versión borrador" : "No hay cambios para guardar"}
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
