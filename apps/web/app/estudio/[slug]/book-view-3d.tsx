"use client";

/*
 * BookView3D — preview inmersivo de los SEPARADORES en su rincón natural: un LIBRO abierto con el
 * marcador asomando entre las páginas (ADR-063 · SEP1). Los separadores NO son imanes → mostrarlos en
 * una nevera sería WYSIWYG incorrecto; su hogar es un libro. Escena de rincón de lectura (madera +
 * papel), navegable/rotable.
 *
 * Restricciones (idénticas a fridge/calendar 3D):
 *  - CSP estricta: CERO assets externos. Materiales con luces procedurales, sin env-map.
 *  - Client-only (WebGL) → el caller lo importa con dynamic ssr:false.
 */

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, RoundedBox, ContactShadows, useTexture, Center } from "@react-three/drei";
import { FitCamera } from "./fit-camera";
import { StudioEnvironment, StudioBackdrop } from "./studio-3d-environment";
import * as THREE from "three";
import type { Magnet3D } from "./fridge-3d-view";

// Libro (footprint fijo, no depende de la cantidad de marcadores).
const BOOK_W = 6;
const BOOK_H = 8; // alto de la página (el libro está "de pie", visto en perspectiva)
const BOOK_THICK = 1.1;
const COVER_COLOR = "#8B5E3C"; // tapa de cuero/madera cálida
const PAGE_COLOR = "#FBF7EE"; // papel crema

/** Un marcador: plano tall texturizado, asomando por el borde superior del libro. */
function Bookmark({
  tex,
  width,
  height,
  x,
  tilt,
}: {
  tex: THREE.Texture;
  width: number;
  height: number;
  x: number;
  tilt: number;
}) {
  // El marcador entra ~45% dentro del libro y asoma el resto por arriba.
  const insideFrac = 0.45;
  const centerY = BOOK_H / 2 - height * insideFrac + height / 2;
  return (
    <group position={[x, centerY, BOOK_THICK / 2 + 0.02]} rotation={[0.06, 0, tilt]}>
      <mesh castShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={tex}
          map-colorSpace={THREE.SRGBColorSpace}
          map-anisotropy={8}
          transparent
          alphaTest={0.5}
          roughness={0.6}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function Book() {
  return (
    <group>
      {/* Bloque del libro (tapa) */}
      <RoundedBox
        args={[BOOK_W, BOOK_H, BOOK_THICK]}
        radius={0.08}
        smoothness={4}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={COVER_COLOR} roughness={0.7} metalness={0.05} />
      </RoundedBox>
      {/* Bloque de páginas (un pelo más chico, crema), apenas proud sobre la tapa */}
      <mesh position={[0, 0, BOOK_THICK / 2 - 0.02]} castShadow>
        <boxGeometry args={[BOOK_W - 0.5, BOOK_H - 0.4, 0.1]} />
        <meshStandardMaterial color={PAGE_COLOR} roughness={0.9} metalness={0} />
      </mesh>
      {/* Línea del centro (lomo/pliegue) */}
      <mesh position={[0, 0, BOOK_THICK / 2 + 0.04]}>
        <boxGeometry args={[0.05, BOOK_H - 0.4, 0.02]} />
        <meshStandardMaterial color="#E7DCC7" roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

function Bookmarks({ items }: { items: Magnet3D[] }) {
  const textures = useTexture(items.map((m) => m.dataUrl));
  const list = useMemo(() => (Array.isArray(textures) ? textures : [textures]), [textures]);

  return (
    <>
      {items.map((m, i) => {
        const aspect = m.hRatio / m.wRatio; // tall (~2.8 para 500×1400)
        const height = BOOK_H * 0.85;
        const width = height / aspect;
        const n = items.length;
        // Repartidos a lo ancho del libro, con una leve inclinación tipo abanico.
        const spread = BOOK_W * 0.5;
        const x = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread;
        const tilt = n === 1 ? 0 : (i / (n - 1) - 0.5) * 0.18;
        return <Bookmark key={i} tex={list[i]!} width={width} height={height} x={x} tilt={tilt} />;
      })}
    </>
  );
}

function Floating({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!g.current) return;
    const t = state.clock.elapsedTime;
    g.current.rotation.y = Math.sin(t * 0.45) * 0.12;
    g.current.position.y = Math.sin(t * 0.9) * 0.05;
  });
  return <group ref={g}>{children}</group>;
}

function Scene({ bookmarks }: { bookmarks: Magnet3D[] }) {
  return (
    <>
      {/* FB5 — env-map procedural (reflejos en tapa/marcadores) + backdrop de estudio (contexto). */}
      <StudioEnvironment intensity={0.95} />
      <StudioBackdrop position={[0, -BOOK_H / 2 - 0.3, -5]} scale={[40, 22, 8]} />
      <hemisphereLight args={["#fff6e8", "#d8cbb8", 0.32]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[4, 7, 8]}
        intensity={1.05}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-5, 3, 4]} intensity={0.3} />

      <Center>
        <Floating>
          {/* El libro reclinado hacia atrás, como sobre una mesa vista en perspectiva. */}
          <group rotation={[-0.5, 0, 0]}>
            <Book />
            <Bookmarks items={bookmarks} />
          </group>
        </Floating>
      </Center>

      <ContactShadows
        position={[0, -BOOK_H / 2 - 0.3, 0]}
        opacity={0.4}
        blur={2.6}
        scale={16}
        far={6}
      />
      {/* #12 — encuadra el libro (alto + marcadores asomando) al aspecto del viewport. */}
      <FitCamera halfW={BOOK_W / 2 + 0.6} halfH={5.6} margin={1.1} camY={1} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.9}
        minDistance={8}
        maxDistance={24}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function BookView3D({ bookmarks }: { bookmarks: Magnet3D[] }) {
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
      dpr={[1, 2]}
      camera={{ position: [0, 1, 15], fov: 42 }}
      gl={{ preserveDrawingBuffer: false, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#FFF8F0"]} />
      <Suspense fallback={null}>
        <Scene bookmarks={bookmarks} />
      </Suspense>
    </Canvas>
  );
}
