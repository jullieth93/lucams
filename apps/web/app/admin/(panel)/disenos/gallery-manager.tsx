"use client";

/*
 * ADR-057 Fase B2 — Gestión de diseños prediseñados: subir imágenes por producto (tag) + borrar.
 * UX admin claro para Lucy (no-técnica): selector de producto, nombre, subir, preview, borrar.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { Upload, Trash2, Loader2, ArrowUpDown } from "lucide-react";
import { uploadGalleryImageAction, deleteGalleryImageAction } from "./actions";

type Item = {
  id: string;
  tag: string;
  name: string;
  imageUrl: string;
  imageUrlB?: string | null;
  isActive: boolean;
};

// Llega del server (page.tsx): productos activos que declaran galleryTag en su
// personalizationSchema. Misma fuente que valida el upload — nada hardcodeado.
type TagOption = {
  tag: string;
  label: string;
  needsFaceB: boolean;
};

function formatPreview(src: string | null | undefined) {
  if (!src) return null;
  if (src.startsWith("http")) return src;
  return src;
}

/**
 * Vista previa del corte de la tira (modo "una sola imagen"): parte la imagen
 * a la mitad vertical en un canvas del navegador — mitad inferior = cara A
 * (derecha), mitad superior = cara B rotada 180° (normalizada). Con swap=true
 * se intercambian (para diseños que vienen al revés). Mismo corte que hace el
 * server con sharp (gallery-strip.ts): lo que ves es lo que se guarda.
 */
function computeStripPreview(
  img: HTMLImageElement,
  swap: boolean,
): { faceA: string; faceB: string } | null {
  const w = img.naturalWidth;
  const fullH = img.naturalHeight;
  if (w <= 0 || fullH <= 0) return null;
  const h = Math.floor(fullH / 2);
  const render = (sourceTop: number, rotate: boolean): string | null => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    if (rotate) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-w / 2, -h / 2);
    }
    ctx.drawImage(img, 0, sourceTop, w, h, 0, 0, w, h);
    return c.toDataURL("image/png");
  };
  const bottom = render(fullH - h, false); // cara A tal cual
  const topRotated = render(0, true); // cara B normalizada
  if (!bottom || !topRotated) return null;
  return swap ? { faceA: topRotated, faceB: bottom } : { faceA: bottom, faceB: topRotated };
}

