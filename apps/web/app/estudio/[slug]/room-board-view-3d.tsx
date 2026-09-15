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
 *  - Imanes ESCALAN a su tamaño físico real (sizeCm de la variante o wCm/hCm por pieza).
 *  - 2026-09-15: TAMAÑO REAL SIEMPRE — se eliminó el encogimiento a la celda (con muchas
 *    unidades las piezas se veían miniatura). Cuando una columna supera el alto útil del
 *    tablero se ABREN más columnas balanceadas (lib/cluster-layout, compartido con la nevera)
 *    y, si el conjunto desborda, la cámara reencuadra tablero + clúster. Nunca se encoge una
 *    pieza.
 *  - Ola 30 (2026-09-15, feedback dueña: "3D Mural, totalmente desproporcionada"): el tablero
 *    CRECE a un corcho de pared grande y realista, 120×80 cm (BOARD_SCENE en lib/cluster-layout,
 *    fuente única compartida con los tests de proporción; escala redonda 0.1 u/cm). El
 *    tablerito anterior de 45×33 cm era irreal para el producto: con su alto solo cabía UNA
 *    fila de tiras de 26.5 cm → 12 tiras abrían 12 columnas y desbordaban por ambos lados.
 *    Ahora las 12 tiras quedan en una grilla 6×2 DENTRO del marco, con aire.
 *  - La pared queda a RAS del tablero (z −1.2 → −0.14): antes había ~1 u de AIRE entre el tablero
 *    y la pared (flotaba); ahora cuelga como un tablero real y la sombra se lee nítida.
 *
 * Restricciones (idénticas a las otras vistas 3D): CSP estricta (cero assets externos) ·
 * client-only (WebGL) → dynamic ssr:false.
 *
 * Pase 2026-07-22 (ola 3 — Lucy: "bajar UN PUNTO, no planas"): el grosor del extruido depende
 * del estilo — las fichas de letras del tablero MEMO (abecedario/vocales/nombre, mismo path de
 * texturas y extrusión) bajan de 0.04 a 0.025 (−37.5%) con bisel y sombra intactos; el corcho
 * (fotoimanes) conserva el grosor de imán.
 * Pase 2026-07-23 (ola 4 — Lucy: "siguen muy gruesas"): las fichas bajan OTRO punto (0.025 →
 * 0.015, ~62.5% bajo el imán) sin llegar a planas; el z sobre el tablero deriva del depth
 * (totalThickness), así el cambio no hunde ni levanta las fichas.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, GradientTexture } from "@react-three/drei";
import { FitCamera } from "./fit-camera";
import { useIsTouch } from "./use-is-touch";
import { StudioEnvironment } from "./studio-3d-environment";
import { MagnetMesh, MAGNET_DEPTH, TILE_DEPTH, magnetWorldSizes } from "./magnet-3d";
import { clusterLayout, BOARD_SCENE } from "./lib/cluster-layout";
import { getCorkTexture } from "./lib/procedural-textures";
import type { Magnet3D } from "./fridge-3d-view";

export type BoardStyle = "memo" | "cork";

// Mural de corcho de pared GRANDE (tamaño fijo). Dimensiones REALES 120×80 cm (Ola 30 —
// feedback dueña: el tablerito de 45×33 desbordaba con 12 tiras). Las constantes físicas viven
// en BOARD_SCENE (lib/cluster-layout) — fuente única compartida con los tests de proporción.
const BOARD_W = BOARD_SCENE.wU; // 12 u ↔ 120 cm
const BOARD_H = BOARD_SCENE.hU; // 8 u ↔ 80 cm
const FRAME = BOARD_SCENE.frameU; // marco de madera 0.55 u ↔ 5.5 cm
const DEPTH = BOARD_SCENE.depthU; // 0.22 u ↔ 2.2 cm
const INNER_W = BOARD_W - FRAME * 2;
const INNER_H = BOARD_H - FRAME * 2;
const FRONT_Z = DEPTH / 2;

/** Grosor del extruido por estilo (ola 3 — Lucy: las fichas de letras se ven muy gruesas,
 *  "bajar UN PUNTO, no planas"; ola 4 2026-07-23: "siguen muy gruesas" → OTRO punto):
 *  memo (fichas de letras/nombre/vocales) → TILE_DEPTH (0.015, bisel y sombra intactos);
 *  cork (fotoimanes) → el grosor de imán de siempre. */
function boardDepth(style: BoardStyle): number {
  return style === "memo" ? TILE_DEPTH : MAGNET_DEPTH;
}

/** Grosor TOTAL del extruido: depth + bisel a ambos lados (bevelThickness = 0.2·depth c/u). */
function totalThickness(depth: number): number {
  return depth * 1.4;
}

