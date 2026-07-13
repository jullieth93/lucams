"use client";

/*
 * FridgeView3D — vista previa 3D del pack de imanes pegados en una nevera (ADR-057 · P1.4).
 *
 * El "Diferenciador #1" prometido en CLAUDE.md: además del editor 2D, el cliente ve su diseño
 * como imanes REALES sobre una nevera kawaii, que puede girar/acercar. La textura de cada imán
 * es el snapshot del slot correspondiente (dataURL PNG con transparencia → respeta la silueta
 * física: rectángulo/corazón/círculo).
 *
 * Restricciones respetadas:
 *  - CSP estricta: CERO assets externos (nada de Environment/HDR/GLTF/fuentes de CDN de drei).
 *    Solo luces + geometría procedural + texturas dataURL inline. Todo self-contained.
 *  - Se monta SOLO client-side (necesita WebGL/window) → se importa con dynamic ssr:false.
 *  - Si el navegador no soporta WebGL, cae a un mensaje amable (no rompe el Estudio).
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
        roughness={0.55}
        metalness={0}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

/** La nevera: cuerpo redondeado color crema + manija + una línea de puerta. */
function Fridge({ width, height }: { width: number; height: number }) {
  const depth = 1.1;
  return (
    <group>
      {/* Cuerpo */}
      <RoundedBox args={[width, height, depth]} radius={0.18} smoothness={6} receiveShadow castShadow>
        <meshStandardMaterial color="#FBF3EA" roughness={0.35} metalness={0.08} />
      </RoundedBox>
      {/* Línea de la puerta (freezer arriba) */}
      <mesh position={[0, height * 0.28, depth / 2 + 0.001]}>
        <planeGeometry args={[width * 0.98, 0.03]} />
        <meshStandardMaterial color="#E6DAF0" roughness={0.6} />
      </mesh>
      {/* Manijas */}
      {[height * 0.02, height * 0.42].map((y, i) => (
        <RoundedBox
          key={i}
          args={[0.09, i === 0 ? height * 0.34 : height * 0.16, 0.09]}
          radius={0.04}
          smoothness={4}
          position={[-width / 2 + 0.28, i === 0 ? -y : y, depth / 2 + 0.06]}
          castShadow
        >
          <meshStandardMaterial color="#C9B8E6" roughness={0.3} metalness={0.3} />
        </RoundedBox>
      ))}
    </group>
  );
}

function Scene({ magnets, cols }: FridgeView3DProps) {
  // Layout: cada imán escala a un ancho base; alto según su aspect. Grid centrado.
  const layout = useMemo(() => {
    const rows = Math.max(1, Math.ceil(magnets.length / cols));
    const baseW = 0.62; // ancho de un imán en unidades de escena
    const gap = 0.14;
    const items = magnets.map((m, i) => {
      const w = baseW;
      const h = baseW * (m.hRatio / m.wRatio);
      const col = i % cols;
      const row = Math.floor(i / cols);
      return { m, w, h, col, row };
    });
    const maxH = Math.max(...items.map((it) => it.h), baseW);
    const gridW = cols * baseW + (cols - 1) * gap;
    const gridH = rows * maxH + (rows - 1) * gap;
    return { items, rows, baseW, gap, maxH, gridW, gridH };
  }, [magnets, cols]);

  // La nevera envuelve la grilla con margen.
  const fridgeW = Math.max(3.2, layout.gridW + 1.4);
  const fridgeH = Math.max(4.2, layout.gridH + 1.8);
  const zFront = 1.1 / 2 + 0.03; // frente de la nevera + pelín

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[3, 5, 6]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-4, 2, 3]} intensity={0.4} color="#E85B9F" />

      <Center>
        <group>
          <Fridge width={fridgeW} height={fridgeH} />
          {layout.items.map(({ m, w, h, col, row }, i) => {
            const x = (col - (cols - 1) / 2) * (layout.baseW + layout.gap);
            const y = ((layout.rows - 1) / 2 - row) * (layout.maxH + layout.gap);
            return (
              <Magnet
                key={i}
                dataUrl={m.dataUrl}
                width={w}
                height={h}
                position={[x, y, zFront]}
              />
            );
          })}
        </group>
      </Center>

      <ContactShadows position={[0, -fridgeH / 2 - 0.05, 0]} opacity={0.35} blur={2.2} scale={12} far={5} />
      <OrbitControls
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.9}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.8}
        minDistance={4}
        maxDistance={14}
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
      camera={{ position: [0, 0.5, 9], fov: 42 }}
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