export function GalleryManager({ items, tagOptions }: { items: Item[]; tagOptions: TagOption[] }) {
  const [tag, setTag] = useState(tagOptions[0]?.tag ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileARef = useRef<HTMLInputElement>(null);
  const fileBRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLInputElement>(null);
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  // Modo "una sola imagen (ambas caras)": tira vertical formato doblez.
  const [uploadMode, setUploadMode] = useState<"faces" | "strip">("faces");
  const [stripFile, setStripFile] = useState<File | null>(null);
  const [swapFaces, setSwapFaces] = useState(false);
  const [stripPreview, setStripPreview] = useState<{ faceA: string; faceB: string } | null>(null);

  const needsFaceB = tagOptions.find((t) => t.tag === tag)?.needsFaceB ?? false;
  // El modo tira solo aplica a productos de 2 caras; si el producto elegido no
  // los tiene, forzamos el flujo por caras.
  const effectiveMode = needsFaceB ? uploadMode : "faces";

  useEffect(() => {
    if (!stripFile) return;
    const url = URL.createObjectURL(stripFile);
    const img = new Image();
    img.onload = () => setStripPreview(computeStripPreview(img, swapFaces));
    img.onerror = () => setStripPreview(null);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [stripFile, swapFaces]);

  function resetForm() {
    setName("");
    setFileA(null);
    setFileB(null);
    setStripFile(null);
    setSwapFaces(false);
    setStripPreview(null);
    if (fileARef.current) fileARef.current.value = "";
    if (fileBRef.current) fileBRef.current.value = "";
    if (stripRef.current) stripRef.current.value = "";
    setError(null);
  }

  function onUpload() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Ponle un nombre al diseño (2–60 caracteres).");
      return;
    }
    const fd = new FormData();
    fd.set("tag", tag);
    fd.set("name", name.trim());
    if (effectiveMode === "strip") {
      if (!stripFile) {
        setError("Selecciona la tira con las dos caras.");
        return;
      }
      fd.set("mode", "strip");
      fd.set("file", stripFile);
      if (swapFaces) fd.set("swapFaces", "1");
    } else {
      if (!fileA) {
        setError("Selecciona la imagen principal (cara A).");
        return;
      }
      fd.set("file", fileA);
      if (needsFaceB && fileB) fd.set("fileB", fileB);
    }
    startTransition(async () => {
      const res = await uploadGalleryImageAction(fd);
      if (res.error) setError(res.error);
      else resetForm();
    });
  }

  function onDelete(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteGalleryImageAction(fd);
    });
  }

  const byTag = tagOptions.map((t) => ({ ...t, items: items.filter((i) => i.tag === t.tag) }));

  // Sin productos con galleryTag declarado no hay dónde colgar los diseños:
  // el upload fallaría siempre, así que mejor explicarlo que mostrar un form roto.
  if (tagOptions.length === 0) {
    return (
      <p className="text-brand-muted text-sm italic">
        Ningún producto activo declara <code>galleryTag</code> en su schema de personalización
        todavía. Decláralo en el producto (ej. separadores) para habilitar la subida de diseños.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Subir */}
      <div className="border-brand-purple/20 space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-brand-purple-dark font-semibold">Subir un diseño prediseñado</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-brand-purple-dark text-sm font-semibold">
            Producto
            <select
              value={tag}
              onChange={(e) => {
                setTag(e.target.value);
                setFileB(null);
                if (fileBRef.current) fileBRef.current.value = "";
              }}
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            >
              {tagOptions.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-brand-purple-dark text-sm font-semibold">
            Nombre del diseño
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Ej: Flores acuarela"
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            />
          </label>
        </div>

        {needsFaceB && (
          <div>
            <p className="text-brand-purple-dark mb-2 text-sm font-semibold">¿Cómo lo subes?</p>
            <div
              role="radiogroup"
              aria-label="Modo de subida"
              className="grid gap-2 sm:grid-cols-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={uploadMode === "faces"}
                onClick={() => setUploadMode("faces")}
                className={
                  "rounded-xl border-2 p-3 text-left transition-all " +
                  (uploadMode === "faces"
                    ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                    : "border-brand-purple/15 hover:border-brand-purple/30")
                }
              >
                <div className="text-brand-purple-dark text-sm font-semibold">Por caras</div>
                <div className="text-brand-muted text-xs">
                  Una imagen para la cara A y otra para la cara B (opcional).
                </div>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={uploadMode === "strip"}
                onClick={() => setUploadMode("strip")}
                className={
                  "rounded-xl border-2 p-3 text-left transition-all " +
                  (uploadMode === "strip"
                    ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                    : "border-brand-purple/15 hover:border-brand-purple/30")
                }
              >
                <div className="text-brand-purple-dark text-sm font-semibold">
                  Una sola imagen (ambas caras)
                </div>
                <div className="text-brand-muted text-xs">
                  Tira vertical de imprenta: cara A abajo (derecha) y cara B arriba (cabeza abajo).
                </div>
              </button>
            </div>
          </div>
        )}

        {effectiveMode === "strip" ? (
          <div className="bg-brand-purple/5 rounded-xl p-3">
            <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
              Tira con las dos caras
            </p>
            <button
              type="button"
              onClick={() => stripRef.current?.click()}
              disabled={pending}
              className="bg-brand-purple hover:bg-brand-purple-dark inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {stripFile ? `Cambiar: ${stripFile.name}` : "Seleccionar tira"}
            </button>
            <input
              ref={stripRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                setStripPreview(null);
                setStripFile(e.target.files?.[0] ?? null);
                setSwapFaces(false);
              }}
            />
            {stripFile && !stripPreview && (
              <p className="mt-2 text-xs text-amber-700">
                No pudimos previsualizar el corte en el navegador; si la proporción no cuadra con el
                producto, el servidor la rechazará con el motivo.
              </p>
            )}
            {stripPreview && (
              <div className="mt-3">
                <p className="text-brand-muted mb-2 text-xs">
                  Así quedará el corte (las dos caras ya derechas, como las verá el Estudio):
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element -- preview local del corte */}
                    <img
                      src={stripPreview.faceA}
                      alt="Cara A resultante"
                      className="max-h-56 w-full rounded-lg bg-white object-contain"
                    />
                    <figcaption className="text-brand-purple-dark mt-1 text-center text-xs font-semibold">
                      Cara A (frente)
                    </figcaption>
                  </figure>
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element -- preview local del corte */}
                    <img
                      src={stripPreview.faceB}
                      alt="Cara B resultante"
                      className="max-h-56 w-full rounded-lg bg-white object-contain"
                    />
                    <figcaption className="text-brand-purple-dark mt-1 text-center text-xs font-semibold">
                      Cara B (respaldo)
                    </figcaption>
                  </figure>
                </div>
                <button
                  type="button"
                  onClick={() => setSwapFaces((s) => !s)}
                  disabled={pending}
                  className="border-brand-purple text-brand-purple hover:bg-brand-purple/10 mt-3 inline-flex items-center gap-2 rounded-xl border-2 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  Intercambiar caras{swapFaces ? " (intercambiadas)" : ""}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Cara A */}
            <div className="bg-brand-purple/5 rounded-xl p-3">
              <p className="text-brand-purple-dark mb-2 text-sm font-semibold">Cara A (frente)</p>
              <button
                type="button"
                onClick={() => fileARef.current?.click()}
                disabled={pending}
                className="bg-brand-purple hover:bg-brand-purple-dark inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {fileA ? `Cambiar: ${fileA.name}` : "Seleccionar imagen A"}
              </button>
              <input
                ref={fileARef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setFileA(e.target.files?.[0] ?? null)}
              />
              {fileA && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={URL.createObjectURL(fileA)}
                  alt="Preview A"
                  className="mt-3 aspect-video w-full rounded-lg object-contain"
                />
              )}
            </div>

            {/* Cara B */}
            {needsFaceB && (
              <div className="bg-brand-purple/5 rounded-xl p-3">
                <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
                  Cara B (respaldo)
                </p>
                <button
                  type="button"
                  onClick={() => fileBRef.current?.click()}
                  disabled={pending}
                  className="border-brand-purple text-brand-purple hover:bg-brand-purple/10 inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {fileB ? `Cambiar: ${fileB.name}` : "Seleccionar imagen B (opcional)"}
                </button>
                <input
                  ref={fileBRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => setFileB(e.target.files?.[0] ?? null)}
                />
                {fileB && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={URL.createObjectURL(fileB)}
                    alt="Preview B"
                    className="mt-3 aspect-video w-full rounded-lg object-contain"
                  />
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onUpload}
          disabled={pending || (effectiveMode === "strip" ? !stripFile : !fileA)}
          className="bg-brand-purple-dark hover:bg-brand-purple inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Guardar diseño
        </button>

        <p className="text-brand-muted text-xs">
          Recomendado: imagen en la proporción del producto. Para separadores puedes subir también
          la cara B; si no, usaremos la misma imagen por ambos lados. Con «Una sola imagen» la tira
          debe ser vertical: cara A abajo y cara B arriba cabeza abajo (formato doblez de imprenta).
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {/* Listado por producto */}
      {byTag.map((group) => (
        <section key={group.tag}>
          <h3 className="text-brand-purple-dark mb-2 text-lg font-semibold">{group.label}</h3>
          {group.items.length === 0 ? (
            <p className="text-brand-muted text-sm italic">
              Aún no hay diseños. Sube el primero arriba.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {group.items.map((it) => {
                const previewB = formatPreview(it.imageUrlB);
                return (
                  <div
                    key={it.id}
                    className="border-brand-purple/12 relative rounded-xl border bg-white p-2 shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público */}
                    <img
                      src={it.imageUrl}
                      alt={it.name}
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                    {previewB && (
                      <span className="text-brand-purple-dark absolute top-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold shadow">
                        A/B
                      </span>
                    )}
                    <p
                      className="text-brand-purple-dark mt-1 truncate text-xs font-semibold"
                      title={it.name}
                    >
                      {it.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => onDelete(it.id)}
                      disabled={pending}
                      aria-label={`Borrar ${it.name}`}
                      className="absolute top-1 right-1 rounded-full bg-white/90 p-1.5 text-rose-600 shadow hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
