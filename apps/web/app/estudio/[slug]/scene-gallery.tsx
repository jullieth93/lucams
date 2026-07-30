"use client";

/*
 * SceneGallery — galería inmersiva "míralo en tu espacio" (ADR-063 · FOTO4).
 * En vez de una barra con muchos botones (que se desborda en móvil), UN solo modal reúne las
 * escenas del hogar y el cliente cambia con chips.
 *
 * 2026-07-22 (ola 2B) — escenas POR TIPO DE PRODUCTO (`kind`):
 *  - "photo" (fotoimanes/polaroid, default): 🧊 Nevera · 📸 Polaroid · 🖼️ Mural (corcho) ·
 *    📚 Repisa · 🎁 Regalo — la galería original FOTO4.
 *    La escena 📸 Polaroid SOLO se ofrece cuando `isPolaroid` es true
 *    (product.slug o plantilla indica producto Polaroid); para los demás
 *    fotoimanes se oculta.
 *  - "calendar" (set 12 tarjetas mes 7.5×10): 🧊 Nevera · 🖼️ Mural — las tarjetas mes son
 *    IMANES DE NEVERA. La escena calendario-de-pared queda ARCHIVADA (sigue en
 *    calendar-view-3d.tsx y en el preview interno, pero ya no se ofrece en la galería).
 *  - "letters" (abecedario / pack vocales): 📌 Tablero memo — la escena que Lucy pidió para
 *    deletrear nombres y fichas.
 *  - "bookmark" (separadores): 📖 Libro — no son imanes de nevera; su hogar es un libro.
 *
 * El caller (studio-editor) decide el `kind` según el personalizationKind del producto. Si no
 * llega, se asume "photo" (comportamiento retrocompatible).
 *
 * 2026-07-22 (ola 2C) — detalle 1-a-1 del calendario: con kind="calendar" aparece el botón
 * "Ver en detalle" y se abre CalendarCardFocus (UNA tarjeta grande para leer mes y festivos,
 * con ← → para recorrerlas de la 1 a la 12). Es un overlay DENTRO de este modal: mientras está
 * activo, la galería pausa su useDialogA11y (Esc/trap/foco pasan al visor) y al salir se
 * retoma — Esc nunca cierra los dos niveles de golpe.
 *
 * 2026-07-22 (ola 3 — Lucy: "detalle primero, espacio después") — el flujo del calendario se
 * INVIERTE: con kind="calendar" este modal ABRE en el visor de detalle ("Tarjeta 1 de 12") y la
 * galería queda UN NIVEL ARRIBA: se entra con "Míralo en tu espacio" (en el visor) y se regresa
 * con "Volver al detalle" (acá). Esc baja un nivel por vez: detalle → cierra el modal; galería
 * → vuelve al detalle de donde vino (la tarjeta que se estaba leyendo se conserva). La galería
 * pausa su useDialogA11y mientras el visor está activo → cero trap anidado.
 *
 * Las texturas por imán (recortadas a su silueta) se calculan UNA vez en el editor y se pasan acá;
 * las escenas 3D las usan directo y los compositores 2D se arman perezosamente al abrir su chip y
 * se cachean. Las vistas 3D se importan diferidas (WebGL, client-only). `sizeCm` (tamaño real de
 * la variante) se reenvía a las escenas 3D para que las piezas escalen a su tamaño físico.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { X, ZoomIn } from "lucide-react";
import { useDialogA11y } from "./use-dialog-a11y";
import type { Magnet3D } from "./fridge-3d-view";
import { composeGiftFlatlay } from "./lib/compose-gift-flatlay";
import { composeShelfFlatlay } from "./lib/compose-shelf-flatlay";
import { useIsTouch } from "./use-is-touch";
import { useStudioTexts } from "./studio-texts-provider";

// Roadmap B1 — los "Cargando … 3D…" de los dynamic imports son texto CMS
// (estudio.escenas.loading-*); sin provider caen al default exacto pre-CMS.
function SceneLoading({
  textKey,
}: {
  textKey: "loadingNevera" | "loadingTablero" | "loadingPolaroid" | "loadingLibro";
}) {
  const texts = useStudioTexts();
  return (
    <div className="text-brand-muted flex h-full items-center justify-center text-sm">
      {texts.escenas[textKey]}
    </div>
  );
}

const FridgeView3D = nextDynamic(() => import("./fridge-3d-view"), {
  ssr: false,
  loading: () => <SceneLoading textKey="loadingNevera" />,
});
const RoomBoardView3D = nextDynamic(() => import("./room-board-view-3d"), {
  ssr: false,
  loading: () => <SceneLoading textKey="loadingTablero" />,
});
const PolaroidView3D = nextDynamic(() => import("./polaroid-3d-view"), {
  ssr: false,
  loading: () => <SceneLoading textKey="loadingPolaroid" />,
});
const BookView3D = nextDynamic(() => import("./book-view-3d"), {
  ssr: false,
  loading: () => <SceneLoading textKey="loadingLibro" />,
});
// Ola 2C — visor de detalle tarjeta-a-tarjeta del calendario (WebGL, client-only).
const CalendarCardFocus = nextDynamic(() => import("./calendar-card-focus"), {
  ssr: false,
  loading: () => null,
});

/** Escena disponible en la galería (el calendario de pared NO está: queda archivado). */
export type Scene = "fridge" | "polaroid" | "board" | "memo" | "book" | "shelf" | "gift";

