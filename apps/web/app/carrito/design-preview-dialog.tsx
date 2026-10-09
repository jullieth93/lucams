"use client";

/*
 * Botón "Ver" del carrito — lightbox con la vista previa del diseño
 * personalizado (Design.previewUrl, PNG público del bucket design-previews).
 *
 * La miniatura de la línea es pequeña (96px) y el cliente quiere revisar su
 * diseño en grande ANTES de pagar sin salir del carrito (QA owner 2026-09-25).
 * Radix Dialog (components/ui/dialog) ya trae foco atrapado, cierre por ESC y
 * por backdrop, y aria-modal — acá solo se compone.
 *
 * Zoom (2026-10-05): el PNG puede tener texto chico (tiras/separadores), así
 * que el lightbox permite acercar —
 *   · Doble click / doble tap: alterna 100% ↔ 200%.
 *   · Pinch (2 dedos): zoom continuo.
 *   · Rueda del mouse sobre la imagen: zoom anclado al cursor (2026-10-06).
 *   · Botones +/− (y reset) para teclado y clientes sin gestos.
 *   · Arrastre = pan cuando hay zoom (pointer events, clampa a la imagen).
 * La matemática (clamp de escala y pan) vive en ./preview-zoom.ts (puro, con
 * tests). El zoom se restablece al cerrar el diálogo.
 *
 * Es client component y NO puede leer el CMS: sus textos llegan resueltos por
 * props desde app/carrito/page.tsx (server), como <CmsText> por cada rótulo —
 * así el ratchet de cobertura de contenido los cuenta como cubiertos (mismo
 * patrón que label={<CmsText …/>} en app/pedido/[token]/page.tsx).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Eye, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
} from "./preview-zoom";

type ZoomState = { scale: number; x: number; y: number };

const ZOOM_RESET: ZoomState = { scale: 1, x: 0, y: 0 };

/** Distancia entre dos punteros activos (gesto pinch). */
function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function DesignPreviewDialog({
  previewUrl,
  productName,
  triggerLabel,
  title,
  description,
}: {
  previewUrl: string;
  productName: string;
  /** Rótulo del botón que abre el lightbox (CMS: cart.ver-diseno). */
  triggerLabel: ReactNode;
  /** Título del lightbox; el nombre del producto se concatena después (CMS: cart.vista-previa-diseno-titulo). */
  title: ReactNode;
  /** Descripción sr-only para lectores de pantalla (CMS: cart.vista-previa-diseno-desc). */
  description: ReactNode;
}) {
  const [zoom, setZoom] = useState<ZoomState>(ZOOM_RESET);
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

  // Aplica escala + pan clampeados contra el tamaño base renderizado de la
  // imagen (offsetWidth/Height ignora el transform — es la caja sin zoom).
  const applyZoom = useCallback((scale: number, x: number, y: number) => {
    const nextScale = clampPreviewZoom(scale);
    if (nextScale === PREVIEW_ZOOM_MIN) {
      setZoom(ZOOM_RESET);
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
  const zoomRef = useRef<ZoomState>(ZOOM_RESET);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Rueda del mouse sobre la imagen = zoom (2026-10-06, QA owner STG). Va con
  // listener nativo NO pasivo: el onWheel de React se registra pasivo en la
  // raíz y el preventDefault sería un no-op (la página scrollearía detrás del
  // diálogo). A diferencia del Estudio (studio-slot handleWheel, donde la
  // rueda sola NO zooomea para no atrapar el scroll de la página), acá la
  // rueda simple SÍ zooomea: el diálogo es modal y ocupa casi toda la
  // pantalla, así que el gesto no atrapa ningún scroll ajeno — y el scroll
  // interno del DialogContent sigue disponible con la rueda FUERA del visor.
  // El zoom se ancla a la posición del cursor (zoomPanTowardPoint); cuando el
  // pan llega a su límite clampeado, degrada suave hacia un zoom centrado.
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
      if (next === PREVIEW_ZOOM_MIN) return ZOOM_RESET;
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
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGesturing(true);
    const points = [...pointersRef.current.values()];
    if (points.length === 2) {
      // Inicia pinch: congela la escala actual como base del ratio.
      pinchRef.current = { dist: pointerDistance(points[0], points[1]), scale: zoom.scale };
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
          pointerDistance(points[0], points[1]),
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
      const moved = Math.hypot(e.clientX - downPos.startX, e.clientY - downPos.startY);
      const now = Date.now();
      const last = lastTapRef.current;
      lastTapRef.current = moved < 12 ? { time: now, x: e.clientX, y: e.clientY } : null;
      if (moved < 12 && last && now - last.time < 350) {
        lastTapRef.current = null;
        toggleZoom();
      }
    }
    if (pointersRef.current.size === 0) panRef.current = null;
  }

  const zoomed = zoom.scale > PREVIEW_ZOOM_MIN;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) setZoom(ZOOM_RESET);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 hover:text-brand-purple-dark"
        >
          <Eye aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      {/* El ancho se sobreescribe con la variante prefijada `sm:max-w-lg` — la
          base del Dialog trae `sm:max-w-sm`, que por orden de cascada le ganaría
          a un `max-w-lg` sin prefijo (mismo caso documentado en studio-preview-modal). */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogTitle className="text-brand-purple-dark font-display text-lg font-bold">
          {title} {productName}
        </DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {/* Aspecto NATURAL del PNG (no siempre es cuadrado — tiras/separadores
            son altos): se capa por ALTO de viewport y por ancho del diálogo,
            object-contain, sin letterboxing forzado. Mismo criterio que la
            vista previa del Estudio (2026-09-22).
            touch-action:none: los gestos (pinch/pan/doble tap) los manejan los
            pointer events de acá; sin esto el navegador secuestra el pinch. */}
        <div
          ref={viewerRef}
          className="border-brand-purple/15 from-brand-cream touch-none overflow-hidden rounded-xl border bg-gradient-to-br to-white p-4 select-none"
          style={{ cursor: zoomed ? (gesturing ? "grabbing" : "grab") : "zoom-in" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={toggleZoom}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- el PNG ya está renderizado a su tamaño final; next/image no aporta optimización acá y exigiría declarar un aspecto que no conocemos */}
          <img
            ref={imgRef}
            src={previewUrl}
            alt={`Vista previa de tu diseño de ${productName}`}
            draggable={false}
            className={
              "mx-auto max-h-[min(32rem,65dvh)] w-auto max-w-full object-contain drop-shadow-lg " +
              (gesturing ? "" : "transition-transform duration-150")
            }
            style={{
              transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
            }}
          />
        </div>
        {/* Controles de zoom: alternativa de teclado a los gestos (WCAG 2.5.1 —
            todo gesto de trayectoria/multipunto tiene alternativa de un puntero). */}
        <div className="flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Alejar la vista previa"
            disabled={zoom.scale <= PREVIEW_ZOOM_MIN}
            onClick={() => applyZoom(stepPreviewZoom(zoom.scale, -1), zoom.x, zoom.y)}
            className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10"
          >
            <ZoomOut aria-hidden="true" />
          </Button>
          <span
            className="text-brand-purple-dark/70 w-12 text-center text-xs font-medium tabular-nums"
            aria-live="polite"
          >
            {Math.round(zoom.scale * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Acercar la vista previa"
            disabled={zoom.scale >= PREVIEW_ZOOM_MAX}
            onClick={() => applyZoom(stepPreviewZoom(zoom.scale, 1), zoom.x, zoom.y)}
            className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10"
          >
            <ZoomIn aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Restablecer el zoom de la vista previa"
            disabled={!zoomed}
            onClick={() => setZoom(ZOOM_RESET)}
            className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
