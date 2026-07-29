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
 * 2026-07-22 (ola 3 — Lucy: "no se ven igual ni el tamaño ni se evidencian las 2 caras de 1
 * imán montado"):
 *  - CARAS REALES del Estudio: las 2N texturas se agrupan en unidades (bookmarkFaceUnits: slot
 *    par = cara A → FRENTE, impar = cara B → ATRÁS, vía FoldedStripMesh.backDataUrl). Al orbitar
 *    detrás se ve la cara B con SU propio diseño, de pie.
 *  - La CARA manda en tamaño y encuadre: cada lienzo del Estudio es UNA cara (600×200 → 6×2 cm ·
 *    400×420 → 4×4.2 cm) y la cara 3D respeta su aspecto EXACTO (stripDimsForFace) → el diseño
 *    se ve completo, con la orientación/encuadre que dejó el cliente (sin re-corte), y una cara
 *    4×4.2 se ve claramente distinta de una 6×2.
 *  - Cara trasera larga (4×4.2): se RECUESTÁ sobre la mesa detrás del libro (backLean de
 *    separatorPlacement) en vez de atravesarla — como la cartulina flexible real.
 *
 * 2026-07-23 (ola 4 — Lucy: "la cara de atrás se ve negra · libro más plano · separador más
 * de pie"):
 *  - BUG cara B NEGRA: el offset UV con flipV dejaba el muestreo FUERA de rango (v ≥ 1 →
 *    ClampToEdge estiraba la fila del borde superior del lienzo, transparente/oscura) — fix en
 *    magnet-3d.textureRegionTransform (+ flipU: la cara B se lee DERECHA desde atrás, no
 *    espejada). Además la trasera cuelga de espaldas a las dos luces principales → relleno de
 *    contraluz desde −Z que la hace legible de pie sin quemar la frontal.
 *  - COMPOSICIÓN: el libro tiende a MÁS PLANO (CAMBER_MAX 0.9 → 0.6, elevación ~2 cm) y el
 *    separador queda un punto MÁS ERGUIDO sobre el borde (SEP_FRONT_LIFT_DEG 3° → 14°): la cara
 *    frontal se lee más de frente y la punta sigue reposando sobre la hoja (lib/book-geometry).
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
import { FoldedStripMesh, MagnetMesh } from "./magnet-3d";
import { getPageEdgesTexture, getPagePrintTexture } from "./lib/procedural-textures";
import {
  BLOCK_T,
  BOOK_FIT,
  COVER_OVERHANG,
  COVER_T,
  FLAT_BOOKMARK_T,
  GUTTER_GAP,
  MAX_BACK_LEAN,
  PAGE_D,
  PAGE_W,
  SEP_CORNER_RATIO,
  SEP_FOLD_ANGLE,
  SEP_R_FOLD,
  SEPARATOR_SLOTS,
  bookmarkFaceUnits,
  camber,
  flatBookmarkDims,
  flatBookmarkPlacementUpright,
  flatBookmarkSlots,
  separatorPlacement,
  stripDimsForFace,
} from "./lib/book-geometry";
import type { Magnet3D } from "./fridge-3d-view";

const COVER_COLOR = "#8B5E3C"; // tapa de cuero/cartón cálido
const SPINE_COLOR = "#7C5334";

function separatorSlotsForCount(count: number): { x: number; yaw: number }[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, yaw: 0 }];
  if (count === 2) {
    return [
      { x: SEPARATOR_SLOTS[0]!.x * 0.55, yaw: SEPARATOR_SLOTS[0]!.yaw },
      { x: SEPARATOR_SLOTS[2]!.x * 0.55, yaw: SEPARATOR_SLOTS[2]!.yaw },
    ];
  }
  if (count === 3) return SEPARATOR_SLOTS.slice();
  // >3: distribuir uniformemente en el mismo tramo, manteniendo yaws sutiles.
  const minX = SEPARATOR_SLOTS[0]!.x;
  const maxX = SEPARATOR_SLOTS[2]!.x;
  return Array.from({ length: count }, (_, i) => ({
    x: minX + ((maxX - minX) * i) / (count - 1),
    yaw: (i % 2 === 0 ? 1 : -1) * 0.05,
  }));
}

