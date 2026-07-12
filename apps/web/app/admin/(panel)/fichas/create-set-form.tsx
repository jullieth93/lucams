"use client";

/*
 * ADR-057 — Crear un ESTILO nuevo del abecedario (Animales, Navidad, Dinos…). Cada estilo es
 * un abecedario ilustrado completo; el cliente lo elige en el Estudio. Tras crearlo, subes sus
 * fichas letra por letra en la grilla de abajo.
 */

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { createLetterSetAction } from "./actions";

export function CreateSetForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("es");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("language", language);
    startTransition(async () => {
      const res = await createLetterSetAction(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setName("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-brand-purple/30 text-brand-purple hover:bg-brand-purple/5 inline-flex items-center gap-2 rounded-xl border-2 border-dashed px-4 py-2.5 text-sm font-semibold"
      >
        <Plus className="h-4 w-4" />
        Crear estilo nuevo (Animales, Navidad…)
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-brand-purple/20 space-y-3 rounded-2xl border bg-white p-5 shadow-sm"
    >
      <div>
        <label htmlFor="set-name" className="text-brand-purple-dark block text-sm font-semibold">
          Nombre del estilo
        </label>
        <p className="text-brand-muted mb-1 text-xs">
          Corto y claro — es lo que verá el cliente en el chip. Ej: “Animales”, “Navidad”, “Dinos”.
        </p>
        <input
          id="set-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Ej: Navidad"
          className="border-brand-purple/25 focus:border-brand-purple w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
        />
      </div>
      <div>
        <label htmlFor="set-lang" className="text-brand-purple-dark block text-sm font-semibold">
          Idioma del abecedario
        </label>
        <p className="text-brand-muted mb-1 text-xs">Español incluye la Ñ (27 letras); Inglés no (26).</p>
        <select
          id="set-lang"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="border-brand-purple/25 focus:border-brand-purple rounded-xl border-2 px-3 py-2 text-sm outline-none"
        >
          <option value="es">Español (con Ñ)</option>
          <option value="en">Inglés</option>
        </select>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Crear estilo
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-brand-muted hover:text-brand-purple-dark rounded-xl px-4 py-2 text-sm font-semibold"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
