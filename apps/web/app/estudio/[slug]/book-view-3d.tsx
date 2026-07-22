"use client";

/*
 * BookView3D — preview inmersivo de los SEPARADORES en su rincón natural: un LIBRO (ADR-063 · SEP1).
 * Los separadores NO son imanes de nevera → su hogar es un libro.
 *
 * Pase de realismo 2026-07-22 (ola 2B — foto de referencia de Lucy: separador magnético real):
 *  - PROPORCIONES REALES (0.3 u/cm): libro 17×24 cm vs tira de 6×2 cm (o 4×4.2 cm). Antes el
 *    "marcador" medía ~85% del alto del libro — un separador real es una tira PEQUEÑA.
 *  - El libro va en CARPA (abierto, apoyado sobre sus propias cubiertas): puesta en escena real de
 *    producto, sin nada flotando (la versión anterior lo reclinaba 0.5 rad contra el vacío).
 *  - El separador se DOBLA A LA MITAD sobre el lomo (FoldedStripMesh): dos caras con grosor de
 *    cartulina (0.4 mm) + cresta del pliegue abrazando el lomo; la cresta COME tira (arco
 *    r·foldAngle), así el largo visible de cada cara sale de la física, no de un número mágico.
 *  - 2 CARAS: la cara frontal muestra el diseño del cliente (recorte cover centrado, sin deformar)
 *    y la trasera muestra el MISMO diseño orientado para leerse desde atrás — al orbitar se ve
 *    que el separador es de dos caras (la edición de 2 caras independientes en Estudio 2D/render
 *    de producción va en otra fase).
 *  - 3 separadores sobre el lomo (rotando los diseños del pack), con leves giros naturales.
 *  - Libro con detalle: cubiertas con marco repujado, bloque de páginas con cantos de hoja
 *    procedurales, caras internas del bloque con texto impreso procedural, lomo redondeado.
 *  - Sombras coherentes: la luz key tiene shadow-camera acotada explícita (antes ±5 por defecto →
 *    se recortaban las sombras de un objeto de ~6.3 u de alto).
 *
 * Restricciones (idénticas a fridge/calendar 3D):
 *  - CSP estricta: CERO assets externos. Materiales/texturas procedurales en runtime.
 *  - Client-only (WebGL) → el caller lo importa con dynamic ssr:false.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { useIsTouch } from "./use-is-touch";
import { OrbitControls, RoundedBox, ContactShadows } from "@react-three/drei";
import { FitCamera } from "./fit-camera";
import { StudioEnvironment, StudioBackdrop } from "./studio-3d-environment";
import { FoldedStripMesh, parseSizeCm } from "./magnet-3d";
import { getPageEdgesTexture, getPagePrintTexture } from "./lib/procedural-textures";
import type { Magnet3D } from "./fridge-3d-view";

// ── Proporciones reales (0.3 unidades de mundo por cm) ──
const CM = 0.3;
// Libro 17×24 cm en carpa: cada cara de la carpa = cubierta (17 de ancho × 24 de largo de página).
const PAGE_LEN = 24 * CM; // 7.2 — largo de la cara (del lomo a la mesa)
const COVER_W = 17 * CM; // 5.1 — ancho del libro (a lo largo del lomo)
const COVER_T = 0.05; // cartón de cubierta ~1.7 mm
const BLOCK_T = 0.28; // bloque de páginas ~0.9 cm
const COVER_EPS = 0.002; // epsilon: la cubierta no queda coplanar con la cara del bloque
const BLOCK_INSET = 0.24; // sobrehueso de la cubierta respecto al bloque (8 mm)
// Apertura de la carpa: cada cara se aparta GAMMA de la vertical (≈28° → carpa amplia y estable).
const GAMMA = 0.49;
const COS_G = Math.cos(GAMMA);
const SIN_G = Math.sin(GAMMA);
// Punto más bajo de la carpa respecto al lomo: el canto exterior inferior de la CUBIERTA (cara
// externa en BLOCK_T/2 + COVER_EPS + COVER_T). Apoya el libro sobre la mesa sin que nada rasgue.
const FOOT_Y = -(PAGE_LEN * COS_G - (BLOCK_T / 2 + COVER_EPS + COVER_T) * SIN_G);
// Altura visual del conjunto (lomo + crestas) para centrar la escena en Y.
const TOP_Y = 0.26;
// Desplazamiento del grupo para que el centro de la bbox quede en el origen de la escena.
const GROUP_Y = -(FOOT_Y + TOP_Y) / 2;
// Pliegue de los separadores: abraza el lomo (media profundidad del lomo + holgura de cartulina).
const FOLD_ANGLE = Math.PI - 2 * GAMMA; // ángulo que gira el material sobre el lomo
const R_FOLD = 0.23;

const COVER_COLOR = "#8B5E3C"; // tapa de cuero/cartón cálido
const COVER_PANEL = "#7C5334"; // marco repujado (un pelo más oscuro)
const SPINE_COLOR = "#7C5334";

/** Dimensiones físicas de la tira desplegada (u de mundo) según sizeCm de la variante o aspecto. */
function stripDims(m: Magnet3D, sizeCm: string | undefined): { stripW: number; stripL: number } {
  const parsed = parseSizeCm(sizeCm);
  if (parsed) {
    return {
      stripW: Math.min(parsed.wCm, parsed.hCm) * CM,
      stripL: Math.max(parsed.wCm, parsed.hCm) * CM,
    };
  }
  // Sin sizeCm: el separador rectangular (lienzo ~5:14) es 2×6 cm; el cuadrado (1:1) es 4×4.2 cm.
  const tall = m.hRatio / m.wRatio >= 1.8;
  return tall ? { stripW: 2 * CM, stripL: 6 * CM } : { stripW: 4 * CM, stripL: 4.2 * CM };
}

