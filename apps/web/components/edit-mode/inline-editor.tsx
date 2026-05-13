"use client";

/*
 * <InlineEditor> — popover modal para editar un bloque o setting
 * desde el sitio público.
 *
 * Flujo:
 *  1. Mount con `cmsKey` → fetch GET /api/admin/cms/by-key/[key]
 *  2. Si es bloque: textarea body + preview markdown live + botones
 *     "Guardar borrador" (gris) / "Publicar" (verde)
 *  3. Si es setting: input simple + botón "Guardar"
 *  4. Al publicar → toast sonner + router.refresh() para que el
 *     server component que rendea el bloque haga refetch del cache
 *     invalidado (updateTag("cms") ya corrió en el server action)
 *  5. ESC o click en backdrop cierra
 *
 * Diseño compacto: 600px max width, body textarea ~12 rows, no
 * version history acá (eso vive en /admin/contenido). Pensado para
 * cambios rápidos, no para edición exhaustiva.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Loader2, X } from "lucide-react";
import {
  inlineEditBlockAction,
  inlineEditSettingAction,
} from "@/app/admin/contenido/inline-edit-actions";

type LoadedBlock = {
  kind: "block";
  block: {
    id: string;
    key: string;
    title: string | null;
    body: string;
    format: "MARKDOWN" | "HTML" | "TEXT" | "JSON";
    description: string | null;
    isPublished: boolean;
    publishedVersion: number | null;
  };
};

type LoadedSetting = {
  kind: "setting";
  setting: {
    id: string;
    key: string;
    value: string;
    valueType: "TEXT" | "EMAIL" | "URL" | "NUMBER" | "PHONE" | "COLOR" | "BOOLEAN";
    label: string;
    description: string | null;
  };
};

type Loaded = LoadedBlock | LoadedSetting;

export function InlineEditor({ cmsKey, onClose }: { cmsKey: string; onClose: () => void }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [body, setBody] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/cms/by-key/${encodeURIComponent(cmsKey)}`);
        if (!r.ok) {
          if (cancelled) return;
          setError(r.status === 403 ? "Tu sesión de admin expiró." : "Bloque no encontrado.");
          return;
        }
        const data = (await r.json()) as Loaded;
        if (cancelled) return;
        setLoaded(data);
        if (data.kind === "block") setBody(data.block.body);
        else setValue(data.setting.value);
      } catch {
        if (!cancelled) setError("No pudimos cargar el contenido.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cmsKey]);

  // Cerrar con ESC
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose, saving]);

  async function handleSaveBlock(publish: boolean) {
    if (!loaded || loaded.kind !== "block") return;
    setSaving(true);
    setError(null);
    const result = await inlineEditBlockAction({
      key: loaded.block.key,
      body,
      publish,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success(publish ? "Publicado ✓ Cambio visible en el sitio." : "Borrador guardado.");
    router.refresh();
    onClose();
  }

  async function handleSaveSetting() {
    if (!loaded || loaded.kind !== "setting") return;
    setSaving(true);
    setError(null);
    const result = await inlineEditSettingAction({
      key: loaded.setting.key,
      value,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success("Guardado ✓ Cambio visible en el sitio.");
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />
      {/* Modal */}
      <div className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-brand-purple/10 flex items-center justify-between border-b px-5 py-3">
          <div>
            <div className="text-brand-purple-dark font-display text-lg">
              {!loaded
                ? "Cargando…"
                : loaded.kind === "block"
                  ? (loaded.block.title ?? loaded.block.key)
                  : loaded.setting.label}
            </div>
            <div className="font-mono text-xs text-slate-500">{cmsKey}</div>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loaded && (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Cargando…
          </div>
        )}

        {loaded?.kind === "block" && (
          <BlockEditor
            block={loaded.block}
            body={body}
            onBodyChange={setBody}
            onSaveDraft={() => handleSaveBlock(false)}
            onPublish={() => handleSaveBlock(true)}
            saving={saving}
          />
        )}

        {loaded?.kind === "setting" && (
          <SettingEditor
            setting={loaded.setting}
            value={value}
            onValueChange={setValue}
            onSave={handleSaveSetting}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  body,
  onBodyChange,
  onSaveDraft,
  onPublish,
  saving,
}: {
  block: LoadedBlock["block"];
  body: string;
  onBodyChange: (v: string) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex max-h-[calc(90vh-120px)] flex-col">
      {block.description && (
        <p className="border-b bg-slate-50 px-5 py-2 text-xs text-slate-600">
          ℹ {block.description}
        </p>
      )}
      <div className="grid flex-1 grid-cols-2 divide-x overflow-hidden">
        <div className="flex flex-col overflow-hidden">
          <div className="border-b bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
            Editor ({block.format.toLowerCase()})
          </div>
          <textarea
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            spellCheck
            className="text-brand-purple-dark min-h-[300px] flex-1 resize-none p-4 font-mono text-sm outline-none focus:bg-yellow-50/30"
            placeholder="Escribe el contenido aquí…"
          />
        </div>
        <div className="flex flex-col overflow-hidden">
          <div className="border-b bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
            Vista previa
          </div>
          <div className="prose prose-sm prose-headings:font-display prose-headings:text-brand-purple-dark prose-a:text-brand-purple max-w-none flex-1 overflow-auto p-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {body || "*Vacío*"}
            </ReactMarkdown>
          </div>
        </div>
      </div>
      <div className="border-brand-purple/10 flex items-center justify-between border-t bg-slate-50 px-5 py-3">
        <p className="text-xs text-slate-500">
          {block.isPublished
            ? `Publicado · versión ${block.publishedVersion ?? "—"}`
            : "No publicado todavía"}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={saving}
            className="rounded-full bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
          >
            Guardar borrador
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={saving}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Publicar
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingEditor({
  setting,
  value,
  onValueChange,
  onSave,
  saving,
}: {
  setting: LoadedSetting["setting"];
  value: string;
  onValueChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const inputType = (() => {
    switch (setting.valueType) {
      case "EMAIL":
        return "email";
      case "URL":
        return "url";
      case "NUMBER":
        return "number";
      case "PHONE":
        return "tel";
      default:
        return "text";
    }
  })();

  return (
    <div className="p-5">
      {setting.description && (
        <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          ℹ {setting.description}
        </p>
      )}
      <label className="text-brand-purple-dark mb-1.5 block text-sm font-medium">
        {setting.label}
      </label>
      <input
        type={inputType}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border px-3 py-2 text-base outline-none focus:ring-2"
        placeholder="Valor"
      />
      <p className="mt-1 text-xs text-slate-500">
        Tipo: {setting.valueType.toLowerCase()} · Clave:{" "}
        <span className="font-mono">{setting.key}</span>
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          Guardar y publicar
        </button>
      </div>
    </div>
  );
}
