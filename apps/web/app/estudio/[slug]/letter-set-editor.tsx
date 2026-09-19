"use client";

/*
 * ADR-057 — Editor de SET DE LETRAS en el Estudio (Abecedario Completo / Pack Vocales).
 * Consistente con el editor de Nombre: mismos controles de color (tema + barajar + color por
 * ficha, vía useLetterColors) y misma estética. Lo personalizable es el COLOR de cada ficha /
 * su marco — un cambio físico real → WYSIWYG. Reutiliza createLetterSetDesign + finalize +
 * carrito.
 *
 * Lucy 2026-09-05 — opción de diseño "Con borde / Sin borde" (mismo precio): es una decisión de
 * LIENZO que se persiste en Design.metadata.withBorder (NO es variante de catálogo) y se refleja
 * en los 3 dibujos de la ficha (DOM del editor, PNG de producción y textura 3D). Default "con
 * borde": lo que siempre se imprimió, así los diseños previos sin la clave quedan válidos.
 * Lucy 2026-09-08 — el selector de borde SIEMPRE queda habilitado; con "Sin borde" la sección
 * "Elige los colores" se desactiva (las fichas no llevan el marco de color) y se reactiva al
 * volver a "Con borde" conservando la selección de colores.
 *
 * Ola 2A (Lucy 2026-07-22) — el TEMA (default/animales/frutas/profesiones) y el IDIOMA ya NO
 * son variantes de la PDP: se eligen ACÁ en el Estudio. El tema preselecciona el LetterTileSet
 * correspondiente (los sets vacíos degradan a letra estándar — se ve tal cual se imprime).
 * Si la PDP traía tema/idioma en la variante, se PRESELECCIONAN. Las vocales son las mismas
 * 5 letras en español e inglés (sin selector de idioma para ellas). Al cambiar tema/idioma se
 * re-resuelve la variante exacta (mismo tamaño/imantado) para que la cotización quede precisa.
 *
 * Vista previa pre-carrito (Lucy 2026-07-25) — antes este editor mandaba el set al carrito sin que
 * el cliente viera cómo iba a quedar. Ahora "Vista previa" (antes "¡Listo!", renombrado 2026-09-09)
 * solo DIBUJA el PNG del set y lo muestra en
 * StudioPreviewModal ("Así se verá tu pedido", el mismo componente del Estudio principal): el
 * diseño se crea, se finaliza y se agrega al carrito RECIÉN al confirmar. Si el cliente vuelve a
 * editar no queda nada creado en la base. El PNG que se ve es exactamente el que se sube como
 * archivo de producción — que es la promesa WYSIWYG de la tienda, no un adorno.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import nextDynamic from "next/dynamic";
import { Box, Copy, Loader2, Sparkles, X } from "lucide-react";
import type { LetterStyle, LetterTileMap } from "@/features/personalization/letter-tiles";
import {
  createLetterSetDesignAction,
  finalizeDesignAction,
} from "@/features/personalization/actions";
import { addPersonalizedToCartAction } from "@/app/carrito/actions";
import { formatCOP } from "@/lib/format";
import {
  useLetterColors,
  effectiveColorsFromSnapshot,
  type LetterColorsSnapshot,
} from "./use-letter-colors";
import { MAX_LETTER_SET_UNITS } from "@/features/personalization/design-units";
import { ThemePicker, SwatchRow } from "./letter-color-controls";
import { StudioPreviewModal } from "./studio-preview-modal";
import { StudioSimpleHeader } from "./studio-simple-header";
import { STUDIO_MAX_WIDTH } from "./studio-layout";
import { resolveLetterSetVariant, type LetterSetVariant } from "./lib/letter-set-resolve";
import type { Magnet3D } from "./fridge-3d-view";
import { buildLetterTileTextures, LETTER_TILE_CORNER_RATIO } from "./lib/letter-tile-textures";
import { useDialogA11y } from "./use-dialog-a11y";
import { useIsTouch } from "./use-is-touch";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

// Roadmap B1 — el "Cargando tu tablero 3D…" del dynamic import es texto CMS
// (estudio.escenas.loading-tablero); sin provider cae al default exacto pre-CMS.
function Board3DLoadingFallback() {
  const texts = useStudioTexts();
  return (
    <div className="text-brand-muted flex h-full items-center justify-center text-sm">
      {texts.escenas.loadingTablero}
    </div>
  );
}

// Ola 2B — tablero memo 3D de las fichas (WebGL, client-only → diferido).
const RoomBoardView3D = nextDynamic(() => import("./room-board-view-3d"), {
  ssr: false,
  loading: () => <Board3DLoadingFallback />,
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
  withBorder = true,
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
  // Radio de esquina ÚNICO para editor/PNG/textura 3D (antes acá era 18 = 15% y divergía de la
  // textura 3D, 10% — deuda cerrada 2026-09-05 alineando el compositor a LETTER_TILE_CORNER_RATIO).
  const radius = LETTER_TILE_CORNER_RATIO * tileW;

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
    roundRect(ctx, x, y, tileW, tileH, radius);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    if (withBorder) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    const img = imgs[i];
    if (img) {
      ctx.save();
      roundRect(ctx, x + 4, y + 4, tileW - 8, tileH - 8, radius - 4);
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

/**
 * El PNG del set se dibuja UNA sola vez: el modal necesita una URL para mostrarlo y el finalize
 * necesita los bytes. Convertimos ese mismo Blob a data URL en vez de volver a dibujar el canvas,
 * así se garantiza que la imagen que el cliente aprueba es byte a byte la que se manda a producir.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer la vista previa"));
    reader.readAsDataURL(blob);
  });
}

/** Convierte un data URL base64 a Blob (mismo motivo que en studio-editor: Flight chunkea strings). */
function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) throw new Error("dataURL inválido (sin coma)");
  const meta = dataUrl.slice(0, commaIdx);
  const binary = atob(dataUrl.slice(commaIdx + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: meta.match(/^data:([^;]+)/)?.[1] ?? "image/png" });
}

