"use client";

/*
 * MagnetMesh — imán/ficha con CUERPO 3D real (pase de realismo Lucy 2026-07-22).
 *
 * Antes los imanes de las escenas 3D eran `planeGeometry` sin grosor: al girar la cámara se
 * delataba el truco. Ahora la pieza se EXTRUYE (`ExtrudeGeometry`, depth ~0.04 + bisel leve en
 * los cantos) desde la MISMA silueta física con la que `buildMagnetTextures` recorta la textura
 * (espejo de `buildShapePath`: rounded-rect r=8/512 del ancho, elipse, corazón bezier
 * normalizado), así el borde del modelo coincide píxel a píxel con el PNG troquelado.
 *
 * Materiales (2 grupos del ExtrudeGeometry):
 *  - material-0 = tapas (cara impresa con la textura del slot; UV = coords del shape →
 *    repeat 1/w,1/h + offset 0.5,0.5). Brillo PET sutil via envMapIntensity (hay env-map
 *    procedural de StudioEnvironment en todas las escenas).
 *  - material-1 = canto (el blanco del material base — PVC/acrílico — que se ve de perfil).
 *
 * `backColor` opcional tapa el reverso (los separadores se ven por detrás al orbitar: el dorso
 * es cartulina sin imprimir, no la foto espejada).
 *
 * La textura se CLONA por pieza (transform propio): la galería interna de preview monta varias
 * escenas a la vez con la misma dataURL y tamaños distintos — compartir la instancia de
 * `useTexture` haría que el repeat/offset de una escena rompiera el mapeo de la otra.
 */

import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

export type MagnetShape = "rectangle" | "circle" | "heart" | "custom";

/** Silueta física centrada en el origen (unidades de mundo). Espejo exacto de buildShapePath. */
function buildSilhouette(shape: MagnetShape, w: number, h: number): THREE.Shape {
  if (shape === "circle") {
    const s = new THREE.Shape();
    s.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
    return s;
  }
  if (shape === "heart") {
    // Mismo corazón bezier normalizado (0..1) de buildShapePath; canvas y-down → three y-up.
    const px = (n: number) => (n - 0.5) * w;
    const py = (n: number) => (0.5 - n) * h;
    const s = new THREE.Shape();
    s.moveTo(px(0.5), py(0.82));
    s.bezierCurveTo(px(0.28), py(0.68), px(0.06), py(0.52), px(0.06), py(0.32));
    s.bezierCurveTo(px(0.06), py(0.18), px(0.16), py(0.08), px(0.28), py(0.08));
    s.bezierCurveTo(px(0.38), py(0.08), px(0.44), py(0.12), px(0.5), py(0.22));
    s.bezierCurveTo(px(0.56), py(0.12), px(0.62), py(0.08), px(0.72), py(0.08));
    s.bezierCurveTo(px(0.84), py(0.08), px(0.94), py(0.18), px(0.94), py(0.32));
    s.bezierCurveTo(px(0.94), py(0.52), px(0.72), py(0.68), px(0.5), py(0.82));
    s.closePath();
    return s;
  }
  // rectangle/custom — el clip de la textura usa rounded-rect con r = min(8, w/12) px sobre
  // texW=512 → r = 8/512 del ancho (misma r en X e Y porque la textura se estira al plano).
  const r = (w * 8) / 512;
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  s.closePath();
  return s;
}

export function MagnetMesh({
  dataUrl,
  width,
  height,
  shape = "rectangle",
  depth = 0.04,
  edgeColor = "#F6F1E8",
  backColor,
  position = [0, 0, 0],
}: {
  dataUrl: string;
  width: number;
  height: number;
  shape?: MagnetShape;
  /** Grosor del cuerpo (sin contar el bisel). Imanes 0.04, separadores 0.025. */
  depth?: number;
  /** Color del canto (material base blanco por defecto). */
  edgeColor?: string;
  /** Si se define, dibuja una tapa trasera lisa de este color (reverso sin imprimir). */
  backColor?: string;
  position?: [number, number, number];
}) {
  const base = useTexture(dataUrl);
  // Clon por pieza: UV de la tapa = coords del shape → repeat 1/w,1/h + offset 0.5,0.5.
  const tex = useMemo(() => {
    const t = base.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.repeat.set(1 / width, 1 / height);
    t.offset.set(0.5, 0.5);
    t.needsUpdate = true;
    return t;
  }, [base, width, height]);
  useEffect(() => () => tex.dispose(), [tex]);

  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildSilhouette(shape, width, height), {
      depth,
      bevelEnabled: true,
      bevelThickness: depth * 0.2,
      bevelSize: 0.008,
      bevelSegments: 2,
      curveSegments: 28,
      steps: 1,
    });
    g.center(); // centra Z (X/Y ya vienen centrados) → cara frontal en +(depth/2 + bisel)
    return g;
  }, [shape, width, height, depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const backGeo = useMemo(
    () => (backColor ? new THREE.ShapeGeometry(buildSilhouette(shape, width, height), 28) : null),
    [backColor, shape, width, height],
  );
  useEffect(() => () => backGeo?.dispose(), [backGeo]);

  const backZ = -(depth / 2 + depth * 0.2) - 0.0012;

  return (
    <group position={position}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          attach="material-0"
          map={tex}
          roughness={0.38}
          metalness={0}
          envMapIntensity={1.15}
        />
        <meshStandardMaterial
          attach="material-1"
          color={edgeColor}
          roughness={0.45}
          metalness={0}
          envMapIntensity={0.9}
        />
      </mesh>
      {backGeo && backColor ? (
        <mesh geometry={backGeo} position={[0, 0, backZ]} rotation={[0, Math.PI, 0]}>
          <meshStandardMaterial color={backColor} roughness={0.85} metalness={0} />
        </mesh>
      ) : null}
    </group>
  );
}