const FRAME_COLOR = "#B98A5E"; // marco de madera
// Tablero claro estilo memo. Un punto más hondo que el blanco de las fichas de letras (canto
// #F6F1E8): así la ficha blanca con su borde de color se lee nítida contra la superficie.
const MEMO_COLOR = "#F1EBDD";

// Escala física de la escena: corcho de pared real de 120 cm de ancho (12 u → 0.1 u/cm).
const BOARD_U_PER_CM = BOARD_SCENE.uPerCm;

// Clúster a TAMAÑO REAL (2026-09-15): estos límites ya no ENCOGEN las piezas — definen la
// disposición estética dentro del marco (BOARD_SCENE.cluster). Cuando una columna supera el
// alto útil (MAX_CLUSTER_H) se ABREN más columnas (lib/cluster-layout, compartido con la
// nevera — el ancho puede crecer más allá del tablero si hace falta); si el conjunto desborda,
// FitCamera reencuadra tablero + clúster (nunca se encoge una pieza).
const MAGNET_GAP = BOARD_SCENE.cluster.gap;
const MAX_CLUSTER_W = BOARD_SCENE.cluster.maxW;
const MAX_CLUSTER_H = BOARD_SCENE.cluster.maxH;

type BoardItem = { m: Magnet3D; w: number; h: number; x: number; y: number };

/**
 * Disposición del clúster a tamaño real (2026-09-15): la matemática vive en lib/cluster-layout
 * (compartida con la nevera): las columnas pedidas se respetan mientras quepan a lo ancho del
 * tablero y, cuando una columna supera el ALTO útil, se ABREN más columnas balanceadas (≤ 1
 * pieza de diferencia) — nunca se encoge una pieza. Devuelve las piezas posicionadas (centro del
 * tablero) y los medios-bounds para FitCamera.
 */
function boardClusterLayout(
  magnets: Magnet3D[],
  cols: number,
  sizeCm?: string,
): { items: BoardItem[]; halfW: number; halfH: number } {
  const physical = magnetWorldSizes(magnets, BOARD_U_PER_CM, { fallbackSizeCm: sizeCm });
  if (physical) {
    const layout = clusterLayout(physical, {
      maxW: MAX_CLUSTER_W,
      maxH: MAX_CLUSTER_H,
      gap: MAGNET_GAP,
      preferCols: cols,
    });
    return {
      items: layout.items.map((it, i) => ({ m: magnets[i]!, w: it.w, h: it.h, x: it.x, y: it.y })),
      halfW: layout.halfW,
      halfH: layout.halfH,
    };
  }
  // Sin dato de cm (p.ej. letras del nombre): ajuste-a-celda histórico sobre la región vieja.
  const regionW = MAX_CLUSTER_W;
  const regionH = MAX_CLUSTER_H;
  const rows = Math.max(1, Math.ceil(magnets.length / cols));
  const cellW = regionW / cols;
  const cellH = regionH / rows;
  const items = magnets.map((m, i) => {
    const aspect = m.hRatio / m.wRatio;
    let w = cellW - MAGNET_GAP;
    let h = w * aspect;
    if (h > cellH - MAGNET_GAP) {
      h = cellH - MAGNET_GAP;
      w = h / aspect;
    }
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * cellW;
    const y = ((rows - 1) / 2 - row) * cellH;
    return { m, w, h, x, y };
  });
  return { items, halfW: regionW / 2, halfH: regionH / 2 };
}

function Magnets({ items, style }: { items: BoardItem[]; style: BoardStyle }) {
  const depth = boardDepth(style);
  const z = FRONT_Z + totalThickness(depth) / 2 + 0.005;

  return (
    <>
      {items.map(({ m, w, h, x, y }, i) => (
        <MagnetMesh
          key={i}
          dataUrl={m.dataUrl}
          width={w}
          height={h}
          shape={m.shape}
          depth={depth}
          cornerRadiusRatio={m.cornerRadiusRatio}
          position={[x, y, z]}
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
  const layout = useMemo(() => boardClusterLayout(magnets, cols, sizeCm), [magnets, cols, sizeCm]);
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
      <Magnets items={layout.items} style={style} />

      {/* #12 — encuadra el tablero al aspecto del viewport (fit-to-width en móvil vertical).
          2026-09-15: si el clúster a tamaño real desborda el tablero, el encuadre crece hasta
          cubrir tablero + clúster completo (las piezas NUNCA se encogen). */}
      <FitCamera
        halfW={Math.max(BOARD_W / 2, layout.halfW + 0.1)}
        halfH={Math.max(BOARD_H / 2, layout.halfH + 0.1)}
        margin={1.12}
        camY={0.3}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        minAzimuthAngle={-0.9}
        maxAzimuthAngle={0.9}
        minPolarAngle={Math.PI / 3.5}
        maxPolarAngle={Math.PI / 1.9}
        minDistance={7}
        maxDistance={60}
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
