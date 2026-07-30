"use client";

/*
 * Editor de un campo LISTA (CMS v2, roadmap B4) — la alternativa amigable al
 * textarea JSON para campos con `metadata.listSchema` (ej. footer.legal.links).
 *
 * La administradora ve FILAS con un input por subcampo (label del subcampo
 * encima), puede agregar/quitar filas y reordenarlas con ↑/↓. Nunca ve JSON;
 * la vista previa del JSON resultante queda en un colapsable, solo como
 * transparencia.
 *
 * Guardar usa saveCmsFieldItemsAction: el service valida contra el listSchema,
 * reemplaza las filas (CmsListItem) y serializa el array a JSON como body del
 * campo → flujo normal: en BLOCK crea BORRADOR (hay que Publicar después);
 * en SETTING publica de inmediato.
 */

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, Loader2, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveCmsFieldItemsAction,
  type CmsActionState,
} from "@/app/admin/(panel)/contenido/actions";

export type EditableListField = {
  id: string;
  key: string;
  kind: "BLOCK" | "SETTING";
  label: string;
  helpText: string | null;
  isPublished: boolean;
  listSchema: { name: string; type: string; label: string }[];
  /** Filas iniciales (values de CmsListItem o derivadas del body JSON). */
  items: Record<string, unknown>[];
};

type Row = {
  /** Key React estable (no viaja al servidor). */
  rowId: string;
  values: Record<string, string>;
};

const SIMPLE_INPUT_TYPE: Record<string, string> = {
  TEXT: "text",
  EMAIL: "email",
  URL: "url",
  NUMBER: "number",
  PHONE: "tel",
  COLOR: "color",
};

// Contador module-scope para las keys React de las filas: solo necesitan ser
// únicas, sin significado (un ref no sirve: leerlo durante render lo prohíbe
// react-hooks/refs).
let rowSeq = 0;
const makeRowId = () => `row-${rowSeq++}`;

// Coerce defensivo: los values vienen de JSON y podrían no ser strings.
function toRowValues(
  listSchema: EditableListField["listSchema"],
  values: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sub of listSchema) {
    const raw = values[sub.name];
    out[sub.name] = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  }
  return out;
}

