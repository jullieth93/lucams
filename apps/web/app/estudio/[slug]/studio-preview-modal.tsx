"use client";

/*
 * StudioPreviewModal — Vista previa final pre-carrito (Lucy 2026-05-21).
 *
 * Después de click «Vista previa» en el Estudio (botón renombrado desde
 * «¡Listo!» — Lucy 2026-09-09), mostramos al cliente cómo va a verse su
 * pedido (grid de los N imanes compositado) ANTES de subir a Storage +
 * agregar al carrito.
 *
 * Beneficio UX:
 *   - Cliente confirma visualmente sin commit.
 *   - Si quiere ajustar, "Volver a editar" cierra modal y el editor queda
 *     intacto (cero pérdida de estado).
 *   - Si está conforme, "Sí, agregar al carrito" dispara el upload real.
 *
 * NO bloquea con backdrop modal — el editor sigue visible debajo para
 * que el cliente compare lo que está viendo arriba con lo que queda
 * por debajo.
 *
 * Zoom (2026-10-19): el compositado puede tener texto chico (tiras,
 * separadores, packs de 12) y antes NO había forma de acercar. Mismo lenguaje
 * del lightbox del carrito (components/design-preview-dialog.tsx), reusando la
 * matemática pura de components/preview-zoom.ts:
 *   · Rueda del mouse sobre la imagen: zoom anclado al cursor.
 *   · Pinch (2 dedos): zoom continuo; arrastre con zoom = pan.
 *   · Doble click / doble tap: alterna 100% ↔ 200%.
 *   · Botones −/%/+/reset (alternativa de teclado a los gestos, WCAG 2.5.1).
 * El zoom se RESTABLECE al cambiar de página del pager; con zoom activo el
 * swipe horizontal NO cambia de unidad (es pan) y el pinch no dispara el swipe.
 */

import {
  Loader2,
  Pencil,
  Sparkles,
  ShoppingCart,
  AlertTriangle,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_TOGGLE,
  clampPanOffset,
  clampPreviewZoom,
  pinchPreviewZoom,
  stepPreviewZoom,
  wheelPreviewZoom,
  zoomPanTowardPoint,
} from "@/components/preview-zoom";
import { formatCOP } from "@/lib/format";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText, splitStudioText } from "./studio-texts";
import type { SlotNoun } from "./lib/slot-noun";
import type { StudioQualityWarning } from "./types";

/**
 * Intercala un valor dinámico en <strong> dentro de un texto CMS (ej. la medida
 * física en las descripciones de confirmación). Si el texto editado ya no trae
 * el placeholder, se interpola plano (degradación segura, sin strong).
 */
function StrongVar({
  template,
  varName,
  value,
}: {
  template: string;
  varName: string;
  value: string;
}) {
  const parts = splitStudioText(template, varName);
  if (!parts) return <>{fillStudioText(template, { [varName]: value })}</>;
  return (
    <>
      {parts[0]}
      <strong>{value}</strong>
      {parts[1]}
    </>
  );
}

/** Umbral (px) del swipe horizontal para pasar de unidad en el pager. */
const PAGER_SWIPE_MIN_PX = 40;

// ──────────────────────────────────────────────────────────────────
//  Zoom del preview (2026-10-19) — espejo del lightbox del carrito
//  (design-preview-dialog) sobre la matemática pura de preview-zoom.ts
// ──────────────────────────────────────────────────────────────────

type PreviewZoomState = { scale: number; x: number; y: number };
const PREVIEW_ZOOM_RESET: PreviewZoomState = { scale: 1, x: 0, y: 0 };

/** Distancia entre dos punteros activos (gesto pinch). */
function previewPointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Controles de zoom −/%/+/reset: alternativa de TECLADO y de un solo puntero a
 * los gestos (WCAG 2.5.1). Los textos salen del CMS (estudio.exportar.zoom-*).
 */
