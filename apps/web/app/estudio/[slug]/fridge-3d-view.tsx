"use client";

/*
 * FridgeView3D — vista previa 3D del pack de imanes pegados en una nevera (ADR-057 · P1.4).
 *
 * El "Diferenciador #1" prometido en CLAUDE.md: además del editor 2D, el cliente ve su diseño
 * como imanes REALES sobre una nevera, que puede girar/acercar. La textura de cada imán es el
 * snapshot del slot correspondiente (dataURL PNG con transparencia → respeta la silueta física:
 * rectángulo/corazón/círculo).
 *
 * Realismo (Lucy 2026-07-13 "una nevera más real, más grande"):
 *  - Nevera GRANDE de dos puertas (freezer arriba + refrigerador abajo), proporción alta y
 *    realista, cuerpo redondeado con leve brillo de electrodoméstico, manijas verticales y patas.
 *  - Los imanes son PEQUEÑOS y se agrupan en la puerta (como imanes de verdad), no cubren toda
 *    la superficie. La nevera es de tamaño fijo (no crece con la cantidad de imanes).
 *
 * Restricciones respetadas:
 *  - CSP estricta: CERO assets externos (nada de Environment/HDR/GLTF/fuentes de CDN de drei).
 *    Solo luces + geometría procedural + texturas dataURL inline.
 *  - Se monta SOLO client-side (WebGL/window) → se importa con dynamic ssr:false.
 *  - Sin WebGL → mensaje amable (no rompe el Estudio).
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, ContactShadows, useTexture, Center } from "@react-three/drei";
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
const FRIDGE_W = 4.2;
const FRIDGE_H = 7.4;
const FRIDGE_D = 1.35;
const FREEZER_FRAC = 0.3; // 30% superior = freezer
const DOOR_Z = FRIDGE_D / 2; // frente del cuerpo
// Región de la puerta del refrigerador (abajo) donde se agrupan los imanes.
const MAGNET_REGION_W = 2.9;
const MAGNET_REGION_H = 3.0;
const MAGNET_REGION_CY = -FRIDGE_H * 0.06; // centro vertical del clúster (parte alta de la puerta)

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

/** Una puerta: panel ligeramente saliente + manija vertical. */
function Door({
  width,
  height,
  centerY,
  handleTop,
}: {
  width: number;
  height: number;
  centerY: number;
  handleTop: boolean;
}) {
  const handleH = height * 0.62;
  const handleY = handleTop ? centerY - height * 0.12 : centerY + height * 0.1;
  return (
    <group>
      {/* Panel de la puerta, apenas saliente del cuerpo */}
      <RoundedBox
        args={[width, height, 0.12]}
        radius={0.08}
        smoothness={5}
        position={[0, centerY, DOOR_Z + 0.02]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#FDFAF6" roughness={0.28} metalness={0.16} />
      </RoundedBox>
      {/* Manija vertical (lado derecho de la puerta) */}
      <RoundedBox
        args={[0.11, handleH, 0.11]}
        radius={0.05}
        smoothness={4}
        position={[width / 2 - 0.34, handleY, DOOR_Z + 0.14]}
        castShadow
      >
        <meshStandardMaterial color="#B9A6DE" roughness={0.25} metalness={0.5} />
      </RoundedBox>
    </group>
  );
}

/** La nevera de dos puertas: cuerpo + freezer + refrigerador + patas. */
function Fridge() {
  const freezerH = FRIDGE_H * FREEZER_FRAC;
  const fridgeH = FRIDGE_H * (1 - FREEZER_FRAC) - 0.06; // -gap
  const gapY = FRIDGE_H / 2 - freezerH - 0.03;
  const freezerCY = FRIDGE_H / 2 - freezerH / 2;
  const fridgeCY = -FRIDGE_H / 2 + fridgeH / 2;
  const doorW = FRIDGE_W * 0.94;
  return (
    <group>
      {/* Cuerpo */}
      <RoundedBox
        args={[FRIDGE_W, FRIDGE_H, FRIDGE_D]}
        radius={0.22}
        smoothness={6}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#F3ECF6" roughness={0.35} metalness={0.1} />
      </RoundedBox>
      {/* Línea/sombra de separación entre puertas */}
      <mesh position={[0, gapY, DOOR_Z + 0.015]}>
        <planeGeometry args={[doorW, 0.06]} />
        <meshStandardMaterial color="#D8C9EA" roughness={0.7} />
      </mesh>
      {/* Freezer (arriba, manija abajo) */}
      <Door width={doorW} height={freezerH - 0.08} centerY={freezerCY} handleTop />
      {/* Refrigerador (abajo, manija arriba) */}
      <Door width={doorW} height={fridgeH - 0.08} centerY={fridgeCY} handleTop={false} />
      {/* Patas */}
      {[-FRIDGE_W / 2 + 0.3, FRIDGE_W / 2 - 0.3].map((x, i) => (
        <mesh key={i} position={[x, -FRIDGE_H / 2 - 0.12, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.24, 16]} />
          <meshStandardMaterial color="#4A445A" roughness={0.6} metalness={0.3} />
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
        <Magnet
          key={i}
          dataUrl={m.dataUrl}
          width={w}
          height={h}
          position={[x, y, DOOR_Z + 0.11]}
        />
      ))}
    </>
  );
}

function Scene({ magnets, cols }: FridgeView3DProps) {
  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight
        position={[4, 7, 8]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-5, 3, 4]} intensity={0.35} color="#E85B9F" />

      <Center>
        <group>
          <Fridge />
          <Magnets magnets={magnets} cols={cols} />
        </group>
      </Center>

      <ContactShadows
        position={[0, -FRIDGE_H / 2 - 0.36, 0]}
        opacity={0.4}
        blur={2.4}
        scale={16}
        far={6}
      />
      <OrbitControls
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.8}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 1.9}
        minDistance={6}
        maxDistance={22}
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
      camera={{ position: [0, 0.4, 13.5], fov: 40 }}
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