/**
 * 3 separadores doblados sobre el BORDE SUPERIOR de las páginas (z = −PAGE_D/2), repartidos a
 * lo ancho a distintas alturas (el camber eleva el borde hacia el lomo) y con giros naturales.
 * Ola 3: las texturas del Estudio se agrupan en UNIDADES (cara A al frente, cara B atrás) y cada
 * cara conserva su aspecto real (6×2 vs 4×4.2 se ven distintas; el diseño no se re-corta).
 * La colocación física (tilt, altura del pliegue, recosto de la trasera) sale de
 * separatorPlacement — la cara frontal reposa sobre la hoja y la trasera cuelga libre o se
 * recuesta sobre la mesa sin atravesarla.
 * Ola 16: renderizamos UNA instancia por unidad real del cliente, nunca repitiendo para llenar
 * 3 slots. Si hay 1 separador se ve 1; si hay 3, se ven 3 posicionados como la foto de referencia.
 */
function Separators({
  items,
  sizeCm,
  facesPerUnit,
}: {
  items: Magnet3D[];
  sizeCm?: string;
  facesPerUnit?: number;
}) {
  const layout = useMemo(() => {
    const units = bookmarkFaceUnits(items, facesPerUnit, sizeCm);
    const slots = separatorSlotsForCount(units.length);
    return slots
      .map(({ x, yaw }, i) => {
        const unit = units[i]!;
        const { stripW, stripL } = stripDimsForFace(unit.front, sizeCm);
        const p = separatorPlacement(x, stripL);
        return { unit, stripW, stripL, x, yaw, p, i };
      })
      .filter(
        // Cuelga libre, o recostada dentro del límite — nunca atravesar la mesa.
        ({ p }) => p.backClearance > 0.015 || p.backLean <= MAX_BACK_LEAN,
      )
      .map(({ unit, stripW, stripL, x, yaw, p, i }) => ({
        key: i,
        unit,
        stripW,
        stripL,
        backLean: p.backClearance > 0.015 ? 0 : p.backLean,
        position: [x, p.crestY, p.crestZ] as [number, number, number],
        rotation: [p.tilt, yaw, 0] as [number, number, number],
      }));
  }, [items, sizeCm, facesPerUnit]);

  return (
    <>
      {layout.map(({ key, unit, stripW, stripL, backLean, position, rotation }) => (
        <group key={key} position={position} rotation={rotation}>
          <FoldedStripMesh
            dataUrl={unit.front.dataUrl}
            backDataUrl={unit.back.dataUrl}
            wRatio={unit.front.wRatio}
            hRatio={unit.front.hRatio}
            stripW={stripW}
            stripL={stripL}
            foldAngle={SEP_FOLD_ANGLE}
            rFold={SEP_R_FOLD}
            cornerRadiusRatio={SEP_CORNER_RATIO}
            backLean={backLean}
          />
        </group>
      ))}
    </>
  );
}

/**
 * Ola 17 — marcapáginas ALARGADO PLANO (sin doblez): la pieza se ACUESTA sobre la hoja
 * derecha del libro, como el marcapáginas clásico de la foto de referencia (vertical,
 * bordes redondeados, diseño en toda la cara). Se extruye finita (~1 mm) con la textura
 * del frente en la tapa — la cara B va impresa en el reverso físico pero queda contra la
 * página (al orbitar por debajo no aplica: la pieza reposa sobre la hoja).
 * La textura del Estudio ya viene VERTICAL (stage 400×1500 / 400×1200) → NO se rota,
 * a diferencia de los separadores doblados (textura horizontal rotada 90° en el editor).
 */
