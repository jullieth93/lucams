"use client";

/*
 * #12 — FitCamera: ajusta la DISTANCIA de la cámara al aspecto real del canvas (fit-to-width en
 * viewport vertical). Las vistas 3D del Estudio tenían la cámara 100% fija (position + fov), así que
 * en un teléfono en vertical (aspect ≈0.49) el nombre salía cortado y el libro desbordaba el encuadre.
 *
 * Solo MUEVE la cámara (nunca toca la geometría física) → WYSIWYG intacto. El fov de THREE es
 * VERTICAL; la altura visible a distancia d es 2·d·tan(fov/2) y el ancho = altura·aspect. Para que
 * quepan tanto el medio-alto (halfH) como el medio-ancho (halfW) del contenido, tomamos la distancia
 * mayor de las dos y le sumamos un margen. OrbitControls re-deriva su radio desde camera.position en
 * cada update(), así que basta setear la posición y llamar controls.update() (requiere makeDefault en
 * el <OrbitControls> para poblar el store `controls`), siempre que d ≤ maxDistance.
 */

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type * as THREE from "three";

type OrbitLike = { update?: () => void };

export function FitCamera({
  halfW,
  halfH,
  margin = 1.12,
  camY = 0,
}: {
  halfW: number;
  halfH: number;
  margin?: number;
  camY?: number;
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
    camera.position.set(0, camY, d);
    camera.updateProjectionMatrix();
    controls?.update?.();
  }, [camera, controls, width, height, halfW, halfH, margin, camY]);

  return null;
}