/** 3 separadores doblados sobre el lomo, repartidos a lo ancho con giros naturales. */
function Separators({ items, sizeCm }: { items: Magnet3D[]; sizeCm?: string }) {
  const layout = useMemo(() => {
    const at = (i: number) => items[((i % items.length) + items.length) % items.length]!;
    const X = [-1.5, 0.08, 1.55];
    const YAW = [0.05, -0.04, 0.03];
    return X.map((x0, i) => {
      const m = at(i);
      const { stripW, stripL } = stripDims(m, sizeCm);
      // Que la tira nunca se salga del lomo por los extremos.
      const maxX = COVER_W / 2 - stripW / 2 - 0.18;
      const x = Math.max(-maxX, Math.min(maxX, x0));
      return { m, stripW, stripL, x, yaw: YAW[i]!, i };
    });
  }, [items, sizeCm]);

  return (
    <>
      {layout.map(({ m, stripW, stripL, x, yaw, i }) => (
        <group key={i} position={[x, 0, 0]} rotation={[0, yaw, 0]}>
          <FoldedStripMesh
            dataUrl={m.dataUrl}
            wRatio={m.wRatio}
            hRatio={m.hRatio}
            stripW={stripW}
            stripL={stripL}
            foldAngle={FOLD_ANGLE}
            rFold={R_FOLD}
          />
        </group>
      ))}
    </>
  );
}

/**
 * Una cara de la carpa: cubierta (con marco repujado) + bloque de páginas. `side` = +1 cara hacia
 * la cámara (+z), -1 cara trasera. El bloque lleva materiales por cara: cantos de hoja en los
 * bordes expuestos y texto impreso en la cara interna (la página abierta visible en la carpa).
 */
