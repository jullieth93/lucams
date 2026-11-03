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
import Link from "next/link";
import { Check, ExternalLink, History, Loader2, Save, Send } from "lucide-react";
import { AdminBadge } from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hint } from "@/components/ui/tooltip";
import { CustomColorPicker } from "@/components/color-picker";
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
  /** Valor publicado (lo que el sitio muestra AHORA); null si nunca se publicó. */
  publishedValue: string | null;
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
  publicPath,
}: {
  field: InlineField;
  latestVersionId: string | null;
  pageSlug: string;
  /** Ruta pública individual asociada al campo (ej. `/legal/garantias` o `/productos`). */
  publicPath?: string | null;
}) {
  const isSeo = field.key.startsWith("seo.page.");
  const [value, setValue] = useState(field.value);
  const [savedValue, setSavedValue] = useState(field.value);
  const [labelValue, setLabelValue] = useState(field.label);
  const [savedLabelValue, setSavedLabelValue] = useState(field.label);
  const [state, formAction, pending] = useActionState<CmsActionState | null, FormData>(
    saveCmsFieldAction,
    null,
  );

  const isDirty = value !== savedValue || (isSeo && labelValue !== savedLabelValue);

  useEffect(() => {
    // Tras guardar OK, lo actual pasa a ser lo "guardado" (isDirty vuelve a false).
    if (state?.ok) {
      queueMicrotask(() => {
        setSavedValue(value);
        setSavedLabelValue(labelValue);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    // Si el servidor re-renderiza con OTRO valor (publicar/despublicar desde la
    // misma fila, "Actualizar caché", o edición hecha en otra sesión) y no hay
    // una edición en curso, sincroniza el input — antes el useState inicial
    // quedaba congelado con el valor viejo (feedback Lucy 2026-09-18).
    if (
      (field.value !== savedValue || field.label !== savedLabelValue) &&
      value === savedValue &&
      labelValue === savedLabelValue
    ) {
      queueMicrotask(() => {
        setValue(field.value);
        setSavedValue(field.value);
        setLabelValue(field.label);
        setSavedLabelValue(field.label);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.value, field.label]);

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
      <span className="flex flex-wrap items-center gap-2">
        {/* Picker propio (components/color-picker.tsx) — el input color nativo
            es una rejilla básica en Android/Linux; paridad en toda plataforma.
            El panel inline cae debajo de la fila (w-full en el flex-wrap). */}
        <input type="hidden" name="body" value={value} />
        <CustomColorPicker
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : null}
          onChange={(hex) => setValue(hex)}
          label={`Color de ${field.label}`}
          disabled={pending}
          className="h-9 w-12 rounded-md"
          panelClassName="w-full basis-full"
          fallbackHex="#000000"
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
          <span className="text-brand-purple-dark text-sm font-semibold">
            {isSeo ? `Página ${publicPath ?? field.key.replace("seo.page.", "/")}` : field.label}
          </span>
          {field.isPublished && !field.hasDraft ? (
            <AdminBadge tone="emerald">Publicado</AdminBadge>
          ) : field.isPublished ? (
            <AdminBadge tone="amber">Cambios sin publicar</AdminBadge>
          ) : (
            <AdminBadge tone="amber">Borrador</AdminBadge>
          )}
          {publicPath && (
            <a
              href={publicPath}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 text-xs font-semibold"
            >
              Ver {publicPath}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {field.helpText && <p className="text-brand-muted mt-0.5 text-xs">{field.helpText}</p>}
        <div className="mt-0.5 flex flex-wrap items-center gap-3">
          <p className="text-brand-muted font-mono text-[10px]">{field.key}</p>
          {field.kind === "BLOCK" && (
            <Link
              href={`/admin/contenido/campos/${field.id}`}
              className="text-brand-muted hover:text-brand-purple inline-flex items-center gap-1 text-[11px] font-medium"
            >
              <History className="h-3 w-3" />
              Historial y opciones
            </Link>
          )}
        </div>
        {isSeo ? (
          <div className="border-brand-purple/10 mt-3 max-w-lg rounded-lg border bg-slate-50/70 p-3">
            <p className="text-[11px] font-medium text-slate-500">
              Vista aproximada en Google · lucamsshop.com{publicPath === "/" ? "" : publicPath}
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-blue-700">
              {labelValue.trim() || "Lucams Shop"}
              {field.key === "seo.page.home" ? "" : " | Lucams Shop"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-600">
              {value.trim() || "Sin meta description."}
            </p>
          </div>
        ) : (
          /* Lucy 2026-09-18 — el «label» de campos como «Guardando...» ES el texto
             original sembrado y no cambia al editar; esta línea muestra explícito
             qué valor está VIVO en el sitio para que no se confunda con el label. */
          field.publishedValue !== null && (
            <p className="text-brand-muted mt-1 text-xs">
              En el sitio ahora:{" "}
              <span className="text-brand-purple-dark font-medium">
                «
                {field.publishedValue.length > 90
                  ? `${field.publishedValue.slice(0, 90)}…`
                  : field.publishedValue}
                »
              </span>
            </p>
          )
        )}
      </div>

      <div className={isSeo ? "w-full max-w-lg space-y-2" : "w-full max-w-md space-y-2"}>
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="id" value={field.id} />
          {isSeo ? (
            <div className="space-y-2.5">
              <div className="space-y-1">
                <Label
                  htmlFor={`seo-label-${field.id}`}
                  className="text-brand-purple-dark text-xs font-semibold"
                >
                  Título en Google ({"<title>"})
                </Label>
                <Input
                  id={`seo-label-${field.id}`}
                  name="label"
                  value={labelValue}
                  onChange={(e) => setLabelValue(e.target.value)}
                  disabled={pending}
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor={`seo-body-${field.id}`}
                  className="text-brand-purple-dark text-xs font-semibold"
                >
                  Descripción en Google (meta description)
                </Label>
                {input}
              </div>
              <div className="flex justify-end">
                <Hint content={isDirty ? "Guardar el cambio" : "No hay cambios para guardar"}>
                  <span tabIndex={0} className="inline-flex">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={pending || !isDirty}
                      className="bg-gradient-brand text-white hover:brightness-110 disabled:opacity-50"
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
                  </span>
                </Hint>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <div className="flex-1">{input}</div>
              <Hint content={isDirty ? "Guardar el cambio" : "No hay cambios para guardar"}>
                <span tabIndex={0} className="inline-flex">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={pending || !isDirty}
                    className="bg-gradient-brand text-white hover:brightness-110 disabled:opacity-50"
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
                </span>
              </Hint>
            </div>
          )}
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
            <Hint content="Hacer público el último borrador guardado">
              <Button
                type="submit"
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Send className="mr-1 h-3.5 w-3.5" />
                Publicar
              </Button>
            </Hint>
          </form>
        )}
      </div>
    </li>
  );
}
