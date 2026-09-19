"use client";

/*
 * <MediaLibraryClient> — interacción de la Mediateca (roadmap B5):
 * uploader (drag & drop + alt obligatorio) y grilla de assets con edición
 * de texto alternativo y borrado con guarda de uso (el service rechaza el
 * borrado si algún campo usa el asset; el botón se deshabilita acá también).
 *
 * Fase 3D (feedback Lucy 2026-09-18): la biblioteca se volvió ÚTIL de verdad —
 * botón "Copiar URL" por asset (mismo patrón copy-to-clipboard de referidos:
 * feedback inline + toast), filtro "Sin uso" para cazar assets huérfanos y
 * detalle expandible del conteo de usos (qué campos/páginas CMS la usan).
 */

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteCmsMediaAction,
  updateCmsMediaAltAction,
  uploadCmsMediaAction,
  type CmsMediaActionState,
} from "@/app/admin/(panel)/contenido/actions";

/** Referencia de uso (misma forma que CmsMediaUsageRef de lib/cms-media.ts). */
export type MediaUsageRef = {
  fieldId: string;
  key: string;
  label: string;
  pageSlug: string;
  pageTitle: string;
};

export type MediaLibraryItem = {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  bytes: number;
  /** campos IMAGE (o LISTA con subcampo IMAGE) que usan el asset en su borrador actual. */
  usedBy: MediaUsageRef[];
};

