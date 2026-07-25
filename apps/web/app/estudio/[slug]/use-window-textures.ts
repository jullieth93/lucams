"use client";

/*
 * useWindowTextures — texturas PEREZOSAS por ventana (índice actual ± radius) para las vistas
 * que recorren las 12 tarjetas/páginas del calendario. Carga con TextureLoader (dataURLs),
 * dispone las que salen de la ventana y TODAS al desmontar — sin esto cada textura ~810×1140
 * son ~3.7MB de GPU que se cargarían ×12 de golpe y quedarían vivas para siempre.
 *
 * Dos estructuras (react-hooks/refs prohíbe leer refs durante render):
 *  - liveRef: la caché VIVA (propiedad y dispose de las texturas) — solo se toca en effects.
 *  - texMap: snapshot inmutable publicado vía setState cuando llega una textura — lo lee el render.
 *
 * Compartido por CalendarView3D (hojas del calendario de pared, /internal/3d-preview) y
 * CalendarCardFocus (visor de detalle tarjeta-a-tarjeta de la galería, ola 2C).
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export function useWindowTextures(
  urls: readonly string[],
  index: number,
  radius = 1,
): THREE.Texture | null {
  const liveRef = useRef<Map<number, THREE.Texture>>(new Map());
  const [texMap, setTexMap] = useState<ReadonlyMap<number, THREE.Texture>>(() => new Map());

  useEffect(() => {
    const live = liveRef.current;
    let cancelled = false;
    const wanted = new Set<number>();
    for (let i = Math.max(0, index - radius); i <= Math.min(urls.length - 1, index + radius); i++) {
      wanted.add(i);
    }

    // Cargar faltantes (async → el setState de publicación es legal aquí).
    const loader = new THREE.TextureLoader();
    for (const i of wanted) {
      if (live.has(i)) continue;
      loader
        .loadAsync(urls[i]!)
        .then((tex) => {
          if (cancelled) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          live.set(i, tex);
          setTexMap(new Map(live));
        })
        .catch(() => {
          // dataURL corrupto → la pieza queda en color papel, sin romper la vista.
        });
    }

    // Liberar las que salen de la ventana. Si texMap queda con una referencia de más no pasa
    // nada: el render solo lee `index` (∈ wanted, viva) y la próxima publicación lo corrige.
    for (const [i, tex] of Array.from(live.entries())) {
      if (!wanted.has(i)) {
        tex.dispose();
        live.delete(i);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [urls, index, radius]);

  // Al desmontar la vista: liberar TODAS las texturas que sigan vivas.
  useEffect(() => {
    const live = liveRef.current;
    return () => {
      for (const tex of live.values()) tex.dispose();
      live.clear();
    };
  }, []);

  return texMap.get(index) ?? null;
}
