"use client";

/*
 * ADR-057 — Grilla del abecedario para el admin de fichas. Cada letra: sube/ve/quita su
 * ilustración. Tras subir, revalidatePath refresca la página → la grilla muestra la nueva.
 */

import { useRef, useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAdminConfirm } from "@/components/admin/use-admin-confirm";
import { uploadLetterTileAction, deleteLetterTileAction } from "./fichas-actions";
import {
  compressImageForUpload,
  shrinkToFitUploadBudget,
  UPLOAD_PAYLOAD_BUDGET_BYTES,
} from "@/app/estudio/[slug]/client-image-compress";

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
  const { confirm, confirmDialog } = useAdminConfirm();

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
      // Auditoría 2026-11-08 — compresión en el navegador antes de la Server
      // Action: el techo real de la plataforma (~4.5 MB por request) corta
      // archivos de 4.5–5 MB ANTES de que el servidor valide (5 MB) y optimice.
      // WebP conserva el alpha de la ilustración; si no cabe ni reducida, error claro.
      const compressed = await compressImageForUpload(file);
      const prepared =
        compressed.size > UPLOAD_PAYLOAD_BUDGET_BYTES
          ? await shrinkToFitUploadBudget(compressed)
          : compressed;
      if (!prepared) {
        toast.error(
          `"${file.name}" es demasiado grande y este navegador no pudo comprimirla. Exporta la ilustración como PNG o WebP e inténtalo de nuevo.`,
        );
        setActiveChar(null);
        return;
      }
      const fd = new FormData();
      fd.set("setId", setId);
      fd.set("char", char);
      fd.set("file", prepared);
      const r = await uploadLetterTileAction(fd);
      if (r.error) toast.error(r.error);
      else toast.success(`Ficha ${char} lista ✨`);
      setActiveChar(null);
    });
  }

  async function del(char: string) {
    const ok = await confirm(
      `¿Quitar la ilustración de la letra «${char}»? Mientras no subas otra, el Estudio mostrará un marcador temporal.`,
      { confirmLabel: "Quitar ficha" },
    );
    if (!ok) return;
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
      {/* 4 columnas base (no 1): son 26+ tiles cuadrados — 1 columna sería
          interminable y a 375px 4 columnas dan tiles de ~80px (touch target
          cómodo). Nunca overflow: grid sin min-widths. */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-9">
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
                className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border transition disabled:opacity-60 ${
                  tile
                    ? "border-brand-turquoise/45 hover:border-brand-turquoise bg-white shadow-2xs"
                    : "border-brand-purple/18 bg-brand-cream/40 hover:border-brand-purple/45 border-dashed"
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
                    onClick={() => void del(char)}
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
      {confirmDialog}
    </>
  );
}
