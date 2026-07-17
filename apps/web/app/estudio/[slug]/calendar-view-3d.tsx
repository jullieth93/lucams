"use client";

/*
 * CalendarView3D — preview inmersivo del calendario mes-a-mes (ADR-063 · CAL4).
 *
 * Lucy pidió que el calendario se vea "como se vería 3D, esa experiencia debe ser fantástica".
 * Muestra un calendario de PARED colgado: tablero con espiral arriba y la PÁGINA del mes actual
 * (foto + mes + año + grilla) compuesta con el MISMO dibujo que producción (WYSIWYG). El cliente
 * navega mes a mes; cada cambio "voltea" la página desde la espiral (rotateX). Se puede girar/acercar.
 *
 * Restricciones (idénticas a FridgeView3D):
 *  - CSP estricta: CERO assets externos (nada de HDR/GLTF/fuentes de CDN). Metal/papel con luces
 *    procedurales, sin env-map.
 *  - Client-only (WebGL) → el caller lo importa con dynamic ssr:false.
 */

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, RoundedBox, ContactShadows, useTexture, Center } from "@react-three/drei";
import * as THREE from "three";
import { CALENDAR_PAGE } from "@/features/personalization/calendar-layout";

// Proporción física de la página (1080×1520). Tablero un poco más grande alrededor.
const PAGE_W = 4.2;
const PAGE_H = PAGE_W * (CALENDAR_PAGE.height / CALENDAR_PAGE.width); // ~5.91
const BOARD_MARGIN = 0.28;
const BOARD_W = PAGE_W + BOARD_MARGIN * 2;
const BOARD_H = PAGE_H + BOARD_MARGIN * 2;
const BOARD_TOP = BOARD_H / 2;

const BOARD_COLOR = "#FFFDF9";
const RING_COLOR = "#C9CDD4";

/** La página del mes: pivota desde la espiral (borde superior) para el efecto de "voltear". */
function Page({ texture }: { texture: THREE.Texture }) {
  const pivot = useRef<THREE.Group>(null);
  const flip = useRef(-Math.PI / 2); // arranca "levantada" y cae a 0

  // Cada vez que cambia la textura (nuevo mes), reinicia el flip.
  useEffect(() => {
    flip.current = -Math.PI / 2;
  }, [texture]);

  useFrame(() => {
    if (!pivot.current) return;
    flip.current += (0 - flip.current) * 0.16; // easing hacia 0
    if (Math.abs(flip.current) < 0.001) flip.current = 0;
    pivot.current.rotation.x = flip.current;
  });

  return (
    // Grupo con pivote en el borde superior de la página (justo bajo la espiral).
    <group position={[0, BOARD_TOP - BOARD_MARGIN, 0.09]}>
      <group ref={pivot}>
        <mesh position={[0, -PAGE_H / 2, 0]}>
          <planeGeometry args={[PAGE_W, PAGE_H]} />
          <meshStandardMaterial
            map={texture}
            map-colorSpace={THREE.SRGBColorSpace}
            map-anisotropy={8}
            roughness={0.72}
            metalness={0}
            side={THREE.FrontSide}
          />
        </mesh>
      </group>
    </group>
  );
}

/** Espiral doble-anillo a lo largo del borde superior del tablero. */
function Spiral() {
  const rings = 11;
  const spanW = PAGE_W * 0.92;
  return (
    <group position={[0, BOARD_TOP - 0.06, 0.16]}>
      {Array.from({ length: rings }, (_, i) => {
        const x = (i / (rings - 1) - 0.5) * spanW;
        return (
          <mesh key={i} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.12, 0.028, 10, 20]} />
            <meshStandardMaterial color={RING_COLOR} roughness={0.3} metalness={0.7} />
          </mesh>
        );
      })}
    </group>
  );
}

function Board({ texture }: { texture: THREE.Texture }) {
  return (
    <group>
      {/* Tablero de fondo (papel/cartón) */}
      <RoundedBox
        args={[BOARD_W, BOARD_H, 0.14]}
        radius={0.06}
        smoothness={4}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={BOARD_COLOR} roughness={0.85} metalness={0} />
      </RoundedBox>
      <Page texture={texture} />
      <Spiral />
    </group>
  );
}

/** Vaivén suave para que el calendario "respire" (no estático), sin marear. */
function Floating({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!g.current) return;
    const t = state.clock.elapsedTime;
    g.current.rotation.y = Math.sin(t * 0.5) * 0.08;
    g.current.position.y = Math.sin(t * 0.9) * 0.06;
  });
  return <group ref={g}>{children}</group>;
}

function Scene({ pages, index }: { pages: string[]; index: number }) {
  // Cargar TODAS las texturas una vez (evita re-suspender al navegar de mes).
  const textures = useTexture(pages);
  const list = useMemo(() => (Array.isArray(textures) ? textures : [textures]), [textures]);
  const tex = list[Math.max(0, Math.min(index, list.length - 1))]!;

  return (
    <>
      {/* Luz procedural (papel mate + espiral metálica) sin env-map (CSP). */}
      <hemisphereLight args={["#ffffff", "#e8e2d8", 0.6]} />
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[4, 7, 8]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-5, 2, 4]} intensity={0.45} />

      <Center>
        <Floating>
          <Board texture={tex} />
        </Floating>
      </Center>

      <ContactShadows
        position={[0, -BOARD_H / 2 - 0.2, 0]}
        opacity={0.35}
        blur={2.6}
        scale={14}
        far={6}
      />
      <OrbitControls
        enablePan={false}
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
      dpr={[1, 2]}
      camera={{ position: [0, 0.5, 10.5], fov: 42 }}
      gl={{ preserveDrawingBuffer: false, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#FFF8F0"]} />
      <Suspense fallback={null}>
        <Scene pages={pages} index={index} />
      </Suspense>
    </Canvas>
  );
}
