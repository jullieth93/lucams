"use client";

/*
 * PolaroidView3D — escena "abanico/pila de polaroids" sobre una mesa de madera clara
 * (catálogo WhatsApp 2026-07-22: la Polaroid es producto FOCO → merecía su propia escena 3D).
 *
 * 4–6 tarjetas polaroid (proporción real ~9×10.5 cm, borde inferior grueso) dispersas con
 * rotaciones naturales: una pila de 3 al centro y 2 sueltas a los lados. La de ARRIBA de la pila
 * lleva el primer diseño del cliente; las demás rotan por el resto (mismo mecanismo de texturas
 * que nevera/mural: snapshots Magnet3D recortados a su silueta). Si el diseño YA es una tarjeta
 * polaroid (alto/ancho > 1.05) cubre la cara completa de la tarjeta; si es una foto ~cuadrada se
 * enmarca con la ventana clásica (foto arriba + borde inferior grueso).
 *
 * Mesa de madera procedural (vetas + tablas + nudos, canvas 2D). Sombras de contacto suaves
 * horneadas una vez (frames=1: la escena es estática; el autoRotate mueve la CÁMARA, no las
 * tarjetas, así el bake sigue válido). StudioEnvironment + FitCamera como las demás escenas.
 *
 * Restricciones: CSP estricta (cero assets externos) · client-only (WebGL) → dynamic ssr:false.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, ContactShadows, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { FitCamera } from "./fit-camera";
import { useIsTouch } from "./use-is-touch";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { StudioEnvironment } from "./studio-3d-environment";
import { getWoodTexture } from "./lib/procedural-textures";
import type { Magnet3D } from "./fridge-3d-view";

// Tarjeta polaroid: proporción real ~9×10.5 cm.
const CARD_W = 1.8;
const CARD_H = CARD_W * (10.5 / 9); // 2.1
const CARD_T = 0.03;

type CardSpec = {
  design: Magnet3D;
  /** Posición sobre la mesa (x, y = altura de apilado, z). */
  position: [number, number, number];
  /** Giro sobre la mesa (rad) — rotación natural de tarjeta echada. */
  spin: number;
};

/** Una tarjeta polaroid acostada: cuerpo blanco + la foto/diseño encima. */
function PolaroidCard({ spec, tex }: { spec: CardSpec; tex: THREE.Texture }) {
  const { design } = spec;
  const ratio = design.hRatio / design.wRatio;
  const cardLike = ratio > 1.05; // el diseño ya ES la tarjeta → cara completa

  // Ventana de la foto (contain-fit, sin deformar). Si no es tarjeta: ventana cuadrada arriba
  // con el borde inferior grueso característico.
  const winW = cardLike ? CARD_W - 0.1 : CARD_W - 0.28;
  const winH = cardLike ? CARD_H - 0.1 : winW;
  let pw = winW;
  let ph = pw * ratio;
  if (ph > winH) {
    ph = winH;
    pw = ph / ratio;
  }
  const photoY = cardLike ? 0 : CARD_H / 2 - 0.14 - ph / 2;

  return (
    <group position={spec.position} rotation={[0, spec.spin, 0]}>
      {/* Acostar la tarjeta: su "arriba" queda apuntando al fondo de la mesa (-z). */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <RoundedBox
          args={[CARD_W, CARD_H, CARD_T]}
          radius={0.02}
          smoothness={3}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color="#FCFBF7"
            roughness={0.55}
            metalness={0}
            envMapIntensity={0.7}
          />
        </RoundedBox>
        <mesh position={[0, photoY, CARD_T / 2 + 0.0015]} receiveShadow>
          <planeGeometry args={[pw, ph]} />
          <meshStandardMaterial
            map={tex}
            map-colorSpace={THREE.SRGBColorSpace}
            map-anisotropy={8}
            roughness={0.42}
            metalness={0}
            envMapIntensity={1.05}
          />
        </mesh>
      </group>
    </group>
  );
}

function Cards({ magnets }: { magnets: Magnet3D[] }) {
  // Pila de 3 al centro (la de arriba = primer diseño del cliente) + 2 sueltas a los lados.
  // Las demás tarjetas rotan por el resto de diseños disponibles.
  const specs = useMemo<CardSpec[]>(() => {
    const at = (i: number) => magnets[((i % magnets.length) + magnets.length) % magnets.length]!;
    const lift = CARD_T + 0.006;
    return [
      { design: at(2), position: [-0.06, lift, 0.05], spin: -0.16 },
      { design: at(1), position: [0.04, lift * 2, -0.03], spin: 0.09 },
      { design: at(0), position: [0, lift * 3, 0], spin: -0.04 }, // arriba: el diseño principal
      { design: at(3), position: [-2.25, lift, 0.4], spin: 0.38 },
      { design: at(4), position: [2.2, lift, -0.5], spin: -0.3 },
    ];
  }, [magnets]);
  const textures = useTexture(useMemo(() => specs.map((s) => s.design.dataUrl), [specs]));
  const list = useMemo(() => (Array.isArray(textures) ? textures : [textures]), [textures]);

  return (
    <>
      {specs.map((spec, i) => (
        <PolaroidCard key={i} spec={spec} tex={list[i]!} />
      ))}
    </>
  );
}

function Scene({ magnets }: { magnets: Magnet3D[] }) {
  // #16 — no autorrotar si el usuario pide reducir movimiento.
  const reduced = usePrefersReducedMotion();
  return (
    <>
      <StudioEnvironment intensity={1} />
      <hemisphereLight args={["#fff8ec", "#d9c9b4", 0.3]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[4, 7, 4]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-far={25}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-5, 3, 5]} intensity={0.3} />

      {/* Mesa de madera clara procedural */}
      <mesh position={[0, -0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial map={getWoodTexture()} roughness={0.75} metalness={0} />
      </mesh>

      <Cards magnets={magnets} />

      {/* Sombra de contacto suave, horneada una vez (escena estática). */}
      <ContactShadows
        frames={1}
        position={[0, 0.002, 0]}
        opacity={0.42}
        blur={2.4}
        scale={12}
        far={2.5}
      />
      <FitCamera halfW={2.9} halfH={1.9} margin={1.25} camY={5.2} />
      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.5}
        minPolarAngle={0.55}
        maxPolarAngle={1.25}
        minDistance={4}
        maxDistance={22}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function PolaroidView3D({ magnets }: { magnets: Magnet3D[] }) {
  const isTouch = useIsTouch();
  if (magnets.length === 0) {
    return (
      <div className="text-brand-muted flex h-full items-center justify-center p-8 text-center text-sm">
        Agrega al menos una foto para ver tus polaroids en 3D.
      </div>
    );
  }
  return (
    <Canvas
      shadows
      dpr={isTouch ? [1, 1.5] : [1, 2]}
      camera={{ position: [0, 5.2, 7.5], fov: 42 }}
      gl={{ preserveDrawingBuffer: false, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#EBDFCF"]} />
      <Suspense fallback={null}>
        <Scene magnets={magnets} />
      </Suspense>
    </Canvas>
  );
}
