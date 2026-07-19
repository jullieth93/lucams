"use client";

/*
 * RoomBoardView3D — imanes sobre un TABLERO MAGNÉTICO enmarcado, colgado en la pared de un cuarto
 * (ADR-063 · NOM2 re-skin + FOTO4-A). Alternativa cálida a la nevera: el nombre o las fotos viven en
 * un tablero decorativo de una habitación, no en la cocina. Sigue siendo superficie magnética real
 * (WYSIWYG). Estilo "memo" (tablero claro) o "cork" (corcho, tipo moodboard).
 *
 * Restricciones (idénticas a las otras vistas 3D): CSP estricta (cero assets externos, luces
 * procedurales) · client-only (WebGL) → dynamic ssr:false.
 */

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, RoundedBox, ContactShadows, useTexture, Center } from "@react-three/drei";
import { FitCamera } from "./fit-camera";
import * as THREE from "three";
import type { Magnet3D } from "./fridge-3d-view";

export type BoardStyle = "memo" | "cork";

// Tablero (tamaño fijo). El marco rodea una superficie magnética.
const BOARD_W = 7;
const BOARD_H = 5.2;
const FRAME = 0.4;
const DEPTH = 0.22;
const INNER_W = BOARD_W - FRAME * 2;
const INNER_H = BOARD_H - FRAME * 2;
const FRONT_Z = DEPTH / 2;

const WALL_COLOR = "#EFE7DC"; // pared cálida del cuarto
const FRAME_COLOR = "#B98A5E"; // marco de madera
const SURFACE = { memo: "#F7F4EC", cork: "#C99A63" }; // tablero claro / corcho

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

function Magnets({ magnets, cols }: { magnets: Magnet3D[]; cols: number }) {
  const items = useMemo(() => {
    const rows = Math.max(1, Math.ceil(magnets.length / cols));
    const regionW = INNER_W * 0.9;
    const regionH = INNER_H * 0.82;
    const cellW = regionW / cols;
    const cellH = regionH / rows;
    const gap = 0.08;
    return magnets.map((m, i) => {
      const aspect = m.hRatio / m.wRatio;
      let w = cellW - gap;
      let h = w * aspect;
      if (h > cellH - gap) {
        h = cellH - gap;
        w = h / aspect;
      }
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = (col - (cols - 1) / 2) * cellW;
      const y = ((rows - 1) / 2 - row) * cellH;
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
          position={[x, y, FRONT_Z + 0.05]}
        />
      ))}
    </>
  );
}

function Board({ style }: { style: BoardStyle }) {
  return (
    <group>
      {/* Marco de madera */}
      <RoundedBox args={[BOARD_W, BOARD_H, DEPTH]} radius={0.05} smoothness={4} castShadow>
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.6} metalness={0.05} />
      </RoundedBox>
      {/* Superficie magnética (memo/corcho), apenas hundida */}
      <mesh position={[0, 0, FRONT_Z - 0.01]} receiveShadow>
        <planeGeometry args={[INNER_W, INNER_H]} />
        <meshStandardMaterial
          color={SURFACE[style]}
          roughness={style === "cork" ? 0.95 : 0.7}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

function Floating({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!g.current) return;
    const t = state.clock.elapsedTime;
    g.current.rotation.y = Math.sin(t * 0.4) * 0.06;
    g.current.position.y = Math.sin(t * 0.85) * 0.04;
  });
  return <group ref={g}>{children}</group>;
}

function Scene({ magnets, cols, style }: { magnets: Magnet3D[]; cols: number; style: BoardStyle }) {
  return (
    <>
      {/* Pared del cuarto, detrás del tablero */}
      <mesh position={[0, 0, -1.2]} receiveShadow>
        <planeGeometry args={[40, 26]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={1} metalness={0} />
      </mesh>

      <hemisphereLight args={["#fff6ea", "#e5dccd", 0.6]} />
      <ambientLight intensity={0.42} />
      <directionalLight
        position={[4, 6, 8]}
        intensity={1.25}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-5, 2, 5]} intensity={0.4} />

      <Center>
        <Floating>
          <Board style={style} />
          <Magnets magnets={magnets} cols={cols} />
        </Floating>
      </Center>

      <ContactShadows
        position={[0, -BOARD_H / 2 - 0.5, 0.5]}
        opacity={0.3}
        blur={2.6}
        scale={16}
        far={5}
      />
      {/* #12 — encuadra el tablero al aspecto del viewport (fit-to-width en móvil vertical). */}
      <FitCamera halfW={BOARD_W / 2} halfH={BOARD_H / 2} margin={1.12} camY={0.3} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minPolarAngle={Math.PI / 3.5}
        maxPolarAngle={Math.PI / 1.9}
        minDistance={7}
        maxDistance={24}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function RoomBoardView3D({
  magnets,
  cols,
  style = "memo",
}: {
  magnets: Magnet3D[];
  cols: number;
  style?: BoardStyle;
}) {
  if (magnets.length === 0) {
    return (
      <div className="text-brand-muted flex h-full items-center justify-center p-8 text-center text-sm">
        Agrega tu diseño para verlo en el tablero.
      </div>
    );
  }
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0.3, 12], fov: 42 }}
      gl={{ preserveDrawingBuffer: false, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#FFF8F0"]} />
      <Suspense fallback={null}>
        <Scene magnets={magnets} cols={cols} style={style} />
      </Suspense>
    </Canvas>
  );
}