function FlatBookmarks({
  items,
  sizeCm,
  facesPerUnit,
}: {
  items: Magnet3D[];
  sizeCm?: string;
  facesPerUnit?: number;
}) {
  const layout = useMemo(() => {
    const units = bookmarkFaceUnits(items, facesPerUnit, sizeCm);
    const slots = flatBookmarkSlots(units.length);
    return units.map((unit, i) => {
      const { w, h } = flatBookmarkDims(unit.front, sizeCm);
      const slot = slots[i]!;
      return {
        key: i,
        unit,
        w,
        h,
        position: flatBookmarkPlacementUpright(slot.x, slot.z, h),
        yaw: slot.yaw,
      };
    });
  }, [items, sizeCm, facesPerUnit]);

  return (
    <>
      {layout.map(({ key, unit, w, h, position, yaw }) => (
        <group key={key} position={position} rotation={[0, yaw, 0]}>
          {/* Ola 18 — la pieza se muestra DE PIE sobre la hoja (sin rotación): la cara A
              mira a la cámara y la cara B se descubre al orbitar detrás. El diseño físico del
              alargado es plano, pero para que el cliente vea las 2 caras que montó en el
              estudio, la pieza 3D se presenta erguida como los separadores doblados. */}
          <MagnetMesh
            dataUrl={unit.front.dataUrl}
            backDataUrl={unit.back.dataUrl}
            width={w}
            height={h}
            shape="rectangle"
            depth={FLAT_BOOKMARK_T}
            cornerRadiusRatio={0.06}
            position={[0, 0, 0]}
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

function Scene({
  bookmarks,
  sizeCm,
  facesPerUnit,
  flat,
}: {
  bookmarks: Magnet3D[];
  sizeCm?: string;
  facesPerUnit?: number;
  /** Ola 17 — marcapáginas plano (Alargados): acostado sobre la hoja, sin doblez. */
  flat?: boolean;
}) {
  // Ola 16 — defensa: si el producto no declara 2 caras, el 3D no puede mostrar
  // la cara B real. Log para soporte; el UI del Estudio sigue funcionando con 1 cara.
  if (process.env.NODE_ENV === "development" && facesPerUnit !== 2) {
    console.warn("[BookView3D] facesPerUnit !== 2; la cara B no se renderizará.", {
      facesPerUnit,
      bookmarks: bookmarks.length,
    });
  }
  // #16 — no autorrotar si el usuario pide reducir movimiento.
  const reduced = usePrefersReducedMotion();
  // Ola 18/19 — encuadre dinámico:
  // - Alargados planos (pieza alta 12/15 cm): encuadre más holgado y centrado en la hoja
  //   derecha para que la pieza completa sea visible.
  // - Separadores doblados (pieza chica 2×6): encuadre más cercano para que la tira se lea.
  const fit = useMemo(() => {
    if (flat) {
      return {
        halfW: 3.0,
        halfH: 5.0,
        polarDeg: 48,
        targetY: 1.2,
        targetX: PAGE_W / 2,
        targetZ: 0,
        margin: 1.05,
        minDistance: 3.5,
      };
    }
    return {
      ...BOOK_FIT,
      halfH: BOOK_FIT.halfH * 0.55,
      halfW: BOOK_FIT.halfW * 0.75,
      targetX: 0,
      targetZ: 0,
      margin: 1.12,
      minDistance: 5,
    };
  }, [flat]);
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
      {/* Ola 4 — relleno de CONTRALUZ (bajo, desde atrás del libro): la cara B de los separadores
        cuelga mirando a −Z, de espaldas a las dos luces principales y en la sombra propia del
        libro → se veía negra. Esta luz rasante la levanta a legible de pie sin quemar la cara
        frontal (casi perpendicular a su normal: aporte < 0.1 allá) ni la página. */}
      <directionalLight position={[-3, 2.5, -8]} intensity={0.55} />

      {/* El libro abierto acostado sobre la mesa (y=0). */}
      <SpinePiece />
      <Cover side={1} />
      <Cover side={-1} />
      <PageBlock side={1} />
      <PageBlock side={-1} />
      <PageSheet side={1} />
      <PageSheet side={-1} />
      {flat ? (
        <FlatBookmarks items={bookmarks} sizeCm={sizeCm} facesPerUnit={facesPerUnit} />
      ) : (
        <Separators items={bookmarks} sizeCm={sizeCm} facesPerUnit={facesPerUnit} />
      )}

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
        halfW={fit.halfW}
        halfH={fit.halfH}
        polarDeg={fit.polarDeg}
        margin={fit.margin}
        targetY={fit.targetY}
        targetX={fit.targetX}
        targetZ={fit.targetZ}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.6}
        minPolarAngle={0.32}
        maxPolarAngle={Math.PI / 1.9}
        minDistance={fit.minDistance}
        maxDistance={60}
        target={[fit.targetX, fit.targetY, fit.targetZ]}
      />
    </>
  );
}

export default function BookView3D({
  bookmarks,
  sizeCm,
  facesPerUnit,
  flat,
}: {
  bookmarks: Magnet3D[];
  /** sizeCm de la variante (ej "6×2", "4×4.2") — fija el tamaño real de la tira. */
  sizeCm?: string;
  /** Ola 10 — caras por unidad física (2 para separadores modernos). */
  facesPerUnit?: number;
  /** Ola 17 — marcapáginas plano (Alargados): acostado sobre la hoja, sin doblez. */
  flat?: boolean;
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
        <Scene bookmarks={bookmarks} sizeCm={sizeCm} facesPerUnit={facesPerUnit} flat={flat} />
      </Suspense>
    </Canvas>
  );
}