/** Tipo de producto que abre la galería (deriva del personalizationKind del producto). */
export type SceneKind = "photo" | "calendar" | "letters" | "bookmark";

// Emoji de cada escena. El LABEL es texto CMS (estudio.escenas.chip-*) y se resuelve
// dentro del componente via contexto (roadmap B1).
const SCENE_EMOJI: Record<Scene, string> = {
  fridge: "🧊",
  polaroid: "📸",
  board: "🖼️",
  memo: "📌",
  book: "📖",
  shelf: "📚",
  gift: "🎁",
};

const ALL_SCENES = Object.keys(SCENE_EMOJI) as Scene[];

/**
 * Escenas ofrecidas por tipo de producto (el calendario-de-pared NO se ofrece: archivado).
 * El orden importa: la primera es la que abre por defecto.
 */
export function scenesForKind(kind: SceneKind = "photo"): Scene[] {
  switch (kind) {
    case "calendar":
      // Las tarjetas mes 7.5×10 son imanes de nevera → nevera/tablero, nunca calendario de pared.
      return ["fridge", "board"];
    case "letters":
      // Abecedario / pack vocales: el tablero memo claro (deletrear nombres y fichas).
      return ["memo"];
    case "bookmark":
      // Los separadores no son imanes de nevera: su hogar es un libro.
      return ["book"];
    case "photo":
    default:
      return ["fridge", "polaroid", "board", "shelf", "gift"];
  }
}

/**
 * Filtra la escena Polaroid de la galería FOTO4 cuando el producto NO es Polaroid.
 * El producto se identifica por slug o por plantilla activa (ver studio-editor.tsx).
 */
export function filterPhotoScenes(scenes: Scene[], isPolaroid: boolean): Scene[] {
  if (isPolaroid) return scenes;
  return scenes.filter((s) => s !== "polaroid");
}

/** Vista del modal con kind="calendar" (ola 3): el detalle es la raíz, la galería va encima. */
export type CalendarModalView = "detail" | "gallery";

/**
 * Vista INICIAL del modal (ola 3 — "detalle primero, espacio después"): el calendario abre DE
 * UNA en el visor de detalle tarjeta-a-tarjeta; los demás productos abren en la galería de
 * escenas, como siempre. Sin tarjetas no hay detalle que mostrar → galería.
 */
export function initialModalView(kind: SceneKind, cardCount: number): CalendarModalView {
  return kind === "calendar" && cardCount > 0 ? "detail" : "gallery";
}

/**
 * Esc en la GALERÍA baja UN nivel: con calendario vuelve al detalle (de donde vino); con los
 * demás productos cierra el modal. (Esc en el detalle cierra el modal — lo maneja el visor.)
 */
export function galleryEscapeAction(
  kind: SceneKind,
  cardCount: number,
): "back-to-detail" | "close" {
  return kind === "calendar" && cardCount > 0 ? "back-to-detail" : "close";
}

