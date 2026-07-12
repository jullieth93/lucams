"use client";

/*
 * Editor de NOMBRE del abecedario (ADR-057, Fase 0). La superficie fit-for-purpose de
 * la variante "nombre": escribe un nombre → ve en vivo la tira de fichas kawaii que vas
 * a recibir. Sin foto, sin cajita. Reemplaza el editor de foto genérico para este caso.
 *
 * "Agregar al carrito": crea el diseño (createNameDesignAction, valida en servidor),
 * renderiza la tira a PNG y reutiliza finalizeDesignAction + addPersonalizedToCartAction
 * (la ruta del dinero probada) → /carrito. El nombre real se guarda en Design.metadata;
 * el PNG es el preview que ven carrito/orden/producción.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Sparkles, Minus, Plus } from "lucide-react";
import { normalizeName, type NameLanguage } from "@/features/personalization/name-input";
import type { LetterStyle, LetterTileMap } from "@/features/personalization/letter-tiles";
import { createNameDesignAction, finalizeDesignAction } from "@/features/personalization/actions";
import { addPersonalizedToCartAction } from "@/app/carrito/actions";
import { formatCOP } from "@/lib/format";
import { LetterTile } from "./letter-tile";
import { useLetterColors } from "./use-letter-colors";
import { ThemePicker, SwatchRow } from "./letter-color-controls";
import { LetterStylePicker } from "./letter-style-picker";

type NameEditorProps = {
  product: { id: string; slug: string; name: string };
  /** Variante ya elegida en la ficha (tamaño/imantado). El editor solo arma la palabra. */
  variantId: string;
  config: { min: number; max: number; language: NameLanguage };
  /**
   * ADR-057 — precio POR FICHA (centavos COP). El total mostrado y el del carrito =
   * nº de letras × pricePerTile. WYSIWYG también en el precio: lo que ves es lo que pagas.
   */
  pricePerTile: number;
  /** Nº de letras pre-elegido en la ficha (solo hint visual antes de escribir). */
  initialCount?: number;
  /** Estilos ilustrados disponibles (Animales, Navidad…). Vacío = solo "Solo letra". */
  styles: LetterStyle[];
};

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // bucket público con CORS → canvas no se contamina
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Dibuja la tira de fichas en canvas y devuelve el PNG. Usa la ilustración real de cada
 * letra si existe (tiles); si no, dibuja la letra en color. `useTiles=false` fuerza el
 * fallback de solo-letras (si el toBlob se contaminara por CORS).
 */