export function ListEditorForm({ field }: { field: EditableListField }) {
  const isSetting = field.kind === "SETTING";

  const toRows = (items: Record<string, unknown>[]): Row[] =>
    items.map((values) => ({ rowId: makeRowId(), values: toRowValues(field.listSchema, values) }));

  // Snapshot del "original" para Descartar + isDirty (mismo patrón que
  // field-editor-form: se actualiza explícitamente tras guardar OK).
  const [original, setOriginal] = useState<Row[]>(() => toRows(field.items));
  const [rows, setRows] = useState<Row[]>(() => toRows(field.items));

  const [state, formAction, pending] = useActionState<CmsActionState | null, FormData>(
    saveCmsFieldItemsAction,
    null,
  );

  const serialize = (list: Row[]) => JSON.stringify(list.map((r) => r.values));
  const isDirty = serialize(rows) !== serialize(original);

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
      queueMicrotask(() => setOriginal(rows));
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

  function updateCell(index: number, name: string, value: string) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, values: { ...row.values, [name]: value } } : row,
      ),
    );
  }

  function addRow() {
    const empty: Record<string, string> = {};
    for (const sub of field.listSchema) empty[sub.name] = "";
    setRows((prev) => [...prev, { rowId: makeRowId(), values: empty }]);
  }

  function removeRow(index: number) {
    const row = rows[index];
    const hasContent = Object.values(row.values).some((v) => v.trim() !== "");
    if (
      hasContent &&
      !window.confirm(`¿Eliminar el elemento ${index + 1}? Esta acción se aplica al guardar.`)
    ) {
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function moveRow(index: number, direction: -1 | 1) {
    setRows((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function discardChanges() {
    if (!isDirty) return;
    if (!window.confirm("¿Descartar los cambios? La lista volverá a como estaba guardada.")) {
      return;
    }
    setRows(original);
    toast.info("Cambios descartados.");
  }

  // Vista previa del JSON que quedará como body del campo (transparencia).
  const jsonPreview = JSON.stringify(
    rows.map((r) => r.values),
    null,
    2,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={field.id} />
      <input type="hidden" name="items" value={serialize(rows)} />

      <div className="space-y-3">
        {rows.length === 0 && (
          <p className="text-brand-muted border-brand-purple/15 rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            La lista está vacía. Agrega el primer elemento con el botón de abajo.
          </p>
        )}

        {rows.map((row, index) => (
          <div
            key={row.rowId}
            className="border-brand-purple/15 rounded-xl border bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-brand-purple-dark text-sm font-semibold">
                Elemento {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => moveRow(index, -1)}
                  disabled={pending || index === 0}
                  className="text-brand-purple-dark hover:bg-brand-purple/10 h-8 w-8 p-0"
                  title="Subir"
                  aria-label={`Subir elemento ${index + 1}`}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => moveRow(index, 1)}
                  disabled={pending || index === rows.length - 1}
                  className="text-brand-purple-dark hover:bg-brand-purple/10 h-8 w-8 p-0"
                  title="Bajar"
                  aria-label={`Bajar elemento ${index + 1}`}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(index)}
                  disabled={pending}
                  className="h-8 w-8 p-0 text-red-700 hover:bg-red-50"
                  title="Eliminar"
                  aria-label={`Eliminar elemento ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field.listSchema.map((sub) => (
                <div key={sub.name} className="space-y-1.5">
                  <Label
                    htmlFor={`${row.rowId}-${sub.name}`}
                    className="text-brand-purple-dark font-semibold"
                  >
                    {sub.label}
                  </Label>
                  {sub.type === "TEXTAREA" || sub.type === "MARKDOWN" ? (
                    <textarea
                      id={`${row.rowId}-${sub.name}`}
                      value={row.values[sub.name] ?? ""}
                      onChange={(e) => updateCell(index, sub.name, e.target.value)}
                      disabled={pending}
                      rows={3}
                      className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 text-brand-purple-dark/90 w-full rounded-lg border bg-white px-4 py-3 text-sm leading-relaxed shadow-sm focus:ring-2 focus:outline-none"
                    />
                  ) : (
                    <Input
                      id={`${row.rowId}-${sub.name}`}
                      type={SIMPLE_INPUT_TYPE[sub.type] ?? "text"}
                      value={row.values[sub.name] ?? ""}
                      onChange={(e) => updateCell(index, sub.name, e.target.value)}
                      disabled={pending}
                      className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        onClick={addRow}
        disabled={pending}
        className="text-brand-purple-dark border-brand-purple/25 hover:bg-brand-purple/10 w-full border border-dashed"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Agregar elemento
      </Button>

      {/* Vista previa del JSON resultante (solo transparencia — no se edita) */}
      <details className="border-brand-purple/10 group rounded-xl border bg-white shadow-sm">
        <summary className="text-brand-purple-dark hover:bg-brand-purple/5 flex cursor-pointer items-center justify-between gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors">
          <span>Ver el JSON resultante (solo lectura)</span>
          <ChevronDown className="text-brand-muted h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-brand-purple/10 border-t px-5 py-4">
          <pre className="text-brand-purple-dark/80 overflow-x-auto rounded-lg bg-stone-50 p-4 font-mono text-xs leading-relaxed">
            {jsonPreview}
          </pre>
        </div>
      </details>

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
              🟢 Esta lista <b>está publicada</b> en el sitio. Al guardar, el cambio queda en
              borrador. Para que se vea, pulsa <b>Publicar nueva versión</b>.
            </>
          ) : (
            <>
              🟡 Esta lista <b>está en borrador</b> (no se ve en el sitio público). Cuando estés
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
              title="Volver a la lista guardada, perdiendo los cambios actuales"
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
