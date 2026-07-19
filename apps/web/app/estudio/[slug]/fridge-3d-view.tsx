"use client";

/*
 * FridgeView3D — vista previa 3D del pack de imanes pegados en una nevera (ADR-057 · P1.4).
 *
 * El "Diferenciador #1" prometido en CLAUDE.md: además del editor 2D, el cliente ve su diseño
 * como imanes REALES sobre una nevera, que puede girar/acercar. La textura de cada imán es el
 * snapshot del slot correspondiente (dataURL PNG con transparencia → respeta la silueta física:
 * rectángulo/corazón/círculo).
 *
 * Realismo (Lucy 2026-07-13, con foto de referencia: nevera convencional real):
 *  - Top-freezer de dos puertas, ALTA y esbelta, cuerpo GRIS SATINADO metálico (electrodoméstico
 *    real, no lavanda), cantos verticales redondeados y frente casi plano.
 *  - Manijas VERTICALES sobre el borde IZQUIERDO de cada puerta (como la referencia), tipo barra
 *    cromada satinada sobre un rebaje.
 *  - Freezer arriba (~1/3), refrigerador abajo (~2/3), sello/junta oscura entre puertas, patas en
 *    las 4 esquinas.
 *  - Los imanes son PEQUEÑOS y se agrupan en la parte alta de la puerta del refrigerador (como
 *    imanes de verdad). La nevera es de tamaño fijo (no crece con la cantidad de imanes).
 *
 * Restricciones respetadas:
 *  - CSP estricta: CERO assets externos (nada de Environment/HDR/GLTF/fuentes de CDN de drei). El
 *    look metálico se logra con luces procedurales (hemisphere + direccionales), sin env-map.
 *  - Se monta SOLO client-side (WebGL/window) → se importa con dynamic ssr:false.
 *  - Sin WebGL → mensaje amable (no rompe el Estudio).
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, ContactShadows, useTexture, Center } from "@react-three/drei";
import { FitCamera } from "./fit-camera";
import { StudioEnvironment, StudioBackdrop } from "./studio-3d-environment";
import * as THREE from "three";

export type Magnet3D = {
  /** Snapshot PNG (dataURL) del imán, con transparencia fuera de la silueta. */
  dataUrl: string;
  /** Ancho físico relativo (unitTemplate.stage.width). */
  wRatio: number;
  /** Alto físico relativo (unitTemplate.stage.height). */
  hRatio: number;
};

type FridgeView3DProps = {
  magnets: Magnet3D[];
  cols: number;
};

// ── Nevera de tamaño FIJO (no depende de la cantidad de imanes) ──
// Proporción de nevera convencional real (alta y esbelta): H/W ≈ 2.5.
const FRIDGE_W = 3.5;
const FRIDGE_H = 8.8;
const FRIDGE_D = 1.5;
const FREEZER_FRAC = 0.31; // ~1/3 superior = freezer
const DOOR_Z = FRIDGE_D / 2; // frente del cuerpo

// Layout del frente (puertas casi cubren la cara, con margen y una junta central).
const M = 0.15; // margen del panel frontal respecto al borde del cuerpo
const DOOR_GAP = 0.12; // junta oscura entre freezer y refrigerador
const AVAIL_H = FRIDGE_H - 2 * M;
const FREEZER_DOOR_H = FREEZER_FRAC * AVAIL_H - DOOR_GAP / 2;
const FRIDGE_DOOR_H = (1 - FREEZER_FRAC) * AVAIL_H - DOOR_GAP / 2;
const DOOR_W = FRIDGE_W - 2 * M;
const FREEZER_CY = FRIDGE_H / 2 - M - FREEZER_DOOR_H / 2;
const FRIDGE_CY = -FRIDGE_H / 2 + M + FRIDGE_DOOR_H / 2;
const GAP_CY = FRIDGE_H / 2 - M - FREEZER_DOOR_H - DOOR_GAP / 2;
const DOOR_T = 0.14; // grosor del panel de puerta (sobresale del cuerpo)
const DOOR_FACE_Z = DOOR_Z + DOOR_T / 2; // cara frontal de la puerta

