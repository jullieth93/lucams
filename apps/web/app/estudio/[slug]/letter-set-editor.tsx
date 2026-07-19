"use client";

/*
 * ADR-057 — Editor de SET DE LETRAS en el Estudio (Abecedario Completo / Pack Vocales).
 * Consistente con el editor de Nombre: mismos controles de color (tema + barajar + color por
 * ficha, vía useLetterColors) y misma estética. Lo personalizable es el COLOR de cada ficha /
 * su marco — un cambio físico real → WYSIWYG. Reutiliza createLetterSetDesign + finalize +
 * carrito. Estilo = ocasión disponible ("Animales" hoy; Navidad, etc. cuando Lucy los dibuje).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";
import type { LetterStyle, LetterTileMap } from "@/features/personalization/letter-tiles";
import {
  createLetterSetDesignAction,
  finalizeDesignAction,
} from "@/features/personalization/actions";
import { addPersonalizedToCartAction } from "@/app/carrito/actions";
import { useLetterColors } from "./use-letter-colors";
import { ThemePicker, SwatchRow } from "./letter-color-controls";
import { LetterStylePicker } from "./letter-style-picker";

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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
  const tileH = 154; // ADR-057 — ficha VERTICAL (espeja el imán físico rectangular ~7×10)
  const gap = 14;
  const pad = 24;
  const w = pad * 2 + cols * tileW + (cols - 1) * gap;
  const h = pad * 2 + rows * tileH + (rows - 1) * gap;
  const scale = 3;

  const imgs = useTiles
    ? await Promise.all(
        letters.map((ch) =>
          tiles[ch]?.imageUrl ? loadImage(tiles[ch]!.imageUrl) : Promise.resolve(null),
        ),
      )
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
    const y = pad + Math.floor(i / cols) * (tileH + gap);
    const color = colors[i % colors.length];
    roundRect(ctx, x, y, tileW, tileH, 18);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = color;
    ctx.stroke();
    const img = imgs[i];
    if (img) {
      ctx.save();
      roundRect(ctx, x + 4, y + 4, tileW - 8, tileH - 8, 14);
      ctx.clip();
      const s = Math.min((tileW - 12) / img.width, (tileH - 12) / img.height);
      ctx.drawImage(
        img,
        x + (tileW - img.width * s) / 2,
        y + (tileH - img.height * s) / 2,
        img.width * s,
        img.height * s,
      );
      ctx.restore();
    } else {
      ctx.fillStyle = color;
      ctx.font = `800 ${Math.round(tileW * 0.5)}px "Baloo 2", "Fredoka", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ch, x + tileW / 2, y + tileH / 2 + 2);
    }
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen"))),
      "image/png",
    ),
  );
}

export function LetterSetEditor({
  product,
  variantId,
  letters,
  styles,
  priceLabel,
  subtitle,
}: {
  product: { id: string; slug: string; name: string };
  variantId: string;
  letters: string[];
  styles: LetterStyle[];
  priceLabel: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Estilo elegido (null = "Solo letra"/Default). Arranca en el primer estilo ilustrado.
  const [styleId, setStyleId] = useState<string | null>(styles[0]?.id ?? null);
  const activeTiles: LetterTileMap = styleId
    ? (styles.find((s) => s.id === styleId)?.tiles ?? {})
    : {};

  // Mismos controles de color que el editor de Nombre.
  const {
    themeId,
    effectiveColors,
    selectedIndex,
    toggleSelected,
    applyTheme,
    setColorForSelected,
    customized,
  } = useLetterColors(letters.length);

  async function handleAddToCart() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createLetterSetDesignAction({
        productId: product.id,
        variantId,
        frameTheme: themeId,
        colors: effectiveColors,
        styleSetId: styleId,
      });
      if (!created.ok) {
        setError(created.message);
        setSubmitting(false);
        return;
      }
      let blob: Blob;
      try {
        blob = await renderLetterSetBlob(letters, activeTiles, effectiveColors);
      } catch {
        blob = await renderLetterSetBlob(letters, activeTiles, effectiveColors, false);
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
      const added = await addPersonalizedToCartAction({
        designId: created.designId,
        qty: 1,
        variantId,
      });
      if (!added.ok) {
        setError(`Guardamos el diseño pero no pudimos agregarlo al carrito: ${added.message}`);
        setSubmitting(false);
        return;
      }
      router.push("/carrito?personalized=1");
    } catch (err) {
      // #14 — detalle técnico al log; mensaje claro es-CO al cliente.
      console.error("[studio.letter-set]", err);
      setError("Algo salió mal. Intenta de nuevo en un momento.");
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
          Elige los colores 🎨
        </h1>
        {subtitle && <p className="text-brand-muted mx-auto mt-2 max-w-md text-sm">{subtitle}</p>}
      </header>

      <div className="border-brand-purple/12 rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
        {/* Selector de estilo (tema/ocasión). Solo aparece si hay estilos ilustrados subidos. */}
        {styles.length > 0 && (
          <div className="mb-5">
            <LetterStylePicker
              styles={styles.map((s) => ({ id: s.id, name: s.name }))}
              selectedId={styleId}
              onSelect={setStyleId}
            />
          </div>
        )}

        {/* Picker de tema de color — control compartido con Nombre (barajar al re-clic). */}
        <ThemePicker themeId={themeId} customized={customized} onApply={applyTheme} />

        {/* Preview del set (WYSIWYG) — cada ficha es seleccionable para pintarla a gusto. */}
        <div className="bg-brand-cream/50 mt-5 rounded-2xl p-5">
          {selectedIndex === null && (
            <p className="text-brand-purple-dark mb-3 flex items-center justify-center text-center text-xs font-semibold">
              <span className="bg-brand-yellow/45 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
                👇 Toca una ficha para darle el color que quieras
              </span>
            </p>
          )}
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-9">
            {letters.map((ch, i) => {
              const tile = activeTiles[ch];
              const color = effectiveColors[i];
              const isSel = selectedIndex === i;
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleSelected(i)}
                  aria-pressed={isSel}
                  aria-label={`Pintar la ficha ${ch}`}
                  className={`flex flex-col items-center rounded-xl transition ${
                    isSel ? "ring-brand-purple scale-105 ring-2 ring-offset-2" : "hover:scale-105"
                  }`}
                >
                  {/* Ficha VERTICAL (aspect 5/6.5) — espeja el imán físico rectangular. */}
                  <div
                    className="flex aspect-[5/6.5] w-full items-center justify-center overflow-hidden rounded-xl bg-white"
                    style={{ border: `2px solid ${color}`, boxShadow: `0 3px 10px ${color}22` }}
                  >
                    {tile ? (
                      // eslint-disable-next-line @next/next/no-img-element -- ficha del bucket público
                      <img
                        src={tile.imageUrl}
                        alt={`Letra ${ch}`}
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <span className="font-display text-base font-extrabold" style={{ color }}>
                        {ch}
                      </span>
                    )}
                  </div>
                  <span className="text-brand-muted mt-1 text-[10px] font-semibold">{ch}</span>
                </button>
              );
            })}
          </div>

          {/* Fila de colores para la ficha seleccionada — control compartido */}
          {selectedIndex !== null && letters[selectedIndex] && (
            <SwatchRow letter={letters[selectedIndex]} onPick={setColorForSelected} />
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={submitting}
            className="bg-gradient-brand inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            {submitting ? "Agregando…" : "Añadir al carrito"}
          </button>
          <span className="text-brand-muted text-sm font-semibold">{priceLabel}</span>
        </div>
      </div>
    </div>
  );
}