/**
 * Multi-unidad (2026-09-09) — montaje de las láminas de TODOS los sets en UN PNG
 * para la vista previa de confirmación (el cliente ve exactamente lo que va a
 * recibir). Apiladas en vertical con el mismo fondo crema del compositor; la
 * línea del carrito/checkout muestra esta misma imagen.
 */
async function montageLaminaBlobs(blobs: Blob[]): Promise<string> {
  const imgs = await Promise.all(
    blobs.map(
      (b) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const url = URL.createObjectURL(b);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("No se pudo montar la vista previa de los sets"));
          };
          img.src = url;
        }),
    ),
  );
  const gap = 36;
  const w = Math.max(...imgs.map((i) => i.naturalWidth));
  const h = imgs.reduce((sum, i) => sum + i.naturalHeight, 0) + gap * (imgs.length - 1);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d no disponible");
  ctx.fillStyle = "#FFF8F0";
  ctx.fillRect(0, 0, w, h);
  let y = 0;
  for (const img of imgs) {
    const x = Math.round((w - img.naturalWidth) / 2);
    ctx.drawImage(img, x, y);
    y += img.naturalHeight + gap;
  }
  return canvas.toDataURL("image/png");
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
  productImageUrl,
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
  initialUnits,
  subtitle,
}: {
  product: { id: string; slug: string; name: string };
  /** Ola 32 — mini avatar del header sticky unificado (StudioSimpleHeader). */
  productImageUrl?: string;
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
  /**
   * Modelo MULTI-UNIDAD (owner 2026-09-09): sets a DISEÑAR elegidos en la PDP con
   * el stepper "Unidades" (`?copies=N` — nombre del parámetro conservado por
   * compat). Cada set lleva sus propios colores por ficha (multiplicador de sets:
   * las fichas ya son muchas — tema/idioma/borde quedan a nivel DISEÑO, compartidos
   * por todos los sets). undefined → 1. Tope MAX_LETTER_SET_UNITS.
   */
  initialUnits?: number;
  subtitle?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Vista previa pre-carrito: `preparing` cubre el dibujo del PNG (puede tardar si hay que bajar
  // las fichas ilustradas), `previewDataUrl` abre la modal y `previewBlobs` son los archivos que se
  // suben al confirmar (UNO POR SET). `previewError` es el error del PASO de confirmación: va
  // DENTRO de la modal (donde está mirando el cliente), mientras `error` sigue siendo el del editor.
  const [preparing, setPreparing] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewBlobs, setPreviewBlobs] = useState<Blob[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // ── Multi-unidad (2026-09-09) — N sets, cada uno con sus colores ──
  // Tope defensivo (cada set = 1 lámina de producción; validado también en el server).
  const unitCount = Math.min(MAX_LETTER_SET_UNITS, Math.max(1, Math.trunc(initialUnits ?? 1) || 1));
  // Set visible en pantalla (pager "Set 1 de N") + tick para forzar remonte tras
  // "Aplicar este diseño a todas" (re-lee el snapshot clonado del Map).
  const [activeUnit, setActiveUnit] = useState(0);
  const [applyTick, setApplyTick] = useState(0);
  // Snapshots de color POR SET (tema + orden + overrides por ficha). El panel del
  // set activo reporta el suyo en cada cambio real (no en cada render); el Map es
  // la fuente para dibujar las láminas de TODOS los sets en la vista previa y para
  // la acción de crear. En estado (no ref): se lee durante el render.
  const [snapshots, setSnapshots] = useState<ReadonlyMap<number, LetterColorsSnapshot>>(
    () => new Map(),
  );
  const recordSnapshot = useCallback((unit: number, snap: LetterColorsSnapshot) => {
    setSnapshots((prev) => {
      if (prev.get(unit) === snap) return prev;
      const next = new Map(prev);
      next.set(unit, snap);
      return next;
    });
  }, []);

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
  // Lucy 2026-09-05 — opción de diseño "Con borde / Sin borde" (mismo precio). Default CON borde:
  // es el comportamiento histórico, así los diseños guardados antes de la opción quedan válidos.
  const [withBorder, setWithBorder] = useState(true);

  const letters = useMemo(
    () => (letterSet === "vowels" ? VOWELS : (alphabets[language] ?? alphabets.es)),
    [letterSet, alphabets, language],
  );

  // Ola 3 (Lucy 2026-07-27) — solo mostrar temas ilustrados que estén 100% completos para el
  // set de letras activo. Un set incompleto genera una experiencia rota (mezcla de dibujitos y
  // letras de color) y confunde al cliente, por lo que se filtran del picker y se ignoran si
  // llegan preseleccionados desde la PDP/URL. La cobertura se verifica letra a letra (no solo
  // por conteo): en vocales, 5 fichas que no sean A-E-I-O-U NO habilitan el tema.
  const optionsForLanguage = useMemo(() => {
    const styles = stylesByLanguage[language] ?? [];
    return (themeOptions[language] ?? []).filter((o) => {
      if (o.tileCount < letters.length) return false;
      const set = styles.find((s) => s.id === o.id);
      return set ? letters.every((l) => set.tiles[l]) : false;
    });
  }, [themeOptions, stylesByLanguage, language, letters]);
  const selectedOption = styleId ? optionsForLanguage.find((o) => o.id === styleId) : null;
  const selectedThemeKey = selectedOption?.theme ?? null;
  const activeTiles: LetterTileMap = useMemo(() => {
    if (!styleId) return {};
    const set = (stylesByLanguage[language] ?? []).find((s) => s.id === styleId);
    const option = optionsForLanguage.find((o) => o.id === styleId);
    if (!set || !option || !letters.every((l) => set.tiles[l])) return {};
    return set.tiles ?? {};
  }, [styleId, stylesByLanguage, language, optionsForLanguage, letters]);

  const currentVariant = variants.find((v) => v.id === currentVariantId);
  // Centavos COP enteros: la etiqueta del editor y el precio de la modal salen del MISMO valor,
  // para que el cliente no vea un número distinto al confirmar.
  const unitPriceCents = currentVariant?.price ?? basePrice;
  const priceLabel = formatCOP(unitPriceCents * unitCount);

  // ── Colores POR SET (multi-unidad 2026-09-09) ──
  // El hook vive en el panel del set ACTIVO (abajo, LetterSetUnitPanel) y reporta su
  // snapshot al Map; acá solo se LEEN colores por unidad para dibujar láminas, la
  // vista 3D y la creación del diseño. Sin snapshot (set no visitado todavía) cae al
  // tema default — mismo estado inicial de siempre.
  const colorsForUnit = useCallback(
    (unit: number) => effectiveColorsFromSnapshot(letters.length, snapshots.get(unit)),
    [letters.length, snapshots],
  );
  /** "Aplicar este diseño a todas": clona los colores del set activo a todos. */
  function handleApplyToAll() {
    setSnapshots((prev) => {
      const src = prev.get(activeUnit);
      if (!src) return prev;
      const next = new Map(prev);
      for (let u = 0; u < unitCount; u++) next.set(u, src);
      return next;
    });
    setApplyTick((t) => t + 1);
  }

  // Ola 2B — Vista 3D de las fichas en el tablero memo (modal fullscreen, WebGL diferido).
  // Las texturas se dibujan UNA vez al abrir (mismo dibujo que el preview 2D → WYSIWYG).
  const [board3D, setBoard3D] = useState<Magnet3D[] | null>(null);
  const [building3D, setBuilding3D] = useState(false);
  const board3DRef = useRef<HTMLDivElement>(null);
  const closeBoard3D = useCallback(() => setBoard3D(null), []);
  useDialogA11y(board3DRef, { onClose: closeBoard3D, active: board3D !== null });
  const isTouch = useIsTouch();
  const texts = useStudioTexts();

  async function handleOpen3D() {
    if (building3D) return;
    setBuilding3D(true);
    try {
      setBoard3D(
        await buildLetterTileTextures(letters, activeTiles, colorsForUnit(activeUnit), withBorder),
      );
    } catch (err) {
      // #14 — detalle técnico al log; al cliente un mensaje claro es-CO.
      console.error("[studio.letter-set.3d]", err);
      setError(texts.errores.vista3d);
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

  /**
   * Paso 1 — "Vista previa": dibuja las láminas de TODOS los sets y abre la vista
   * previa (el cliente ve exactamente lo que va a recibir — modelo multi-unidad).
   * No toca la red ni la base: si el cliente decide seguir editando, no queda
   * ningún diseño creado ni ningún archivo subido.
   */
  async function handleShowPreview() {
    // Simétrico al guard de handleOpen3D: si el 3D se está construyendo, abrir la previa
    // dejaría los dos diálogos superpuestos y el 3D inerte bajo el overlay.
    if (building3D) return;
    if (submitting || preparing) return;
    setPreparing(true);
    setError(null);
    setPreviewError(null);
    try {
      const blobs: Blob[] = [];
      for (let u = 0; u < unitCount; u++) {
        const colors = colorsForUnit(u);
        try {
          blobs.push(await renderLetterSetBlob(letters, activeTiles, colors, true, withBorder));
        } catch {
          // Si alguna ficha ilustrada no carga, el set se dibuja con la letra de color: el cliente
          // ve —y aprueba— exactamente lo que se imprimiría en ese caso.
          blobs.push(await renderLetterSetBlob(letters, activeTiles, colors, false, withBorder));
        }
      }
      setPreviewBlobs(blobs);
      // Con varios sets el preview es el MONTAJE de todas las láminas apiladas;
      // con uno, la lámina misma (comportamiento histórico).
      setPreviewDataUrl(
        blobs.length === 1 && blobs[0]
          ? await blobToDataUrl(blobs[0])
          : await montageLaminaBlobs(blobs),
      );
    } catch (err) {
      // #14 — detalle técnico al log; mensaje claro es-CO al cliente.
      console.error("[studio.letter-set.preview]", err);
      setError(texts.errores.preview);
    } finally {
      setPreparing(false);
    }
  }

  /**
   * Paso 2 — "Sí, agregar al carrito": recién acá se crea el diseño, se suben las
   * láminas aprobadas y se agrega al carrito. Se reusan los blobs de la vista
   * previa (no se re-dibujan) para que los archivos de producción sean los mismos
   * que el cliente aprobó.
   * Modelo multi-unidad (2026-09-09): el diseño contiene TODOS los sets (unitCount,
   * con sus colores por ficha en metadata) → la línea del carrito es UNA con qty=1
   * y el precio = variante × N lo deriva el servidor (letterSetUnitCount).
   */
  async function handleConfirmAddToCart() {
    if (submitting || !previewBlobs || previewBlobs.length === 0) return;
    setSubmitting(true);
    setPreviewError(null);
    try {
      const unitsColors = Array.from({ length: unitCount }, (_, u) => colorsForUnit(u));
      const created = await createLetterSetDesignAction({
        productId: product.id,
        variantId: currentVariantId,
        // Tema/colores del primer set (representante del diseño; compat con
        // clientes viejos que solo mandaban UN set).
        frameTheme: snapshots.get(0)?.themeId ?? "arcoiris",
        colors: unitsColors[0],
        // Multi-unidad — TODOS los sets con sus colores (el server los valida y
        // los persiste en metadata.units; el precio ×N sale de ahí).
        units: unitsColors.map((colors) => ({ colors })),
        unitCount,
        styleSetId: styleId,
        language,
        withBorder,
      });
      if (!created.ok) {
        setPreviewError(created.message);
        setSubmitting(false);
        return;
      }
      const fd = new FormData();
      fd.set("designId", created.designId);
      // Cada set se imprime como SU lámina (un archivo de producción POR SET),
      // aunque la modal le cuente al cliente las fichas que va a recibir.
      fd.set("slotCount", String(unitCount));
      // Preview = montaje de todas las láminas (el MISMO PNG que aprobó el cliente).
      fd.set("preview", dataUrlToBlob(previewDataUrl!), "preview.png");
      previewBlobs.forEach((blob, i) => {
        fd.set(`production_${i}`, blob, `produccion-set-${i + 1}.png`);
      });
      const finalized = await finalizeDesignAction(fd);
      if (!finalized.ok) {
        setPreviewError(finalized.message);
        setSubmitting(false);
        return;
      }
      const added = await addPersonalizedToCartAction({
        designId: created.designId,
        qty: 1,
        variantId: currentVariantId,
      });
      if (!added.ok) {
        setPreviewError(fillStudioText(texts.exportar.errorCarritoSet, { error: added.message }));
        setSubmitting(false);
        return;
      }
      // Cerramos la modal antes de redirigir para que no quede parpadeando sobre el carrito.
      setPreviewDataUrl(null);
      router.push("/carrito?personalized=1");
    } catch (err) {
      // #14 — detalle técnico al log; mensaje claro es-CO al cliente.
      console.error("[studio.letter-set]", err);
      setPreviewError(texts.errores.generico);
      setSubmitting(false);
    }
  }

  /** "Volver a editar": suelta la vista previa para no reusar un PNG viejo tras cambiar colores. */
  function handleClosePreview() {
    if (submitting) return; // nunca soltar los blobs en medio de la subida
    setPreviewDataUrl(null);
    setPreviewBlobs(null);
    setPreviewError(null);
  }

  // El idioma solo se elige cuando cambia el alfabeto (abecedario) y el producto tiene ambos.
  const showLanguagePicker = letterSet === "full" && availableLanguages.length > 1;

  return (
    <>
      {/* Ola 32 — chrome unificado del Estudio: barra sticky con el idioma visual
          del StudioToolbar del estudio de foto (pill «Salir», avatar+nombre del
          producto, total en vivo + CTA «Vista previa» — la MISMA acción del botón
          grande del panel de controles). */}
      <StudioSimpleHeader
        productName={product.name}
        productSlug={product.slug}
        productImageUrl={productImageUrl}
        trailing={
          <span className="text-brand-purple-dark text-sm font-bold whitespace-nowrap tabular-nums">
            {priceLabel}
          </span>
        }
        ctaLabel={texts.comun.listo}
        ctaBusyLabel={preparing ? texts.comun.preparando : texts.comun.agregando}
        ctaBusy={preparing || submitting}
        ctaDisabled={building3D}
        ctaSrHint={texts.letras.listoSr}
        onCta={handleShowPreview}
      />

      <div
        className="mx-auto w-full px-4 py-6 sm:px-6 lg:px-8"
        style={{ maxWidth: STUDIO_MAX_WIDTH }}
      >
        {/* h1 visible (WCAG): el eyebrow "Personalizar · {producto}" ya vive en el
            header sticky (md+), no se repite acá. */}
        <header className="mb-5 text-center">
          <h1 className="font-display text-brand-purple-dark text-2xl sm:text-3xl">
            {texts.letras.titulo}
          </h1>
          {subtitle && <p className="text-brand-muted mx-auto mt-1 max-w-md text-sm">{subtitle}</p>}
        </header>

        {/* Panel del set activo (colores por ficha). key por (set, tick): al cambiar
            de set o tras "Aplicar a todas" se remonta leyendo el snapshot del Map.
            Ola 32 — el estado de color es UNO por set (useLetterColors) pero sus
            piezas se reparten en las DOS columnas del layout: el picker de tema va
            con los controles y la grilla de fichas ES el lienzo. */}
        <LetterSetUnitState
          key={`${activeUnit}-${applyTick}`}
          unit={activeUnit}
          letters={letters}
          initial={snapshots.get(activeUnit)}
          onSnapshot={recordSnapshot}
        >
          {(unit) => (
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
              {/* PREVIEW = el lienzo: tarjeta-unidad estándar del Estudio (mismo
              lenguaje que las tarjetas del estudio de foto). Primero en móvil;
              en lg columna fluida a la derecha. */}
              <section
                aria-label={texts.letras.titulo}
                className="order-1 min-w-0 lg:order-2 lg:flex-1"
              >
                <div className="border-brand-purple/15 rounded-2xl border bg-white/70 p-2 shadow-sm sm:p-4">
                  {/* Preview del set (WYSIWYG) — cada ficha es seleccionable para pintarla
                  a gusto. Ola 28 (owner 2026-09-11, 1.7): con «Sin borde» no hay marco
                  de color que pintar → sin hint y fichas NO seleccionables (la paleta
                  ya quedó inerte).
                  Ola 32 — la grilla aprovecha el ancho del lienzo: sube columnas con
                  el viewport (el ancho mínimo de columna mantiene el tap target ≥44px). */}
                  <div className="bg-brand-cream/50 flex min-h-[280px] flex-col justify-center rounded-xl p-4 sm:min-h-[360px] sm:p-5">
                    {withBorder && unit.selectedIndex === null && (
                      <p className="text-brand-purple-dark mb-3 flex items-center justify-center text-center text-xs font-semibold">
                        <span className="bg-brand-yellow/45 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
                          {texts.letras.tocaHint}
                        </span>
                      </p>
                    )}
                    {/* Grilla de fichas: FLEX centrado (Ola 33) + Ola 34 (owner
                        2026-09-18, "móvil apretado / web mal distribuido"):
                        columnas por breakpoint 3/4/5/7/8 (antes 4/6/8/10/12/13)
                        con tope de ficha de 128px — en móvil la ficha sube de
                        ~65px (4 col) a ~93px (3 col, límite físico de 375px) y
                        en desktop deja de encogerse dentro de la tarjeta-lienzo
                        (a 1024px eran ~44px con 10 col en el lienzo con
                        sidebar). El ancho calc descuenta los gaps (12px base,
                        16px sm+) para llenar la fila exacta. */}
                    <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
                      {letters.map((ch, i) => {
                        const tile = activeTiles[ch];
                        const color = unit.effectiveColors[i];
                        const isSel = withBorder && unit.selectedIndex === i;
                        return (
                          <button
                            key={ch}
                            type="button"
                            data-letter-tile
                            onClick={() => withBorder && unit.toggleSelected(i)}
                            disabled={!withBorder}
                            aria-pressed={withBorder ? isSel : undefined}
                            aria-label={fillStudioText(texts.letras.pintarAria, { letra: ch })}
                            className={`flex w-[calc((100%-24px)/3)] max-w-32 flex-col items-center rounded-xl transition sm:w-[calc((100%-48px)/4)] md:w-[calc((100%-64px)/5)] xl:w-[calc((100%-96px)/7)] 2xl:w-[calc((100%-112px)/8)] ${
                              isSel
                                ? "ring-brand-purple scale-105 ring-2 ring-offset-2"
                                : withBorder
                                  ? "hover:scale-105"
                                  : "cursor-default"
                            }`}
                          >
                            {/* Ficha VERTICAL (aspect 5/6.5) — espeja el imán físico rectangular.
                            Sin borde: la ficha queda blanca a ras (el PNG y la textura 3D
                            hacen lo mismo). */}
                            <div
                              className="flex aspect-[5/6.5] w-full items-center justify-center overflow-hidden rounded-xl bg-white"
                              style={{
                                border: withBorder ? `2px solid ${color}` : "2px solid transparent",
                                boxShadow: `0 3px 10px ${color}22`,
                              }}
                            >
                              {tile ? (
                                // eslint-disable-next-line @next/next/no-img-element -- ficha del bucket público
                                <img
                                  src={tile.imageUrl}
                                  alt={fillStudioText(texts.letras.letraAlt, { letra: ch })}
                                  className="h-full w-full object-contain p-1"
                                />
                              ) : (
                                <span
                                  className="font-display text-base font-extrabold"
                                  style={{ color }}
                                >
                                  {ch}
                                </span>
                              )}
                            </div>
                            <span className="text-brand-muted mt-1 text-[10px] font-semibold">
                              {ch}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Fila de colores para la ficha seleccionada — control compartido.
                    Con «Sin borde» no aplica (no hay marco de color que pintar). */}
                    {withBorder && unit.selectedIndex !== null && letters[unit.selectedIndex] && (
                      <SwatchRow
                        letter={letters[unit.selectedIndex]}
                        onPick={unit.setColorForSelected}
                      />
                    )}
                  </div>
                </div>
              </section>

              {/* Controles: tarjeta blanca lateral en lg (idioma del StudioSidebar),
              debajo del lienzo en móvil. */}
              <aside className="order-2 lg:order-1 lg:w-80 lg:shrink-0">
                <div className="border-brand-purple/12 rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
                  {/* Ola 2A — Selector de TEMA (antes dimensión de la PDP). Siempre visible: Default
            ("Solo letra") + un chip por set del idioma (vacíos degradan a letra estándar). */}
                  <div className="mb-5">
                    <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
                      {texts.letras.temaTitulo}
                      <span className="text-brand-muted ml-2 text-xs font-normal">
                        {texts.letras.temaHint}
                      </span>
                    </p>
                    <div
                      role="radiogroup"
                      aria-label={texts.letras.temaAria}
                      className="flex flex-wrap gap-2"
                    >
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
                        {texts.letras.soloLetra}
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
                  </div>

                  {/* Ola 2A — Selector de IDIOMA (antes dimensión de la PDP). Solo abecedario (el
            alfabeto cambia: la Ñ) y solo si el producto tiene ambos idiomas. */}
                  {showLanguagePicker && (
                    <div className="mb-5">
                      <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
                        {texts.letras.idiomaTitulo}
                      </p>
                      <div
                        role="radiogroup"
                        aria-label={texts.letras.idiomaTitulo}
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
                              {lang === "es" ? texts.letras.idiomaEs : texts.letras.idiomaEn}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Lucy 2026-09-05 — opción de diseño "Con borde / Sin borde" (mismo precio). Es una
            decisión de LIENZO que viaja en Design.metadata y se refleja en el PNG de producción,
            no una variante del catálogo. Default "Con borde": lo que siempre se imprimió.
            Lucy 2026-09-08 — el selector SIEMPRE queda habilitado (es la vía para reactivar
            los colores); "Sin borde" solo desactiva la sección de colores de abajo.
            Multi-unidad (2026-09-09): el borde es a NIVEL DISEÑO (todos los sets lo
            comparten); lo que cambia por set son los COLORES de las fichas. */}
                  <div className="mt-5">
                    <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
                      {texts.letras.bordeTitulo}
                      <span className="text-brand-muted ml-2 text-xs font-normal">
                        {texts.letras.bordeHint}
                      </span>
                    </p>
                    <div
                      role="radiogroup"
                      aria-label={texts.letras.bordeTitulo}
                      className="flex flex-wrap gap-2"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={withBorder}
                        onClick={() => setWithBorder(true)}
                        className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${
                          withBorder
                            ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                            : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
                        }`}
                      >
                        <span aria-hidden="true">◻️</span>
                        {texts.letras.bordeCon}
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!withBorder}
                        onClick={() => setWithBorder(false)}
                        className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${
                          !withBorder
                            ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                            : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
                        }`}
                      >
                        <span aria-hidden="true">⬜</span>
                        {texts.letras.bordeSin}
                      </button>
                    </div>
                  </div>

                  {/* Multi-unidad (2026-09-09) — pager de sets + "Aplicar este diseño a todas".
            Cada set lleva sus propios colores por ficha (el tema/idioma/borde son del
            diseño completo). Las láminas de TODOS los sets se ven en la Vista previa. */}
                  {unitCount > 1 && (
                    <div className="mt-5 flex flex-col items-center gap-3">
                      <nav
                        aria-label={texts.unidades.pagerAria}
                        className="flex flex-wrap items-center justify-center gap-2"
                      >
                        {Array.from({ length: unitCount }, (_, u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setActiveUnit(u)}
                            aria-pressed={u === activeUnit}
                            className={`inline-flex items-center gap-1.5 rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
                              u === activeUnit
                                ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                                : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
                            }`}
                          >
                            {fillStudioText(texts.unidades.unidadDe, {
                              nombre: texts.unidades.nombreSet,
                              n: u + 1,
                              total: unitCount,
                            })}
                          </button>
                        ))}
                      </nav>
                      <button
                        type="button"
                        onClick={handleApplyToAll}
                        aria-label={texts.unidades.aplicarATodasAria}
                        title={texts.unidades.aplicarATodasTitle}
                        className="border-brand-purple/30 text-brand-purple-dark hover:border-brand-purple/60 hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-full border-2 bg-white px-4 py-2 text-xs font-bold transition active:scale-95"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        {texts.unidades.aplicarATodas}
                      </button>
                    </div>
                  )}

                  {/* Picker de tema de color del set activo (barajar al re-clic) — control
            compartido con Nombre. Lucy 2026-09-08 — con «Sin borde» las fichas no
            llevan el marco de color, así que la sección «Elige los colores» se
            DESACTIVA (visible + inerte, con el porqué). Al volver a «Con borde» se
            reactiva conservando la selección: el estado de colores (useLetterColors,
            vía LetterSetUnitState) nunca se resetea al desactivar.
            Ola 32 — la grilla de fichas que alimenta vive en el lienzo (tarjeta-unidad). */}
                  <ThemePicker
                    themeId={unit.themeId}
                    customized={unit.customized}
                    onApply={unit.applyTheme}
                    disabled={!withBorder}
                    disabledHint={texts.letras.bordeSinColoresHint}
                  />

                  {error && (
                    <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">
                      {error}
                    </p>
                  )}

                  <div className="mt-6 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={handleOpen3D}
                      disabled={building3D || submitting || preparing}
                      aria-label={texts.escenas.setBtnTableroAria}
                      className="border-brand-purple/30 text-brand-purple-dark hover:border-brand-purple/60 inline-flex items-center gap-2 rounded-full border-2 bg-white px-6 py-2.5 text-sm font-bold transition disabled:opacity-60"
                    >
                      {building3D ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Box className="h-4 w-4" />
                      )}
                      {building3D ? texts.comun.armando : texts.escenas.setBtnTablero}
                    </button>
                    {/* El botón ya no agrega al carrito: abre la vista previa. El texto lo dice ("Vista
              previa", igual que el Estudio principal) y el sr-only completa la promesa sin romper
              WCAG 2.5.3 (el nombre accesible empieza por el texto visible). */}
                    <button
                      type="button"
                      onClick={handleShowPreview}
                      disabled={submitting || preparing || building3D}
                      className="bg-gradient-brand inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
                    >
                      {preparing || submitting ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Sparkles className="h-5 w-5" />
                      )}
                      {preparing
                        ? texts.comun.preparando
                        : submitting
                          ? texts.comun.agregando
                          : texts.comun.listo}
                      {!preparing && !submitting && (
                        <span className="sr-only">{texts.letras.listoSr}</span>
                      )}
                    </button>
                    <span className="text-brand-muted text-sm font-semibold">{priceLabel}</span>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </LetterSetUnitState>
      </div>

      {/* Vista previa pre-carrito (Lucy 2026-07-25) — "Así se verá tu pedido". El estado abierto
          lo manda el propio PNG: sin vista previa no hay nada que confirmar (y la modal ya se
          auto-oculta con previewUrl=null), así no hay dos banderas que puedan desincronizarse. */}
      <StudioPreviewModal
        isOpen={previewDataUrl !== null}
        previewUrl={previewDataUrl}
        productName={product.name}
        // Estos productos tienen variantes "Con imán" y "Sin imán" (la PDP las ofrece como
        // dimensión propia). Llamarle "imán" a la que no lo lleva es afirmar algo falso sobre el
        // producto físico, y justo en la pantalla de confirmación (revisión 2026-07-25).
        productKind={currentVariant?.magnet === false ? "tiles" : "magnets"}
        // El cliente cuenta FICHAS, no archivos: el set son N imanes ("los 27 imanes que vas a
        // recibir"). El slotCount=unitCount del finalize es otra cosa: las láminas de producción.
        slotCount={letters.length}
        // Tamaño real de la variante vigente (la que se re-resuelve al cambiar tema/idioma).
        // El atributo se guarda sin unidad ("5×7"); sin esto la modal decía "Cada imán mide 7×10.".
        sizeCm={currentVariant?.sizeCm ? `${currentVariant.sizeCm} cm` : undefined}
        unitPrice={unitPriceCents}
        // Multi-unidad (2026-09-09): el diseño contiene TODOS los sets → total =
        // precio del set × N y la línea del carrito es UNA (qty 1).
        unitCount={unitCount}
        isFinalizing={submitting}
        errorMessage={previewError}
        onEdit={handleClosePreview}
        onConfirm={handleConfirmAddToCart}
      />

      {/* Ola 2B — Modal del tablero memo 3D con las fichas (lazy, client-only). */}
      {board3D !== null && (
        <div
          ref={board3DRef}
          role="dialog"
          aria-modal="true"
          aria-label={texts.escenas.setTableroAria}
          tabIndex={-1}
          className="bg-brand-purple-dark/85 fixed inset-0 z-50 flex flex-col backdrop-blur-sm outline-none"
        >
          <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
            <span className="font-display text-lg font-bold">{texts.escenas.setTableroTitulo}</span>
            <button
              type="button"
              onClick={closeBoard3D}
              aria-label={texts.comun.cerrarVista3d}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative flex-1">
            <RoomBoardView3D magnets={board3D} cols={boardCols} style="memo" />
            <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1.5 text-center text-xs text-white">
              {isTouch ? texts.escenas.hintTouch : texts.escenas.hintMouse}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
//  Multi-unidad (2026-09-09) — estado de color de UN set
// ──────────────────────────────────────────────────────────────────

/**
 * Estado de color de UN set del diseño multi-unidad. Ola 32: dejó de ser un
 * "panel" con markup propio para ser un wrapper de ESTADO con render-prop: el
 * layout del editor reparte las piezas en dos columnas (picker de tema con los
 * controles; grilla de fichas como lienzo) pero el `useLetterColors` debe ser
 * UNO por set — dos instancias se desincronizarían (el tema barajado no sería
 * el que pinta la grilla).
 *
 * El estado vive en `useLetterColors` con snapshot exportable: el padre lo
 * persiste por set (al cambiar de pestaña se remonta con `initial`) y lo clona
 * a todos con "Aplicar este diseño a todas".
 *
 * `onSnapshot` se llama en CADA cambio de color (tema, barajar, ficha pintada):
 * el Map del padre siempre tiene el estado fresco de este set para dibujar las
 * láminas de la vista previa y crear el diseño.
 */
function LetterSetUnitState({
  unit,
  letters,
  initial,
  onSnapshot,
  children,
}: {
  unit: number;
  letters: string[];
  initial?: LetterColorsSnapshot;
  onSnapshot: (unit: number, snap: LetterColorsSnapshot) => void;
  children: (colors: ReturnType<typeof useLetterColors>) => React.ReactNode;
}) {
  const colors = useLetterColors(letters.length, initial);
  const { themeId, activeColors, letterColors } = colors;

  // Reportar el snapshot al padre SOLO en cambios reales (tema, orden barajado u
  // overrides por ficha): depende de las piezas de estado del hook (estables entre
  // renders ajenos), no de un objeto snapshot armado por render — crearía un bucle
  // de setState padre → re-render → effect.
  useEffect(() => {
    onSnapshot(unit, { themeId, activeColors, letterColors });
  }, [unit, themeId, activeColors, letterColors, onSnapshot]);

  return <>{children(colors)}</>;
}