function BookHalf({ side }: { side: 1 | -1 }) {
  const edges = getPageEdgesTexture();
  const print = getPagePrintTexture();
  return (
    <group rotation={[side === 1 ? -GAMMA : GAMMA, 0, 0]}>
      {/* Cubierta */}
      <RoundedBox
        args={[COVER_W, PAGE_LEN, COVER_T]}
        radius={0.02}
        smoothness={3}
        position={[0, -PAGE_LEN / 2, side * (BLOCK_T / 2 + COVER_T / 2 + COVER_EPS)]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={COVER_COLOR}
          roughness={0.65}
          metalness={0.05}
          envMapIntensity={0.8}
        />
      </RoundedBox>
      {/* Marco repujado de la cubierta (detalle sutil, como una tapa real) */}
      <RoundedBox
        args={[COVER_W - 0.7, PAGE_LEN - 0.9, 0.012]}
        radius={0.05}
        smoothness={3}
        position={[0, -PAGE_LEN / 2, side * (BLOCK_T / 2 + COVER_EPS + COVER_T + 0.006)]}
        receiveShadow
      >
        <meshStandardMaterial color={COVER_PANEL} roughness={0.7} metalness={0.05} />
      </RoundedBox>
      {/* Bloque de páginas: 5 caras con cantos de hoja + cara interna con texto impreso */}
      <mesh position={[0, -PAGE_LEN / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[COVER_W - BLOCK_INSET, PAGE_LEN - BLOCK_INSET, BLOCK_T]} />
        {/* orden de caras del box: +x, −x, +y, −y, +z, −z */}
        <meshStandardMaterial attach="material-0" map={edges} roughness={0.9} metalness={0} />
        <meshStandardMaterial attach="material-1" map={edges} roughness={0.9} metalness={0} />
        <meshStandardMaterial attach="material-2" map={edges} roughness={0.9} metalness={0} />
        <meshStandardMaterial attach="material-3" map={edges} roughness={0.9} metalness={0} />
        <meshStandardMaterial
          attach="material-4"
          map={side === 1 ? edges : print}
          roughness={0.9}
          metalness={0}
        />
        <meshStandardMaterial
          attach="material-5"
          map={side === 1 ? print : edges}
          roughness={0.9}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

/** El lomo: tira redondeada que une las cubiertas en el eje de la carpa (la cresta la abraza). */
function Spine() {
  return (
    <RoundedBox
      args={[COVER_W, 0.1, 0.42]}
      radius={0.03}
      smoothness={3}
      position={[0, 0, 0]}
      castShadow
    >
      <meshStandardMaterial color={SPINE_COLOR} roughness={0.65} metalness={0.05} />
    </RoundedBox>
  );
}

function Scene({ bookmarks, sizeCm }: { bookmarks: Magnet3D[]; sizeCm?: string }) {
  // #16 — no autorrotar si el usuario pide reducir movimiento.
  const reduced = usePrefersReducedMotion();
  return (
    <>
      {/* FB5 — env-map procedural (reflejos en cubierta/cartulina) + ciclorama de estudio. */}
      <StudioEnvironment intensity={0.95} />
      <StudioBackdrop position={[0, GROUP_Y + FOOT_Y - 0.02, -6]} scale={[40, 22, 8]} />
      <hemisphereLight args={["#fff6e8", "#d8cbb8", 0.32]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[4, 7, 8]}
        intensity={1.05}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={9}
        shadow-camera-bottom={-8}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-5, 3, 4]} intensity={0.3} />

      {/* El libro en carpa, centrado verticalmente en la escena. */}
      <group position={[0, GROUP_Y, 0]}>
        <BookHalf side={1} />
        <BookHalf side={-1} />
        <Spine />
        <Separators items={bookmarks} sizeCm={sizeCm} />
      </group>

      {/* Escena estática (el autoRotate mueve la CÁMARA) → sombra horneada 1 vez. */}
      <ContactShadows
        frames={1}
        position={[0, GROUP_Y + FOOT_Y + 0.004, 0]}
        opacity={0.4}
        blur={2.6}
        scale={16}
        far={6}
      />
      {/* #12 — encuadra la carpa (ancho del lomo × alto total) al aspecto del viewport. */}
      <FitCamera
        halfW={COVER_W / 2 + 0.4}
        halfH={(TOP_Y - FOOT_Y) / 2 + 0.3}
        margin={1.12}
        camY={0.3}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.6}
        minPolarAngle={0.5}
        maxPolarAngle={Math.PI / 1.94}
        minDistance={6}
        maxDistance={24}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function BookView3D({
  bookmarks,
  sizeCm,
}: {
  bookmarks: Magnet3D[];
  /** sizeCm de la variante (ej "6×2", "4×4.2") — fija el tamaño real de la tira. */
  sizeCm?: string;
}) {
  const isTouch = useIsTouch();
  if (bookmarks.length === 0) {
    return (
      <div className="text-brand-muted flex h-full items-center justify-center p-8 text-center text-sm">
        Agrega una foto para ver tu separador en el libro.
      </div>
    );
  }
  return (
    <Canvas
      shadows
      dpr={isTouch ? [1, 1.5] : [1, 2]}
      camera={{ position: [0, 0.3, 13], fov: 42 }}
      gl={{ preserveDrawingBuffer: false, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#FFF8F0"]} />
      <Suspense fallback={null}>
        <Scene bookmarks={bookmarks} sizeCm={sizeCm} />
      </Suspense>
    </Canvas>
  );
}
