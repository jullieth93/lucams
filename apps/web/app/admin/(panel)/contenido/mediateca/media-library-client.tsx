"use client";

/*
 * <MediaLibraryClient> — interacción de la Mediateca (roadmap B5):
 * uploader (drag & drop + alt obligatorio) y grilla de assets con edición
 * de texto alternativo y borrado con guarda de uso (el service rechaza el
 * borrado si algún campo usa el asset; el botón se deshabilita acá también).
 */

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteCmsMediaAction,
  updateCmsMediaAltAction,
  uploadCmsMediaAction,
  type CmsMediaActionState,
} from "@/app/admin/(panel)/contenido/actions";

export type MediaLibraryItem = {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  bytes: number;
  /** keys de los campos IMAGE que usan el asset en su borrador actual. */
  usedBy: string[];
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
        <div className="flex items-center justify-between gap-2">
          {inUse ? (
            <span
              className="text-[11px] font-medium text-emerald-700"
              title={`La usan: ${item.usedBy.join(", ")}`}
            >
              En uso ({item.usedBy.length})
            </span>
          ) : (
            <span className="text-brand-muted text-[11px]">Sin usar</span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={delPending || inUse}
            title={
              inUse
                ? `No se puede borrar: la usan ${item.usedBy.join(", ")}`
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
          <h2 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Biblioteca ({media.length})
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {media.map((m) => (
              <MediaCard key={m.id} item={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
