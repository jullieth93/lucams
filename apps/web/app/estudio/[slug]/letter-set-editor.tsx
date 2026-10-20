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
 * Ola 2A (Lucy 2026-07-22) — el TEMA (default/animales/frutas/profesiones) ya NO
 * es variante de la PDP: se elige ACÁ en el Estudio. El tema preselecciona el LetterTileSet
 * correspondiente (los sets vacíos degradan a letra estándar — se ve tal cual se imprime).
 * Si la PDP traía tema en la variante, se PRESELECCIONA. Las vocales son las mismas
 * 5 letras en español e inglés.
 * 2026-10-12 — el IDIOMA vuelve a ser SOLO de la PDP: ya se eligió como variante antes
 * de entrar (llega en `initialLanguage`, resuelto de los atributos de la variante o del
 * diseño recuperado) y el selector DENTRO del estudio se eliminó (era una elección
 * duplicada PDP↔estudio). Al cambiar el tema se re-resuelve la variante exacta (mismo
 * tamaño/imantado/idioma) para que la cotización quede precisa.
 *
 * Vista previa pre-carrito (Lucy 2026-07-25) — antes este editor mandaba el set al carrito sin que
 * el cliente viera cómo iba a quedar. Ahora "Vista previa" (antes "¡Listo!", renombrado 2026-09-09)
 * solo DIBUJA el PNG del set y lo muestra en
 * StudioPreviewModal ("Así se verá tu pedido", el mismo componente del Estudio principal): el
 * diseño se crea, se finaliza y se agrega al carrito RECIÉN al confirmar. Si el cliente vuelve a
 * editar no queda nada creado en la base. El PNG que se ve es exactamente el que se sube como
 * archivo de producción — que es la promesa WYSIWYG de la tienda, no un adorno.
 *
 * 2026-10-19 (rediseño aprobado por el owner) — el ESTILO ilustrado y el BORDE dejan de ser
 * un estado global del diseño: cada set tiene su propio estilo/tema, colores y borde. El
 * estado por unidad vive en LetterSetUnitState (colores vía useLetterColors + styleId +
 * withBorder) y se persiste en metadata.units[u] (createLetterSetDesign); las claves raíz
 * (styleSetId/withBorder) quedan como representante del set 1 para retrocompatibilidad.
 * La Vista Previa se PAGINA por set (pages de StudioPreviewModal) y las mismas páginas se
 * suben tras el finalize (uploadDesignPreviewPagesAction) para el "Ver" paginado del carrito.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import nextDynamic from "next/dynamic";
import { Box, Copy, Loader2, Minus, Plus, X } from "lucide-react";
import type { LetterStyle, LetterTileMap } from "@/features/personalization/letter-tiles";
import {
  createLetterSetDesignAction,
  finalizeDesignAction,
  uploadDesignPreviewPagesAction,
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
import { describeVariantAttributes } from "@/features/products/variant-schemas";
import { StudioSimpleHeader } from "./studio-simple-header";
import { STUDIO_MAX_WIDTH } from "./studio-layout";
import { resolveLetterSetVariant, type LetterSetVariant } from "./lib/letter-set-resolve";
import { loadCanvasImage } from "./lib/canvas-image";
import type { Magnet3D } from "./fridge-3d-view";
import { buildLetterTileTextures, LETTER_TILE_CORNER_RATIO } from "./lib/letter-tile-textures";
import { NAME_TILE_THEMES } from "./letter-tile";
import { useDialogA11y } from "./use-dialog-a11y";
import { Hint } from "@/components/ui/tooltip";
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
  // 2026-09-25 — carga vía optimizador de Next (mismo origen, sin exigencia de
  // CORS del bucket) con fallback a la URL directa (lib/canvas-image).
  return loadCanvasImage(url);
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

/** Blob de una lámina → HTMLImageElement (vía objectURL, liberada al cargar). */
function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
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
  });
}

/**
 * 2026-10-19 — lámina de producción (PNG ×3, puede pasar de 2 MB con fichas
 * ilustradas) → página de preview LIGERA (WebP, borde largo ≤1600 px) para el
 * pager de la Vista Previa y para el "Ver" paginado del carrito
 * (uploadDesignPreviewPagesAction acepta ≤2 MB por página; si el WebP queda
 * grande se reintenta más chico). El archivo de PRODUCCIÓN sigue siendo el PNG
 * original — esto es solo exhibición.
 */
async function laminaToPreviewPageDataUrl(blob: Blob): Promise<string> {
  const img = await blobToImage(blob);
  for (const maxEdge of [1600, 1100]) {
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d no disponible");
    ctx.fillStyle = "#FFF8F0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/webp", 0.85);
    if (dataUrlToBlob(dataUrl).size <= 1_800_000) return dataUrl;
  }
  // Último intento igual se devuelve: la acción valida y degrada best-effort.
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d no disponible");
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/webp", 0.85);
}

/**
 * Multi-unidad (2026-09-09) — montaje de las láminas de TODOS los sets en UN PNG
 * para la vista previa de confirmación (el cliente ve exactamente lo que va a
 * recibir). Apiladas en vertical con el mismo fondo crema del compositor; la
 * línea del carrito/checkout muestra esta misma imagen.
 */
