"use client";

/*
 * <FieldRow> — fila de edición INLINE de un campo simple del CMS v2
 * (todo menos MARKDOWN/HTML/JSON, que se editan en el editor completo).
 *
 * Patrón tomado del viejo setting-row.tsx (feedback Lucy 2026-05-18):
 * guardado con useActionState, mensaje de éxito/error inline, setState
 * diferido con queueMicrotask tras el effect (react-hooks/set-state-in-effect).
 *
 * Semántica de publicación (service CMS v2):
 *   - SETTING: Guardar publica de inmediato → mensaje "ya se ve en el sitio".
 *   - BLOCK:   Guardar deja BORRADOR → aparece el botón Publicar (el servidor
 *              re-renderiza la fila con hasDraft=true tras el revalidatePath).
 */

import { useActionState, useEffect, useState } from "react";
import { Check, Loader2, Save, Send } from "lucide-react";
import { AdminBadge } from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  publishCmsFieldAction,
  saveCmsFieldAction,
  type CmsActionState,
} from "@/app/admin/(panel)/contenido/actions";

export type InlineField = {
  id: string;
  key: string;
  kind: "BLOCK" | "SETTING";
  type: "TEXT" | "TEXTAREA" | "EMAIL" | "URL" | "NUMBER" | "PHONE" | "COLOR" | "BOOLEAN";
  label: string;
  helpText: string | null;
  /** Valor a mostrar: el publicado si existe, si no el borrador. */
  value: string;
  /** true cuando lo mostrado es el borrador (nada publicado aún). */
  showingDraft: boolean;
  /** Hay una versión más nueva que la publicada (o nunca se publicó). */
  hasDraft: boolean;
  isPublished: boolean;
};

const INPUT_TYPE: Record<Exclude<InlineField["type"], "TEXTAREA" | "BOOLEAN">, string> = {
  TEXT: "text",
  EMAIL: "email",
  URL: "url",
  NUMBER: "number",
  PHONE: "tel",
  COLOR: "color",
};

export function FieldRow({
  field,
  latestVersionId,
  pageSlug,
}: {
  field: InlineField;
  latestVersionId: string | null;
  pageSlug: string;
}) {
  const [value, setValue] = useState(field.value);
  const [savedValue, setSavedValue] = useState(field.value);
  const [state, formAction, pending] = useActionState<CmsActionState | null, FormData>(
    saveCmsFieldAction,
    null,
  );

  const isDirty = value !== savedValue;

  useEffect(() => {
    // Tras guardar OK, lo actual pasa a ser lo "guardado" (isDirty vuelve a false).
    if (state?.ok) queueMicrotask(() => setSavedValue(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const canPublish = field.kind === "BLOCK" && field.hasDraft && latestVersionId;

  const input =
    field.type === "BOOLEAN" ? (
      <select
        name="body"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-sm focus:ring-2 focus:outline-none"
      >
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    ) : field.type === "TEXTAREA" ? (
      <textarea
        name="body"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        rows={3}
        className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 text-brand-purple-dark w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
      />
    ) : field.type === "COLOR" ? (
      <span className="flex items-center gap-2">
        {/* type=color exige #rrggbb; si el valor guardado no es hex válido
            arrancamos en negro para que el control no se rompa. */}
        <input type="hidden" name="body" value={value} />
        <input
          type="color"
          aria-label={`Color de ${field.label}`}
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          className="border-brand-purple/20 h-9 w-12 cursor-pointer rounded-md border bg-white p-1"
        />
        <code className="text-brand-purple-dark/75 font-mono text-xs">{value}</code>
      </span>
    ) : (
      <Input
        name="body"
        type={INPUT_TYPE[field.type]}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
      />
    );

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-brand-purple-dark text-sm font-semibold">{field.label}</span>
          {field.isPublished && !field.hasDraft ? (
            <AdminBadge tone="emerald">Publicado</AdminBadge>
          ) : field.isPublished ? (
            <AdminBadge tone="amber">Cambios sin publicar</AdminBadge>
          ) : (
            <AdminBadge tone="amber">Borrador</AdminBadge>
          )}
        </div>
        {field.helpText && <p className="text-brand-muted mt-0.5 text-xs">{field.helpText}</p>}
        <p className="text-brand-muted mt-0.5 font-mono text-[10px]">{field.key}</p>
      </div>

      <div className="w-full max-w-md space-y-2">
        <form action={formAction} className="flex items-start gap-2">
          <input type="hidden" name="id" value={field.id} />
          <div className="flex-1">{input}</div>
          <Button
            type="submit"
            size="sm"
            disabled={pending || !isDirty}
            className="bg-gradient-brand text-white hover:brightness-110 disabled:opacity-50"
            title={isDirty ? "Guardar el cambio" : "No hay cambios para guardar"}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Save className="mr-1 h-3.5 w-3.5" />
                Guardar
              </>
            )}
          </Button>
        </form>

        {state?.error && <p className="text-xs text-rose-600">{state.error}</p>}
        {state?.ok && !state.error && (
          <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            {field.kind === "SETTING"
              ? "Guardado — ya se ve en el sitio."
              : "Borrador guardado — dale a Publicar para que se vea en el sitio."}
          </p>
        )}
        {field.showingDraft && !state?.ok && (
          <p className="text-xs text-amber-700">
            Estás viendo el borrador (todavía no se publica en el sitio).
          </p>
        )}

        {canPublish && (
          <form action={publishCmsFieldAction}>
            <input type="hidden" name="fieldId" value={field.id} />
            <input type="hidden" name="versionId" value={latestVersionId} />
            <input type="hidden" name="redirectTo" value={`/admin/contenido/paginas/${pageSlug}`} />
            <Button
              type="submit"
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              title="Hacer público el último borrador guardado"
            >
              <Send className="mr-1 h-3.5 w-3.5" />
              Publicar
            </Button>
          </form>
        )}
      </div>
    </li>
  );
}
