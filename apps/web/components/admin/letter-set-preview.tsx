"use client";

/*
 * Vista previa de un set de fichas del abecedario (Fase 3 · 3.7).
 *
 * El admin de /admin/disenos?tab=fichas sube ilustración por letra pero no
 * veía el set COMPUESTO como lo verá el cliente. Este botón abre una modal
 * que compone el set completo (A-Z / A-Z+Ñ) con el MISMO render real del
 * Estudio: drawLetterTile (app/estudio/[slug]/lib/letter-tile-textures.ts) —
 * ficha vertical 5:6.5 blanca, borde de color, ilustración del tema contenida
 * o la letra estándar si la ficha aún no tiene imagen (degradación idéntica
 * a la del editor de nombres). Paleta = tema default del Estudio ("arcoíris").
 *
 * Sin canvas 2D disponible (tests jsdom, navegadores muy raros) degrada a una
 * grilla HTML de las fichas crudas — nunca rompe el admin.
 *
 * Los datos llegan por props (el server component padre ya carga el set con
 * getLetterSet): no hace falta server action nueva.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, Loader2, X } from "lucide-react";
import { useDialogA11y } from "@/app/admin/(panel)/plantillas/use-dialog-a11y";
import { drawLetterTile } from "@/app/estudio/[slug]/lib/letter-tile-textures";
import { loadCanvasImage } from "@/app/estudio/[slug]/lib/canvas-image";
import { NAME_TILE_THEMES } from "@/app/estudio/[slug]/letter-tile";

export type LetterSetPreviewTile = { imageUrl: string; label: string | null };

/** Distribución de la grilla — misma regla que renderLetterSetBlob del Estudio. */
export function letterGridLayout(count: number): { cols: number; rows: number } {
  const cols = Math.min(9, Math.max(5, Math.ceil(Math.sqrt(Math.max(1, count)))));
  return { cols, rows: Math.ceil(Math.max(1, count) / cols) };
}

// Tamaño de cada ficha en el lienzo compuesto (aspecto físico 5:6.5).
const TILE_W = 150;
const TILE_H = Math.round((TILE_W * 6.5) / 5); // 195
const GAP = 10;
const PAD = 16;

/**
 * Compone el set completo en UN canvas (fondo crema como el compositor de
 * producción del Estudio) y devuelve un dataURL PNG. null si el navegador no
 * da contexto 2D — el caller cae a la grilla HTML.
 */
async function composeLetterSetImage(
  alphabet: readonly string[],
  tiles: Record<string, LetterSetPreviewTile>,
): Promise<string | null> {
  const { cols, rows } = letterGridLayout(alphabet.length);
  const canvas = document.createElement("canvas");
  canvas.width = PAD * 2 + cols * TILE_W + (cols - 1) * GAP;
  canvas.height = PAD * 2 + rows * TILE_H + (rows - 1) * GAP;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const colors = NAME_TILE_THEMES[0].colors;
  const imgs = await Promise.all(
    alphabet.map((ch) =>
      tiles[ch]?.imageUrl ? loadCanvasImage(tiles[ch].imageUrl) : Promise.resolve(null),
    ),
  );

  ctx.fillStyle = "#FFF8F0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  alphabet.forEach((ch, i) => {
    const x = PAD + (i % cols) * (TILE_W + GAP);
    const y = PAD + Math.floor(i / cols) * (TILE_H + GAP);
    ctx.save();
    ctx.translate(x, y);
    drawLetterTile(ctx, ch, colors[i % colors.length], imgs[i] ?? null, TILE_W, TILE_H);
    ctx.restore();
  });

  return canvas.toDataURL("image/png");
}

export function LetterSetPreviewButton({
  setName,
  alphabet,
  tiles,
}: {
  setName: string;
  alphabet: string[];
  tiles: Record<string, LetterSetPreviewTile>;
}) {
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose: () => setOpen(false), active: open });

  const done = alphabet.filter((c) => tiles[c]).length;

  function openPreview() {
    setImageUrl(null);
    setComposing(true);
    setOpen(true);
  }

  // Composición LAZY: solo al abrir la modal (cargar 26+ imágenes en cada
  // render de la grilla sería desperdicio). Se recompone en cada apertura:
  // el admin pudo haber subido/quitado fichas desde la última vez.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    composeLetterSetImage(alphabet, tiles)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setImageUrl(null);
      })
      .finally(() => {
        if (!cancelled) setComposing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, alphabet, tiles]);

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        className="border-brand-purple/20 text-brand-purple hover:bg-brand-purple/5 focus:ring-brand-turquoise inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors focus:ring-2 focus:outline-none"
        aria-haspopup="dialog"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        Vista previa
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Cerrar vista previa"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 cursor-default bg-black/50 backdrop-blur-sm"
              tabIndex={-1}
            />

            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="letter-set-preview-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="ring-brand-purple/10 fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[94vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1"
            >
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h2
                  id="letter-set-preview-title"
                  className="text-brand-purple-dark text-sm font-bold"
                >
                  Vista previa · {setName}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-brand-purple-dark/70 hover:text-brand-purple-dark focus:ring-brand-turquoise rounded-md p-1 focus:ring-2 focus:outline-none"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="overflow-y-auto px-5 py-4">
                {composing ? (
                  <p className="text-brand-muted flex items-center justify-center gap-2 py-16 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Componiendo la vista previa…
                  </p>
                ) : imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- dataURL de canvas local
                  <img
                    src={imageUrl}
                    alt={`Set ${setName} compuesto: fichas ${alphabet.join(" ")}`}
                    className="ring-brand-purple/10 mx-auto w-full rounded-xl ring-1"
                  />
                ) : (
                  // Fallback sin canvas 2D: grilla HTML de las fichas crudas.
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${letterGridLayout(alphabet.length).cols}, minmax(0, 1fr))`,
                    }}
                  >
                    {alphabet.map((ch) =>
                      tiles[ch] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- preview admin
                        <img
                          key={ch}
                          src={tiles[ch].imageUrl}
                          alt={`Ficha ${ch}`}
                          className="border-brand-turquoise/50 w-full rounded-lg border object-contain"
                        />
                      ) : (
                        <span
                          key={ch}
                          className="border-brand-purple/20 bg-brand-cream/50 font-display text-brand-purple/40 flex aspect-[5/6.5] items-center justify-center rounded-lg border border-dashed text-xl font-extrabold"
                        >
                          {ch}
                        </span>
                      ),
                    )}
                  </div>
                )}

                <p className="text-brand-muted mt-3 text-xs">
                  Así la ve el cliente en el Estudio. {done}/{alphabet.length} fichas con
                  ilustración — las que faltan se ven con la letra estándar en el color de la ficha.
                </p>
              </div>

              <div className="flex items-center justify-end border-t px-5 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-brand-purple-dark/70 hover:bg-brand-purple/10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
