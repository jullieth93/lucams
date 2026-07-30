"use client";

/*
 * Editor completo de un CmsField (CMS v2) — adaptado del viejo
 * block-editor-form.tsx (brand 2026-05-20).
 *
 * Según el tipo de campo:
 *   - MARKDOWN/HTML → MarkdownEditor con toolbar + preview live (split).
 *   - JSON          → textarea mono con validación JSON SUAVE (avisa si no
 *                     parsea, pero deja guardar — el dato puede estar a medias).
 *   - TEXTAREA      → textarea plano. BOOLEAN → select Sí/No.
 *   - Resto         → input acorde (email/url/tel/number/color).
 *
 * label/helpText ("Mostrar en admin") editables en sección colapsable.
 * Guardar usa saveCmsFieldAction: en BLOCK crea BORRADOR (hay que Publicar
 * después); en SETTING publica de inmediato.
 */

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
import { saveCmsFieldAction, type CmsActionState } from "@/app/admin/(panel)/contenido/actions";

export type EditableField = {
  id: string;
  key: string;
  kind: "BLOCK" | "SETTING";
  type:
    | "TEXT"
    | "TEXTAREA"
    | "MARKDOWN"
    | "HTML"
    | "JSON"
    | "EMAIL"
    | "URL"
    | "NUMBER"
    | "PHONE"
    | "COLOR"
    | "BOOLEAN";
  label: string;
  helpText: string | null;
  /** Último borrador (CmsField.body). */
  body: string;
  isPublished: boolean;
};

const SIMPLE_INPUT_TYPE: Record<string, string> = {
  TEXT: "text",
  EMAIL: "email",
  URL: "url",
  NUMBER: "number",
  PHONE: "tel",
  COLOR: "color",
};

