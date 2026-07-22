"use client";

/*
 * ADR-057 — Editor de SET DE LETRAS en el Estudio (Abecedario Completo / Pack Vocales).
 * Consistente con el editor de Nombre: mismos controles de color (tema + barajar + color por
 * ficha, vía useLetterColors) y misma estética. Lo personalizable es el COLOR de cada ficha /
 * su marco — un cambio físico real → WYSIWYG. Reutiliza createLetterSetDesign + finalize +
 * carrito.
 *
 * Ola 2A (Lucy 2026-07-22) — el TEMA (default/animales/frutas/profesiones) y el IDIOMA ya NO
 * son variantes de la PDP: se eligen ACÁ en el Estudio. El tema preselecciona el LetterTileSet
 * correspondiente (los sets vacíos degradan a letra estándar — se ve tal cual se imprime).
 * Si la PDP traía tema/idioma en la variante, se PRESELECCIONAN. Las vocales son las mismas
 * 5 letras en español e inglés (sin selector de idioma para ellas). Al cambiar tema/idioma se
 * re-resuelve la variante exacta (mismo tamaño/imantado) para que la cotización quede precisa.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import { Box, ChevronLeft, Loader2, Sparkles, X } from "lucide-react";
import type { LetterStyle, LetterTileMap } from "@/features/personalization/letter-tiles";
import {
  createLetterSetDesignAction,
  finalizeDesignAction,
} from "@/features/personalization/actions";
import { addPersonalizedToCartAction } from "@/app/carrito/actions";
import { formatCOP } from "@/lib/format";
import { useLetterColors } from "./use-letter-colors";
import { ThemePicker, SwatchRow } from "./letter-color-controls";
import { resolveLetterSetVariant, type LetterSetVariant } from "./lib/letter-set-resolve";
import type { Magnet3D } from "./fridge-3d-view";
import { buildLetterTileTextures } from "./lib/letter-tile-textures";
import { useDialogA11y } from "./use-dialog-a11y";
import { useIsTouch } from "./use-is-touch";

// Ola 2B — tablero memo 3D de las fichas (WebGL, client-only → diferido).
const RoomBoardView3D = nextDynamic(() => import("./room-board-view-3d"), {
  ssr: false,
  loading: () => (
    <div className="text-brand-muted flex h-full items-center justify-center text-sm">
      Cargando tu tablero 3D…
    </div>
  ),
});

/** Opción de tema (set de fichas) tal como la entrega listLetterThemeOptions. */
export type ThemeOption = {
  id: string;
  name: string;
  theme: string | null;
  language: string;
  tileCount: number;
};

export type { LetterSetVariant };

const VOWELS = ["A", "E", "I", "O", "U"];

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

/** Emoji del chip según la clave de tema (fallback 🎨 para temas nuevos). */
function themeEmoji(theme: string | null, name: string): string {
  if (theme === "animales") return "🐾";
  if (theme === "frutas") return "🍓";
  if (theme === "profesiones") return "🧑‍🏫";
  const n = name.toLowerCase();
  if (n.includes("navidad") || n.includes("christmas")) return "🎄";
  if (n.includes("dino")) return "🦕";
  if (n.includes("espacio") || n.includes("space")) return "🚀";
  return "🎨";
}

/** Nombre corto del chip: "Kawaii Animales · Español" → "Kawaii Animales". */
function shortSetName(name: string): string {
  return name.split("·")[0]?.trim() || name;
}

