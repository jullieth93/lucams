"use client";

/*
 * RoomBoardView3D — imanes sobre un TABLERO MAGNÉTICO enmarcado, colgado en la pared de un cuarto
 * (ADR-063 · NOM2 re-skin + FOTO4-A). Alternativa cálida a la nevera: el nombre o las fotos viven en
 * un tablero decorativo de una habitación, no en la cocina. Sigue siendo superficie magnética real
 * (WYSIWYG). Estilo "memo" (tablero claro) o "cork" (corcho, tipo moodboard).
 *
 * Pase de realismo 2026-07-22:
 *  - Corcho PROCEDURAL (canvas 2D → CanvasTexture, miles de gránulos) en vez de color plano.
 *  - El tablero cuelga QUIETO de la pared (un tablero colgado no flota: se eliminó el Floating);
 *    la sombra se proyecta contra la PARED (gradiente cenital sutil), no contra un piso invisible
 *    (se eliminó el ContactShadows de piso).
 *  - Imanes con CUERPO (MagnetMesh extruido: canto blanco + brillo PET), no planos.
 *
 * Pase 2026-07-22 (ola 2B):
 *  - Imanes ESCALAN a su tamaño físico real (sizeCm de la variante o wCm/hCm por pieza): el
 *    tablero mide ~45 cm de ancho (7 u → 0.1556 u/cm; 5.2 u ↔ 33.4 cm de alto cuadra con un
 *    tablero decorativo real ~45×33 cm). Mismo mecanismo de ajuste global uniforme que la nevera.
 *  - La pared queda a RAS del tablero (z −1.2 → −0.14): antes había ~1 u de AIRE entre el tablero
 *    y la pared (flotaba); ahora cuelga como un tablero real y la sombra se lee nítida.
 *
 * Restricciones (idénticas a las otras vistas 3D): CSP estricta (cero assets externos) ·
 * client-only (WebGL) → dynamic ssr:false.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, GradientTexture } from "@react-three/drei";
import { FitCamera } from "./fit-camera";
import { useIsTouch } from "./use-is-touch";
import { StudioEnvironment } from "./studio-3d-environment";
import { MagnetMesh, magnetWorldSizes } from "./magnet-3d";
import { getCorkTexture } from "./lib/procedural-textures";
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
const MAGNET_T = 0.056; // grosor total del imán extruido (0.04 + bisel) → z del centro

const FRAME_COLOR = "#B98A5E"; // marco de madera
// Tablero claro estilo memo. Un punto más hondo que el blanco de las fichas de letras (canto
// #F6F1E8): así la ficha blanca con su borde de color se lee nítida contra la superficie.
const MEMO_COLOR = "#F1EBDD";

// Escala física de la escena: tablero decorativo real ~45 cm de ancho (7 u).
const BOARD_U_PER_CM = BOARD_W / 45;

function Magnets({
  magnets,
  cols,
  sizeCm,
}: {
  magnets: Magnet3D[];
  cols: number;
  sizeCm?: string;
}) {
  const items = useMemo(() => {
    const rows = Math.max(1, Math.ceil(magnets.length / cols));
    const regionW = INNER_W * 0.9;
    const regionH = INNER_H * 0.82;
    const cellW = regionW / cols;
    const cellH = regionH / rows;
    const gap = 0.08;
    // Tamaños FÍSICOS (cm reales) si hay dato; null → ajuste-a-celda (p.ej. letras del nombre).
    const physical = magnetWorldSizes(magnets, BOARD_U_PER_CM, {
      cellW,
      cellH,
      gap,
      fallbackSizeCm: sizeCm,
    });
    return magnets.map((m, i) => {
      let w: number;
      let h: number;
      if (physical) {
        ({ w, h } = physical[i]!);
      } else {
        const aspect = m.hRatio / m.wRatio;
        w = cellW - gap;
        h = w * aspect;
        if (h > cellH - gap) {
          h = cellH - gap;
          w = h / aspect;
        }
      }
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = (col - (cols - 1) / 2) * cellW;
      const y = ((rows - 1) / 2 - row) * cellH;
      return { m, w, h, x, y };
    });
  }, [magnets, cols, sizeCm]);

  return (
    <>
      {items.map(({ m, w, h, x, y }, i) => (
        <MagnetMesh
          key={i}
          dataUrl={m.dataUrl}
          width={w}
          height={h}
          shape={m.shape}
          position={[x, y, FRONT_Z + MAGNET_T / 2 + 0.005]}
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
        <meshStandardMaterial
          color={FRAME_COLOR}
          roughness={0.6}
          metalness={0.05}
          envMapIntensity={0.8}
        />
      </RoundedBox>
      {/* Superficie magnética: corcho procedural o tablero claro, apenas hundida */}
      <mesh position={[0, 0, FRONT_Z - 0.01]} receiveShadow>
        <planeGeometry args={[INNER_W, INNER_H]} />
        <meshStandardMaterial
          map={style === "cork" ? getCorkTexture() : null}
          color={style === "cork" ? "#ffffff" : MEMO_COLOR}
          roughness={style === "cork" ? 0.95 : 0.7}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

function Scene({
  magnets,
  cols,
  style,
  sizeCm,
}: {
  magnets: Magnet3D[];
  cols: number;
  style: BoardStyle;
  sizeCm?: string;
}) {
  return (
    <>
      {/* Pared del cuarto a RAS del tablero (cuelga de verdad, no flota), con luz cenital sutil;
        recibe la sombra del tablero y los imanes. */}
      <mesh position={[0, 0, -0.14]} receiveShadow>
        <planeGeometry args={[40, 26]} />
        <meshStandardMaterial roughness={1} metalness={0}>
          <GradientTexture attach="map" stops={[0, 1]} colors={["#F2E9DC", "#E2D4C0"]} size={256} />
        </meshStandardMaterial>
      </mesh>

      {/* FB5 — env-map procedural para reflejos PBR (marco del tablero, imanes). Baja el ambiente
        directo porque el entorno ya aporta. */}
      <StudioEnvironment intensity={0.9} />
      <hemisphereLight args={["#fff6ea", "#e5dccd", 0.35]} />
      <ambientLight intensity={0.24} />
      <directionalLight
        position={[4, 6, 8]}
        intensity={1.0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-5, 2, 5]} intensity={0.3} />

      <Board style={style} />
      <Magnets magnets={magnets} cols={cols} sizeCm={sizeCm} />

      {/* #12 — encuadra el tablero al aspecto del viewport (fit-to-width en móvil vertical). */}
      <FitCamera halfW={BOARD_W / 2} halfH={BOARD_H / 2} margin={1.12} camY={0.3} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minAzimuthAngle={-0.9}
        maxAzimuthAngle={0.9}
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
  sizeCm,
}: {
  magnets: Magnet3D[];
  cols: number;
  style?: BoardStyle;
  /** sizeCm de la variante elegida (ej "6.5×6.5", "7.5×10") — escala física de los imanes. */
  sizeCm?: string;
}) {
  const isTouch = useIsTouch();
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
      dpr={isTouch ? [1, 1.5] : [1, 2]}
      camera={{ position: [0, 0.3, 12], fov: 42 }}
      gl={{ preserveDrawingBuffer: false, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#EBDFCF"]} />
      <Suspense fallback={null}>
        <Scene magnets={magnets} cols={cols} style={style} sizeCm={sizeCm} />
      </Suspense>
    </Canvas>
  );
}