export function FieldEditorForm({ field }: { field: EditableField }) {
  const isSetting = field.kind === "SETTING";

  // Snapshot del "original" para Descartar + isDirty (mismo patrón que el
  // viejo block-editor-form: se actualiza explícitamente tras guardar OK).
  const [original, setOriginal] = useState(() => ({
    body: field.body,
    label: field.label,
    helpText: field.helpText ?? "",
  }));
  const [body, setBody] = useState(() => field.body);
  const [label, setLabel] = useState(() => field.label);
  const [helpText, setHelpText] = useState(() => field.helpText ?? "");
  // Remount del MarkdownEditor al descartar (defaultValue solo se lee en mount).
  const [editorKey, setEditorKey] = useState(0);
  // Validación JSON suave: avisa pero NO bloquea el guardado.
  const [jsonWarning, setJsonWarning] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<CmsActionState | null, FormData>(
    saveCmsFieldAction,
    null,
  );

  const isDirty =
    body !== original.body || label !== original.label || helpText !== original.helpText;

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state?.ok) {
      toast.success(
        isSetting
          ? "Guardado — el cambio ya se ve en el sitio."
          : "Borrador guardado. Cuando estés lista, dale a Publicar.",
      );
      // queueMicrotask defiere el setState fuera del cuerpo síncrono del
      // effect (react-hooks/set-state-in-effect — patrón del repo).
      queueMicrotask(() => setOriginal({ body, label, helpText }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Aviso nativo al cerrar pestaña con cambios sin guardar.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function updateBody(v: string) {
    setBody(v);
    if (field.type === "JSON") {
      try {
        JSON.parse(v);
        setJsonWarning(null);
      } catch {
        setJsonWarning("Este texto no es JSON válido todavía — revísalo antes de publicar.");
      }
    }
  }

  function discardChanges() {
    if (!isDirty) return;
    if (!window.confirm("¿Descartar los cambios? Volverá al contenido que tenía guardado antes.")) {
      return;
    }
    setBody(original.body);
    setLabel(original.label);
    setHelpText(original.helpText);
    setEditorKey((k) => k + 1);
    toast.info("Cambios descartados.");
  }

  const isMarkdownLike = field.type === "MARKDOWN" || field.type === "HTML";

  const bodyEditor = isMarkdownLike ? (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Izq: editor con toolbar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="body" className="text-brand-purple-dark text-base font-semibold">
            Contenido
          </Label>
          <span className="text-brand-muted text-xs">Lo que escribas se ve a la derecha →</span>
        </div>
        <MarkdownEditor
          key={editorKey}
          id="body"
          name="body"
          defaultValue={body}
          rows={20}
          placeholder={MARKDOWN_PLACEHOLDER}
          onChange={updateBody}
        />

        {/* Cheatsheet colapsable — el toolbar cubre lo más usado, esto es referencia */}
        <details className="border-brand-purple/15 group rounded-lg border bg-amber-50/50">
          <summary className="text-brand-purple-dark flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-amber-100/50">
            <span className="flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
              ¿Prefieres escribir el formato a mano? Ver atajos
            </span>
            <ChevronDown className="text-brand-muted h-3.5 w-3.5 transition-transform group-open:rotate-180" />
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
                <code className="rounded bg-white px-1 py-0.5">[texto](https://url)</code> → enlace
              </li>
            </ul>
            <p className="text-brand-muted mt-2">
              Para separar párrafos: deja una línea vacía en el medio.
            </p>
          </div>
        </details>
      </div>

      {/* Der: preview live */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-brand-purple-dark text-base font-semibold">Vista previa</Label>
          <span className="text-brand-muted text-xs">Así se va a ver en el sitio</span>
        </div>
        <div className="prose prose-sm prose-headings:font-display prose-headings:text-brand-purple-dark prose-a:text-brand-purple border-brand-purple/15 min-h-[500px] max-w-none rounded-lg border bg-white p-5 shadow-sm">
          {body.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {body}
            </ReactMarkdown>
          ) : (
            <p className="text-brand-muted italic">Empieza a escribir a la izquierda...</p>
          )}
        </div>
      </div>
    </div>
  ) : field.type === "JSON" ? (
    <div className="space-y-2">
      <Label htmlFor="body" className="text-brand-purple-dark text-base font-semibold">
        Contenido (JSON)
      </Label>
      <textarea
        id="body"
        name="body"
        value={body}
        onChange={(e) => updateBody(e.target.value)}
        disabled={pending}
        rows={16}
        spellCheck={false}
        className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 text-brand-purple-dark/90 w-full rounded-lg border bg-white px-4 py-3 font-mono text-sm leading-relaxed shadow-sm focus:ring-2 focus:outline-none"
      />
      {jsonWarning && <p className="text-xs text-amber-700">⚠ {jsonWarning}</p>}
    </div>
  ) : field.type === "TEXTAREA" ? (
    <div className="space-y-2">
      <Label htmlFor="body" className="text-brand-purple-dark text-base font-semibold">
        Contenido
      </Label>
      <textarea
        id="body"
        name="body"
        value={body}
        onChange={(e) => updateBody(e.target.value)}
        disabled={pending}
        rows={6}
        className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 text-brand-purple-dark/90 w-full rounded-lg border bg-white px-4 py-3 text-sm leading-relaxed shadow-sm focus:ring-2 focus:outline-none"
      />
    </div>
  ) : field.type === "BOOLEAN" ? (
    <div className="space-y-2">
      <Label htmlFor="body" className="text-brand-purple-dark text-base font-semibold">
        Valor
      </Label>
      <select
        id="body"
        name="body"
        value={body}
        onChange={(e) => updateBody(e.target.value)}
        disabled={pending}
        className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 flex h-9 w-full max-w-xs rounded-md border bg-white px-3 py-1 text-sm shadow-sm focus:ring-2 focus:outline-none"
      >
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    </div>
  ) : (
    <div className="space-y-2">
      <Label htmlFor="body" className="text-brand-purple-dark text-base font-semibold">
        Contenido
      </Label>
      <Input
        id="body"
        name="body"
        type={SIMPLE_INPUT_TYPE[field.type] ?? "text"}
        value={body}
        onChange={(e) => updateBody(e.target.value)}
        disabled={pending}
        className="border-brand-purple/20 focus-visible:ring-brand-purple/30 max-w-xl"
      />
    </div>
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={field.id} />
      {/* MarkdownEditor es no-controlado (defaultValue): el valor viaja en su
          textarea name="body"; para los demás tipos el control ya tiene name. */}

      {/* Mostrar en admin: nombre y ayuda (colapsable) */}
      <details className="border-brand-purple/10 group rounded-xl border bg-white shadow-sm">
        <summary className="text-brand-purple-dark hover:bg-brand-purple/5 flex cursor-pointer items-center justify-between gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors">
          <span>Mostrar en admin: nombre y texto de ayuda</span>
          <ChevronDown className="text-brand-muted h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-brand-purple/10 grid grid-cols-1 gap-4 border-t px-5 py-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="label" className="text-brand-purple-dark font-semibold">
              Nombre visible
            </Label>
            <Input
              id="label"
              name="label"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={pending}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            <p className="text-brand-muted text-xs">El nombre que ves en este panel.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="helpText" className="text-brand-purple-dark font-semibold">
              Texto de ayuda
            </Label>
            <Input
              id="helpText"
              name="helpText"
              placeholder="Ej. Aparece en la portada, máx ~60 caracteres"
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              disabled={pending}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            <p className="text-brand-muted text-xs">
              Una pista para acordarte dónde se usa este texto.
            </p>
          </div>
        </div>
      </details>

      {bodyEditor}

      {/* Errores */}
      {state?.error && (
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
          ) : isSetting ? (
            <>
              🟢 Este ajuste <b>se publica apenas guardes</b> — el sitio cambia de inmediato.
            </>
          ) : field.isPublished ? (
            <>
              🟢 Este texto <b>está publicado</b> en el sitio. Al guardar, el cambio queda en
              borrador. Para que se vea, pulsa <b>Publicar nueva versión</b>.
            </>
          ) : (
            <>
              🟡 Este texto <b>está en borrador</b> (no se ve en el sitio público). Cuando estés
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
            title={
              isDirty
                ? isSetting
                  ? "Guardar y aplicar en el sitio"
                  : "Guardar como nueva versión borrador"
                : "No hay cambios para guardar"
            }
          >
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Guardando...
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-4 w-4" />
                {isSetting ? "Guardar y aplicar" : "Guardar borrador"}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

const MARKDOWN_PLACEHOLDER = `# Mi título

Acá va el contenido. Puedes usar **negrita** o *cursiva*.

## Subtítulo

- Puedes hacer listas
- Con varios elementos
- Como esta

También puedes poner [un enlace](https://lucamsshop.com) y deja una línea vacía para separar párrafos.`;