// Clúster de imanes: PEQUEÑO respecto a la puerta (como imanes reales en una nevera grande),
// agrupado en la parte alta-centro de la puerta del refrigerador.
const MAGNET_REGION_W = DOOR_W * 0.46;
const MAGNET_REGION_H = FRIDGE_DOOR_H * 0.28;
const MAGNET_REGION_CY = FRIDGE_CY + FRIDGE_DOOR_H * 0.22;
const MAGNET_Z = DOOR_FACE_Z + 0.06; // claramente sobre el panel biselado

// Materiales (gris satinado de electrodoméstico; metalness baja para verse bien sin env-map).
const BODY_COLOR = "#9297A0";
const DOOR_COLOR = "#A0A5AE";
const PANEL_COLOR = "#989DA6"; // panel biselado interno (un pelo más oscuro)
const SEAM_COLOR = "#34373D";
const HANDLE_COLOR = "#C9CDD4";
const FOOT_COLOR = "#212227";

/** Un imán: plano texturizado con alphaTest para bordes nítidos según la silueta. */
function Magnet({
  dataUrl,
  width,
  height,
  position,
}: {
  dataUrl: string;
  width: number;
  height: number;
  position: [number, number, number];
}) {
  const texture = useTexture(dataUrl);
  return (
    <mesh position={position} castShadow>
      <planeGeometry args={[width, height]} />
      {/* map-colorSpace / map-anisotropy: forma declarativa de R3F para configurar la textura
          sin mutar el valor del hook (colores correctos + nitidez en ángulo). */}
      <meshStandardMaterial
        map={texture}
        map-colorSpace={THREE.SRGBColorSpace}
        map-anisotropy={8}
        transparent
        alphaTest={0.5}
        roughness={0.5}
        metalness={0}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

/** Manija vertical sobre el borde izquierdo: canal oscuro embutido + grip fino satinado. */
function Handle({ doorW, centerY, handleH }: { doorW: number; centerY: number; handleH: number }) {
  const x = -doorW / 2 + 0.22;
  return (
    <group>
      {/* Canal embutido (rebaje oscuro donde entran los dedos) */}
      <RoundedBox
        args={[0.13, handleH + 0.16, 0.05]}
        radius={0.02}
        smoothness={3}
        position={[x, centerY, DOOR_FACE_Z - 0.005]}
      >
        <meshStandardMaterial color="#5A5E64" roughness={0.75} metalness={0.15} />
      </RoundedBox>
      {/* Grip fino cromado (sobresale poco → integrado, no un tirador grueso) */}
      <RoundedBox
        args={[0.055, handleH, 0.075]}
        radius={0.025}
        smoothness={4}
        position={[x, centerY, DOOR_FACE_Z + 0.055]}
        castShadow
      >
        <meshStandardMaterial
          color={HANDLE_COLOR}
          roughness={0.2}
          metalness={0.7}
          envMapIntensity={1.9}
        />
      </RoundedBox>
    </group>
  );
}

/** Una puerta: cuerpo saliente + panel biselado interno (borde con groove) + manija. */
function Door({ width, height, centerY }: { width: number; height: number; centerY: number }) {
  return (
    <group>
      {/* Cuerpo de la puerta */}
      <RoundedBox
        args={[width, height, DOOR_T]}
        radius={0.08}
        smoothness={5}
        position={[0, centerY, DOOR_Z]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={DOOR_COLOR}
          roughness={0.28}
          metalness={0.42}
          envMapIntensity={1.5}
        />
      </RoundedBox>
      {/* Panel interno con bisel: apenas proud + un pelo más oscuro → el escalón lee como un
          groove perimetral (detalle de nevera real, sin texturas). */}
      <RoundedBox
        args={[width - 0.36, height - 0.36, 0.03]}
        radius={0.06}
        smoothness={4}
        position={[0, centerY, DOOR_FACE_Z + 0.012]}
        receiveShadow
      >
        <meshStandardMaterial
          color={PANEL_COLOR}
          roughness={0.36}
          metalness={0.34}
          envMapIntensity={1.4}
        />
      </RoundedBox>
      <Handle doorW={width} centerY={centerY} handleH={height * 0.7} />
    </group>
  );
}

/** La nevera top-freezer: cuerpo + dos puertas + junta + patas. */
function Fridge() {
  const feetX = FRIDGE_W / 2 - 0.32;
  const feetZ = FRIDGE_D / 2 - 0.32;
  return (
    <group>
      {/* Cuerpo (cantos redondeados) */}
      <RoundedBox
        args={[FRIDGE_W, FRIDGE_H, FRIDGE_D]}
        radius={0.26}
        smoothness={6}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={BODY_COLOR}
          roughness={0.34}
          metalness={0.34}
          envMapIntensity={1.4}
        />
      </RoundedBox>

      {/* Junta/sello oscuro entre freezer y refrigerador */}
      <mesh position={[0, GAP_CY, DOOR_Z + 0.03]}>
        <boxGeometry args={[DOOR_W + 0.04, DOOR_GAP, 0.02]} />
        <meshStandardMaterial color={SEAM_COLOR} roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Freezer (arriba) y refrigerador (abajo) */}
      <Door width={DOOR_W} height={FREEZER_DOOR_H} centerY={FREEZER_CY} />
      <Door width={DOOR_W} height={FRIDGE_DOOR_H} centerY={FRIDGE_CY} />

      {/* Patas en las 4 esquinas */}
      {[
        [-feetX, -feetZ],
        [feetX, -feetZ],
        [-feetX, feetZ],
        [feetX, feetZ],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, -FRIDGE_H / 2 - 0.11, z]} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.22, 16]} />
          <meshStandardMaterial color={FOOT_COLOR} roughness={0.5} metalness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

function Magnets({ magnets, cols }: FridgeView3DProps) {
  const items = useMemo(() => {
    const rows = Math.max(1, Math.ceil(magnets.length / cols));
    // Tamaño de celda para que TODO el clúster entre en la región de la puerta.
    const cellW = MAGNET_REGION_W / cols;
    const cellH = MAGNET_REGION_H / rows;
    const gap = 0.06;
    return magnets.map((m, i) => {
      const aspect = m.hRatio / m.wRatio;
      // El imán entra en la celda respetando su proporción física.
      let w = cellW - gap;
      let h = w * aspect;
      if (h > cellH - gap) {
        h = cellH - gap;
        w = h / aspect;
      }
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = (col - (cols - 1) / 2) * cellW;
      const y = MAGNET_REGION_CY + ((rows - 1) / 2 - row) * cellH;
      return { m, w, h, x, y };
    });
  }, [magnets, cols]);

  return (
    <>
      {items.map(({ m, w, h, x, y }, i) => (
        <Magnet key={i} dataUrl={m.dataUrl} width={w} height={h} position={[x, y, MAGNET_Z]} />
      ))}
    </>
  );
}

function Scene({ magnets, cols }: FridgeView3DProps) {
  return (
    <>
      {/* FB5 — env-map procedural (reflejos PBR reales) + backdrop de estudio (contexto/asiento). La
        iluminación directa baja porque el entorno ya aporta ambiente; el key mantiene el brillo y la
        sombra proyectada. */}
      <StudioEnvironment intensity={1} />
      <StudioBackdrop position={[0, -FRIDGE_H / 2 - 0.34, -5]} scale={[42, 24, 9]} />
      <hemisphereLight args={["#ffffff", "#cfc9c2", 0.28]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[5, 8, 7]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-6, 3, 4]} intensity={0.3} />

      <Center>
        <group>
          <Fridge />
          <Magnets magnets={magnets} cols={cols} />
        </group>
      </Center>

      <ContactShadows
        position={[0, -FRIDGE_H / 2 - 0.34, 0]}
        opacity={0.5}
        blur={2.8}
        scale={16}
        far={6}
      />
      {/* #12 — encuadra la nevera (alta y angosta) al aspecto del viewport (fit-to-height). */}
      <FitCamera halfW={FRIDGE_W / 2} halfH={FRIDGE_H / 2} margin={1.12} camY={0.4} />
      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.8}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 1.9}
        minDistance={7}
        maxDistance={24}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function FridgeView3D({ magnets, cols }: FridgeView3DProps) {
  if (magnets.length === 0) {
    return (
      <div className="text-brand-muted flex h-full items-center justify-center p-8 text-center text-sm">
        Agrega al menos una foto para ver tus imanes en la nevera 3D.
      </div>
    );
  }
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0.4, 14.5], fov: 40 }}
      gl={{ preserveDrawingBuffer: false, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#FFF8F0"]} />
      <Suspense fallback={null}>
        <Scene magnets={magnets} cols={cols} />
      </Suspense>
    </Canvas>
  );
}
