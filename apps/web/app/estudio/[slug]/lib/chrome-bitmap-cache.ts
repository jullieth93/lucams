"use client";

/*
 * Chrome bitmap cache (2026-10-22 — perfil CDP de entrada al Estudio):
 * el chrome de las plantillas Polaroid Clásica/Instagram es un SVG que CADA
 * slot cargaba con useImage y Konva re-rasterizaba en cada drawImage (los SVG
 * no quedan como bitmap entre draws: Chrome los rasteriza al tamaño destino
 * en cada llamada). Con 6 slots × redraws a dpr nativo era costo puro: todos
 * dibujan el MISMO chrome al MISMO tamaño.
 *
 * Acá el SVG se rasteriza UNA sola vez a un offscreen canvas a la resolución
 * efectiva del backing store (logical × Konva.pixelRatio, ya capeado a 2 en
 * lib/konva-pixel-ratio.ts) y se comparte entre todos los slots: dibujar un
 * canvas-bitmap es un blit barato. La clave incluye src+tamaño, así que todas
 * las unidades del mismo producto comparten UNA entrada (2 con la variante
 * dark de Instagram). Cache de sesión del módulo — los chrome por sesión se
 * cuentan con los dedos, no hace falta LRU.
 */

import { useEffect, useState } from "react";
import Konva from "konva";

const cache = new Map<string, Promise<HTMLCanvasElement>>();

function effectiveRatio(): number {
  if (typeof window === "undefined") return 1;
  return Konva.pixelRatio ?? window.devicePixelRatio ?? 1;
}

function rasterize(
  src: string,
  width: number,
  height: number,
): { key: string; promise: Promise<HTMLCanvasElement> } {
  const ratio = effectiveRatio();
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  const key = `${src}|${w}x${h}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      const img = new window.Image();
      // Mismo crossOrigin que useImage en AssetLayerRenderer: habilita
      // toDataURL del stage (snapshots/preview) sin taint.
      img.crossOrigin = "anonymous";
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      return canvas;
    })();
    cache.set(key, pending);
    // Un rechazo (red/caída) no debe envenenar el cache para siempre.
    pending.catch(() => cache.delete(key));
  }
  return { key, promise: pending };
}

/**
 * Bitmap compartido del chrome SVG (null mientras rasteriza — el caller no
 * dibuja nada, igual que el fallback de useImage). El estado se guarda con su
 * clave y se DERIVA: si src/tamaño cambian, el bitmap viejo simplemente no
 * coincide y se devuelve null (sin setState síncrono en el efecto).
 */
export function useChromeBitmap(
  src: string,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const [loaded, setLoaded] = useState<{ key: string; bmp: HTMLCanvasElement } | null>(null);
  const { key, promise } = src ? rasterize(src, width, height) : { key: "", promise: null };
  useEffect(() => {
    if (!promise) return;
    let alive = true;
    promise
      .then((bmp) => {
        if (alive) setLoaded({ key, bmp });
      })
      .catch(() => {
        // Sin chrome antes que chrome roto: el slot queda usable sin la capa.
      });
    return () => {
      alive = false;
    };
  }, [key, promise]);
  return loaded && loaded.key === key ? loaded.bmp : null;
}
