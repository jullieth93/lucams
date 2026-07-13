"use client";

/*
 * ADR-057 Fase B2 — Gestión de diseños prediseñados: subir imágenes por producto (tag) + borrar.
 * UX admin claro para Lucy (no-técnica): selector de producto, nombre, subir, preview, borrar.
 */

import { useRef, useState, useTransition } from "react";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { uploadGalleryImageAction, deleteGalleryImageAction } from "./actions";

type Item = { id: string; tag: string; name: string; imageUrl: string; isActive: boolean };

const TAGS = [
  { value: "separadores", label: "Separadores para Libros" },
  { value: "fotoimanes", label: "Fotoimanes" },
];

export function GalleryManager({ items }: { items: Item[] }) {
  const [tag, setTag] = useState("separadores");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onUpload(file: File) {
    setError(null);
    if (name.trim().length < 2) {
      setError("Ponle un nombre al diseño (2–60 caracteres).");
      return;
    }
    const fd = new FormData();
    fd.set("tag", tag);
    fd.set("name", name.trim());
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadGalleryImageAction(fd);
      if (res.error) setError(res.error);
      else setName("");
      if (fileRef.current) fileRef.current.value = "";
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
      <div className="border-brand-purple/20 space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-brand-purple-dark font-semibold">Subir un diseño prediseñado</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-brand-purple-dark text-sm font-semibold">
            Producto
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="border-brand-purple/25 mt-1 block rounded-xl border-2 px-3 py-2 text-sm outline-none"
            >
              {TAGS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-brand-purple-dark flex-1 text-sm font-semibold">
            Nombre del diseño
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Ej: Flores acuarela"
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Subir imagen
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
        </div>
        <p className="text-brand-muted text-xs">
          Recomendado: la imagen en la proporción del producto (cuadrada o alargada). Se muestra en el
          editor para que el cliente la aplique con un toque.
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {/* Listado por producto */}
      {byTag.map((group) => (
        <section key={group.value}>
          <h3 className="text-brand-purple-dark mb-2 text-lg font-semibold">{group.label}</h3>
          {group.items.length === 0 ? (
            <p className="text-brand-muted text-sm italic">Aún no hay diseños. Sube el primero arriba.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {group.items.map((it) => (
                <div key={it.id} className="border-brand-purple/12 relative rounded-xl border bg-white p-2 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público */}
                  <img src={it.imageUrl} alt={it.name} className="aspect-square w-full rounded-lg object-cover" />
                  <p className="text-brand-purple-dark mt-1 truncate text-xs font-semibold" title={it.name}>
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
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