function formatKb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/** Tarjeta de subida: misma interacción que el control del editor de campo. */
function UploadCard() {
  const [state, dispatch, pending] = useActionState<CmsMediaActionState | null, FormData>(
    uploadCmsMediaAction,
    null,
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(next: File | null) {
    setFile(next);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
  }

  function handleUpload() {
    if (!file || !alt.trim()) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("alt", alt.trim());
    startTransition(() => dispatch(fd));
  }

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state?.ok) {
      toast.success("Imagen subida a la mediateca.");
      queueMicrotask(() => {
        pickFile(null);
        setAlt("");
        if (fileRef.current) fileRef.current.value = "";
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <section className="border-brand-purple/15 space-y-3 rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="text-brand-purple-dark font-display text-base font-bold">Subir imagen</h2>
      <div
        role="button"
        tabIndex={0}
        aria-label="Arrastra una imagen aquí o haz click para elegirla"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragOver
            ? "border-brand-purple bg-brand-purple/5"
            : "border-brand-purple/25 hover:border-brand-purple/50 bg-brand-cream/40"
        }`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview local del archivo elegido
          <img
            src={previewUrl}
            alt="Vista previa del archivo elegido"
            className="max-h-36 rounded-lg"
          />
        ) : (
          <>
            <ImagePlus className="text-brand-purple/60 h-8 w-8" />
            <p className="text-brand-purple-dark text-sm font-semibold">
              Arrastra una imagen aquí o haz click para elegirla
            </p>
            <p className="text-brand-muted text-xs">JPG, PNG, WebP o AVIF · máx 5 MB</p>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />
      {file && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-60 flex-1 space-y-1.5">
            <Label htmlFor="ml-alt" className="text-brand-purple-dark font-semibold">
              Texto alternativo <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="ml-alt"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              disabled={pending}
              placeholder="Ej. Banner del Día de la Madre con imanes de fotos"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            <p className="text-brand-muted text-xs">
              Lo leen los lectores de pantalla. Describe qué se ve, en una frase.
            </p>
          </div>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={pending || !alt.trim()}
            className="bg-gradient-brand text-white hover:brightness-110 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Subiendo...
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-4 w-4" /> Subir
              </>
            )}
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * Botón "Copiar URL" del asset (Fase 3D). Mismo patrón copy-to-clipboard del
 * repo (referral-copy-button / copy-quote-link): navigator.clipboard con
 * feedback inline breve; si el clipboard no está disponible, el toast muestra
 * la URL para copiarla a mano.
 */
function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-live="polite"
      title="Copiar la URL pública de la imagen"
      onClick={async () => {
        try {
          if (!navigator.clipboard) throw new Error("clipboard unavailable");
          await navigator.clipboard.writeText(url);
          setCopied(true);
          toast.success("URL copiada al portapapeles.");
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast("Copia la URL a mano:", { description: url, duration: 10000 });
        }
      }}
      className="text-brand-purple-dark hover:bg-brand-purple/10 inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {copied ? "¡Copiada!" : "Copiar URL"}
    </button>
  );
}

/** Tarjeta de un asset: thumb + alt editable + metadata + borrado. */
function MediaCard({ item }: { item: MediaLibraryItem }) {
  const [altState, altDispatch, altPending] = useActionState<CmsMediaActionState | null, FormData>(
    updateCmsMediaAltAction,
    null,
  );
  const [delState, delDispatch, delPending] = useActionState<CmsMediaActionState | null, FormData>(
    deleteCmsMediaAction,
    null,
  );
  const [alt, setAlt] = useState(item.alt);
  const [savedAlt, setSavedAlt] = useState(item.alt);

  const altDirty = alt.trim() !== savedAlt;
  const inUse = item.usedBy.length > 0;

  useEffect(() => {
    if (altState?.error) toast.error(altState.error);
    else if (altState?.ok) {
      toast.success("Texto alternativo guardado.");
      queueMicrotask(() => setSavedAlt(alt.trim()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altState]);

  useEffect(() => {
    if (delState?.error) toast.error(delState.error);
    else if (delState?.ok) toast.success("Imagen borrada.");
  }, [delState]);

  function handleDelete() {
    if (!window.confirm("¿Borrar esta imagen de la mediateca? No se puede deshacer.")) return;
    const fd = new FormData();
    fd.set("id", item.id);
    startTransition(() => delDispatch(fd));
  }

  function handleSaveAlt() {
    if (!altDirty) return;
    const fd = new FormData();
    fd.set("id", item.id);
    fd.set("alt", alt.trim());
    startTransition(() => altDispatch(fd));
  }

  return (
    <div className="border-brand-purple/15 overflow-hidden rounded-xl border bg-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element -- thumb admin del bucket */}
      <img
        src={item.url}
        alt={item.alt}
        className="aspect-[4/3] w-full object-cover"
        loading="lazy"
      />
      <div className="space-y-2 p-3">
        <div className="space-y-1">
          <Input
            aria-label="Texto alternativo"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            disabled={altPending || delPending}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-8 text-xs"
          />
          {altDirty && (
            <Button
              type="button"
              size="sm"
              onClick={handleSaveAlt}
              disabled={altPending}
              className="bg-gradient-brand h-7 text-xs text-white hover:brightness-110"
            >
              {altPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Check className="mr-1 h-3 w-3" />
              )}
              Guardar alt
            </Button>
          )}
        </div>
        <p className="text-brand-muted text-[11px]">
          {item.width} × {item.height} px · {formatKb(item.bytes)}
        </p>
        {/*
         * Conteo de usos expandible (Fase 3D): el click despliega QUÉ campos
         * la usan y en qué página CMS viven, con link directo a editarlos.
         */}
        {inUse ? (
          <details className="group">
            <summary className="cursor-pointer list-none text-[11px] font-medium text-emerald-700 hover:underline">
              En uso ({item.usedBy.length}) · ver dónde
            </summary>
            <ul className="mt-1 space-y-1.5 rounded-md bg-emerald-50/60 p-2">
              {item.usedBy.map((ref) => (
                <li key={ref.fieldId} className="text-[11px] leading-tight">
                  <Link
                    href={`/admin/contenido/campos/${ref.fieldId}`}
                    className="text-brand-purple-dark font-semibold hover:underline"
                  >
                    {ref.label}
                  </Link>{" "}
                  <span className="text-brand-muted font-mono text-[10px]">({ref.key})</span>
                  <div className="text-brand-muted">
                    en{" "}
                    <Link
                      href={`/admin/contenido/paginas/${ref.pageSlug}`}
                      className="hover:text-brand-purple-dark hover:underline"
                    >
                      {ref.pageTitle}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <span className="text-brand-muted text-[11px]">Sin usar — candidata a limpiar</span>
        )}
        <div className="flex items-center justify-between gap-2">
          <CopyUrlButton url={item.url} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={delPending || inUse}
            title={
              inUse
                ? `No se puede borrar: la usan ${item.usedBy.map((r) => r.key).join(", ")}`
                : "Borrar de la mediateca"
            }
            className="h-7 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            {delPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MediaLibraryClient({ media }: { media: MediaLibraryItem[] }) {
  // Filtro "Sin uso" (Fase 3D, feedback Lucy 2026-09-18): vista para cazar
  // assets huérfanos — subidos alguna vez pero que ya ningún campo referencia.
  const [filter, setFilter] = useState<"all" | "unused">("all");
  const unusedCount = media.filter((m) => m.usedBy.length === 0).length;
  const visible = filter === "unused" ? media.filter((m) => m.usedBy.length === 0) : media;

  return (
    <div className="space-y-6">
      <UploadCard />
      {media.length === 0 ? (
        <p className="border-brand-purple/15 text-brand-muted rounded-xl border border-dashed bg-white/60 px-4 py-8 text-center text-sm">
          Todavía no hay imágenes. Sube la primera arriba — después la eliges desde cualquier campo
          de imagen.
        </p>
      ) : (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-brand-purple-dark font-display text-base font-bold">
              Biblioteca ({media.length})
            </h2>
            <div
              role="group"
              aria-label="Filtrar por uso"
              className="border-brand-purple/15 ml-auto inline-flex overflow-hidden rounded-lg border bg-white text-xs font-semibold"
            >
              <button
                type="button"
                onClick={() => setFilter("all")}
                aria-pressed={filter === "all"}
                className={`px-3 py-1.5 transition-colors ${
                  filter === "all"
                    ? "bg-brand-purple text-white"
                    : "text-brand-purple-dark hover:bg-brand-purple/5"
                }`}
              >
                Todas ({media.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("unused")}
                aria-pressed={filter === "unused"}
                className={`px-3 py-1.5 transition-colors ${
                  filter === "unused"
                    ? "bg-brand-purple text-white"
                    : "text-brand-purple-dark hover:bg-brand-purple/5"
                }`}
              >
                Sin uso ({unusedCount})
              </button>
            </div>
          </div>
          {visible.length === 0 ? (
            <p className="border-brand-purple/15 text-brand-muted rounded-xl border border-dashed bg-white/60 px-4 py-8 text-center text-sm">
              Ninguna imagen sin uso — todas las de la biblioteca las referencia al menos un campo.
              🎉
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visible.map((m) => (
                <MediaCard key={m.id} item={m} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
