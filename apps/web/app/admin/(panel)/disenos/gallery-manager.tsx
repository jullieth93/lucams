"use client";

/*
 * ADR-057 Fase B2 — Gestión de diseños prediseñados: subir imágenes por producto (tag) + borrar.
 * UX admin claro para Lucy (no-técnica): selector de producto, nombre, subir, preview, borrar.
 */

import { useRef, useState, useTransition } from "react";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { uploadGalleryImageAction, deleteGalleryImageAction } from "./actions";

type Item = {
  id: string;
  tag: string;
  name: string;
  imageUrl: string;
  imageUrlB?: string | null;
  isActive: boolean;
};

const TAGS = [
  { value: "separadores-magneticos", label: "Separadores Magnéticos" },
  { value: "separadores-alargados", label: "Separadores Alargados" },
  { value: "fotoimanes", label: "Fotoimanes" },
];

function formatPreview(src: string | null | undefined) {
  if (!src) return null;
  if (src.startsWith("http")) return src;
  return src;
}

export function GalleryManager({ items }: { items: Item[] }) {
  const [tag, setTag] = useState("separadores");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileARef = useRef<HTMLInputElement>(null);
  const fileBRef = useRef<HTMLInputElement>(null);
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);

  const needsFaceB = tag === "separadores";

  function resetForm() {
    setName("");
    setFileA(null);
    setFileB(null);
    if (fileARef.current) fileARef.current.value = "";
    if (fileBRef.current) fileBRef.current.value = "";
    setError(null);
  }

  function onUpload() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Ponle un nombre al diseño (2–60 caracteres).");
      return;
    }
    if (!fileA) {
      setError("Selecciona la imagen principal (cara A).");
      return;
    }
    const fd = new FormData();
    fd.set("tag", tag);
    fd.set("name", name.trim());
    fd.set("file", fileA);
    if (needsFaceB && fileB) fd.set("fileB", fileB);
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

  const byTag = TAGS.map((t) => ({ ...t, items: items.filter((i) => i.tag === t.value) }));

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
              {TAGS.map((t) => (
                <option key={t.value} value={t.value}>
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
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
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
              <p className="text-brand-purple-dark mb-2 text-sm font-semibold">Cara B (respaldo)</p>
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

        <button
          type="button"
          onClick={onUpload}
          disabled={pending || !fileA}
          className="bg-brand-purple-dark hover:bg-brand-purple inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Guardar diseño
        </button>

        <p className="text-brand-muted text-xs">
          Recomendado: imagen en la proporción del producto. Para separadores puedes subir también
          la cara B; si no, usaremos la misma imagen por ambos lados.
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {/* Listado por producto */}
      {byTag.map((group) => (
        <section key={group.value}>
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
                      <span className="absolute top-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-brand-purple-dark shadow">
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
