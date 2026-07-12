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
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";
import { normalizeName, type NameLanguage } from "@/features/personalization/name-input";
import { createNameDesignAction, finalizeDesignAction } from "@/features/personalization/actions";
import { addPersonalizedToCartAction } from "@/app/carrito/actions";
import { LetterTile, NAME_TILE_THEMES, getNameTileTheme, LETTER_SWATCHES } from "./letter-tile";

type NameEditorProps = {
  product: { id: string; slug: string; name: string };
  /** Variante ya elegida en la ficha (idioma/tamaño/imantado). El editor solo arma la palabra. */
  variantId: string;
  config: { min: number; max: number; language: NameLanguage };
  priceLabel: string;
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

/** Dibuja la tira de fichas en un canvas de alta resolución y devuelve el PNG. */
async function renderNameStripBlob(letters: string[], colors: readonly string[]): Promise<Blob> {
  const scale = 4;
  const tileW = 120;
  const tileH = 142;
  const gap = 16;
  const pad = 22;
  const w = pad * 2 + letters.length * tileW + Math.max(0, letters.length - 1) * gap;
  const h = pad * 2 + tileH;

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
    ctx.fillStyle = color;
    ctx.font = `800 ${Math.round(tileW * 0.56)}px "Baloo 2", "Fredoka", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, x + tileW / 2, y + tileH / 2 + 2);
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen"))), "image/png"),
  );
}

export function NameEditor({ product, variantId, config, priceLabel }: NameEditorProps) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [themeId, setThemeId] = useState(NAME_TILE_THEMES[0].id);
  // Override de color por letra (índice → color). Vacío = usa el color del tema.
  const [letterColors, setLetterColors] = useState<Record<number, string>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => normalizeName(raw, config), [raw, config]);
  const { letters, valid, tooShort, notices } = result;
  const theme = getNameTileTheme(themeId);

  const effectiveColors = useMemo(
    () => letters.map((_, i) => letterColors[i] ?? theme.colors[i % theme.colors.length]),
    [letters, letterColors, theme],
  );

  // Letras repetidas → transparencia sobre cuántas fichas iguales lleva.
  const repeats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of letters) counts[l] = (counts[l] ?? 0) + 1;
    return Object.entries(counts)
      .filter(([, n]) => n > 1)
      .map(([l, n]) => `${l}×${n}`);
  }, [letters]);

  const examples = config.language === "es" ? ["Mía", "Mateo", "Amor"] : ["Mia", "Noah", "Love"];

  function applyTheme(id: string) {
    setThemeId(id);
    setLetterColors({}); // el tema es un punto de partida limpio
    setSelectedIndex(null);
  }

  function setColorForSelected(color: string) {
    if (selectedIndex === null) return;
    setLetterColors((prev) => ({ ...prev, [selectedIndex]: color }));
    setSelectedIndex(null);
  }

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
      });
      if (!created.ok) {
        setError(created.message);
        setSubmitting(false);
        return;
      }

      const blob = await renderNameStripBlob(letters, effectiveColors);
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

  const counterOver = letters.length > config.max;

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
        {/* Input */}
        <label htmlFor="name-input" className="text-brand-purple-dark block text-sm font-semibold">
          Escribe el nombre o palabra
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="name-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={config.max + 4}
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
            {letters.length}/{config.max}
          </span>
        </div>
        <p className="text-brand-muted mt-2 text-xs">
          {config.min}–{config.max} letras ·{" "}
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
                onClick={() => setRaw(ex)}
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

        {/* Paleta de colores (tema de las fichas) */}
        <div className="mt-5">
          <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
            Elige los colores
            <span className="text-brand-muted ml-2 text-xs font-normal">
              (o toca una letra para pintarla a tu gusto)
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {NAME_TILE_THEMES.map((t) => {
              const active = t.id === themeId && Object.keys(letterColors).length === 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTheme(t.id)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 rounded-full border-2 py-1.5 pr-3 pl-2 text-sm font-semibold transition ${
                    active
                      ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                      : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
                  }`}
                >
                  <span className="flex gap-0.5" aria-hidden="true">
                    {t.colors.slice(0, 3).map((c, i) => (
                      <span
                        key={i}
                        className="h-3.5 w-3.5 rounded-full ring-1 ring-black/5"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                  {t.emoji} {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview de la tira de fichas (cada una seleccionable para pintarla) */}
        <div className="bg-brand-cream/60 mt-5 rounded-2xl p-5">
          {letters.length === 0 ? (
            <p className="text-brand-muted flex h-[88px] items-center justify-center text-sm">
              Aquí verás tu nombre en fichas 🦝
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3">
              {letters.map((ch, i) => (
                <LetterTile
                  key={`${ch}-${i}`}
                  letter={ch}
                  color={effectiveColors[i]}
                  selected={selectedIndex === i}
                  onClick={() => setSelectedIndex(selectedIndex === i ? null : i)}
                />
              ))}
            </div>
          )}

          {/* Fila de colores para la letra seleccionada */}
          {selectedIndex !== null && letters[selectedIndex] && (
            <div className="border-brand-purple/15 mt-4 rounded-xl border bg-white p-3">
              <p className="text-brand-purple-dark mb-2 text-center text-xs font-semibold">
                Color de la letra <span className="font-display text-base">{letters[selectedIndex]}</span>
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {LETTER_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorForSelected(c)}
                    aria-label={`Pintar de este color`}
                    className="h-8 w-8 rounded-full ring-2 ring-black/5 transition hover:scale-110"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
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
          <span className="text-brand-muted text-sm font-semibold">{priceLabel}</span>
        </div>
      </div>
    </div>
  );
}