export function SceneGallery({
  magnets,
  cols,
  kind = "photo",
  sizeCm,
  isPolaroid = false,
  onClose,
  /** Ola 10 — caras por unidad (separadores): para agrupar A/B en la vista 3D. */
  facesPerUnit,
}: {
  magnets: Magnet3D[];
  cols: number;
  /** Tipo de producto — decide qué escenas se ofrecen (ver scenesForKind). Default "photo". */
  kind?: SceneKind;
  /** sizeCm de la variante elegida (ej "6.5×6.5", "7.5×10") — escala física en las escenas 3D. */
  sizeCm?: string;
  /** La escena Polaroid solo se muestra para productos Polaroid (slug o plantilla). */
  isPolaroid?: boolean;
  onClose: () => void;
  /** Ola 10 — caras por unidad física (2 para separadores). */
  facesPerUnit?: number;
}) {
  const scenes = useMemo(
    () => filterPhotoScenes(scenesForKind(kind), isPolaroid),
    [kind, isPolaroid],
  );
  const [scene, setScene] = useState<Scene>(() => scenes[0]!);
  // Si el kind cambia con el modal abierto, la escena activa puede no existir en la nueva lista:
  // se deriva en render (sin efecto ni setState en cascada — react-hooks/set-state-in-effect).
  const activeScene = scenes.includes(scene) ? scene : scenes[0]!;
  const isTouch = useIsTouch(); // #9 — copy del gesto de zoom según táctil vs mouse.
  const texts = useStudioTexts();
  // Roadmap B1 — labels de las escenas desde el CMS (estudio.escenas.chip-*).
  const sceneLabels: Record<Scene, string> = {
    fridge: texts.escenas.chipNevera,
    polaroid: texts.escenas.chipPolaroid,
    board: texts.escenas.chipMural,
    memo: texts.escenas.chipTablero,
    book: texts.escenas.chipLibro,
    shelf: texts.escenas.chipRepisa,
    gift: texts.escenas.chipRegalo,
  };
  // Compositores 2D: se arman perezosamente al abrir su chip y se cachean.
  const [shelfUrl, setShelfUrl] = useState<string | null>(null);
  const [giftUrl, setGiftUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  // #18 — escenas cuyo compositor falló: mostramos un fallback claro en vez de un panel colgado.
  const [failed, setFailed] = useState<Record<Scene, boolean>>(
    () => Object.fromEntries(ALL_SCENES.map((s) => [s, false])) as Record<Scene, boolean>,
  );

  // Ola 3 — detalle PRIMERO del calendario: con kind="calendar" el modal abre en el visor
  // tarjeta-a-tarjeta y la galería queda un nivel arriba ("Míralo en tu espacio"). focusIndex
  // se conserva al ir y volver: la tarjeta que estabas leyendo sigue ahí al regresar.
  const [focusIndex, setFocusIndex] = useState(0);
  const [detailOpen, setDetailOpen] = useState(
    () => initialModalView(kind, magnets.length) === "detail",
  );
  // Callbacks ESTABLES (useCallback): si cambian de identidad en cada render, los useDialogA11y
  // se rearma y roban el foco al navegar tarjetas con teclado. El onClose del caller puede venir
  // inline (identidad nueva por render) → se estabiliza vía ref.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const closeModal = useCallback(() => onCloseRef.current(), []);
  const openGallery = useCallback(() => setDetailOpen(false), []);
  const backToDetail = useCallback(() => setDetailOpen(true), []);

  // #15 — foco inicial + trap + Escape + retorno de foco (centraliza el effect de Escape previo).
  // Con el visor de detalle abierto, la galería PAUSA su a11y: Esc/trap/foco pasan al visor y
  // al cerrarlo se retoma (Esc nunca cierra los dos niveles de golpe). Esc en la galería baja
  // UN nivel: calendario → vuelve al detalle; demás productos → cierra el modal.
  const onGalleryEscape = useCallback(() => {
    if (galleryEscapeAction(kind, magnets.length) === "back-to-detail") backToDetail();
    else closeModal();
  }, [kind, magnets.length, backToDetail, closeModal]);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose: onGalleryEscape, active: !detailOpen });

  // Armar el compositor 2D de la escena activa (una sola vez por escena).
  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      const need =
        (activeScene === "shelf" && shelfUrl === null) ||
        (activeScene === "gift" && giftUrl === null);
      if (!need) return;
      setBuilding(true);
      if (!cancelled) setFailed((f) => (f[activeScene] ? { ...f, [activeScene]: false } : f)); // #18 limpiar al reintentar
      try {
        if (activeScene === "shelf") {
          const url = await composeShelfFlatlay(magnets);
          if (!cancelled) setShelfUrl(url);
        } else if (activeScene === "gift") {
          const url = await composeGiftFlatlay(magnets);
          if (!cancelled) setGiftUrl(url);
        }
      } catch {
        // #18 — marcar la escena como fallida (fallback visible) en vez de dejarla colgada en carga.
        // No rompemos el editor: el cliente puede cambiar de escena o reintentar.
        if (!cancelled) setFailed((f) => ({ ...f, [activeScene]: true }));
      } finally {
        if (!cancelled) setBuilding(false);
      }
    };
    void build();
    return () => {
      cancelled = true;
    };
  }, [activeScene, magnets, shelfUrl, giftUrl]);

  const is3D =
    activeScene === "fridge" ||
    activeScene === "board" ||
    activeScene === "polaroid" ||
    activeScene === "memo" ||
    activeScene === "book";
  const flatUrl = activeScene === "shelf" ? shelfUrl : activeScene === "gift" ? giftUrl : null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={texts.escenas.galeriaAria}
      tabIndex={-1}
      className="bg-brand-purple-dark/85 fixed inset-0 z-50 flex flex-col backdrop-blur-sm outline-none"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
        <span className="font-display text-lg font-bold">{texts.escenas.titulo}</span>
        <div className="flex items-center gap-2">
          {/* Ola 3 — la galería es el nivel SUPERIOR del flujo del calendario: de acá se vuelve
            al detalle tarjeta-a-tarjeta (la tarjeta que se estaba leyendo se conserva). */}
          {kind === "calendar" && magnets.length > 0 && (
            <button
              type="button"
              onClick={backToDetail}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-bold text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
            >
              <ZoomIn className="h-4 w-4" aria-hidden />
              <span>{texts.escenas.volverDetalle}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={texts.comun.cerrar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Chips de escena — #22: botones de alternancia (aria-pressed), no tabs. Un role=tablist
        exige flechas + roving tabindex + tabpanel (WAI-ARIA APG); acá la interacción real es de
        toggle, así que group + aria-pressed evita la disonancia semántica. Con UNA sola escena
        disponible no hay nada que alternar → se oculta la fila. */}
      {scenes.length > 1 && (
        <div
          role="group"
          aria-label={texts.escenas.grupoAria}
          className="flex flex-wrap items-center justify-center gap-2 px-4 pb-2"
        >
          {scenes.map((key) => {
            const active = key === activeScene;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setScene(key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors focus:ring-2 focus:ring-white focus:outline-none ${
                  active
                    ? "text-brand-purple-dark bg-white shadow-md"
                    : "bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                <span aria-hidden>{SCENE_EMOJI[key]}</span>
                <span>{sceneLabels[key]}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="relative flex-1">
        {is3D ? (
          activeScene === "fridge" ? (
            <FridgeView3D magnets={magnets} cols={cols} sizeCm={sizeCm} />
          ) : activeScene === "polaroid" ? (
            <PolaroidView3D magnets={magnets} sizeCm={sizeCm} />
          ) : activeScene === "board" ? (
            <RoomBoardView3D magnets={magnets} cols={cols} style="cork" sizeCm={sizeCm} />
          ) : activeScene === "memo" ? (
            <RoomBoardView3D magnets={magnets} cols={cols} style="memo" sizeCm={sizeCm} />
          ) : (
            <BookView3D bookmarks={magnets} sizeCm={sizeCm} facesPerUnit={facesPerUnit} />
          )
        ) : building && !flatUrl ? (
          <div className="text-brand-cream/90 flex h-full items-center justify-center text-sm">
            {texts.escenas.armando}
          </div>
        ) : failed[activeScene] ? (
          <div className="text-brand-cream/90 flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
            <p>{texts.escenas.error}</p>
            <p className="text-brand-cream/70 text-xs">{texts.escenas.errorHint}</p>
          </div>
        ) : flatUrl ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-2 sm:p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={flatUrl}
              alt={
                activeScene === "gift"
                  ? "Tu diseño presentado como un regalo"
                  : "Tu diseño en una repisa"
              }
              className="max-h-[calc(100%-1rem)] max-w-[calc(100%-1rem)] rounded-2xl object-contain shadow-2xl"
            />
          </div>
        ) : null}

        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1.5 text-center text-xs text-white">
          {is3D
            ? isTouch
              ? texts.escenas.hintTouch
              : texts.escenas.hintMouse
            : texts.escenas.hintPlana}
        </p>
      </div>

      {/* Ola 3 — visor de detalle 1-a-1 (overlay dentro del modal): es la vista INICIAL del
        calendario; desde acá se sube a la galería con "Míralo en tu espacio" y se cierra todo
        con Esc/X. La galería pausa su a11y mientras está activo. */}
      {kind === "calendar" && detailOpen && magnets.length > 0 && (
        <CalendarCardFocus
          cards={magnets}
          index={focusIndex}
          onIndexChange={setFocusIndex}
          onClose={closeModal}
          onOpenGallery={openGallery}
        />
      )}
    </div>
  );
}
