"use client";

/*
 * ADR-057 — Editor de SET DE LETRAS en el Estudio (Abecedario Completo / Pack Vocales).
 * Consistente con el resto: toda interacción del cliente vive dentro del Estudio. Lo
 * personalizable es el COLOR DEL MARCO (cambio físico real → WYSIWYG). Reutiliza
 * createLetterSetDesign + finalize + carrito.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";
import { NAME_TILE_THEMES, getNameTileTheme } from "./letter-tile";
import type { LetterTileMap } from "@/features/personalization/letter-tiles";
import { createLetterSetDesignAction, finalizeDesignAction } from "@/features/personalization/actions";
import { addPersonalizedToCartAction } from "@/app/carrito/actions";

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function renderLetterSetBlob(
  letters: string[],
  tiles: LetterTileMap,
  colors: readonly string[],
  useTiles = true,
): Promise<Blob> {
  const cols = Math.min(9, Math.max(5, Math.ceil(Math.sqrt(letters.length))));
  const rows = Math.ceil(letters.length / cols);
  const tileW = 120;
  const gap = 14;
  const pad = 24;
  const w = pad * 2 + cols * tileW + (cols - 1) * gap;
  const h = pad * 2 + rows * tileW + (rows - 1) * gap;
  const scale = 3;

  const imgs = useTiles
    ? await Promise.all(letters.map((ch) => (tiles[ch]?.imageUrl ? loadImage(tiles[ch]!.imageUrl) : Promise.resolve(null))))
    : letters.map(() => null);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d no disponible");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#FFF8F0";
  ctx.fillRect(0, 0, w, h);

  letters.forEach((ch, i) => {
    const x = pad + (i % cols) * (tileW + gap);
    const y = pad + Math.floor(i / cols) * (tileW + gap);
    const color = colors[i % colors.length];
    roundRect(ctx, x, y, tileW, tileW, 18);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = color;
    ctx.stroke();
    const img = imgs[i];
    if (img) {
      ctx.save();
      roundRect(ctx, x + 4, y + 4, tileW - 8, tileW - 8, 14);
      ctx.clip();
      const s = Math.min((tileW - 12) / img.width, (tileW - 12) / img.height);
      ctx.drawImage(img, x + (tileW - img.width * s) / 2, y + (tileW - img.height * s) / 2, img.width * s, img.height * s);
      ctx.restore();
    } else {
      ctx.fillStyle = color;
      ctx.font = `800 ${Math.round(tileW * 0.5)}px "Baloo 2", "Fredoka", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ch, x + tileW / 2, y + tileW / 2 + 2);
    }
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen"))), "image/png"),
  );
}

export function LetterSetEditor({
  product,
  variantId,
  letters,
  tiles,
  priceLabel,
  subtitle,
}: {
  product: { id: string; slug: string; name: string };
  variantId: string;
  letters: string[];
  tiles: LetterTileMap;
  priceLabel: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const [themeId, setThemeId] = useState(NAME_TILE_THEMES[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = getNameTileTheme(themeId);
  const frameColors = useMemo(
    () => letters.map((_, i) => theme.colors[i % theme.colors.length]),
    [letters, theme],
  );

  async function handleAddToCart() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createLetterSetDesignAction({ productId: product.id, variantId, frameTheme: themeId });
      if (!created.ok) {
        setError(created.message);
        setSubmitting(false);
        return;
      }
      let blob: Blob;
      try {
        blob = await renderLetterSetBlob(letters, tiles, theme.colors);
      } catch {
        blob = await renderLetterSetBlob(letters, tiles, theme.colors, false);
      }
      const fd = new FormData();
      fd.set("designId", created.designId);
      fd.set("slotCount", "1");
      fd.set("preview", blob, "preview.png");
      fd.set("production_0", blob, "produccion.png");
      const finalized = await finalizeDesignAction(fd);
      if (!finalized.ok) {
        setError(finalized.message);
        setSubmitting(false);
        return;
      }
      const added = await addPersonalizedToCartAction({ designId: created.designId, qty: 1, variantId });
      if (!added.ok) {
        setError(`Guardamos el diseño pero no pudimos agregarlo al carrito: ${added.message}`);
        setSubmitting(false);
        return;
      }
      router.push("/carrito?personalized=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8">
      <Link
        href={`/producto/${product.slug}`}
        className="text-brand-muted hover:text-brand-purple mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver
      </Link>

      <header className="mb-6 text-center">
        <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
          Personalizar · {product.name}
        </p>
        <h1 className="font-display text-brand-purple-dark mt-1 text-3xl sm:text-4xl">
          Elige el color del marco 🎨
        </h1>
        {subtitle && <p className="text-brand-muted mx-auto mt-2 max-w-md text-sm">{subtitle}</p>}
      </header>

      <div className="border-brand-purple/12 rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
        {/* Selector de tema de marco */}
        <div className="flex flex-wrap justify-center gap-2">
          {NAME_TILE_THEMES.map((t) => {
            const active = t.id === themeId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setThemeId(t.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-full border-2 py-1.5 pr-3 pl-2 text-sm font-semibold transition ${
                  active
                    ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                    : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
                }`}
              >
                <span className="flex gap-0.5" aria-hidden="true">
                  {t.colors.slice(0, 3).map((c, i) => (
                    <span key={i} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/5" style={{ backgroundColor: c }} />
                  ))}
                </span>
                {t.emoji} {t.label}
              </button>
            );
          })}
        </div>

        {/* Preview del set con el marco elegido (WYSIWYG) */}
        <div className="bg-brand-cream/50 mt-5 grid grid-cols-4 gap-3 rounded-2xl p-5 sm:grid-cols-6 md:grid-cols-9">
          {letters.map((ch, i) => {
            const tile = tiles[ch];
            const color = frameColors[i];
            return (
              <div key={ch} className="flex flex-col items-center">
                <div
                  className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-white"
                  style={{ border: `2px solid ${color}`, boxShadow: `0 3px 10px ${color}22` }}
                >
                  {tile ? (
                    // eslint-disable-next-line @next/next/no-img-element — ficha del bucket público
                    <img src={tile.imageUrl} alt={`Letra ${ch}`} className="h-full w-full object-contain p-1" />
                  ) : (
                    <span className="font-display text-base font-extrabold" style={{ color }}>
                      {ch}
                    </span>
                  )}
                </div>
                <span className="text-brand-muted mt-1 text-[10px] font-semibold">{ch}</span>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">{error}</p>
        )}

        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={submitting}
            className="bg-gradient-brand inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {submitting ? "Agregando…" : "Añadir al carrito"}
          </button>
          <span className="text-brand-muted text-sm font-semibold">{priceLabel}</span>
        </div>
      </div>
    </div>
  );
}
