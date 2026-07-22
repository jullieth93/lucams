"use client";

/*
 * BookView3D — preview inmersivo de los SEPARADORES en su rincón natural: un LIBRO (ADR-063 · SEP1).
 * Los separadores NO son imanes de nevera → su hogar es un libro.
 *
 * Reescritura 2026-07-22 (ola 2C — foto de referencia de Lucy: separadores magnéticos reales
 * sobre un libro ABIERTO acostado, visto desde arriba-3/4). Antes el libro iba EN CARPA con los
 * separadores sobre el lomo — esa NO es la realidad de la foto. Ahora:
 *  - LIBRO ABIERTO ACOSTADO sobre la mesa: dos hojas con curvatura central al lomo (camber +
 *    valle de encuadernación), texto impreso procedural legible en ambas páginas, bloque de
 *    páginas en cuña (canto de hojas procedural), cubiertas con sobrehueso y lomo inferior.
 *  - 3 separadores DOBLADOS SOBRE EL BORDE SUPERIOR de las páginas (no sobre el lomo), a
 *    distintas alturas gracias al camber. La cara frontal reposa casi plana sobre la hoja
 *    mostrando el diseño del cliente hacia la cámara; la trasera cuelga apenas pasada la
 *    vertical abrazando el canto del bloque — al orbitar detrás se ve con el MISMO diseño
 *    legible de pie (así se imprimen los separadores reales: dos caras). El pliegue abraza el
 *    filo de la hoja (rFold ~2 mm) y las esquinas son REDONDAS (11% del ancho).
 *  - PROPORCIONES REALES (0.3 u/cm): página 17×24 cm (pliego abierto 34×24) vs tira de 6×2 cm
 *    (o 4×4.2 cm) — toda la matemática vive en lib/book-geometry.ts (pura, testeada): el
 *    reposo de la cara frontal sobre la hoja y el aire bajo la cara trasera están verificados.
 *  - Cámara con ángulo polar FIJO (FitCameraPolar): la vista arriba-3/4 no depende del aspecto
 *    del viewport (FitCamera dejaba el ángulo casi rasante en móvil vertical). Órbita libre en
 *    azimut y hasta bajo el horizonte para descubrir las caras traseras.
 *
 * Restricciones (idénticas a fridge/calendar 3D):
 *  - CSP estricta: CERO assets externos. Materiales/texturas procedurales en runtime.
 *  - Client-only (WebGL) → el caller lo importa con dynamic ssr:false.
 */

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { useIsTouch } from "./use-is-touch";
import { OrbitControls, RoundedBox, ContactShadows } from "@react-three/drei";
import { FitCameraPolar } from "./fit-camera-polar";
import { StudioEnvironment, StudioBackdrop } from "./studio-3d-environment";
import { FoldedStripMesh, parseSizeCm } from "./magnet-3d";
import { getPageEdgesTexture, getPagePrintTexture } from "./lib/procedural-textures";
import {
  BLOCK_T,
  BOOK_FIT,
  CM,
  COVER_OVERHANG,
  COVER_T,
  GUTTER_GAP,
  PAGE_D,
  PAGE_W,
  SEP_CORNER_RATIO,
  SEP_FOLD_ANGLE,
  SEP_R_FOLD,
  SEPARATOR_SLOTS,
  camber,
  separatorPlacement,
} from "./lib/book-geometry";
import type { Magnet3D } from "./fridge-3d-view";

const COVER_COLOR = "#8B5E3C"; // tapa de cuero/cartón cálido
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

/**
 * 3 separadores doblados sobre el BORDE SUPERIOR de las páginas (z = −PAGE_D/2), repartidos a
 * lo ancho a distintas alturas (el camber eleva el borde hacia el lomo) y con giros naturales.
 * La colocación física (tilt, altura del pliegue, holguras) sale de separatorPlacement — la cara
 * frontal reposa sobre la hoja y la trasera cuelga libre detrás del canto del bloque.
 */
function Separators({ items, sizeCm }: { items: Magnet3D[]; sizeCm?: string }) {
  const layout = useMemo(() => {
    const at = (i: number) => items[((i % items.length) + items.length) % items.length]!;
    return SEPARATOR_SLOTS.map(({ x, yaw }, i) => {
      const m = at(i);
      const { stripW, stripL } = stripDims(m, sizeCm);
      const p = separatorPlacement(x, stripL);
      return { m, stripW, stripL, x, yaw, p, i };
    })
      .filter(({ p }) => p.backClearance > 0.015) // nunca atravesar la mesa
      .map(({ m, stripW, stripL, x, yaw, p, i }) => ({
        key: i,
        m,
        stripW,
        stripL,
        position: [x, p.crestY, p.crestZ] as [number, number, number],
        rotation: [p.tilt, yaw, 0] as [number, number, number],
      }));
  }, [items, sizeCm]);

  return (
    <>
      {layout.map(({ key, m, stripW, stripL, position, rotation }) => (
        <group key={key} position={position} rotation={rotation}>
          <FoldedStripMesh
            dataUrl={m.dataUrl}
            wRatio={m.wRatio}
            hRatio={m.hRatio}
            stripW={stripW}
            stripL={stripL}
            foldAngle={SEP_FOLD_ANGLE}
            rFold={SEP_R_FOLD}
            cornerRadiusRatio={SEP_CORNER_RATIO}
          />
        </group>
      ))}
    </>
  );
}

