"use client";

/*
 * <CmsImageControl> — control de los campos CMS `type: IMAGE` (roadmap B5).
 *
 * El `body` del campo es el CmsMedia.id del asset elegido. El control ofrece
 * los dos caminos para fijarlo:
 *   1. Subir nueva: drag & drop o click → preview local → alt obligatorio
 *      (a11y) → uploadCmsMediaAction → el id queda seleccionado.
 *   2. Elegir de la mediateca: grilla de assets ya subidos (reutilizar).
 *
 * NO hay <form> anidado: el editor del campo ya envuelve todo en el suyo; la
 * subida se dispara llamando la action con startTransition desde un botón
 * type="button". El valor viaja en un hidden input `name="body"` — el guardado
 * del campo es el flujo normal de siempre (borrador/publicar).
 */

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ImagePlus, Images, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  uploadCmsMediaAction,
  type CmsMediaActionState,
} from "@/app/admin/(panel)/contenido/actions";

export type CmsMediaLite = {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
};

export function CmsImageControl({
  name,
  value,
  onChange,
  library,
}: {
  /** name="body" — el hidden input que viaja en el form del editor. */
  name: string;
  /** CmsMedia.id actualmente guardado en el campo ("" si aún no hay imagen). */
  value: string;
  onChange: (mediaId: string) => void;
  /** Assets recientes de la mediateca (para reutilizar sin resubir). */
  library: CmsMediaLite[];
}) {
  const [state, dispatch, pending] = useActionState<CmsMediaActionState | null, FormData>(
    uploadCmsMediaAction,
    null,
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState("");
  const [uploaded, setUploaded] = useState<CmsMediaLite[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Assets visibles para el picker/preview: los subidos en esta sesión + la biblioteca.
  const allMedia = [...uploaded, ...library];
  const selected = value ? (allMedia.find((m) => m.id === value) ?? null) : null;

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
    else if (state?.ok && state.media) {
      toast.success("Imagen subida. Acuérdate de Guardar el campo para dejarla en el borrador.");
      const media = state.media;
      queueMicrotask(() => {
        setUploaded((u) => [media, ...u]);
        onChange(media.id);
        pickFile(null);
        setAlt("");
        if (fileRef.current) fileRef.current.value = "";
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="space-y-4">
      <input type="hidden" name={name} value={value} />

      {/* Imagen seleccionada (la que quedará guardada) */}
      <div className="space-y-2">
        <Label className="text-brand-purple-dark text-base font-semibold">Imagen del campo</Label>
        {selected ? (
          <div className="border-brand-purple/15 flex flex-wrap items-center gap-4 rounded-xl border bg-white p-3 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- asset admin, preview directo del bucket */}
            <img
              src={selected.url}
              alt={selected.alt}
              className="h-24 w-24 rounded-lg object-cover ring-1 ring-black/5"
            />
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-brand-purple-dark font-semibold">{selected.alt}</p>
              <p className="text-brand-muted text-xs">
                {selected.width} × {selected.height} px
              </p>
              <p className="text-brand-muted mt-1 text-xs">
                Para cambiarla: sube una nueva o elige otra de la mediateca ↓
              </p>
            </div>
          </div>
        ) : (
          <p className="border-brand-purple/15 text-brand-muted rounded-xl border border-dashed bg-white/60 px-4 py-3 text-sm">
            Todavía no hay imagen. Sube una nueva o elige una de la mediateca — y después{" "}
            <b>Guardar</b>.
          </p>
        )}
      </div>

      {/* Subir nueva (drag & drop + click) */}
      <div className="space-y-2">
        <Label className="text-brand-purple-dark text-base font-semibold">Subir nueva</Label>
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
              : "border-brand-purple/25 hover:border-brand-purple/50 bg-white"
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
              <Label htmlFor="cms-media-alt" className="text-brand-purple-dark font-semibold">
                Texto alternativo <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="cms-media-alt"
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
                  <Upload className="mr-1.5 h-4 w-4" /> Subir imagen
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Reutilizar de la mediateca */}
      {allMedia.length > 0 && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setPickerOpen((v) => !v)}
            className="text-brand-purple-dark hover:bg-brand-purple/10 -ml-2"
          >
            <Images className="mr-1.5 h-4 w-4" />
            {pickerOpen ? "Ocultar mediateca" : `Elegir de la mediateca (${allMedia.length})`}
          </Button>
          {pickerOpen && (
            <div className="border-brand-purple/15 space-y-3 rounded-xl border bg-white p-3 shadow-sm">
              <Input
                value={pickerFilter}
                onChange={(e) => setPickerFilter(e.target.value)}
                placeholder="Filtrar por texto alternativo…"
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30 max-w-sm"
              />
              <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                {allMedia
                  .filter(
                    (m) =>
                      pickerFilter.trim() === "" ||
                      m.alt.toLowerCase().includes(pickerFilter.trim().toLowerCase()),
                  )
                  .map((m) => {
                    const isSel = m.id === value;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onChange(m.id);
                          setPickerOpen(false);
                        }}
                        title={m.alt}
                        className={`group relative aspect-square overflow-hidden rounded-lg ring-2 transition hover:scale-[1.02] ${
                          isSel ? "ring-emerald-500" : "hover:ring-brand-purple/50 ring-transparent"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- thumb admin del bucket */}
                        <img
                          src={m.url}
                          alt={m.alt}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        {isSel && (
                          <span className="absolute top-1 right-1 rounded-full bg-emerald-500 p-0.5 text-white">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
