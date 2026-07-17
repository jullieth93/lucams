"use client";

/*
 * ADR-057 — Grilla del abecedario para el admin de fichas. Cada letra: sube/ve/quita su
 * ilustración. Tras subir, revalidatePath refresca la página → la grilla muestra la nueva.
 */

import { useRef, useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { uploadLetterTileAction, deleteLetterTileAction } from "./actions";

type Tile = { imageUrl: string; label: string | null };

export function LetterGrid({
  setId,
  alphabet,
  tiles,
}: {
  setId: string;
  alphabet: string[];
  tiles: Record<string, Tile>;
}) {
  const [pending, startTransition] = useTransition();
  const [activeChar, setActiveChar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(char: string) {
    setActiveChar(char);
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const char = activeChar;
    if (!file || !char) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("setId", setId);
      fd.set("char", char);
      fd.set("file", file);
      const r = await uploadLetterTileAction(fd);
      if (r.error) toast.error(r.error);
      else toast.success(`Ficha ${char} lista ✨`);
      setActiveChar(null);
    });
  }

  function del(char: string) {
    setActiveChar(char);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("setId", setId);
      fd.set("char", char);
      const r = await deleteLetterTileAction(fd);
      if (r.error) toast.error(r.error);
      else toast.success(`Ficha ${char} quitada`);
      setActiveChar(null);
    });
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
        {alphabet.map((char) => {
          const tile = tiles[char];
          const busy = pending && activeChar === char;
          return (
            <div key={char} className="relative">
              <button
                type="button"
                onClick={() => pick(char)}
                disabled={pending}
                aria-label={tile ? `Cambiar ficha ${char}` : `Subir ficha ${char}`}
                className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-2 transition disabled:opacity-60 ${
                  tile
                    ? "border-brand-turquoise/50 hover:border-brand-turquoise bg-white"
                    : "border-brand-purple/20 bg-brand-cream/50 hover:border-brand-purple/50 border-dashed"
                }`}
              >
                {tile ? (
                  // eslint-disable-next-line @next/next/no-img-element -- preview admin
                  <img
                    src={tile.imageUrl}
                    alt={`Ficha ${char}`}
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <span className="font-display text-brand-purple/40 text-2xl font-extrabold">
                    {char}
                  </span>
                )}
                {busy && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                    <Loader2 className="text-brand-purple h-5 w-5 animate-spin" />
                  </span>
                )}
                {!tile && !busy && (
                  <span className="text-brand-purple/50 absolute right-1 bottom-1">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
              {/* Etiqueta de la letra + borrar */}
              <div className="mt-1 flex items-center justify-center gap-1">
                <span className="text-brand-muted text-[11px] font-bold">{char}</span>
                {tile && (
                  <button
                    type="button"
                    onClick={() => del(char)}
                    disabled={pending}
                    aria-label={`Quitar ficha ${char}`}
                    className="text-brand-muted hover:text-rose-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