async function montageLaminaBlobs(blobs: Blob[]): Promise<string> {
  const imgs = await Promise.all(blobs.map(blobToImage));
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
  initialLanguage,
  themeOptions,
  initialTheme,
  stylesByLanguage,
  initialUnits,
  initialStyleId,
  initialUnitStyles,
  initialWithBorder,
  initialUnitBorders,
  initialColorTheme,
  initialUnitColors,
  replacesCartDesignId,
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
  /** Idioma del alfabeto — viene de la variante elegida en la PDP (o del diseño
   *  recuperado). 2026-10-12: ya NO se cambia dentro del estudio (selector
   *  eliminado por duplicado PDP↔estudio). */
  initialLanguage: "es" | "en";
  themeOptions: { es: ThemeOption[]; en: ThemeOption[] };
  /** Tema que venía en la variante de la PDP (preselección). null = "Solo letra". */
  initialTheme: string | null;
  stylesByLanguage: { es: LetterStyle[]; en: LetterStyle[] };
  /**
   * Modelo MULTI-UNIDAD (owner 2026-09-09): sets a DISEÑAR. El N inicial llega de
   * la PDP (`?copies=N` — nombre del parámetro conservado por compat) o del diseño
   * recuperado, y se puede cambiar ACÁ con el stepper "¿Cuántos sets quieres?"
   * (2026-10-12). Cada set lleva su propio estilo/tema, colores y borde
   * (2026-10-19 — antes solo los colores eran por set; tema/borde eran globales).
   * El idioma queda a nivel DISEÑO (llega fijo de la PDP). undefined → 1.
   * Tope MAX_LETTER_SET_UNITS.
   */
  initialUnits?: number;
  /** Al re-abrir (?designId=): estilo ilustrado persistido (metadata.styleSetId).
   *  null explícito = «Solo letra» (manda sobre la preselección de la PDP).
   *  2026-10-19 — aplica al set 1 y de default a los sets sin estilo propio
   *  (diseños guardados antes del estilo por set). */
  initialStyleId?: string | null;
  /** Al re-abrir (?designId=): estilo ilustrado POR SET (metadata.units[u].styleSetId,
   *  2026-10-19). undefined por posición = cae a initialStyleId/default. */
  initialUnitStyles?: (string | null | undefined)[];
  /** Al re-abrir (?designId=): opción «Con borde / Sin borde» persistida
   *  (metadata.withBorder). Ausente → con borde (default histórico).
   *  2026-10-19 — aplica al set 1 y de default a los sets sin borde propio. */
  initialWithBorder?: boolean;
  /** Al re-abrir (?designId=): borde POR SET (metadata.units[u].withBorder,
   *  2026-10-19). undefined por posición = cae a initialWithBorder/default. */
  initialUnitBorders?: (boolean | undefined)[];
  /** Al re-abrir (?designId=): tema de color persistido (metadata.frameTheme), para
   *  reconstruir los snapshots de color por set junto a initialUnitColors. */
  initialColorTheme?: string;
  /** Al re-abrir (?designId=): colores efectivos por ficha de CADA set
   *  (metadata.units[u].colors; el set 0 cae al `colors` raíz en diseños de un set).
   *  Se restauran tal cual (orden incluido). */
  initialUnitColors?: string[][];
  /** Edición desde el carrito: id del diseño original que la línea del carrito
   *  referencia hoy. Al confirmar se crea un diseño NUEVO y la línea vieja se
   *  REEMPLAZA en sitio (replaceDesignId en addPersonalizedToCart) — sin duplicar. */
  replacesCartDesignId?: string | null;
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
  // 2026-10-19 — Vista Previa PAGINADA por set: una página ligera (WebP) por
  // lámina, con su rótulo ("Set 1 de 2"). Las mismas páginas se suben tras el
  // finalize (uploadDesignPreviewPagesAction) para el "Ver" paginado del
  // carrito. `previewPagesGen` marca cada generación NUEVA (el pager resetea a
  // la primera página solo cuando cambia — contrato de StudioPreviewModal).
  const [previewPages, setPreviewPages] = useState<{ dataUrl: string; label: string }[] | null>(
    null,
  );
  const [previewPagesGen, setPreviewPagesGen] = useState(0);

  // ── Multi-unidad (2026-09-09) — N sets, cada uno con SU DISEÑO ──
  // Tope defensivo (cada set = 1 lámina de producción; validado también en el server).
  // 2026-10-12 — el N es ESTADO (stepper "¿Cuántos sets quieres?" en el panel):
  // se puede cambiar sin volver a la PDP; el precio (unitPriceCents × N), el
  // pager y la vista previa lo siguen en vivo.
  const [unitCount, setUnitCount] = useState(() =>
    Math.min(MAX_LETTER_SET_UNITS, Math.max(1, Math.trunc(initialUnits ?? 1) || 1)),
  );
  // Set visible en pantalla (pager "Set 1 de N") + tick para forzar remonte tras
  // "Aplicar este diseño a todas" (re-lee el snapshot clonado del Map).
  const [activeUnit, setActiveUnit] = useState(0);
  const [applyTick, setApplyTick] = useState(0);
  // Estilo/borde DEFAULT de un set sin snapshot propio (nunca visitado, o diseño
  // viejo sin claves por set): al re-abrir (?designId=) manda el persistido del
  // diseño (null explícito = «Solo letra»); si no, el tema de la variante de la
  // PDP, resuelto contra los sets del idioma inicial. El borde default es CON
  // borde (comportamiento histórico).
  const [defaultStyleId] = useState<string | null>(() => {
    if (initialStyleId !== undefined) return initialStyleId;
    if (!initialTheme) return null;
    const match = themeOptions[initialLanguage].find((o) => o.theme === initialTheme);
    return match?.id ?? null;
  });
  const [defaultWithBorder] = useState(initialWithBorder !== false);
  // Snapshots POR SET (2026-10-19 — estilo, colores y borde por unidad). El panel
  // del set activo reporta el suyo en cada cambio real (no en cada render); el
  // Map es la fuente para dibujar las láminas de TODOS los sets en la vista
  // previa y para la acción de crear. En estado (no ref): se lee en el render.
  // Al re-abrir (?designId=) el Map nace con lo persistido de cada set: colores
  // EFECTIVOS (activeColors = los hex guardados → effectiveColors sale idéntico,
  // índice a índice, sin depender del barajado aleatorio del tema), estilo y
  // borde de metadata.units[u] (cayendo a las claves raíz en diseños viejos).
  const [snapshots, setSnapshots] = useState<ReadonlyMap<number, LetterSetUnitSnapshot>>(() => {
    const map = new Map<number, LetterSetUnitSnapshot>();
    const count = Math.min(MAX_LETTER_SET_UNITS, Math.max(1, Math.trunc(initialUnits ?? 1) || 1));
    for (let u = 0; u < count; u++) {
      const entry: LetterSetUnitSnapshot = {};
      const colors = initialUnitColors?.[u];
      if (colors && colors.length > 0) {
        entry.colors = {
          themeId: initialColorTheme ?? NAME_TILE_THEMES[0].id,
          activeColors: colors,
          letterColors: {},
        };
      }
      const styleSeed =
        u < (initialUnitStyles?.length ?? 0)
          ? initialUnitStyles![u]
          : u === 0
            ? initialStyleId
            : undefined;
      if (styleSeed !== undefined) entry.styleId = styleSeed;
      const borderSeed =
        u < (initialUnitBorders?.length ?? 0)
          ? initialUnitBorders![u]
          : u === 0
            ? initialWithBorder
            : undefined;
      if (borderSeed !== undefined) entry.withBorder = borderSeed;
      if (entry.colors || entry.styleId !== undefined || entry.withBorder !== undefined) {
        map.set(u, entry);
      }
    }
    return map;
  });
  const recordSnapshot = useCallback((unit: number, snap: LetterSetUnitSnapshot) => {
    setSnapshots((prev) => {
      if (prev.get(unit) === snap) return prev;
      const next = new Map(prev);
      next.set(unit, snap);
      return next;
    });
  }, []);

  /**
   * Stepper de cantidad de sets (2026-10-12). Misma regla del stepper de
   * unidades del estudio de foto (store.setUnitCount): al REDUCIR se recortan
   * los sets del FINAL (sus snapshots de color se descartan) y al AUMENTAR los
   * sets nuevos nacen VACÍOS (sin snapshot → tema default, como un set nunca
   * visitado). Si el set visible queda por fuera, cae al último disponible.
   */
  function handleChangeUnitCount(next: number) {
    const target = Math.min(MAX_LETTER_SET_UNITS, Math.max(1, Math.trunc(next)));
    if (!Number.isFinite(target) || target === unitCount) return;
    if (target < unitCount) {
      setSnapshots((prev) => {
        const nextMap = new Map(prev);
        for (const key of nextMap.keys()) if (key >= target) nextMap.delete(key);
        return nextMap;
      });
      setActiveUnit((u) => Math.min(u, target - 1));
    }
    setUnitCount(target);
  }

  // Idioma del alfabeto: FIJO, llega de la variante elegida en la PDP (2026-10-12 —
  // el selector dentro del estudio se eliminó por duplicado PDP↔estudio; las vocales
  // son las mismas 5 letras en ambos idiomas).
  const language = initialLanguage;
  // 2026-10-19 — el estilo ilustrado (LetterTileSet.id, null = «Solo letra») y el
  // borde ya NO son estado global: viven POR SET en LetterSetUnitState y llegan al
  // padre vía el Map de snapshots (styleForUnit/borderForUnit, más abajo).
  // Variante efectiva (se re-resuelve al cambiar el tema del SET 1 — el
  // representante del diseño para la cotización; el idioma es fijo — llega de la
  // PDP, 2026-10-12).
  const [currentVariantId, setCurrentVariantId] = useState(variantId);

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
  // Fichas ilustradas de UN estilo (2026-10-19 — por set). Set incompleto para el
  // alfabeto activo → {} (degrada a letra estándar — se ve tal cual se imprime).
  const tilesForStyle = useCallback(
    (styleId: string | null): LetterTileMap => {
      if (!styleId) return {};
      const set = (stylesByLanguage[language] ?? []).find((s) => s.id === styleId);
      const option = optionsForLanguage.find((o) => o.id === styleId);
      if (!set || !option || !letters.every((l) => set.tiles[l])) return {};
      return set.tiles ?? {};
    },
    [stylesByLanguage, language, optionsForLanguage, letters],
  );

  const currentVariant = variants.find((v) => v.id === currentVariantId);
  // Centavos COP enteros: la etiqueta del editor y el precio de la modal salen del MISMO valor,
  // para que el cliente no vea un número distinto al confirmar.
  const unitPriceCents = currentVariant?.price ?? basePrice;
  const priceLabel = formatCOP(unitPriceCents * unitCount);

  // ── Estado POR SET (multi-unidad 2026-09-09; estilo/borde por set 2026-10-19) ──
  // El estado vive en el panel del set ACTIVO (abajo, LetterSetUnitState) y reporta su
  // snapshot al Map; acá solo se LEE por unidad para dibujar láminas, la vista 3D y la
  // creación del diseño. Sin snapshot (set no visitado todavía) cae al default — mismo
  // estado inicial de siempre (tema de color default, preselección de la PDP, con borde).
  const colorsForUnit = useCallback(
    (unit: number) => effectiveColorsFromSnapshot(letters.length, snapshots.get(unit)?.colors),
    [letters.length, snapshots],
  );
  const styleForUnit = useCallback(
    // OJO: el estilo explícito puede ser NULL («Solo letra») — no se puede usar
    // `?? defaultStyleId` porque null es nullish y caería al default (bug
    // encontrado en test 2026-10-19). undefined = sin clave → default.
    (unit: number) => {
      const styleId = snapshots.get(unit)?.styleId;
      return styleId !== undefined ? styleId : defaultStyleId;
    },
    [snapshots, defaultStyleId],
  );
  const borderForUnit = useCallback(
    (unit: number) => {
      const withBorder = snapshots.get(unit)?.withBorder;
      return withBorder !== undefined ? withBorder : defaultWithBorder;
    },
    [snapshots, defaultWithBorder],
  );
  const tilesForUnit = useCallback(
    (unit: number) => tilesForStyle(styleForUnit(unit)),
    [tilesForStyle, styleForUnit],
  );
  /** "Aplicar este diseño a todas": clona el diseño COMPLETO del set activo
   *  (estilo + colores + borde — 2026-10-19) a todos los sets. */
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
      // El 3D muestra el SET ACTIVO con SU estilo, colores y borde (2026-10-19).
      setBoard3D(
        await buildLetterTileTextures(
          letters,
          tilesForUnit(activeUnit),
          colorsForUnit(activeUnit),
          borderForUnit(activeUnit),
        ),
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

  /**
   * Cambio de tema de UN set (2026-10-19 — estilo POR SET): actualiza el estado
   * de la unidad. Si es el set 1 (representante del diseño para la cotización),
   * re-resuelve la variante (mismo tamaño/imán/idioma; el precio no cambia con
   * el tema en el catálogo actual — letter-set-resolve).
   */
  function handleSelectStyle(
    unitState: { setStyleId: (id: string | null) => void },
    unitIndex: number,
    nextId: string | null,
  ) {
    unitState.setStyleId(nextId);
    if (unitIndex !== 0) return;
    const themeKey = nextId
      ? (optionsForLanguage.find((o) => o.id === nextId)?.theme ?? null)
      : null;
    setCurrentVariantId((cur) =>
      resolveLetterSetVariant(variants, cur, { theme: themeKey, language }),
    );
  }

  /**
   * Paso 1 — "Vista previa": dibuja las láminas de TODOS los sets y abre la vista
   * previa (el cliente ve exactamente lo que va a recibir — modelo multi-unidad).
   * Cada lámina se dibuja con el estilo, los colores y el borde de SU set
   * (2026-10-19). No toca la red ni la base: si el cliente decide seguir editando,
   * no queda ningún diseño creado ni ningún archivo subido.
   * 2026-10-19 — con varios sets la modal PAGINA una lámina por set (pages de
   * StudioPreviewModal) en vez de mostrar solo el montaje apilado; las mismas
   * páginas ligeras se reusarán para el "Ver" paginado del carrito.
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
        const tiles = tilesForUnit(u);
        const colors = colorsForUnit(u);
        const border = borderForUnit(u);
        try {
          blobs.push(await renderLetterSetBlob(letters, tiles, colors, true, border));
        } catch {
          // Si alguna ficha ilustrada no carga, el set se dibuja con la letra de color: el cliente
          // ve —y aprueba— exactamente lo que se imprimiría en ese caso.
          blobs.push(await renderLetterSetBlob(letters, tiles, colors, false, border));
        }
      }
      setPreviewBlobs(blobs);
      // Con varios sets el preview global es el MONTAJE de todas las láminas
      // apiladas (preview limpio del diseño; lo usa el carrito como imagen de la
      // línea) y la modal PAGINA una página ligera por set; con uno, la lámina
      // misma (comportamiento histórico, sin pager).
      setPreviewDataUrl(
        blobs.length === 1 && blobs[0]
          ? await blobToDataUrl(blobs[0])
          : await montageLaminaBlobs(blobs),
      );
      if (blobs.length > 1) {
        setPreviewPages(
          await Promise.all(
            blobs.map(async (blob, u) => ({
              dataUrl: await laminaToPreviewPageDataUrl(blob),
              label: fillStudioText(texts.unidades.unidadDe, {
                nombre: texts.unidades.nombreSet,
                n: u + 1,
                total: blobs.length,
              }),
            })),
          ),
        );
        setPreviewPagesGen((g) => g + 1);
      } else {
        setPreviewPages(null);
      }
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
        // Tema/colores/estilo/borde del primer set (representante del diseño;
        // compat con clientes viejos que solo mandaban UN set y con lectores
        // que solo miran las claves raíz de metadata).
        frameTheme: snapshots.get(0)?.colors?.themeId ?? "arcoiris",
        colors: unitsColors[0],
        // Multi-unidad — TODOS los sets con SU diseño: colores por ficha +
        // estilo ilustrado + borde POR SET (2026-10-19). El server los valida
        // y los persiste en metadata.units; el precio ×N sale de ahí.
        units: unitsColors.map((colors, u) => ({
          colors,
          styleSetId: styleForUnit(u),
          withBorder: borderForUnit(u),
        })),
        unitCount,
        styleSetId: styleForUnit(0),
        language,
        withBorder: borderForUnit(0),
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
      // 2026-10-19 — páginas POR SET del preview para el "Ver" paginado del
      // carrito (antes solo el estudio de foto las subía: previewPagesCount
      // quedaba null y el carrito caía a la imagen única). Mismo patrón del
      // estudio de foto: request APARTE tras el finalize, BEST-EFFORT — un
      // fallo NO bloquea la compra (el carrito cae al preview global).
      if (previewPages && previewPages.length > 1) {
        try {
          const pagesForm = new FormData();
          pagesForm.set("designId", created.designId);
          previewPages.forEach((page, i) => {
            pagesForm.set(`page_${i}`, dataUrlToBlob(page.dataUrl), `set-${i + 1}.webp`);
          });
          await uploadDesignPreviewPagesAction(pagesForm);
        } catch (pagesErr) {
          console.error("[studio.letter-set.preview-pages]", pagesErr);
        }
      }
      const added = await addPersonalizedToCartAction({
        designId: created.designId,
        qty: 1,
        variantId: currentVariantId,
        // Edición desde el carrito: la línea vieja se reemplaza en sitio (no duplicar).
        replaceDesignId: replacesCartDesignId ?? undefined,
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
    setPreviewPages(null);
    setPreviewError(null);
  }

  // (2026-10-12 — el idioma NO se elige acá: llega de la variante de la PDP,
  // ver initialLanguage; el selector duplicado dentro del estudio se eliminó.)

  // Desglose de la variante VIGENTE (re-resuelta en vivo al cambiar tema):
  // imantado, idioma y tema. Lo comparten el header sticky (2026-10-12) y la
  // Vista Previa; el tamaño lo enuncia la propia modal (sizeCm) y no se duplica.
  const variantLabel = currentVariant
    ? describeVariantAttributes({
        magnet: currentVariant.magnet,
        language: currentVariant.language,
        theme: currentVariant.theme,
      }).join(" · ") || undefined
    : undefined;

  return (
    <>
      {/* Ola 32 — chrome unificado del Estudio: barra sticky con el idioma visual
          del StudioToolbar del estudio de foto (pill «Salir», avatar+nombre del
          producto, total en vivo + CTA «Ver diseño»). 2026-10-12 — este CTA es el
          ÚNICO «Ver diseño» del editor: el botón duplicado al pie del panel de
          controles se eliminó (misma acción, doble rótulo en pantalla). */}
      <StudioSimpleHeader
        productName={product.name}
        productSlug={product.slug}
        productImageUrl={productImageUrl}
        // 2026-10-12 — desglose de la variante bajo el nombre (el MISMO label
        // de la Vista Previa, vivo al cambiar tema/idioma).
        variantLabel={variantLabel}
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

        {/* Panel del set activo (estilo + colores + borde POR SET, 2026-10-19).
            key por (set, tick): al cambiar de set o tras "Aplicar a todas" se
            remonta leyendo el snapshot del Map.
            Ola 32 — el estado es UNO por set (useLetterColors + styleId +
            withBorder) pero sus piezas se reparten en las DOS columnas del
            layout: los controles van en la tarjeta lateral y la grilla de
            fichas ES el lienzo. */}
        <LetterSetUnitState
          key={`${activeUnit}-${applyTick}`}
          unit={activeUnit}
          letters={letters}
          initialColors={snapshots.get(activeUnit)?.colors}
          initialStyleId={styleForUnit(activeUnit)}
          initialWithBorder={borderForUnit(activeUnit)}
          onSnapshot={recordSnapshot}
        >
          {(unit) => {
            // Fase 1B (POR SET desde 2026-10-19) — la paleta de colores pinta el
            // BORDE de la ficha (temas con ilustración) pero también el RELLENO de
            // la letra cuando el set es «Solo letra» (drawLetterTile fillText).
            // Regla: la paleta solo se desactiva con «Sin borde» Y tema ilustrado
            // (ahí sí no hay nada que pintar); con «Solo letra» queda activa aun
            // sin borde (el color sigue pintando la letra).
            const colorsEnabled = unit.withBorder || unit.styleId === null;
            // Fichas ilustradas del estilo DE ESTE SET (vacío = letra estándar).
            const unitTiles = tilesForStyle(unit.styleId);
            return (
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
                {/* PREVIEW = el lienzo: tarjeta-unidad estándar del Estudio (mismo
              lenguaje que las tarjetas del estudio de foto). En móvil va DEBAJO
              de la tarjeta de controles (2026-10-05, owner: primero se elige
              Tema → Borde → Sets → Colores y luego se ve el lienzo; el idioma
              llega fijo de la PDP desde 2026-10-12); en lg
              columna fluida a la derecha. */}
                <section
                  aria-label={texts.letras.titulo}
                  className="order-2 min-w-0 lg:order-2 lg:flex-1"
                >
                  <div className="border-brand-purple/15 rounded-2xl border bg-white/70 p-2 shadow-sm sm:p-4">
                    {/* Preview del set (WYSIWYG) — cada ficha es seleccionable para pintarla
                  a gusto. Ola 28 (owner 2026-09-11, 1.7): con «Sin borde» no hay marco
                  de color que pintar → sin hint y fichas NO seleccionables (la paleta
                  ya quedó inerte).
                  Fase 1B — REDEFINIDA: el apagado solo aplica con tema ILUSTRADO
                  (unit.styleId !== null); con «Solo letra» el color pinta el RELLENO de la
                  letra aun sin borde, así que el pintado por ficha sigue activo
                  (colorsEnabled = unit.withBorder || unit.styleId === null).
                  Ola 32 — la grilla aprovecha el ancho del lienzo: sube columnas con
                  el viewport (el ancho mínimo de columna mantiene el tap target ≥44px). */}
                    <div className="bg-brand-cream/50 flex min-h-[280px] flex-col justify-center rounded-xl p-4 sm:min-h-[360px] sm:p-5">
                      {colorsEnabled && unit.selectedIndex === null && (
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
                          const tile = unitTiles[ch];
                          const color = unit.effectiveColors[i];
                          const isSel = colorsEnabled && unit.selectedIndex === i;
                          return (
                            <button
                              key={ch}
                              type="button"
                              data-letter-tile
                              onClick={() => colorsEnabled && unit.toggleSelected(i)}
                              disabled={!colorsEnabled}
                              aria-pressed={colorsEnabled ? isSel : undefined}
                              aria-label={fillStudioText(texts.letras.pintarAria, { letra: ch })}
                              className={`[container-type:inline-size] flex w-[calc((100%-24px)/3)] max-w-32 flex-col items-center rounded-xl transition sm:w-[calc((100%-48px)/4)] md:w-[calc((100%-64px)/5)] xl:w-[calc((100%-96px)/7)] 2xl:w-[calc((100%-112px)/8)] ${
                                isSel
                                  ? "ring-brand-purple scale-105 ring-2 ring-offset-2"
                                  : colorsEnabled
                                    ? "hover:scale-105"
                                    : "cursor-default"
                              }`}
                            >
                              {/* Ficha VERTICAL (aspect 5/6.5) — espeja el imán físico rectangular.
                            Sin borde: la ficha queda blanca a ras (el PNG y la textura 3D
                            hacen lo mismo).
                            2026-09-25 (QA owner): la letra era `text-base` FIJO (16px) —
                            en fichas de hasta 128px quedaba diminuta con mucho aire,
                            distinto del preview/3D. Ahora escala con la ficha vía
                            container query (50cqw = MISMA proporción letra/ficha del
                            compositor de producción y de la textura 3D: fontPx =
                            0.5 × ancho — letterTileMetrics/renderLetterSetBlob). El
                            container-type vive en el BOTÓN (mismo ancho que la ficha)
                            porque las unidades cqw se resuelven contra el ANCESTRO
                            contenedor, no contra el propio elemento.
                            2026-10-19 (WYSIWYG borde): el borde DOM era 2px fijos
                            (~1.6% del ancho) pero la textura 3D y el PNG de producción
                            usan 6·(w/120) = 5% del ancho (letterTileMetrics) — y la
                            impresión se ve como el 3D. Ahora el editor iguala esa
                            proporción: max(2px, 5cqw). */}
                              <div
                                className="flex aspect-[5/6.5] w-full items-center justify-center overflow-hidden rounded-xl bg-white"
                                style={{
                                  borderStyle: "solid",
                                  borderColor: unit.withBorder ? color : "transparent",
                                  borderWidth: "max(2px, 5cqw)",
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
                                    className="font-display leading-none font-extrabold select-none"
                                    style={{ color, fontSize: "50cqw" }}
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

                      {/* Paleta de la ficha seleccionada — control compartido.
                    Fase 1B: solo se apaga con «Sin borde» Y tema ilustrado; con
                    «Solo letra» el color pinta el relleno de la letra aun sin borde.
                    2026-10-19 (UX paleta contextual): antes quedaba debajo de TODA
                    la grilla — con las 27 fichas del abecedario quedaba varios
                    viewports abajo y el cliente no la encontraba. Ahora es una
                    barra STICKY pegada al borde inferior visible del lienzo
                    (sticky bottom dentro de la tarjeta): acompaña el scroll de la
                    grilla en móvil y desktop sin portales ni posicionamiento JS,
                    y se cierra con la X (o re-tocando la ficha). */}
                      {colorsEnabled &&
                        unit.selectedIndex !== null &&
                        letters[unit.selectedIndex] && (
                          <div className="sticky bottom-3 z-10 drop-shadow-lg">
                            <SwatchRow
                              letter={letters[unit.selectedIndex]}
                              currentColor={unit.effectiveColors[unit.selectedIndex]}
                              onPick={unit.setColorForSelected}
                              onClose={unit.clearSelected}
                            />
                          </div>
                        )}
                    </div>
                  </div>
                </section>

                {/* Controles: tarjeta blanca lateral en lg (idioma del StudioSidebar),
              ARRIBA del lienzo en móvil (2026-10-05: Tema → Borde → Sets →
              Colores se eligen antes de ver el lienzo; el idioma llega fijo de
              la PDP — 2026-10-12). */}
                <aside className="order-1 lg:order-1 lg:w-80 lg:shrink-0">
                  <div className="border-brand-purple/12 rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
                    {/* Stepper de cantidad de sets (2026-10-12) — cambiar N SIN volver
            a la PDP (antes venía fijo de ?copies=N). Mismo patrón visual del stepper
            del estudio de foto (StudioPhotoCountControl): grupo ring con −/+. Al
            reducir se recortan los sets del final; al aumentar nacen vacíos (tema
            default). Tope MAX_LETTER_SET_UNITS; el precio y el pager siguen a N.
            2026-10-19 (rediseño owner) — va PRIMERO: con estilo/colores/borde POR
            SET, lo primero es cuántos sets y en cuál se está trabajando. */}
                    <div>
                      <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
                        {texts.letras.setsTitulo}
                        <span className="text-brand-muted ml-2 text-xs font-normal">
                          {texts.letras.setsHint}
                        </span>
                      </p>
                      <div
                        role="group"
                        aria-label={texts.letras.setsGroupAria}
                        className="ring-brand-purple/15 inline-flex items-center rounded-lg bg-white ring-1"
                      >
                        <button
                          type="button"
                          aria-label={texts.letras.setsMenosAria}
                          disabled={unitCount <= 1}
                          onClick={() => handleChangeUnitCount(unitCount - 1)}
                          className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-9 w-9 cursor-pointer items-center justify-center rounded-l-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <Minus className="h-4 w-4" aria-hidden />
                        </button>
                        <span
                          aria-live="polite"
                          className="text-brand-purple-dark flex min-w-14 items-center justify-center text-center text-sm font-bold tabular-nums"
                        >
                          {fillStudioText(
                            unitCount === 1 ? texts.letras.setsValorUno : texts.letras.setsValor,
                            { n: unitCount },
                          )}
                        </span>
                        <button
                          type="button"
                          aria-label={texts.letras.setsMasAria}
                          disabled={unitCount >= MAX_LETTER_SET_UNITS}
                          onClick={() => handleChangeUnitCount(unitCount + 1)}
                          className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-9 w-9 cursor-pointer items-center justify-center rounded-r-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>

                    {/* Multi-unidad (2026-09-09) — pager de sets + "Aplicar este diseño a todas".
            2026-10-19 (rediseño owner): cada set lleva SU PROPIO estilo, colores y borde
            (antes solo los colores eran por set). El selector de set va ANTES de las
            opciones y con rótulo visible: debe quedar claro en qué set se está
            trabajando. Las láminas de TODOS los sets se ven en la Vista previa. */}
                    {unitCount > 1 && (
                      <div className="mt-5 flex flex-col items-start gap-3">
                        <p className="text-brand-purple-dark text-sm font-semibold">
                          {texts.letras.setPagerTitulo}
                          <span className="text-brand-muted ml-2 text-xs font-normal">
                            {texts.letras.setPagerHint}
                          </span>
                        </p>
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
                        <Hint content={texts.unidades.aplicarATodasTitle}>
                          <button
                            type="button"
                            onClick={handleApplyToAll}
                            aria-label={texts.unidades.aplicarATodasAria}
                            className="border-brand-purple/30 text-brand-purple-dark hover:border-brand-purple/60 hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-full border-2 bg-white px-4 py-2 text-xs font-bold transition active:scale-95"
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                            {texts.unidades.aplicarATodas}
                          </button>
                        </Hint>
                      </div>
                    )}

                    {/* Ola 2A — Selector de TEMA (antes dimensión de la PDP). Siempre visible: Default
            ("Solo letra") + un chip por set del idioma (vacíos degradan a letra estándar).
            2026-10-19 — el tema es POR SET: estos chips pintan el estilo del set
            ACTIVO (unit.styleId); cada set puede llevar un tema distinto. */}
                    <div className="mt-5">
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
                          aria-checked={unit.styleId === null}
                          onClick={() => handleSelectStyle(unit, activeUnit, null)}
                          className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${
                            unit.styleId === null
                              ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                              : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
                          }`}
                        >
                          <span aria-hidden="true">✏️</span>
                          {texts.letras.soloLetra}
                        </button>
                        {optionsForLanguage.map((o) => {
                          const active = o.id === unit.styleId;
                          return (
                            <button
                              key={o.id}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => handleSelectStyle(unit, activeUnit, o.id)}
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

                    {/* 2026-10-12 — el selector de IDIOMA dentro del estudio se eliminó
            (duplicado PDP↔estudio): el idioma llega fijo de la variante elegida en la
            página de producto (initialLanguage). */}

                    {/* Lucy 2026-09-05 — opción de diseño "Con borde / Sin borde" (mismo precio). Es una
            decisión de LIENZO que viaja en Design.metadata y se refleja en el PNG de producción,
            no una variante del catálogo. Default "Con borde": lo que siempre se imprimió.
            Lucy 2026-09-08 — el selector SIEMPRE queda habilitado (es la vía para reactivar
            los colores); "Sin borde" solo desactiva la sección de colores de abajo.
            2026-10-19 (rediseño owner): el borde es POR SET (antes nivel diseño) —
            cada set declara el suyo (metadata.units[u].withBorder). */}
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
                          aria-checked={unit.withBorder}
                          onClick={() => unit.setWithBorder(true)}
                          className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${
                            unit.withBorder
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
                          aria-checked={!unit.withBorder}
                          onClick={() => unit.setWithBorder(false)}
                          className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${
                            !unit.withBorder
                              ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                              : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
                          }`}
                        >
                          <span aria-hidden="true">⬜</span>
                          {texts.letras.bordeSin}
                        </button>
                      </div>
                    </div>

                    {/* Picker de tema de color del set activo (barajar al re-clic) — control
            compartido con Nombre. Lucy 2026-09-08 — con «Sin borde» las fichas no
            llevan el marco de color, así que la sección «Elige los colores» se
            DESACTIVA (visible + inerte, con el porqué). Al volver a «Con borde» se
            reactiva conservando la selección: el estado de colores (useLetterColors,
            vía LetterSetUnitState) nunca se resetea al desactivar.
            Fase 1B — el apagado SOLO aplica con tema ilustrado (unit.styleId !== null):
            con «Solo letra» el color pinta el RELLENO de la letra (fillText) aun sin
            borde, así que la sección permanece activa en ese caso.
            Ola 32 — la grilla de fichas que alimenta vive en el lienzo (tarjeta-unidad).
            2026-10-19 — colores, tema y borde son POR SET: esta sección edita el
            set activo del pager de arriba. */}
                    <ThemePicker
                      themeId={unit.themeId}
                      customized={unit.customized}
                      onApply={unit.applyTheme}
                      disabled={!colorsEnabled}
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
                      {/* 2026-10-12 — el CTA «Ver diseño» del panel se eliminó por DUPLICADO:
                        queda UNO solo, el del header sticky (StudioSimpleHeader, misma
                        acción y rótulo). El precio se conserva junto a los controles. */}
                      <span className="text-brand-muted text-sm font-semibold">{priceLabel}</span>
                    </div>
                  </div>
                </aside>
              </div>
            );
          }}
        </LetterSetUnitState>
      </div>

      {/* Vista previa pre-carrito (Lucy 2026-07-25) — "Así se verá tu pedido". El estado abierto
          lo manda el propio PNG: sin vista previa no hay nada que confirmar (y la modal ya se
          auto-oculta con previewUrl=null), así no hay dos banderas que puedan desincronizarse. */}
      <StudioPreviewModal
        isOpen={previewDataUrl !== null}
        previewUrl={previewDataUrl}
        // 2026-10-19 — Vista Previa PAGINADA por set (una página por lámina,
        // "Set 1 de 2"): antes el editor solo pasaba el montaje apilado y el
        // pager nunca aparecía (pages.length > 1 lo activa). Las páginas ya
        // vienen resueltas (se dibujan todas en «Ver diseño») → sin onRequestPage.
        pages={previewPages}
        pagesGeneration={previewPagesGen}
        productName={product.name}
        // Estos productos tienen variantes "Con imán" y "Sin imán" (la PDP las ofrece como
        // dimensión propia). Llamarle "imán" a la que no lo lleva es afirmar algo falso sobre el
        // producto físico, y justo en la pantalla de confirmación (revisión 2026-07-25).
        productKind={currentVariant?.magnet === false ? "tiles" : "magnets"}
        // El cliente cuenta FICHAS, no archivos: el set son N imanes ("los 27 imanes que vas a
        // recibir"). El slotCount=unitCount del finalize es otra cosa: las láminas de producción.
        slotCount={letters.length}
        // Tamaño real de la variante vigente (la que se re-resuelve al cambiar tema).
        // El atributo se guarda sin unidad ("5×7"); sin esto la modal decía "Cada imán mide 7×10.".
        sizeCm={currentVariant?.sizeCm ? `${currentVariant.sizeCm} cm` : undefined}
        // Paquete F (2026-10-02) — desglose de la variante VIGENTE (re-resuelta en
        // vivo al cambiar tema): imantado, idioma y tema. El tamaño ya lo
        // cubre sizeCm de arriba; no se duplica. Misma etiqueta del header (const
        // variantLabel, extraída 2026-10-12).
        variantLabel={variantLabel}
        unitPrice={unitPriceCents}
        // Multi-unidad (2026-09-09): el diseño contiene TODOS los sets → total =
        // precio del set × N y la línea del carrito es UNA (qty 1).
        unitCount={unitCount}
        // 2026-10-12 — sustantivo de la unidad para la línea de la modal
        // ("2 sets — cada uno con su propio diseño", nunca "N unidades"): el
        // MISMO del pager de sets (textos CMS unidades.nombreSet).
        unitNoun={{ one: texts.unidades.nombreSet.toLowerCase(), many: "sets" }}
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
//  Multi-unidad (2026-09-09) — estado COMPLETO de UN set
// ──────────────────────────────────────────────────────────────────

/**
 * Estado persistible de UN set (2026-10-19 — rediseño owner): además de los
 * colores por ficha (snapshot de useLetterColors), cada set lleva SU estilo
 * ilustrado (styleId, null = «Solo letra») y SU opción de borde. Los campos
 * ausentes caen a los defaults del editor (preselección PDP / valor recuperado
 * a nivel diseño — retrocompatible con diseños guardados antes del rediseño).
 */
type LetterSetUnitSnapshot = {
  colors?: LetterColorsSnapshot;
  styleId?: string | null;
  withBorder?: boolean;
};

/** Estado de UN set que el editor pinta/edita (hook de colores + estilo + borde). */
type LetterSetUnitRender = ReturnType<typeof useLetterColors> & {
  styleId: string | null;
  setStyleId: (id: string | null) => void;
  withBorder: boolean;
  setWithBorder: (value: boolean) => void;
};

/**
 * Estado de UN set del diseño multi-unidad. Ola 32: dejó de ser un "panel" con
 * markup propio para ser un wrapper de ESTADO con render-prop: el layout del
 * editor reparte las piezas en dos columnas (controles en la tarjeta lateral;
 * grilla de fichas como lienzo) pero el estado debe ser UNO por set — dos
 * instancias se desincronizarían (el tema barajado no sería el que pinta la
 * grilla).
 *
 * El estado de color vive en `useLetterColors` con snapshot exportable; el
 * estilo y el borde son estado local del wrapper (2026-10-19). El padre lo
 * persiste todo por set (al cambiar de pestaña se remonta con los `initial*`)
 * y lo clona a todas con "Aplicar este diseño a todas".
 *
 * `onSnapshot` se llama en CADA cambio real (tema de color, barajar, ficha
 * pintada, estilo, borde): el Map del padre siempre tiene el estado fresco de
 * este set para dibujar las láminas de la vista previa y crear el diseño.
 */
function LetterSetUnitState({
  unit,
  letters,
  initialColors,
  initialStyleId,
  initialWithBorder,
  onSnapshot,
  children,
}: {
  unit: number;
  letters: string[];
  initialColors?: LetterColorsSnapshot;
  /** Estilo ilustrado inicial del set (null explícito = «Solo letra»). */
  initialStyleId: string | null;
  initialWithBorder: boolean;
  onSnapshot: (unit: number, snap: LetterSetUnitSnapshot) => void;
  children: (unit: LetterSetUnitRender) => React.ReactNode;
}) {
  const colors = useLetterColors(letters.length, initialColors);
  const { themeId, activeColors, letterColors } = colors;
  const [styleId, setStyleId] = useState<string | null>(initialStyleId);
  const [withBorder, setWithBorder] = useState(initialWithBorder);

  // Reportar el snapshot al padre SOLO en cambios reales (tema, orden barajado,
  // overrides por ficha, estilo, borde): depende de las piezas de estado del
  // hook (estables entre renders ajenos), no de un objeto snapshot armado por
  // render — crearía un bucle de setState padre → re-render → effect.
  useEffect(() => {
    onSnapshot(unit, { colors: { themeId, activeColors, letterColors }, styleId, withBorder });
  }, [unit, themeId, activeColors, letterColors, styleId, withBorder, onSnapshot]);

  return <>{children({ ...colors, styleId, setStyleId, withBorder, setWithBorder })}</>;
}
