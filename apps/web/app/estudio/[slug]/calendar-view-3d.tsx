"use client";

/*
 * CalendarView3D — preview inmersivo del calendario mes-a-mes (ADR-063 · CAL4).
 *
 * Lucy pidió que el calendario se vea "como se vería 3D, esa experiencia debe ser fantástica".
 * Calendario de PARED colgado, ahora verdaderamente 3D (pase de realismo 2026-07-22):
 *  - Argollado REAL: espiral metálico continuo (hélice → tubeGeometry) abrazando el borde
 *    superior de las hojas. Antes los anillos estaban ACOSTADOS (rotation [π/2,0,0] dejaba cada
 *    toro plano sobre el tablero) — un wire-o real va en plano VERTICAL y las hojas lo atraviesan.
 *  - Hoja del mes con cuerpo de papel: plano segmentado 24×32 deformado por vértices. En reposo
 *    guarda la curva convexa leve de una hoja colgada (+ respiración casi imperceptible); al
 *    voltear, el bend es proporcional al ángulo (el borde libre se retrasa y riza), no un flip
 *    rígido. Reverso papel sin imprimir, visible durante la volteada. Pila de hojas debajo.
 *  - Sombra contra la PARED (no piso): pared con gradiente cenital sutil (GradientTexture) +
 *    directional con shadow-camera amplia. Colgador (argolla + clavo) visible.
 *  - Consistencia con las otras escenas: StudioEnvironment (env-map procedural, CSP-safe) y
 *    FitCamera (antes era la única escena sin él → se cortaba en móvil vertical). Sin Floating:
 *    un calendario colgado no flota. Órbita acotada (azimut ±0.7).
 *  - Texturas PEREZOSAS: solo mes actual ±1 (antes las 12 de golpe, ~44MB GPU); dispose al
 *    salir de la ventana y al desmontar.
 *
 * Restricciones (idénticas a FridgeView3D):
 *  - CSP estricta: CERO assets externos (nada de HDR/GLTF/fuentes de CDN).
 *  - Client-only (WebGL) → el caller lo importa con dynamic ssr:false.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { useIsTouch } from "./use-is-touch";
import { OrbitControls, RoundedBox, GradientTexture } from "@react-three/drei";
import * as THREE from "three";
import { CALENDAR_PAGE } from "@/features/personalization/calendar-layout";
import { FitCamera } from "./fit-camera";
import { StudioEnvironment } from "./studio-3d-environment";

// Proporción física de la página (1080×1520). Tablero un poco más grande alrededor.
const PAGE_W = 4.2;
const PAGE_H = PAGE_W * (CALENDAR_PAGE.height / CALENDAR_PAGE.width); // ~5.91
const BOARD_MARGIN = 0.28;
const BOARD_W = PAGE_W + BOARD_MARGIN * 2;
const BOARD_H = PAGE_H + BOARD_MARGIN * 2;
const BOARD_TOP = BOARD_H / 2;

const BOARD_COLOR = "#FFFDF9";

// Pivote del argollado: borde superior de las hojas. La hoja cuelga delante de la pila.
const PIVOT_Y = BOARD_TOP - BOARD_MARGIN;
const STACK_Z = 0.115; // centro de la pila de hojas (su cara frontal en ~0.157)
const PAGE_Z = 0.17; // plano de la hoja del mes en reposo (delante de la pila)
const WALL_Z = -0.14; // pared, casi a ras del tablero (fondo en -0.07) → sombra nítida

// Espiral continuo: eje X a lo largo del borde superior, atravesando el borde de las hojas
// (su arco trasero entra en el tablero → se lee como "pasado por las perforaciones").
const COIL_RADIUS = 0.15;
const COIL_LENGTH = PAGE_W + 0.24;
const COIL_COUNT = 30;
const COIL_Z = PAGE_Z;

// Hoja deformable (24×32 segmentos → 825 vértices, barato de animar por frame).
const SEG_X = 24;
const SEG_Y = 32;
const COLS = SEG_X + 1;
const ROWS = SEG_Y + 1;
// Scratch a nivel módulo (una sola hoja por escena) — bendPage corre por frame sin alocar.
const rowY = new Float64Array(ROWS);
const rowZ = new Float64Array(ROWS);

/** Curva hélice para el espiral continuo: eje X a lo largo del borde, radio en Y/Z. */
class HelixCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private radius: number,
    private length: number,
    private coils: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = Math.PI * 2 * this.coils * t;
    return target.set(
      (t - 0.5) * this.length,
      this.radius * Math.sin(angle),
      this.radius * Math.cos(angle),
    );
  }
}

