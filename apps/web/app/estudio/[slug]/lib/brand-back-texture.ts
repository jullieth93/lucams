/*
 * Textura del patrón de marca «Lucams» para la cara B por defecto en las
 * escenas 3D del Estudio (libro/separadores) — decisión owner 2026-11-03:
 * una cara B sin diseñar se ve (y se imprime) con el wordmark tileado, ya no
 * en blanco (supersede la regla de 2026-10-07 para separadores backOptional).
 *
 * El dibujo es el MISMO módulo puro de producción y de la Vista Previa
 * (features/personalization/brand-back-pattern.ts) sobre un canvas DOM —
 * WYSIWYG por construcción en las tres superficies. La fuente script se
 * resuelve/carga vía la CSS var `--font-dancing` del layout del Estudio
 * (ensureCalendarTitleFontLoaded — la misma vía del título del calendario).
 */

import { useEffect, useState } from "react";
import { drawBrandBackFace } from "@/features/personalization/brand-back-pattern";
import { ensureCalendarTitleFontLoaded } from "./calendar-card-preview";

/** Ancho base de la textura (px); el alto sale del aspecto real de la cara. */
const TEXTURE_W = 320;

const cache = new Map<string, Promise<string>>();

/** dataURL PNG del patrón, a la razón de aspecto EXACTA de la cara (w/h del stage). */
export function buildBrandBackTextureDataUrl(wRatio: number, hRatio: number): Promise<string> {
  const key = `${wRatio}x${hRatio}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const job = (async () => {
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_W;
    canvas.height = Math.max(1, Math.round((TEXTURE_W * hRatio) / Math.max(0.0001, wRatio)));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d no disponible");
    const family = await ensureCalendarTitleFontLoaded("dancing");
    drawBrandBackFace(ctx, canvas.width, canvas.height, family ?? undefined);
    return canvas.toDataURL("image/png");
  })();
  cache.set(key, job);
  return job;
}

/**
 * Hook React: la textura del patrón para una cara de aspecto wRatio:hRatio
 * (null mientras se genera — el caller pinta el blanco de respaldo ese instante,
 * igual que mientras decodifica una foto).
 */
export function useBrandBackTexture(
  wRatio: number | undefined,
  hRatio: number | undefined,
): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!wRatio || !hRatio) return;
    let alive = true;
    buildBrandBackTextureDataUrl(wRatio, hRatio)
      .then((url) => {
        if (alive) setDataUrl(url);
      })
      .catch(() => {
        // Sin textura el caller conserva el blanco de respaldo — nunca rompe la escena.
      });
    return () => {
      alive = false;
    };
  }, [wRatio, hRatio]);
  return dataUrl;
}