function PreviewZoomControls({
  zoom,
  onStep,
  onReset,
}: {
  zoom: PreviewZoomState;
  onStep: (direction: 1 | -1) => void;
  onReset: () => void;
}) {
  const texts = useStudioTexts();
  const zoomed = zoom.scale > PREVIEW_ZOOM_MIN;
  const btnClass =
    "border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 focus-visible:ring-brand-turquoise inline-flex h-9 w-9 items-center justify-center rounded-full border-2 bg-white transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40";
  return (
    <div className="mt-2 flex items-center justify-center gap-2">
      <button
        type="button"
        aria-label={texts.exportar.zoomAlejarAria}
        disabled={zoom.scale <= PREVIEW_ZOOM_MIN}
        onClick={() => onStep(-1)}
        className={btnClass}
      >
        <ZoomOut className="h-4 w-4" aria-hidden />
      </button>
      <span
        className="text-brand-purple-dark/70 w-12 text-center text-xs font-medium tabular-nums"
        aria-live="polite"
      >
        {Math.round(zoom.scale * 100)}%
      </span>
      <button
        type="button"
        aria-label={texts.exportar.zoomAcercarAria}
        disabled={zoom.scale >= PREVIEW_ZOOM_MAX}
        onClick={() => onStep(1)}
        className={btnClass}
      >
        <ZoomIn className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={texts.exportar.zoomRestablecerAria}
        disabled={!zoomed}
        onClick={onReset}
        className={btnClass}
      >
        <RotateCcw className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Imagen del preview CON zoom (2026-10-19) — rueda del mouse anclada al cursor,
 * pinch (2 dedos), doble click/doble tap (100%↔200%), arrastre = pan con zoom
 * activo y botones −/%/+/reset. Componente AUTOSUFICIENTE (toda la lógica
 * inline, espejo del lightbox components/design-preview-dialog.tsx sobre la
 * matemática pura de preview-zoom.ts): el estado vive acá, así que REMONTARLO
 * restablece el zoom — el pager lo monta con key={índice de página} y el zoom
 * se resetea solo al cambiar de unidad.
 *
 * `onZoomedChange` reporta si hay zoom activo: el pager lo usa para que el
 * swipe horizontal NO cambie de página cuando el arrastre es pan (y el pinch
 * nunca pagina — ver la guardia multi-touch del pager).
 */
function ZoomablePreviewImage({
  src,
  alt,
  onZoomedChange,
}: {
  src: string;
  alt: string;
  onZoomedChange?: (zoomed: boolean) => void;
}) {
  const [zoom, setZoom] = useState<PreviewZoomState>(PREVIEW_ZOOM_RESET);
  // true mientras hay un puntero presionado: apaga la transición CSS para que
  // el pan/pinch siga al dedo sin lag.
  const [gesturing, setGesturing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );
  // Doble tap (táctil): timestamp + posición del último tap simple.
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  // Tras un doble tap táctil el browser TAMBIÉN sintetiza `dblclick` (mouse de
  // compatibilidad): sin esta guardia el toggle correría dos veces y el zoom
  // quedaría en cero neto (bug verificado en Chromium móvil, 2026-10-22).
  const lastTouchToggleRef = useRef(0);

  const zoomed = zoom.scale > PREVIEW_ZOOM_MIN;

  // Reporte al host (el pager apaga su swipe con zoom activo). Va en effect:
  // setState del padre durante el render del hijo está prohibido.
  useEffect(() => {
    onZoomedChange?.(zoomed);
  }, [zoomed, onZoomedChange]);

  // Aplica escala + pan clampeados contra el tamaño base renderizado de la
  // imagen (offsetWidth/Height ignora el transform — es la caja sin zoom).
  const applyZoom = useCallback((scale: number, x: number, y: number) => {
    const nextScale = clampPreviewZoom(scale);
    if (nextScale === PREVIEW_ZOOM_MIN) {
      setZoom(PREVIEW_ZOOM_RESET);
      return;
    }
    const baseW = imgRef.current?.offsetWidth ?? 0;
    const baseH = imgRef.current?.offsetHeight ?? 0;
    setZoom({
      scale: nextScale,
      x: clampPanOffset(x, nextScale, baseW),
      y: clampPanOffset(y, nextScale, baseH),
    });
  }, []);

  // Espejo del estado para el listener NATIVO de rueda (se adjunta una sola
  // vez; sin el ref leería una escala stale del primer render).
  const zoomRef = useRef<PreviewZoomState>(PREVIEW_ZOOM_RESET);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Rueda del mouse sobre la imagen = zoom anclado al cursor (listener nativo
  // NO pasivo: el onWheel de React se registra pasivo en la raíz y el
  // preventDefault sería un no-op — mismo criterio del lightbox del carrito).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return; // scroll horizontal puro: no es gesto de zoom
      e.preventDefault();
      const current = zoomRef.current;
      const nextScale = wheelPreviewZoom(current.scale, e.deltaY);
      const img = imgRef.current;
      if (!img) {
        applyZoom(nextScale, current.x, current.y);
        return;
      }
      // Cursor relativo al centro de la imagen SIN transformar: al bounding
      // rect (ya trasladado/escalado) se le resta el pan actual.
      const rect = img.getBoundingClientRect();
      const pointX = e.clientX - (rect.left + rect.width / 2 - current.x);
      const pointY = e.clientY - (rect.top + rect.height / 2 - current.y);
      applyZoom(
        nextScale,
        zoomPanTowardPoint(current.x, pointX, current.scale, nextScale),
        zoomPanTowardPoint(current.y, pointY, current.scale, nextScale),
      );
    };
    viewer.addEventListener("wheel", onWheel, { passive: false });
    return () => viewer.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  const toggleZoom = useCallback(() => {
    setZoom((z) => {
      const next = z.scale === PREVIEW_ZOOM_MIN ? PREVIEW_ZOOM_TOGGLE : PREVIEW_ZOOM_MIN;
      if (next === PREVIEW_ZOOM_MIN) return PREVIEW_ZOOM_RESET;
      const baseW = imgRef.current?.offsetWidth ?? 0;
      const baseH = imgRef.current?.offsetHeight ?? 0;
      return {
        scale: next,
        x: clampPanOffset(z.x, next, baseW),
        y: clampPanOffset(z.y, next, baseH),
      };
    });
  }, []);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // jsdom no implementa pointer capture (los tests de gestos van por los
    // botones/rueda/doble click); en browser retiene el arrastre.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop en jsdom */
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGesturing(true);
    const points = [...pointersRef.current.values()];
    if (points.length === 2) {
      // Inicia pinch: congela la escala actual como base del ratio.
      pinchRef.current = {
        dist: previewPointerDistance(points[0]!, points[1]!),
        scale: zoom.scale,
      };
      panRef.current = null;
      lastTapRef.current = null;
    } else if (points.length === 1) {
      panRef.current = { startX: e.clientX, startY: e.clientY, baseX: zoom.x, baseY: zoom.y };
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length === 2 && pinchRef.current) {
      applyZoom(
        pinchPreviewZoom(
          pinchRef.current.scale,
          pinchRef.current.dist,
          previewPointerDistance(points[0]!, points[1]!),
        ),
        zoom.x,
        zoom.y,
      );
    } else if (points.length === 1 && panRef.current && zoom.scale > PREVIEW_ZOOM_MIN) {
      applyZoom(
        zoom.scale,
        panRef.current.baseX + (e.clientX - panRef.current.startX),
        panRef.current.baseY + (e.clientY - panRef.current.startY),
      );
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const wasPinch = pointersRef.current.size >= 2;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) setGesturing(false);
    pinchRef.current = null;

    if (wasPinch) {
      // Queda un dedo tras el pinch: re-inicia el pan desde su posición para
      // que la imagen no salte al seguir arrastrando.
      const [remaining] = [...pointersRef.current.entries()];
      if (remaining) {
        panRef.current = {
          startX: remaining[1].x,
          startY: remaining[1].y,
          baseX: zoom.x,
          baseY: zoom.y,
        };
      }
      lastTapRef.current = null;
      return;
    }

    // Doble tap: solo taps simples (sin arrastre) de puntero táctil. La
    // distancia se mide contra la posición REAL del pointerdown guardada en
    // panRef: el cache de pointers se actualiza con cada move, así que medir
    // contra él daría moved ≈ 0 siempre y un arrastre de pan contaría como tap.
    const downPos = panRef.current;
    if (e.pointerType === "touch" && downPos && pointersRef.current.size === 0) {
      const dx = e.clientX - downPos.startX;
      const dy = e.clientY - downPos.startY;
      const moved = Math.hypot(dx, dy);
      const now = Date.now();
      const last = lastTapRef.current;
      lastTapRef.current = moved < 12 ? { time: now, x: e.clientX, y: e.clientY } : null;
      if (moved < 12 && last && now - last.time < 350) {
        lastTapRef.current = null;
        lastTouchToggleRef.current = now;
        toggleZoom();
      }
    }
    if (pointersRef.current.size === 0) panRef.current = null;
  }

  // dblclick de MOUSE alterna el zoom; el dblclick sintetizado tras un doble
  // tap táctil se ignora (ya alternó vía pointerup — ver lastTouchToggleRef).
  const handleDoubleClick = useCallback(() => {
    if (Date.now() - lastTouchToggleRef.current < 500) return;
    toggleZoom();
  }, [toggleZoom]);

  return (
    <>
      {/* touch-none: los gestos (pinch/pan/doble tap) los manejan los pointer
          events de acá; sin esto el navegador secuestra el pinch. */}
      <div
        ref={viewerRef}
        className="touch-none overflow-hidden select-none"
        style={{ cursor: zoomed ? (gesturing ? "grabbing" : "grab") : "zoom-in" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- dataURL local del compositor; next/image no aporta optimización acá */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          className={
            "mx-auto max-h-[min(28rem,42dvh)] w-auto max-w-full object-contain drop-shadow-lg " +
            (gesturing ? "" : "transition-transform duration-150")
          }
          style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}
        />
      </div>
      <PreviewZoomControls
        zoom={zoom}
        onStep={(dir) => applyZoom(stepPreviewZoom(zoom.scale, dir), zoom.x, zoom.y)}
        onReset={() => setZoom(PREVIEW_ZOOM_RESET)}
      />
    </>
  );
}

/**
 * Fase 2 · item 2.2 (2026-10-07) — pager de la Vista Previa por unidad física:
 * UNA página por set/tira/separador/pack con flechas (desktop y táctil), dots
 * con target táctil grande (44px), swipe horizontal sobre la imagen y flechas
 * de teclado ←/→. El indicador ("Set 2 de 4") se anuncia con aria-live. La
 * navegación NO envuelve (tope en la primera/última unidad): el extremo deshabilita
 * su flecha, patrón más predecible que el carrusel infinito para una compra.
 *
 * PERF (2026-10-07) — páginas PEREZOSAS: `dataUrl: null` = la página de esa
 * unidad aún no se genera (el editor la arma por demanda, una por navegación,
 * en vez de TODAS en el click de «Vista previa» — ese era el long task del
 * botón). Al llegar a una página pendiente se dispara `onRequestPage(i)` y se
 * muestra un indicador de carga hasta que el editor la resuelve.
 */
function PreviewPagesPager({
  pages,
  altBase,
  onRequestPage,
  generation,
}: {
  pages: { dataUrl: string | null; label: string }[];
  altBase: string;
  onRequestPage?: (index: number) => void;
  /**
   * Señal de REGENERACIÓN del set de páginas (la incrementa el editor al
   * armar una vista previa NUEVA). El reset a la primera página solo corre
   * cuando cambia la generación: el array `pages` cambia de referencia cada
   * vez que una página perezosa se cachea (dataUrl null → resuelta) y ese
   * cambio NO debe devolver al cliente a la página 1 (bug 2026-10-12).
   */
  generation: number;
}) {
  const texts = useStudioTexts();
  const n = pages.length;
  const [index, setIndex] = useState(0);
  // 2026-10-19 — zoom de la página visible (ZoomablePreviewImage: rueda/pinch/
  // doble click/pan). La imagen se monta con key={generación}-{índice}: cambiar
  // de unidad o regenerar el set la REMONTA → el zoom se restablece solo.
  // `zoomed` lo reporta la imagen (onZoomedChange) para la guardia del swipe.
  const [zoomed, setZoomed] = useState(false);
  // Reinicia al primer set solo cuando se REGENERA la vista previa (patrón de
  // estado derivado: ajuste durante el render, no en un effect — regla
  // react-hooks/set-state-in-effect).
  const [prevGeneration, setPrevGeneration] = useState(generation);
  if (prevGeneration !== generation) {
    setPrevGeneration(generation);
    setIndex(0);
    setZoomed(false);
  }
  const i = Math.min(index, Math.max(0, n - 1));
  const page = pages[i]!;
  const go = useCallback(
    (delta: number) => {
      setIndex((cur) => Math.min(n - 1, Math.max(0, cur + delta)));
    },
    [n],
  );

  // Generación perezosa: pedir la página de la unidad visible si aún no existe.
  useEffect(() => {
    if (page.dataUrl === null) onRequestPage?.(i);
  }, [page.dataUrl, i, onRequestPage]);

  // Swipe táctil sobre la imagen: solo gestos claramente HORIZONTALES (un
  // desplazamiento vertical sigue scrolleando el diálogo).
  // 2026-10-19 — convive con el zoom: con zoom activo el arrastre es PAN (no
  // cambia de página) y un PINCH (2+ dedos) suprime el swipe hasta que todos
  // los dedos se levantan (sin la guardia, levantar los dedos del pinch se leía
  // como swipe horizontal y saltaba de unidad).
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipeSuppressedRef = useRef(false);

  const arrowClass =
    "text-brand-purple hover:bg-brand-purple/10 focus-visible:ring-brand-turquoise inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/90 shadow-md transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-30 disabled:hover:bg-white/90";

  return (
    <div
      className="border-brand-purple/15 from-brand-cream relative mt-3 overflow-hidden rounded-xl border bg-gradient-to-br to-white p-4 outline-none"
      tabIndex={0}
      role="group"
      aria-roledescription="carrusel"
      aria-label={page.label}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          go(1);
        }
      }}
      onTouchStart={(e) => {
        // Pinch en curso (2+ dedos) → este gesto NO es swipe de paginación.
        if (e.touches.length > 1) swipeSuppressedRef.current = true;
        const t = e.touches[0];
        if (t) touchStart.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        // Gesto multi-touch (pinch): se ignora hasta que TODOS los dedos se
        // levantan (levantar el penúltimo dedo no debe paginar).
        const remaining = e.touches?.length ?? 0;
        if (swipeSuppressedRef.current) {
          if (remaining === 0) swipeSuppressedRef.current = false;
          touchStart.current = null;
          return;
        }
        const start = touchStart.current;
        touchStart.current = null;
        // Con zoom activo el arrastre horizontal es PAN de la imagen, no swipe.
        if (!start || zoomed) return;
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) >= PAGER_SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
          go(dx < 0 ? 1 : -1);
        }
      }}
    >
      {/* Página perezosa: pendiente → indicador de carga mientras el editor
          la genera; resuelta → la imagen de la unidad CON ZOOM
          (ZoomablePreviewImage, key={generación}-{índice}: cambiar de unidad o
          regenerar la remonta → el zoom se restablece solo). */}
      {page.dataUrl !== null ? (
        <ZoomablePreviewImage
          key={`${generation}-${i}`}
          src={page.dataUrl}
          alt={`${altBase} — ${page.label}`}
          onZoomedChange={setZoomed}
        />
      ) : (
        <div
          className="flex h-[min(28rem,42dvh)] items-center justify-center gap-2"
          role="status"
          aria-label={texts.exportar.pagerCargandoPagina}
        >
          <Loader2 className="text-brand-purple h-6 w-6 animate-spin" aria-hidden />
          <span className="text-brand-muted text-sm">{texts.exportar.pagerCargandoPagina}</span>
        </div>
      )}
      {/* Flechas + indicador "Set 2 de 4" (aria-live para lector de pantalla). */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={i === 0}
          aria-label={texts.exportar.pagerAnteriorAria}
          className={arrowClass}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <p className="text-brand-purple-dark text-sm font-bold" aria-live="polite">
          {page.label}
        </p>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={i === n - 1}
          aria-label={texts.exportar.pagerSiguienteAria}
          className={arrowClass}
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {/* Dots: target táctil 44px (el área clicable crece con padding, no el dot). */}
      <div
        className="mt-1 flex items-center justify-center"
        role="tablist"
        aria-label={texts.exportar.pagerDotsAria}
      >
        {pages.map((p, k) => (
          <button
            key={p.label}
            type="button"
            role="tab"
            aria-selected={k === i}
            aria-label={p.label}
            onClick={() => {
              // Cambiar de unidad por dot remonta la imagen (key) → el zoom se
              // restablece solo; el estado reportado queda alineado de inmediato.
              setZoomed(false);
              setIndex(k);
            }}
            className="focus-visible:ring-brand-turquoise inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
          >
            <span
              aria-hidden
              className={[
                "rounded-full transition-all",
                k === i ? "bg-brand-purple h-2.5 w-6" : "bg-brand-purple/25 h-2.5 w-2.5",
              ].join(" ")}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

type StudioPreviewModalProps = {
  isOpen: boolean;
  previewUrl: string | null; // dataURL del grid compositado (client-side)
  /**
   * Fase 2 · item 2.2 (2026-10-07) — Vista Previa PAGINADA por unidad física
   * (set/tira/separador/pack): una composición por unidad a tamaño legible con
   * navegación (flechas + dots + swipe táctil). El `previewUrl` (montaje único)
   * sigue siendo el que se SUBE al confirmar — las páginas son solo UX de la
   * modal. null/undefined o 1 página → imagen única de siempre, sin pager.
   * `label` ya viene resuelto por el editor ("Set 2 de 4", texts.unidades.unidadDe).
   *
   * PERF (2026-10-07) — `dataUrl: null` = página PENDIENTE: el editor genera
   * cada página POR DEMANDA cuando el cliente navega a ella (onRequestPage),
   * con cache local por unidad; el pager muestra un indicador de carga mientras
   * tanto. Antes se generaban TODAS en el click de «Vista previa» (long task
   * Canvas2D en el main thread — el INP del botón).
   */
  pages?: { dataUrl: string | null; label: string }[] | null;
  /** Generación perezosa: el pager la invoca al llegar a una página pendiente. */
  onRequestPage?: (index: number) => void;
  /**
   * Contador de REGENERACIÓN de `pages` (lo incrementa el editor al armar una
   * vista previa nueva). El pager resetea a la primera página solo cuando
   * cambia — una página perezosa que se resuelve (mismo set, dataUrl null →
   * con data) NO resetea la navegación.
   */
  pagesGeneration?: number;
  productName: string;
  slotCount: number;
  /** Piezas por unidad (tiras: fotos por tira; calendario: páginas por set).
   *  Solo cuando productKind es "strips" o "calendar" multi-unidad. */
  slotsPerUnit?: number;
  /** Tamaño físico de cada imán (ej. "5×5 cm"). Lucy 2026-05-21 — mostrarlo
   *  para que el cliente sepa qué tamaño real va a recibir. */
  sizeCm?: string;
  unitPrice: number | null; // precio en centavos COP de la variant elegida
  /**
   * Multiplicador de precio del SERVIDOR (designUnitPriceMultiplier, mismo
   * cálculo del carrito: ceil(slotCount / cubierto-por-variante)). Es lo que
   * multiplica al unitPrice en el total mostrado. CRÍTICO para packs donde la
   * variante YA es el pack (separadores: variante = 5 unidades → multiplicador
   * 1 aunque el diseño tenga 5 unidades; antes se multiplicaba por unitCount y
   * la modal mostraba 5× el precio real — bug 2026-09-22). undefined → cae al
   * comportamiento legacy (unitCount ?? copies).
   */
  priceMultiplier?: number;
  /**
   * Separadores PLANOS (noFold, Alargados): la pieza no se dobla → los textos
   * no hablan de "doblado". Solo tiene sentido con productKind="bookmarks".
   */
  noFold?: boolean;
  /**
   * Modelo MULTI-UNIDAD (owner 2026-09-09): unidades que contiene el DISEÑO
   * (cada una diseñada por separado en el Estudio). El total = unitario ×
   * unidades y el carrito recibe UNA línea con qty=1 (onConfirm recibe 1).
   * undefined → 1 (diseño de una unidad: total = unitario).
   */
  unitCount?: number;
  /**
   * 2026-10-12 — sustantivo de la UNIDAD del diseño para la línea
   * "{n} {sustantivo} — cada {uno} con su propio diseño" (antes "N unidades"
   * para todo). Lo resuelve el editor por producto (separador/set/tira/pack/
   * pieza); el plural y el género ("cada uno"/"cada una") salen del par.
   * undefined → "unidad/unidades" (texto histórico).
   */
  unitNoun?: SlotNoun;
  /**
   * LEGACY (superficie "nombre", editor hermano): copias IDÉNTICAS de la PDP
   * vía `?copies=N` — la modal las confirma como qty del carrito. Solo se usa
   * cuando `unitCount` no viene; el modelo nuevo prefiere `unitCount`.
   */
  initialCopies?: number;
  isFinalizing: boolean;
  errorMessage: string | null;
  /** #3 — tipo de producto: el calendario se describe en "páginas", no "imanes".
   *  Ola 3 — "bookmarks": separadores de libros (tiras 2 caras), concordancia propia.
   *  Multi-unidad (2026-09-09) — "strips": tiras photobooth (cada unidad es una
   *  tira continua de N fotos — antes se describían como "N imanes", incorrecto).
   *  "tiles": fichas SIN imán. Los sets de letras y el nombre tienen variantes "Con imán" y
   *  "Sin imán"; llamarle "imán" a la que no lo lleva es una afirmación falsa sobre el producto
   *  físico, hecha justo en la pantalla de confirmación (revisión 2026-07-25, Ley 1480 art. 23). */
  productKind?: "magnets" | "calendar" | "bookmarks" | "tiles" | "strips";
  /** Año del calendario (solo cuando productKind==="calendar"). */
  calendarYear?: number;
  /**
   * Paquete F (2026-10-02) — desglose de la variante/opciones vigentes
   * ("5×7 cm · Sin imán · Español", describeVariantAttributes).
   * Cada editor lo construye con su verdad EN VIVO (la variante re-resuelta,
   * el magnet del canvas) — nunca con el deep-link de la PDP, que puede haber
   * quedado viejo si el cliente cambió opciones en el Estudio.
   */
  variantLabel?: string;
  /**
   * Paquete C (2026-10-02) — fotos CON aviso de calidad que el diseño USA
   * (collectQualityWarnings: solo las asignadas a slots). Si la lista llega
   * con elementos, se muestra la sección "Calidad de tus fotos"; el cliente
   * DEBE marcar la aceptación solo si hay avisos con requiresAck (fase 2:
   * el aviso de brillo suave como único problema es informativo y no
   * bloquea). La aceptación viaja en onConfirm y la persiste el servidor en
   * Design.qualityAcknowledgedAt.
   * undefined/vacía → flujo idéntico al histórico (sin sección ni checkbox).
   */
  qualityWarnings?: StudioQualityWarning[];
  /**
   * ADR-131 (2026-10-13) — progreso REAL del render de imprenta en background
   * ("Preparando archivos de impresión… 12 de 36"), alimentado por el polling del
   * RenderJob mientras finalize + add-to-cart completan. null = sin dato aún (se
   * muestra solo el "Guardando…" del botón, como siempre).
   */
  renderProgressLabel?: string | null;
  onEdit: () => void;
  /** Recibe el qty para el carrito: 1 en el modelo multi-unidad (el diseño ya
   *  contiene las unidades); las copias de la PDP en el path legacy (nombre).
   *  `opts.qualityAcknowledged` = el cliente marcó la aceptación de calidad. */
  onConfirm: (copies: number, opts?: { qualityAcknowledged?: boolean }) => void;
};

export function StudioPreviewModal({
  isOpen,
  previewUrl,
  pages = null,
  onRequestPage,
  pagesGeneration = 0,
  productName,
  slotCount,
  slotsPerUnit,
  sizeCm,
  unitPrice,
  priceMultiplier,
  noFold = false,
  unitCount,
  unitNoun,
  initialCopies,
  isFinalizing,
  errorMessage,
  productKind = "magnets",
  calendarYear,
  variantLabel,
  qualityWarnings,
  renderProgressLabel,
  onEdit,
  onConfirm,
}: StudioPreviewModalProps) {
  const texts = useStudioTexts();

  // Paquete C (2026-10-02) — aceptación explícita de calidad: checkbox obligatorio
  // cuando el diseño usa fotos con aviso. La aceptación queda ligada al CONJUNTO
  // de avisos vigente (su clave): si el cliente vuelve a editar y cambian las fotos
  // con aviso, la aceptación anterior ya no aplica y tiene que marcarla de nuevo.
  // Fase 2 (2026-10-02) — solo los avisos con requiresAck exigen el checkbox:
  // el aviso de brillo SUAVE como único problema (look oscuro deliberado) se
  // muestra igual en la lista, pero es informativo y no bloquea el confirmar.
  const hasQualityWarnings = !!qualityWarnings && qualityWarnings.length > 0;
  const ackWarnings = (qualityWarnings ?? []).filter((w) => w.requiresAck);
  const ackRequired = ackWarnings.length > 0;
  const qualityWarningsKey = ackWarnings.map((w) => `${w.assetId}:${w.level}`).join(",");
  const [acceptedWarningsKey, setAcceptedWarningsKey] = useState<string | null>(null);
  const qualityAccepted = ackRequired && acceptedWarningsKey === qualityWarningsKey;

  // Modelo multi-unidad (2026-09-09): las unidades van DENTRO del diseño → el
  // carrito recibe qty=1. Path legacy (nombre): copias idénticas (qty 1..99).
  const units = Math.min(99, Math.max(1, Math.trunc(unitCount ?? 1) || 1));
  const isMultiUnit = units > 1;
  const copies = Math.min(99, Math.max(1, Math.trunc(initialCopies ?? 1) || 1));
  // Qty al confirmar: multi-unidad → 1; legacy → las copias de la PDP.
  const confirmQty = unitCount !== undefined ? 1 : copies;
  // Multiplicador del total mostrado: el del SERVIDOR cuando llega
  // (priceMultiplier — la variante puede YA ser el pack, p.ej. separadores:
  // 5 unidades a $12.500 el pack → ×1, no ×5); si no, unidades del diseño
  // (modelo nuevo) o copias (legacy).
  const serverMultiplier = Math.min(99, Math.max(1, Math.trunc(priceMultiplier ?? 1) || 1));
  const totalMultiplier =
    priceMultiplier !== undefined ? serverMultiplier : unitCount !== undefined ? units : copies;

  if (!previewUrl) return null;

  // #3 — el calendario habla de "páginas" (concordancia femenina: "las"/"Revísalas"); los imanes,
  // de "imanes". Ola 3 — los separadores hablan de "separadores" (cada uno con sus 2 caras).
  const isCalendar = productKind === "calendar";
  const isBookmarks = productKind === "bookmarks";
  const isStrips = productKind === "strips";
  // Cómo nombrar la pieza: con imán es un "imán"; sin él, una "ficha".
  const pieza = productKind === "tiles" ? texts.exportar.piezaFicha : texts.exportar.piezaIman;
  const piezas = productKind === "tiles" ? texts.exportar.piezaFichas : texts.exportar.piezaImanes;
  // Roadmap B1 — textos CMS (estudio.exportar.* / estudio.unidades.*): la concordancia de
  // género/número se resuelve acá y los textos llevan placeholders documentados.
  const perUnit = slotsPerUnit ?? slotCount;
  const descCalendar = isMultiUnit
    ? fillStudioText(texts.unidades.descCalendarios, {
        n: slotCount,
        m: perUnit,
        año: calendarYear ? ` ${calendarYear}` : "",
      })
    : fillStudioText(texts.exportar.descCalendario, {
        n: slotCount,
        año: calendarYear ? ` ${calendarYear}` : "",
      });
  const descMagnets =
    slotCount === 1
      ? fillStudioText(texts.exportar.descImanUno, { pieza })
      : fillStudioText(texts.exportar.descImanes, { n: slotCount, piezas });
  const descStrips =
    slotCount === 1
      ? fillStudioText(texts.unidades.descTiraUna, { m: perUnit })
      : fillStudioText(texts.unidades.descTiras, { n: slotCount, m: perUnit });
  const summaryLine = isCalendar
    ? isMultiUnit
      ? fillStudioText(texts.unidades.resumenCalendarios, { n: slotCount, m: perUnit })
      : fillStudioText(texts.exportar.resumenCalendario, { n: slotCount })
    : isBookmarks
      ? slotCount === 1
        ? fillStudioText(texts.exportar.resumenSeparadorUno, { n: slotCount })
        : fillStudioText(texts.exportar.resumenSeparadores, { n: slotCount })
      : isStrips
        ? slotCount === 1
          ? fillStudioText(texts.unidades.resumenTiraUna, { n: slotCount, m: perUnit })
          : fillStudioText(texts.unidades.resumenTiras, { n: slotCount, m: perUnit })
        : slotCount === 1
          ? fillStudioText(texts.exportar.resumenUno, {
              n: slotCount,
              pieza,
              o: pieza === texts.exportar.piezaFicha ? "a" : "o",
            })
          : fillStudioText(texts.exportar.resumenMuchos, {
              n: slotCount,
              piezas,
              os: piezas === texts.exportar.piezaFichas ? "as" : "os",
            });
  const summarySize = sizeCm
    ? isCalendar
      ? fillStudioText(texts.exportar.resumenTamano, { tamano: sizeCm })
      : fillStudioText(texts.exportar.resumenTamanoCada, { tamano: sizeCm })
    : null;
  // Alt de la imagen del preview (imagen única o base del alt de cada página
  // del pager — item 2.2: "{alt} — {Set 2 de 4}").
  const previewAlt = isCalendar
    ? `Vista previa de las ${slotCount} páginas de tu calendario${calendarYear ? ` ${calendarYear}` : ""}`
    : isBookmarks
      ? `Vista previa de ${slotCount} separadores desplegados con sus 2 caras`
      : isStrips
        ? `Vista previa de ${slotCount === 1 ? "tu tira" : `tus ${slotCount} tiras`} — cada una con ${perUnit} fotos`
        : `Vista previa de ${slotCount} imanes`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isFinalizing && onEdit()}>
      <DialogContent
        // Lucy 2026-09-03 — la modal desbordaba el viewport: imagen (hasta 448px) +
        // textos + resumen + stepper + CTAs superaban el alto en desktop de poca
        // altura y en móvil, y el contenido quedaba cortado SIN scroll. Ahora:
        //   - alto capado por dvh con scroll interno (overflow-y-auto) en todas las
        //     resoluciones — toda la solución queda deslizable;
        //   - en móvil (<sm) comportamiento tipo sheet: anclado abajo, ancho completo,
        //     max 92dvh, sin borde redondeado inferior;
        //   - en sm+ centrada como siempre, con el mismo tope de alto.
        // OJO: el ancho se sobreescribe con la variante prefijada `sm:max-w-2xl` —
        // la base del Dialog trae `sm:max-w-sm`, que por orden de cascada le ganaría
        // a un `max-w-2xl` sin prefijo (el dialog nunca llegaba a 2xl en desktop).
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-sm:top-auto max-sm:right-0 max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[92dvh] max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-2xl"
        // Si está finalizando, no permitimos cerrar (race condition con upload)
        onInteractOutside={(e) => {
          if (isFinalizing) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isFinalizing) e.preventDefault();
        }}
        showCloseButton={!isFinalizing}
      >
        <DialogTitle className="text-brand-purple-dark font-display flex items-center gap-2 text-xl font-bold">
          <Sparkles className="text-brand-pink h-5 w-5" />
          {isCalendar
            ? texts.exportar.tituloCalendario
            : isBookmarks
              ? texts.exportar.tituloSeparadores
              : texts.exportar.tituloPedido}
        </DialogTitle>
        <DialogDescription className="text-brand-purple-dark/70 text-sm">
          {isCalendar ? (
            <>
              {descCalendar}
              {sizeCm && (
                <>
                  {" "}
                  <StrongVar
                    template={texts.exportar.descCalendarioTamano}
                    varName="tamano"
                    value={sizeCm}
                  />
                </>
              )}{" "}
              {texts.exportar.descCalendarioRevisa}
            </>
          ) : isBookmarks ? (
            <>
              {fillStudioText(texts.exportar.descSeparadores, { n: slotCount })}
              {sizeCm && (
                <>
                  {" "}
                  {/* noFold (Alargados): la pieza es PLANA — sin "doblado". */}
                  <StrongVar
                    template={
                      noFold
                        ? texts.exportar.descSeparadoresTamanoPlano
                        : texts.exportar.descSeparadoresTamano
                    }
                    varName="tamano"
                    value={sizeCm}
                  />
                </>
              )}{" "}
              {texts.exportar.descRevisaMuchos}
            </>
          ) : isStrips ? (
            <>
              {descStrips}
              {sizeCm && (
                <>
                  {" "}
                  <StrongVar
                    template={fillStudioText(texts.exportar.descImanTamano, { pieza: "tira" })}
                    varName="tamano"
                    value={sizeCm}
                  />
                </>
              )}{" "}
              {texts.exportar.descRevisaMuchos}
            </>
          ) : (
            <>
              {descMagnets}
              {sizeCm && (
                <>
                  {" "}
                  {/* El texto trae DOS placeholders ({pieza} y {tamano}): se rellena
                      pieza plano primero y StrongVar interpola tamano con <strong>. */}
                  <StrongVar
                    template={fillStudioText(texts.exportar.descImanTamano, { pieza })}
                    varName="tamano"
                    value={sizeCm}
                  />
                </>
              )}{" "}
              {slotCount === 1 ? texts.exportar.descRevisaUno : texts.exportar.descRevisaMuchos}
            </>
          )}
        </DialogDescription>

        {/* Preview compositado del grid. La imagen usa su ASPECTO NATURAL
            (2026-09-22 — antes un contenedor aspect-square fijo letterboxeaba
            mal las tiras altas de separadores, que quedaban diminutas con
            aire lateral): se capa por ALTO de viewport (max-h en dvh) y por
            ancho del diálogo, así la imagen nunca se come el viewport en
            pantallas bajas y el resto del contenido sigue accesible con el
            scroll del diálogo.
            Item 2.2 (2026-10-07) — con varias unidades el preview se PAGINA
            (una página por set/tira/separador/pack a tamaño legible); con una
            sola unidad se muestra el montaje único de siempre. */}
        {pages && pages.length > 1 ? (
          <PreviewPagesPager
            pages={pages}
            altBase={previewAlt}
            onRequestPage={onRequestPage}
            generation={pagesGeneration}
          />
        ) : (
          <div className="border-brand-purple/15 from-brand-cream relative mt-3 overflow-hidden rounded-xl border bg-gradient-to-br to-white p-4">
            {/* 2026-10-19 — imagen única CON zoom (rueda/pinch/doble click), mismo
                lenguaje del pager y del lightbox del carrito. */}
            <ZoomablePreviewImage src={previewUrl} alt={previewAlt} />
          </div>
        )}

        {/* Resumen */}
        <div className="border-brand-purple/10 bg-brand-purple/[0.03] rounded-lg border p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-brand-purple-dark font-semibold">{productName}</p>
              {variantLabel && <p className="text-brand-muted text-xs">{variantLabel}</p>}
              <p className="text-brand-muted text-xs">
                {summaryLine}
                {summarySize && (
                  <>
                    {" · "}
                    <span className="text-brand-purple font-semibold">{summarySize}</span>
                  </>
                )}
              </p>
            </div>
            {unitPrice !== null && (
              <div className="text-right">
                {/* Total de la línea: unitario × unidades del diseño (modelo
                    multi-unidad; en el path legacy, × copias de la PDP) — el
                    MISMO cálculo que el servidor aplica en el carrito. */}
                <p className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
                  {formatCOP(unitPrice * totalMultiplier)}
                </p>
                {totalMultiplier > 1 && (
                  <p className="text-brand-muted text-xs tabular-nums">
                    {formatCOP(unitPrice)} c/u
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Unidades del DISEÑO (modelo multi-unidad 2026-09-09): el cliente ya
            las diseñó una a una — la línea del carrito es UNA (qty 1) y producción
            recibe TODAS las unidades. Path legacy (nombre): copias idénticas de la
            PDP como dato.
            QA owner 2026-09-25 — el carrito ya NO tiene stepper para líneas
            personalizadas: en la rama multi-unidad se eliminó la nota "Puedes
            ajustar la cantidad en el carrito" (falsa ahí; las unidades se cambian
            en el editor — el CTA «Volver a editar» está justo abajo). En la rama
            legacy la nota sigue, con texto actualizado (la cantidad se eligió en
            la PDP). */}
          {/* Unidades del DISEÑO (modelo multi-unidad 2026-09-09): el cliente ya
            las diseñó una a una — la línea del carrito es UNA (qty 1) y producción
            recibe TODAS las unidades. Path legacy (nombre): copias idénticas de la
            PDP como dato.
            2026-10-12 — la línea nombra la unidad CON SU SUSTANTIVO ("1 separador",
            "3 separadores", "2 packs"…), nunca más "N unidades", y se muestra
            TAMBIÉN con 1 unidad (singular). El sustantivo llega por prop
            `unitNoun` (lo resuelve el editor por producto); sin prop cae a
            "unidad/unidades" (texto histórico).
            QA owner 2026-09-25 — el carrito ya NO tiene stepper para líneas
            personalizadas: en la rama multi-unidad se eliminó la nota "Puedes
            ajustar la cantidad en el carrito" (falsa ahí; las unidades se cambian
            en el editor — el CTA «Volver a editar» está justo abajo). En la rama
            legacy la nota sigue, con texto actualizado (la cantidad se eligió en
            la PDP). */}
          {unitCount !== undefined ? (
            <div className="border-brand-purple/10 mt-3 border-t pt-3">
              <p className="text-brand-purple-dark text-sm font-semibold">
                {fillStudioText(texts.unidades.modalUnidades, {
                  n: units,
                  sustantivo:
                    units === 1 ? (unitNoun?.one ?? "unidad") : (unitNoun?.many ?? "unidades"),
                  // Sin prop, el sustantivo de respaldo es "unidad" (femenino);
                  // con prop, el flag feminine del par (undefined = masculino).
                  uno: (unitNoun ? (unitNoun.feminine ?? false) : true) ? "una" : "uno",
                })}
              </p>
            </div>
          ) : copies > 1 ? (
            <div className="border-brand-purple/10 mt-3 border-t pt-3">
              <p className="text-brand-purple-dark text-sm font-semibold">
                {fillStudioText(texts.exportar.copiasIdenticas, { n: copies })}
              </p>
              <p className="text-brand-muted text-xs">{texts.exportar.copiasAjusteCarrito}</p>
            </div>
          ) : null}
        </div>

        {/* Paquete C (2026-10-02) — sección "Calidad de tus fotos": solo cuando el
            diseño USA fotos con avisos de calidad. Lista cada foto con su mensaje
            y la recomendación específica del servidor, y exige la aceptación
            explícita (checkbox) antes de habilitar el confirmar.
            Fase 2 (2026-10-02) — el checkbox solo aparece cuando hay avisos que
            la exigen (requiresAck): si TODOS los avisos son de brillo suave
            (informativos), se muestra una nota y el confirmar queda habilitado. */}
        {hasQualityWarnings && (
          <section
            aria-labelledby="quality-ack-title"
            className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3"
          >
            <p
              id="quality-ack-title"
              className="flex items-center gap-1.5 text-sm font-bold text-amber-900"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {texts.exportar.calidadSeccionTitulo}
            </p>
            <p className="mt-1 text-xs text-amber-900/80">{texts.exportar.calidadSeccionIntro}</p>
            <ul className="mt-2 space-y-2">
              {qualityWarnings.map((w) => (
                <li
                  key={w.assetId}
                  className="flex items-start gap-2 rounded-md bg-white/70 p-2 ring-1 ring-amber-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL temporal del cliente */}
                  <img
                    src={w.canvasUrl ?? w.signedUrl}
                    alt=""
                    className={[
                      "h-12 w-12 shrink-0 rounded-md object-cover ring-1",
                      w.level === "warning-soft" ? "ring-amber-300" : "ring-red-300",
                    ].join(" ")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-brand-purple-dark text-xs leading-snug font-semibold">
                      {w.message}
                    </p>
                    {w.recommendation && (
                      <p className="text-brand-muted mt-0.5 text-xs leading-snug">
                        {w.recommendation}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {ackRequired ? (
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs font-semibold text-amber-950">
                <input
                  type="checkbox"
                  checked={qualityAccepted}
                  onChange={(e) =>
                    setAcceptedWarningsKey(e.target.checked ? qualityWarningsKey : null)
                  }
                  disabled={isFinalizing}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
                />
                <span>{texts.exportar.calidadAcepto}</span>
              </label>
            ) : (
              <p className="mt-3 text-xs font-semibold text-amber-900/80">
                {texts.exportar.calidadNotaInformativa}
              </p>
            )}
          </section>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* ADR-131 — progreso real del render de imprenta mientras el confirmar corre:
            el cliente NUNCA espera a ciegas (el "Guardando…" solo del botón era el
            síntoma del timeout del render síncrono). */}
        {isFinalizing && renderProgressLabel && (
          <p className="text-brand-muted flex items-center gap-1.5 text-xs" aria-live="polite">
            <Loader2 className="h-3 w-3 animate-spin" />
            {renderProgressLabel}
          </p>
        )}

        {/* Acciones */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          {/* Lucy 2026-09-09 — "Volver a editar" se vuelve BOTÓN SÓLIDO morado de
              marca (mismo lenguaje del botón «Salir» del toolbar): el outline suave
              se leía como texto secundario y el cliente no encontraba la salida de
              la modal. Animación sutil del design system: transition-all + sombra
              que crece en hover + leve compresión al presionar (active:scale).
              2026-10-02 — sin variant="outline": esa variante arrastra clases
              dark: (dark:bg-input/30, casi blanco) que twMerge no puede limpiar
              con el override morado; el botón ya define todo su estilo en
              className, así que usa la variante default. */}
          <Button
            type="button"
            size="lg"
            onClick={onEdit}
            disabled={isFinalizing}
            className="bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/20 hover:shadow-brand-purple/30 border-transparent text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
          >
            <Pencil className="mr-1.5 h-4 w-4" />
            {texts.exportar.volverEditar}
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={() =>
              onConfirm(confirmQty, {
                qualityAcknowledged: ackRequired && qualityAccepted,
              })
            }
            disabled={isFinalizing || (ackRequired && !qualityAccepted)}
            aria-busy={isFinalizing}
            className="bg-gradient-brand text-white hover:brightness-110"
          >
            {isFinalizing ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {texts.exportar.confirmarGuardando}
              </>
            ) : (
              <>
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                {texts.exportar.confirmarCta}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