/**
 * Texturas perezosas por ventana (mes actual ± radius). Carga con TextureLoader (dataURLs),
 * dispone las que salen de la ventana y TODAS al desmontar — sin esto cada textura 810×1140
 * son ~3.7MB de GPU que antes se cargaban ×12 de golpe.
 *
 * Dos estructuras (react-hooks/refs prohíbe leer refs durante render):
 *  - liveRef: la caché VIVA (propiedad y dispose de las texturas) — solo se toca en effects.
 *  - texMap: snapshot inmutable publicado vía setState cuando llega una textura — lo lee el render.
 */
function useWindowTextures(urls: string[], index: number, radius = 1): THREE.Texture | null {
  const liveRef = useRef<Map<number, THREE.Texture>>(new Map());
  const [texMap, setTexMap] = useState<ReadonlyMap<number, THREE.Texture>>(() => new Map());

  useEffect(() => {
    const live = liveRef.current;
    let cancelled = false;
    const wanted = new Set<number>();
    for (
      let i = Math.max(0, index - radius);
      i <= Math.min(urls.length - 1, index + radius);
      i++
    ) {
      wanted.add(i);
    }

    // Cargar faltantes (async → el setState de publicación es legal aquí).
    const loader = new THREE.TextureLoader();
    for (const i of wanted) {
      if (live.has(i)) continue;
      loader
        .loadAsync(urls[i]!)
        .then((tex) => {
          if (cancelled) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          live.set(i, tex);
          setTexMap(new Map(live));
        })
        .catch(() => {
          // dataURL corrupto → la hoja queda en papel liso, sin romper la vista.
        });
    }

    // Liberar las que salen de la ventana (ya no se renderizan: el flip arranca con el mes
    // nuevo). Si texMap queda con una referencia de más no pasa nada: el render solo lee
    // `index` (∈ wanted, viva) y la próxima publicación lo corrige.
    for (const [i, tex] of Array.from(live.entries())) {
      if (!wanted.has(i)) {
        tex.dispose();
        live.delete(i);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [urls, index, radius]);

  // Al desmontar la vista: liberar TODAS las texturas que sigan vivas.
  useEffect(() => {
    const live = liveRef.current;
    return () => {
      for (const tex of live.values()) tex.dispose();
      live.clear();
    };
  }, []);

  return texMap.get(index) ?? null;
}

/**
 * Deforma la hoja (posiciones por vértice) según el ángulo de volteada `a` (0 = colgando).
 * La hoja se integra por filas desde el borde superior con tangente θ(s) = a·(1 − trail·s^1.5):
 * el borde libre se RETRASA proporcionalmente al ángulo (trail), lo que da el rizo del papel al
 * voltear; en reposo queda solo la curva estática (panza convexa + cantos laterales leves).
 */
function bendPage(geo: THREE.PlaneGeometry, a: number, breathe: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const trail = 0.55 * Math.min(1, Math.abs(a) / (Math.PI / 2));
  const SUB = 6;
  const ds = 1 / SEG_Y / SUB;
  let cy = 0;
  let cz = 0;
  rowY[0] = 0;
  rowZ[0] = 0;
  for (let r = 1; r < ROWS; r++) {
    for (let k = 0; k < SUB; k++) {
      const s = (r - 1 + (k + 0.5) / SUB) / SEG_Y;
      const th = a * (1 - trail * Math.pow(s, 1.5));
      cy -= Math.cos(th) * PAGE_H * ds;
      cz -= Math.sin(th) * PAGE_H * ds;
    }
    rowY[r] = cy;
    rowZ[r] = cz;
  }
  const bottomBow = 0.09 + breathe;
  for (let i = 0; i < arr.length / 3; i++) {
    const x0 = baseX(i);
    // PlaneGeometry empuja los vértices con y NEGADA (x, -y, 0): la fila 0 ya es el borde
    // SUPERIOR (y=+H/2) → la fila iy es directamente la distancia al pivote, en segmentos.
    const r = Math.floor(i / COLS);
    const sr = r / SEG_Y;
    const sx = x0 / (PAGE_W / 2);
    arr[i * 3] = x0;
    arr[i * 3 + 1] = rowY[r]!;
    arr[i * 3 + 2] = rowZ[r]! + bottomBow * sr * sr + 0.045 * sx * sx * sr;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// X original de cada vértice del plano (uniforme por construcción) — evita guardar basePos.
function baseX(i: number): number {
  const ix = i % COLS;
  return -PAGE_W / 2 + (ix / SEG_X) * PAGE_W;
}

/**
 * La página del mes: cara impresa + reverso papel (BackSide, misma superficie desplazada).
 * Cada cambio de mes reinicia la volteada: la hoja arranca "levantada" y cae con bend.
 * Las geometrías son JSX (R3F las dispone al desmontar) y se deforman via refs — mutar valores
 * creados por hooks (useMemo) dentro de useFrame lo prohíbe react-hooks/immutability.
 */
function MonthPage({ texture, monthIndex }: { texture: THREE.Texture | null; monthIndex: number }) {
  const frontRef = useRef<THREE.Mesh>(null);
  const backRef = useRef<THREE.Mesh>(null);
  const reduced = usePrefersReducedMotion();
  const flip = useRef(-Math.PI / 2); // arranca "levantada" y cae a 0
  useEffect(() => {
    flip.current = -Math.PI / 2;
  }, [monthIndex]);

  useFrame((state) => {
    const front = frontRef.current;
    const back = backRef.current;
    if (!front || !back) return;
    flip.current += (0 - flip.current) * 0.14;
    if (Math.abs(flip.current) < 0.0012) flip.current = 0;
    const a = flip.current;
    // Respiración del papel en reposo (casi imperceptible; off con prefers-reduced-motion).
    const breathe = reduced ? 0 : Math.sin(state.clock.elapsedTime * 0.6) * 0.006;
    const frontGeo = front.geometry as THREE.PlaneGeometry;
    const backGeo = back.geometry as THREE.PlaneGeometry;
    bendPage(frontGeo, a, breathe);
    // El reverso sigue la MISMA superficie, 4mm por detrás (papel sin imprimir).
    const fp = frontGeo.attributes.position as THREE.BufferAttribute;
    const bp = backGeo.attributes.position as THREE.BufferAttribute;
    const fa = fp.array as Float32Array;
    const ba = bp.array as Float32Array;
    for (let i = 0; i < fa.length; i += 3) {
      ba[i] = fa[i]!;
      ba[i + 1] = fa[i + 1]!;
      ba[i + 2] = fa[i + 2]! - 0.004;
    }
    bp.needsUpdate = true;
    backGeo.computeVertexNormals();
  });

  return (
    <group position={[0, PIVOT_Y, PAGE_Z]}>
      <mesh ref={frontRef} castShadow>
        <planeGeometry args={[PAGE_W, PAGE_H, SEG_X, SEG_Y]} />
        {/* colorSpace/anisotropy los setea el loader (useWindowTextures): las props con guion
            map-* fallarían mientras map es null (textura cargando). */}
        <meshStandardMaterial
          map={texture}
          color={texture ? "#ffffff" : "#FDFBF4"}
          roughness={0.72}
          metalness={0}
          envMapIntensity={0.5}
        />
      </mesh>
      {/* Reverso: misma malla desplazada, BackSide voltea las normales sola. */}
      <mesh ref={backRef}>
        <planeGeometry args={[PAGE_W, PAGE_H, SEG_X, SEG_Y]} />
        <meshStandardMaterial
          color="#F4EFE3"
          roughness={0.92}
          metalness={0}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

/** Espiral continuo (hélice) a lo largo del borde superior; metal con reflejos del env-map. */
function WireCoil() {
  const curve = useMemo(() => new HelixCurve(COIL_RADIUS, COIL_LENGTH, COIL_COUNT), []);
  return (
    <mesh position={[0, PIVOT_Y, COIL_Z]} castShadow>
      <tubeGeometry args={[curve, COIL_COUNT * 20, 0.022, 8, false]} />
      <meshStandardMaterial
        color="#D9DDE3"
        roughness={0.24}
        metalness={1}
        envMapIntensity={1.7}
      />
    </mesh>
  );
}

/** Argolla de colgar + clavo en la pared (vendidos por la sombra que proyectan). La argolla
 *  emerge de DETRÁS del tablero (patas ocultas) y cuelga del clavo. */
function Hanger() {
  return (
    <group>
      <mesh position={[0, BOARD_TOP - 0.1, -0.1]} castShadow>
        <torusGeometry args={[0.24, 0.026, 10, 28, Math.PI]} />
        <meshStandardMaterial
          color="#C9CDD4"
          roughness={0.3}
          metalness={0.9}
          envMapIntensity={1.5}
        />
      </mesh>
      <mesh position={[0, BOARD_TOP + 0.1, WALL_Z + 0.01]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.07, 12]} />
        <meshStandardMaterial color="#8E9299" roughness={0.35} metalness={0.8} />
      </mesh>
    </group>
  );
}

function Scene({ pages, index }: { pages: string[]; index: number }) {
  const texture = useWindowTextures(pages, index, 1);

  return (
    <>
      {/* Mismo entorno de estudio que las otras escenas (reflejos del espiral, ambiente). */}
      <StudioEnvironment intensity={0.9} />
      <hemisphereLight args={["#ffffff", "#e8e2d8", 0.3]} />
      <ambientLight intensity={0.2} />
      <directionalLight
        position={[4, 7, 8]}
        intensity={1.2}
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
      <directionalLight position={[-5, 2, 4]} intensity={0.35} />

      {/* Pared con luz cenital sutil (más clara arriba) — recibe la sombra del calendario. */}
      <mesh position={[0, 0, WALL_Z]} receiveShadow>
        <planeGeometry args={[40, 26]} />
        <meshStandardMaterial roughness={1} metalness={0}>
          <GradientTexture attach="map" stops={[0, 1]} colors={["#F7EFE4", "#E3D6C4"]} size={256} />
        </meshStandardMaterial>
      </mesh>

      {/* Tablero de fondo (cartón) */}
      <RoundedBox
        args={[BOARD_W, BOARD_H, 0.14]}
        radius={0.06}
        smoothness={4}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={BOARD_COLOR} roughness={0.85} metalness={0} />
      </RoundedBox>

      {/* Pila de hojas debajo de la del mes (grosor del bloque) */}
      <mesh position={[0, PIVOT_Y - PAGE_H / 2, STACK_Z]} castShadow receiveShadow>
        <boxGeometry args={[PAGE_W, PAGE_H, 0.085]} />
        <meshStandardMaterial color="#FDFBF4" roughness={0.9} metalness={0} />
      </mesh>

      <MonthPage texture={texture} monthIndex={index} />
      <WireCoil />
      <Hanger />

      {/* #12 — encuadra el calendario al aspecto del viewport (antes se cortaba en móvil). */}
      <FitCamera halfW={BOARD_W / 2} halfH={BOARD_H / 2} margin={1.12} camY={0.2} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minAzimuthAngle={-0.7}
        maxAzimuthAngle={0.7}
        minPolarAngle={Math.PI / 3.2}
        maxPolarAngle={Math.PI / 1.8}
        minDistance={6}
        maxDistance={16}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function CalendarView3D({ pages, index }: { pages: string[]; index: number }) {
  const isTouch = useIsTouch();
  if (pages.length === 0) {
    return (
      <div className="text-brand-muted flex h-full items-center justify-center p-8 text-center text-sm">
        Agrega fotos a tus meses para ver tu calendario en 3D.
      </div>
    );
  }
  return (
    <Canvas
      shadows
      dpr={isTouch ? [1, 1.5] : [1, 2]}
      camera={{ position: [0, 0.2, 10.5], fov: 42 }}
      gl={{ preserveDrawingBuffer: false, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#E9DDCB"]} />
      <Suspense fallback={null}>
        <Scene pages={pages} index={index} />
      </Suspense>
    </Canvas>
  );
}
