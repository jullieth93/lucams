"use client";

/*
 * ADR-057 — Crear un ESTILO nuevo del abecedario (Animales, Navidad, Dinos…). Cada estilo es
 * un abecedario ilustrado completo; el cliente lo elige en el Estudio. Tras crearlo, subes sus
 * fichas letra por letra en la grilla de abajo.
 */

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { createLetterSetAction } from "./fichas-actions";

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
        className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex h-9 items-center gap-2 rounded-md border bg-white px-3.5 text-xs font-semibold shadow-xs transition-colors"
      >
        <Plus className="text-brand-purple h-4 w-4" />
        Crear estilo nuevo (Animales, Navidad…)
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-brand-purple/10 space-y-3.5 rounded-xl border bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="set-name" className="text-brand-purple-dark block text-xs font-semibold">
            Nombre del estilo
          </label>
          <p className="text-brand-muted mb-1 text-xs">
            Corto y claro — lo que verá el cliente en el chip (ej. «Animales», «Navidad»).
          </p>
          <input
            id="set-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Ej: Navidad"
            className="border-brand-purple/15 focus-visible:border-brand-purple focus-visible:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-3 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="set-lang" className="text-brand-purple-dark block text-xs font-semibold">
            Idioma del abecedario
          </label>
          <p className="text-brand-muted mb-1 text-xs">
            Español incluye la Ñ (27 letras); Inglés no (26).
          </p>
          <select
            id="set-lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="border-brand-purple/15 focus-visible:border-brand-purple focus-visible:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-3 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="es">Español (con Ñ)</option>
            <option value="en">Inglés</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-gradient-brand inline-flex h-9 items-center gap-2 rounded-md px-4 text-xs font-semibold text-white shadow-xs hover:brightness-110 disabled:opacity-60"
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
          className="border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 h-9 rounded-md border bg-white px-3.5 text-xs font-semibold transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