/**
 * La hoja superior de un lado: plano segmentado deformado por vértices con el camber (sube hacia
 * el lomo y hunde en el valle de la encuadernación), con el texto impreso procedural. La página
 * izquierda espeja la textura (clon) para que el patrón de líneas no se repita idéntico.
 */
function PageSheet({ side }: { side: 1 | -1 }) {
  const print = getPagePrintTexture();
  const tex = useMemo(() => {
    if (side === 1) return print;
    const t = print.clone();
    t.repeat.set(-1, 1);
    t.offset.set(1, 0);
    t.needsUpdate = true;
    return t;
  }, [print, side]);
  useEffect(() => {
    if (tex === print) return;
    return () => tex.dispose();
  }, [tex, print]);

  const geoRef = useRef<THREE.PlaneGeometry>(null);
  const w = PAGE_W - GUTTER_GAP;
  const cx = side * (GUTTER_GAP / 2 + w / 2);
  useLayoutEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      // z local = normal del plano → altura mundial tras rotar −90° en X.
      pos.setZ(i, camber(pos.getX(i) + cx));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }, [cx]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[cx, COVER_T + BLOCK_T + 0.002, 0]}
      castShadow
      receiveShadow
    >
      <planeGeometry ref={geoRef} args={[w, PAGE_D, 28, 6]} />
      <meshStandardMaterial
        map={tex}
        roughness={0.85}
        metalness={0}
        side={THREE.DoubleSide}
        envMapIntensity={0.5}
      />
    </mesh>
  );
}

/**
 * El bloque de páginas de un lado: CUÑA extruida cuya cara superior sigue el camber (gruesa en
 * el corte, se levanta hacia el lomo bajo la hoja superior). Tapas y paredes con cantos de hoja
 * procedurales (la pared lleva un clon rotado 90° para que las hojas corran horizontales).
 */
function PageBlock({ side }: { side: 1 | -1 }) {
  const edges = getPageEdgesTexture();
  const edgesWall = useMemo(() => {
    const t = edges.clone();
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
    t.needsUpdate = true;
    return t;
  }, [edges]);
  useEffect(() => () => edgesWall.dispose(), [edgesWall]);

  const geometry = useMemo(() => {
    const x0 = GUTTER_GAP / 2;
    const x1 = PAGE_W;
    const shape = new THREE.Shape();
    shape.moveTo(x0, 0);
    shape.lineTo(x1, 0);
    shape.lineTo(x1, BLOCK_T + camber(x1)); // canto exterior (vertical)
    const N = 24;
    for (let i = 1; i <= N; i++) {
      const x = x1 - ((x1 - x0) * i) / N;
      shape.lineTo(x, BLOCK_T + camber(x));
    }
    shape.closePath(); // cara del lomo (vertical)
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: PAGE_D - 0.06,
      bevelEnabled: false,
      curveSegments: 4,
      steps: 1,
    });
    geo.translate(0, 0, -(PAGE_D - 0.06) / 2);
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      position={[0, COVER_T, 0]}
      scale={[side, 1, 1]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial attach="material-0" map={edges} roughness={0.92} metalness={0} />
      <meshStandardMaterial attach="material-1" map={edgesWall} roughness={0.92} metalness={0} />
    </mesh>
  );
}

/** Cubierta de un lado (cartón con sobrehueso, apoya sobre la mesa). */
function Cover({ side }: { side: 1 | -1 }) {
  // Del lomo (−0.16, pasa bajo el lomo) al corte + sobrehueso.
  const w = PAGE_W + COVER_OVERHANG + 0.16;
  const cx = side * ((PAGE_W + COVER_OVERHANG - 0.16) / 2);
  return (
    <RoundedBox
      args={[w, COVER_T, PAGE_D + COVER_OVERHANG * 2]}
      radius={0.02}
      smoothness={3}
      position={[cx, COVER_T / 2, 0]}
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
  );
}

/** El lomo del libro, apoyado sobre la mesa entre las dos cubiertas. */
function SpinePiece() {
  return (
    <RoundedBox
      args={[0.5, 0.09, PAGE_D + COVER_OVERHANG * 2]}
      radius={0.03}
      smoothness={3}
      position={[0, 0.045, 0]}
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
      <StudioBackdrop position={[0, -0.02, -6]} scale={[40, 22, 8]} />
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

      {/* El libro abierto acostado sobre la mesa (y=0). */}
      <SpinePiece />
      <Cover side={1} />
      <Cover side={-1} />
      <PageBlock side={1} />
      <PageBlock side={-1} />
      <PageSheet side={1} />
      <PageSheet side={-1} />
      <Separators items={bookmarks} sizeCm={sizeCm} />

      {/* Escena estática (el autoRotate mueve la CÁMARA) → sombra horneada 1 vez. */}
      <ContactShadows
        frames={1}
        position={[0, 0.004, 0]}
        opacity={0.4}
        blur={2.6}
        scale={18}
        far={6}
      />
      {/* Encuadre con ángulo polar fijo (arriba-3/4) — no depende del aspecto del viewport. */}
      <FitCameraPolar
        halfW={BOOK_FIT.halfW}
        halfH={BOOK_FIT.halfH}
        polarDeg={BOOK_FIT.polarDeg}
        margin={1.12}
        targetY={BOOK_FIT.targetY}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.6}
        minPolarAngle={0.32}
        maxPolarAngle={Math.PI / 1.9}
        minDistance={5}
        maxDistance={60}
        target={[0, BOOK_FIT.targetY, 0]}
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
      camera={{ position: [0, 9, 12], fov: 40 }}
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