export function LetterSetEditor({
  product,
  variantId,
  variants,
  basePrice,
  letterSet,
  alphabets,
  availableLanguages,
  initialLanguage,
  themeOptions,
  initialTheme,
  stylesByLanguage,
  subtitle,
}: {
  product: { id: string; slug: string; name: string };
  variantId: string;
  variants: LetterSetVariant[];
  /** Precio base del producto (centavos) por si la variante no tiene override. */
  basePrice: number;
  letterSet: "full" | "vowels";
  alphabets: { es: string[]; en: string[] };
  availableLanguages: ("es" | "en")[];
  initialLanguage: "es" | "en";
  themeOptions: { es: ThemeOption[]; en: ThemeOption[] };
  /** Tema que venía en la variante de la PDP (preselección). null = "Solo letra". */
  initialTheme: string | null;
  stylesByLanguage: { es: LetterStyle[]; en: LetterStyle[] };
  subtitle?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Idioma del alfabeto (para vocales no se muestra el selector: mismas 5 letras).
  const [language, setLanguage] = useState<"es" | "en">(initialLanguage);
  // Tema elegido = LetterTileSet.id (null = "Solo letra"/Default). Preselección: el tema de
  // la variante de la PDP, resuelto contra los sets del idioma inicial.
  const [styleId, setStyleId] = useState<string | null>(() => {
    if (!initialTheme) return null;
    const match = themeOptions[initialLanguage].find((o) => o.theme === initialTheme);
    return match?.id ?? null;
  });
  // Variante efectiva (se re-resuelve al cambiar tema/idioma → cotización precisa).
  const [currentVariantId, setCurrentVariantId] = useState(variantId);

  const letters = useMemo(
    () => (letterSet === "vowels" ? VOWELS : (alphabets[language] ?? alphabets.es)),
    [letterSet, alphabets, language],
  );

  const optionsForLanguage = themeOptions[language] ?? [];
  const selectedOption = styleId ? optionsForLanguage.find((o) => o.id === styleId) : null;
  const selectedThemeKey = selectedOption?.theme ?? null;
  const activeTiles: LetterTileMap = styleId
    ? ((stylesByLanguage[language] ?? []).find((s) => s.id === styleId)?.tiles ?? {})
    : {};

  const currentVariant = variants.find((v) => v.id === currentVariantId);
  const priceLabel = formatCOP(currentVariant?.price ?? basePrice);

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

  // Ola 2B — Vista 3D de las fichas en el tablero memo (modal fullscreen, WebGL diferido).
  // Las texturas se dibujan UNA vez al abrir (mismo dibujo que el preview 2D → WYSIWYG).
  const [board3D, setBoard3D] = useState<Magnet3D[] | null>(null);
  const [building3D, setBuilding3D] = useState(false);
  const board3DRef = useRef<HTMLDivElement>(null);
  const closeBoard3D = useCallback(() => setBoard3D(null), []);
  useDialogA11y(board3DRef, { onClose: closeBoard3D, active: board3D !== null });
  const isTouch = useIsTouch();

  async function handleOpen3D() {
    if (building3D) return;
    setBuilding3D(true);
    try {
      setBoard3D(await buildLetterTileTextures(letters, activeTiles, effectiveColors));
    } catch (err) {
      // #14 — detalle técnico al log; al cliente un mensaje claro es-CO.
      console.error("[studio.letter-set.3d]", err);
      setError("No pudimos abrir la vista 3D. Intenta de nuevo.");
    } finally {
      setBuilding3D(false);
    }
  }

  // Grid del tablero: packs chicos (vocales) en una sola fila; el abecedario en grilla ~√n.
  const boardCols =
    board3D === null || board3D.length <= 8
      ? Math.max(1, board3D?.length ?? 1)
      : Math.ceil(Math.sqrt(board3D.length));

  /** Cambio de tema: actualiza set + re-resuelve la variante (mismo tamaño/imán). */
  function handleSelectTheme(nextId: string | null) {
    setStyleId(nextId);
    const themeKey = nextId
      ? (optionsForLanguage.find((o) => o.id === nextId)?.theme ?? null)
      : null;
    setCurrentVariantId((cur) =>
      resolveLetterSetVariant(variants, cur, { theme: themeKey, language }),
    );
  }

  /** Cambio de idioma: nuevo alfabeto + mismo TEMA en el set del idioma nuevo + variante. */
  function handleSelectLanguage(next: "es" | "en") {
    if (next === language) return;
    setLanguage(next);
    const nextOptions = themeOptions[next] ?? [];
    const nextSetId = selectedThemeKey
      ? (nextOptions.find((o) => o.theme === selectedThemeKey)?.id ?? null)
      : null;
    setStyleId(nextSetId);
    setCurrentVariantId((cur) =>
      resolveLetterSetVariant(variants, cur, { theme: selectedThemeKey, language: next }),
    );
  }

  async function handleAddToCart() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createLetterSetDesignAction({
        productId: product.id,
        variantId: currentVariantId,
        frameTheme: themeId,
        colors: effectiveColors,
        styleSetId: styleId,
        language,
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
        variantId: currentVariantId,
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

  // El idioma solo se elige cuando cambia el alfabeto (abecedario) y el producto tiene ambos.
  const showLanguagePicker = letterSet === "full" && availableLanguages.length > 1;

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
        {/* Ola 2A — Selector de TEMA (antes dimensión de la PDP). Siempre visible: Default
            ("Solo letra") + un chip por set del idioma (vacíos degradan a letra estándar). */}
        <div className="mb-5">
          <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
            Elige el tema
            <span className="text-brand-muted ml-2 text-xs font-normal">
              · el dibujo de cada ficha 🎨
            </span>
          </p>
          <div role="radiogroup" aria-label="Tema de las fichas" className="flex flex-wrap gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={styleId === null}
              onClick={() => handleSelectTheme(null)}
              className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${
                styleId === null
                  ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                  : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
              }`}
            >
              <span aria-hidden="true">✏️</span>
              Solo letra
            </button>
            {optionsForLanguage.map((o) => {
              const active = o.id === styleId;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handleSelectTheme(o.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                      : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
                  }`}
                >
                  <span aria-hidden="true">{themeEmoji(o.theme, o.name)}</span>
                  {shortSetName(o.name)}
                </button>
              );
            })}
          </div>
          {selectedOption && selectedOption.tileCount === 0 && (
            <p className="text-brand-muted mt-2 text-xs">
              Este tema aún no tiene dibujitos: tus fichas se imprimen con la letra de color, tal
              como las ves abajo.
              <span className="mt-1 block font-semibold">
                Sube las ilustraciones en /admin/fichas para activar este tema.
              </span>
            </p>
          )}
        </div>

        {/* Ola 2A — Selector de IDIOMA (antes dimensión de la PDP). Solo abecedario (el
            alfabeto cambia: la Ñ) y solo si el producto tiene ambos idiomas. */}
        {showLanguagePicker && (
          <div className="mb-5">
            <p className="text-brand-purple-dark mb-2 text-sm font-semibold">Idioma del alfabeto</p>
            <div
              role="radiogroup"
              aria-label="Idioma del alfabeto"
              className="flex flex-wrap gap-2"
            >
              {availableLanguages.map((lang) => {
                const active = lang === language;
                return (
                  <button
                    key={lang}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => handleSelectLanguage(lang)}
                    className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${
                      active
                        ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                        : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
                    }`}
                  >
                    <span aria-hidden="true">{lang === "es" ? "🇪🇸" : "🇬🇧"}</span>
                    {lang === "es" ? "Español" : "English"}
                  </button>
                );
              })}
            </div>
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
            onClick={handleOpen3D}
            disabled={building3D || submitting}
            aria-label="Ver tus fichas en un tablero magnético 3D"
            className="border-brand-purple/30 text-brand-purple-dark hover:border-brand-purple/60 inline-flex items-center gap-2 rounded-full border-2 bg-white px-6 py-2.5 text-sm font-bold transition disabled:opacity-60"
          >
            {building3D ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Box className="h-4 w-4" />
            )}
            {building3D ? "Armando…" : "Ver en 3D"}
          </button>
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
            {submitting ? "Agregando…" : "Agregar al carrito"}
          </button>
          <span className="text-brand-muted text-sm font-semibold">{priceLabel}</span>
        </div>
      </div>

      {/* Ola 2B — Modal del tablero memo 3D con las fichas (lazy, client-only). */}
      {board3D !== null && (
        <div
          ref={board3DRef}
          role="dialog"
          aria-modal="true"
          aria-label="Vista 3D de tus fichas en un tablero magnético"
          tabIndex={-1}
          className="bg-brand-purple-dark/85 fixed inset-0 z-50 flex flex-col backdrop-blur-sm outline-none"
        >
          <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
            <span className="font-display text-lg font-bold">🖼️ Tus fichas en el tablero</span>
            <button
              type="button"
              onClick={closeBoard3D}
              aria-label="Cerrar vista 3D"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative flex-1">
            <RoomBoardView3D magnets={board3D} cols={boardCols} style="memo" />
            <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1.5 text-center text-xs text-white">
              {isTouch
                ? "Arrastra para girar · pellizca con 2 dedos para acercar"
                : "Arrastra para girar · rueda o pellizca para acercar"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