async function renderNameStripBlob(
  letters: string[],
  colors: readonly string[],
  tiles: LetterTileMap,
  useTiles = true,
): Promise<Blob> {
  const scale = 4;
  const tileW = 120;
  const tileH = 142;
  const gap = 16;
  const pad = 22;
  const w = pad * 2 + letters.length * tileW + Math.max(0, letters.length - 1) * gap;
  const h = pad * 2 + tileH;

  const imgs = useTiles
    ? await Promise.all(letters.map((ch) => (tiles[ch]?.imageUrl ? loadImage(tiles[ch]!.imageUrl) : Promise.resolve(null))))
    : letters.map(() => null);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d no disponible");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#FFF8F0";
  ctx.fillRect(0, 0, w, h);

  letters.forEach((ch, i) => {
    const x = pad + i * (tileW + gap);
    const y = pad;
    const color = colors[i % colors.length];
    roundRectPath(ctx, x, y, tileW, tileH, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = color;
    ctx.stroke();
    const img = imgs[i];
    if (img) {
      ctx.save();
      roundRectPath(ctx, x + 4, y + 4, tileW - 8, tileH - 8, 16);
      ctx.clip();
      const box = { w: tileW - 12, h: tileH - 12 };
      const s = Math.min(box.w / img.width, box.h / img.height);
      const dw = img.width * s;
      const dh = img.height * s;
      ctx.drawImage(img, x + (tileW - dw) / 2, y + (tileH - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = color;
      ctx.font = `800 ${Math.round(tileW * 0.56)}px "Baloo 2", "Fredoka", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ch, x + tileW / 2, y + tileH / 2 + 2);
    }
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen"))), "image/png"),
  );
}

export function NameEditor({
  product,
  variantId,
  config,
  pricePerTile,
  initialCount,
  styles,
}: NameEditorProps) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cantidad de fichas (letras) elegida en la ficha. El editor se LIMITA a esta cantidad;
  // el +/− la ajusta (min..max del producto). Es el nº de fichas que se cobra.
  const [count, setCount] = useState(() =>
    Math.min(config.max, Math.max(config.min, initialCount ?? config.min)),
  );
  // Estilo elegido (null = "Solo letra"/Default). Arranca en el primer estilo ilustrado
  // disponible (muestra el diferenciador); si no hay ninguno, queda en Default.
  const [styleId, setStyleId] = useState<string | null>(styles[0]?.id ?? null);
  const activeTiles = useMemo(
    () => (styleId ? (styles.find((s) => s.id === styleId)?.tiles ?? {}) : {}),
    [styleId, styles],
  );

  // El máximo efectivo es la cantidad elegida (count), no el max del producto → el campo
  // queda limitado a esa cantidad (feedback de Lucy: no debe dejar escribir más).
  const result = useMemo(
    () => normalizeName(raw, { ...config, max: count }),
    [raw, config, count],
  );
  const { letters, valid, tooShort, notices } = result;

  // Ajusta la cantidad de fichas (min..max) y recorta el texto si sobra.
  function changeCount(delta: number) {
    const nc = Math.min(config.max, Math.max(config.min, count + delta));
    setCount(nc);
    setRaw((r) => r.slice(0, nc));
  }

  // Colores compartidos con el editor de Set de letras (tema + barajar + color por ficha).
  const {
    themeId,
    effectiveColors,
    selectedIndex,
    toggleSelected,
    applyTheme,
    setColorForSelected,
    customized,
  } = useLetterColors(letters.length);

  // Letras repetidas → transparencia sobre cuántas fichas iguales lleva.
  const repeats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of letters) counts[l] = (counts[l] ?? 0) + 1;
    return Object.entries(counts)
      .filter(([, n]) => n > 1)
      .map(([l, n]) => `${l}×${n}`);
  }, [letters]);

  const examples = config.language === "es" ? ["Mía", "Mateo", "Amor"] : ["Mia", "Noah", "Love"];

  async function handleAddToCart() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createNameDesignAction({
        productId: product.id,
        variantId,
        name: raw,
        themeId,
        colors: effectiveColors,
        styleSetId: styleId,
      });
      if (!created.ok) {
        setError(created.message);
        setSubmitting(false);
        return;
      }

      // Con fichas del estilo elegido; si el canvas se contamina por CORS, cae a solo-letras.
      let blob: Blob;
      try {
        blob = await renderNameStripBlob(letters, effectiveColors, activeTiles);
      } catch {
        blob = await renderNameStripBlob(letters, effectiveColors, activeTiles, false);
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
        setError(`Guardamos tu diseño pero no pudimos agregarlo al carrito: ${added.message}`);
        setSubmitting(false);
        return;
      }

      router.push("/carrito?personalized=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  const counterOver = letters.length > count;

  // ADR-057 — precio en vivo POR FICHA. El total = nº de letras × precio-por-ficha, igual
  // que lo calcula el carrito (Design.metadata.letters.length × variant.price) → sin desajuste.
  const liveTotal = letters.length * pricePerTile;

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
          Arma tu palabra ✨
        </h1>
        <p className="text-brand-muted mx-auto mt-2 max-w-md text-sm">
          Escribe un nombre o palabra (MÍA, MATEO, AMOR…) y verás las fichas que vas a recibir —
          una por cada letra.
        </p>
      </header>

      <div className="border-brand-purple/12 rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
        {/* Input + cantidad de fichas */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="name-input" className="text-brand-purple-dark block text-sm font-semibold">
            Escribe el nombre o palabra
          </label>
          {/* Stepper: cuántas letras (fichas). El campo queda limitado a esta cantidad. */}
          <div className="border-brand-purple/20 flex items-center gap-1 rounded-full border bg-white p-1">
            <button
              type="button"
              onClick={() => changeCount(-1)}
              disabled={count <= config.min}
              aria-label="Menos letras"
              className="text-brand-purple hover:bg-brand-purple/10 flex h-7 w-7 items-center justify-center rounded-full transition disabled:opacity-30"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="text-brand-purple-dark w-16 text-center text-xs font-semibold tabular-nums">
              {count} {count === 1 ? "letra" : "letras"}
            </span>
            <button
              type="button"
              onClick={() => changeCount(1)}
              disabled={count >= config.max}
              aria-label="Más letras"
              className="text-brand-purple hover:bg-brand-purple/10 flex h-7 w-7 items-center justify-center rounded-full transition disabled:opacity-30"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="name-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={count}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={config.language === "es" ? "Ej: Mía" : "Ex: Mia"}
            className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-turquoise/40 font-display text-brand-purple-dark w-full rounded-2xl border-2 bg-white px-4 py-3 text-2xl tracking-wide uppercase outline-none focus:ring-4"
          />
          <span
            className={`font-display flex-shrink-0 text-sm font-bold tabular-nums ${
              counterOver ? "text-rose-500" : "text-brand-muted"
            }`}
          >
            {letters.length}/{count}
          </span>
        </div>
        <p className="text-brand-muted mt-2 text-xs">
          Ajusta la cantidad con − / + (de {config.min} a {config.max} letras) ·{" "}
          {config.language === "es" ? "incluye la Ñ" : "alfabeto en inglés (sin Ñ)"} · sin números ni
          símbolos
        </p>

        {/* Ejemplos de arranque (menos fricción) */}
        {raw.trim() === "" && (
          <div className="text-brand-muted mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span>Prueba:</span>
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  // Ajusta la cantidad al ejemplo para que quepa completo (no lo corta).
                  const n = Math.min(config.max, Math.max(config.min, ex.length));
                  setCount(n);
                  setRaw(ex.slice(0, n));
                }}
                className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 rounded-full border px-3 py-1 font-semibold"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {/* Aviso de letras repetidas (transparencia) */}
        {repeats.length > 0 && (
          <p className="text-brand-muted mt-3 text-xs">
            Se repiten fichas: <span className="text-brand-purple-dark font-semibold">{repeats.join(" · ")}</span>{" "}
            (una ficha por cada letra).
          </p>
        )}

        {/* Avisos amables */}
        {notices.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {notices.map((n) => (
              <li
                key={n}
                className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
              >
                {n}
              </li>
            ))}
          </ul>
        )}

        {/* Selector de estilo (tema/ocasión de las ilustraciones) — antes del color */}
        {styles.length > 0 && (
          <div className="mt-5">
            <LetterStylePicker
              styles={styles.map((s) => ({ id: s.id, name: s.name }))}
              selectedId={styleId}
              onSelect={setStyleId}
            />
          </div>
        )}

        {/* Paleta de colores (tema de las fichas) — control compartido con Set de letras */}
        <div className="mt-5">
          <ThemePicker themeId={themeId} customized={customized} onApply={applyTheme} />
        </div>

        {/* Preview de la tira de fichas (cada una seleccionable para pintarla) */}
        <div className="bg-brand-cream/60 mt-5 rounded-2xl p-5">
          {letters.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              {/* Casillas-hint: N fichas vacías según lo elegido en la ficha (nº de letras). */}
              <div className="flex flex-wrap items-center justify-center gap-3" aria-hidden="true">
                {Array.from({ length: count }).map((_, i) => (
                  <div
                    key={i}
                    className="border-brand-purple/25 flex h-[72px] w-[62px] items-center justify-center rounded-xl border-2 border-dashed bg-white/60"
                  >
                    <span className="text-brand-purple/30 font-display text-xl">?</span>
                  </div>
                ))}
              </div>
              <p className="text-brand-muted text-sm">Aquí verás tu nombre en fichas 🦝</p>
            </div>
          ) : (
            <>
              {/* Descubribilidad del color por letra: barra visible, no un texto perdido. */}
              {selectedIndex === null && (
                <p className="text-brand-purple-dark mb-3 flex items-center justify-center gap-1.5 text-center text-xs font-semibold">
                  <span className="bg-brand-yellow/45 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
                    👇 Toca una letra para darle el color que quieras
                  </span>
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3">
                {letters.map((ch, i) => (
                  <LetterTile
                    key={`${ch}-${i}`}
                    letter={ch}
                    color={effectiveColors[i]}
                    imageUrl={activeTiles[ch]?.imageUrl}
                    selected={selectedIndex === i}
                    onClick={() => toggleSelected(i)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Fila de colores para la letra seleccionada — control compartido */}
          {selectedIndex !== null && letters[selectedIndex] && (
            <SwatchRow letter={letters[selectedIndex]} onPick={setColorForSelected} />
          )}
        </div>

        {tooShort && letters.length > 0 && (
          <p className="text-brand-muted mt-3 text-center text-sm">
            Te faltan letras — mínimo {config.min}.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">{error}</p>
        )}

        {/* CTA */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!valid || submitting}
            className="bg-gradient-brand inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            {submitting ? "Agregando…" : "Agregar al carrito"}
          </button>
          {/* Precio EN VIVO por ficha — lo que ves es lo que pagas (igual que el carrito). */}
          {letters.length > 0 ? (
            <span className="text-brand-purple-dark text-sm font-semibold tabular-nums">
              {letters.length} {letters.length === 1 ? "ficha" : "fichas"} × {formatCOP(pricePerTile)}{" "}
              = <span className="text-brand-purple">{formatCOP(liveTotal)}</span>
            </span>
          ) : (
            <span className="text-brand-muted text-sm font-semibold tabular-nums">
              {formatCOP(pricePerTile)} por ficha · {count} letras ={" "}
              {formatCOP(pricePerTile * count)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
