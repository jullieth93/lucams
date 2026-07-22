"use client";

/*
 * FitCameraPolar — variante de FitCamera para escenas que se miran desde un ÁNGULO FIJO
 * (vista desde arriba-3/4 del libro acostado, lectura cenital de la tarjeta de calendario).
 *
 * FitCamera solo fija la DISTANCIA y deja la cámara casi frontal (camY constante → el ángulo
 * cambia con el aspecto del viewport: en móvil vertical quedaba casi rasante). Acá el ángulo
 * polar φ (sobre la horizontal) es un prop: la cámara queda a distancia d en dirección
 * (0, d·sinφ, d·cosφ) respecto al target, así el encuadre es el mismo en desktop y móvil.
 * Misma mecánica que FitCamera: solo MUEVE la cámara (WYSIWYG intacto) y pide controls.update()
 * (requiere <OrbitControls makeDefault>). La distancia resultante puede superar la de una vista
 * frontal (la hipotenusa) → las escenas que la usan deben dar maxDistance holgado.
 */

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type * as THREE from "three";

type OrbitLike = { update?: () => void };

export function FitCameraPolar({
  halfW,
  halfH,
  polarDeg,
  margin = 1.12,
  targetY = 0,
}: {
  halfW: number;
  halfH: number;
  /** Ángulo de la cámara sobre la horizontal (90 = cenital puro, 0 = frontal rasante). */
  polarDeg: number;
  margin?: number;
  targetY?: number;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitLike | null;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useEffect(() => {
    if (!width || !height) return;
    const aspect = width / height;
    const tan = Math.tan((camera.fov * Math.PI) / 180 / 2);
    // Distancia que hace caber el alto (halfH/tan) Y el ancho (halfW/(tan·aspect)); la mayor manda.
    const d = Math.max(halfH / tan, halfW / (tan * aspect)) * margin;
    const phi = (polarDeg * Math.PI) / 180;
    camera.position.set(0, targetY + d * Math.sin(phi), d * Math.cos(phi));
    camera.updateProjectionMatrix();
    controls?.update?.();
  }, [camera, controls, width, height, halfW, halfH, polarDeg, margin, targetY]);

  return null;
}
