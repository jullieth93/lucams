"use client";

/*
 * PolaroidView3D — escena "abanico/pila de polaroids" sobre una mesa de madera clara
 * (catálogo WhatsApp 2026-07-22: la Polaroid es producto FOCO → merecía su propia escena 3D).
 *
 * 4–6 tarjetas polaroid (proporción real del producto, ej. 7.5×10 cm) dispersas con
 * rotaciones naturales: una pila de 3 al centro y 2 sueltas a los lados. La de ARRIBA de la pila
 * lleva el primer diseño del cliente; las demás rotan por el resto (mismo mecanismo de texturas
 * que nevera/mural: snapshots Magnet3D recortados a su silueta). La textura ya contiene el diseño
 * completo (foto + marco/borde + texto), por lo que la geometría 3D es una tarjeta física del
 * tamaño real mapeada 1:1 con la textura.
 *
 * Mesa de madera procedural (vetas + tablas + nudos, canvas 2D). Sombras de contacto suaves
 * horneadas una vez (frames=1: la escena es estática; el autoRotate mueve la CÁMARA, no las
 * tarjetas, así el bake sigue válido). StudioEnvironment + FitCameraPolar como las demás escenas.
 *
 * Restricciones: CSP estricta (cero assets externos) · client-only (WebGL) → dynamic ssr:false.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, ContactShadows, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { FitCameraPolar } from "./fit-camera-polar";
import { useIsTouch } from "./use-is-touch";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { StudioEnvironment } from "./studio-3d-environment";
import { getWoodTexture } from "./lib/procedural-textures";
import type { Magnet3D } from "./fridge-3d-view";

// Escala del mundo 3D: 0.25 unidades por cm (coincide con la escala de libro, suficiente para
// apreciar detalles de una tarjeta de ~7.5×10 cm sin exagerar).
const CM_SCALE = 0.25;

/** Parsea "7.5×10", "7.5x10", "10" → cm. Fallback a 7.5×10 cm (Polaroid real). */
function parseSizeCmLocal(sizeCm: string | undefined): { wCm: number; hCm: number } {
  if (!sizeCm) return { wCm: 7.5, hCm: 10 };
  const m = sizeCm.match(/^(\d+(?:\.\d+)?)(?:\s*[×x]\s*(\d+(?:\.\d+)?))?$/i);
  if (!m) return { wCm: 7.5, hCm: 10 };
  const w = parseFloat(m[1]!);
  const h = m[2] ? parseFloat(m[2]!) : w;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { wCm: 7.5, hCm: 10 };
  return { wCm: w, hCm: h };
}

type CardDimensions = {
  cardW: number;
  cardH: number;
  cardT: number;
};

type CardSpec = {
  design: Magnet3D;
  /** Posición sobre la mesa (x, y = altura de apilado, z). */
  position: [number, number, number];
  /** Giro sobre la mesa (rad) — rotación natural de tarjeta echada. */
  spin: number;
};

/** Una tarjeta polaroid acostada: cuerpo blanco + la textura completa (foto+marco+texto) encima. */
function PolaroidCard({
  spec,
  tex,
  cardW,
  cardH,
  cardT,
}: {
  spec: CardSpec;
  tex: THREE.Texture;
  cardW: number;
  cardH: number;
  cardT: number;
}) {
  return (
    <group position={spec.position} rotation={[0, spec.spin, 0]}>
      {/* Acostar la tarjeta: su "arriba" queda apuntando al fondo de la mesa (-z). */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <RoundedBox
          args={[cardW, cardH, cardT]}
          radius={Math.min(0.02, cardW * 0.015, cardH * 0.015)}
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
        {/* Textura 1:1 con la cara de la tarjeta. Es transparente en las esquinas redondeadas
            (el recorte de producción), por lo que se ve el cuerpo blanco por debajo. */}
        <mesh position={[0, 0, cardT / 2 + 0.0015]} receiveShadow>
          <planeGeometry args={[cardW, cardH]} />
          <meshStandardMaterial
            map={tex}
            map-colorSpace={THREE.SRGBColorSpace}
            map-anisotropy={8}
            roughness={0.42}
            metalness={0}
            envMapIntensity={1.05}
            transparent
          />
        </mesh>
      </group>
    </group>
  );
}

function Cards({ magnets, sizeCm }: { magnets: Magnet3D[]; sizeCm?: string }) {
  // Dimensiones físicas reales de la tarjeta polaroid según la variante del producto.
  const dims = useMemo<CardDimensions>(() => {
    const { wCm, hCm } = parseSizeCmLocal(sizeCm);
    return { cardW: wCm * CM_SCALE, cardH: hCm * CM_SCALE, cardT: 0.03 };
  }, [sizeCm]);

  const { cardW, cardH, cardT } = dims;

  // Pila de 3 al centro (la de arriba = primer diseño del cliente) + 2 sueltas a los lados.
  // Las posiciones escalan con el tamaño físico para que la pila se vea real en cualquier variante.
  const specs = useMemo<CardSpec[]>(() => {
    const at = (i: number) => magnets[((i % magnets.length) + magnets.length) % magnets.length]!;
    const lift = cardT + 0.006;
    return [
      { design: at(2), position: [-cardW * 0.75, lift, cardH * 0.35], spin: -0.18 },
      { design: at(1), position: [cardW * 0.65, lift * 2, -cardH * 0.25], spin: 0.12 },
      { design: at(0), position: [0, lift * 3, 0], spin: -0.05 }, // arriba: el diseño principal
      { design: at(3), position: [-cardW * 2.2, lift, -cardH * 0.15], spin: 0.42 },
      { design: at(4), position: [cardW * 2.1, lift, cardH * 0.55], spin: -0.32 },
    ];
  }, [magnets, cardW, cardH, cardT]);
  const textures = useTexture(useMemo(() => specs.map((s) => s.design.dataUrl), [specs]));
  const list = useMemo(() => (Array.isArray(textures) ? textures : [textures]), [textures]);

  return (
    <>
      {specs.map((spec, i) => (
        <PolaroidCard key={i} spec={spec} tex={list[i]!} cardW={cardW} cardH={cardH} cardT={cardT} />
      ))}
    </>
  );
}

function Scene({ magnets, sizeCm }: { magnets: Magnet3D[]; sizeCm?: string }) {
  // #16 — no autorrotar si el usuario pide reducir movimiento.
  const reduced = usePrefersReducedMotion();
  const dims = useMemo(() => {
    const { wCm, hCm } = parseSizeCmLocal(sizeCm);
    return { cardW: wCm * CM_SCALE, cardH: hCm * CM_SCALE };
  }, [sizeCm]);
  const { cardW, cardH } = dims;

  // Spread de la escena: la pila central + 2 tarjetas a los lados. Se usa para encuadrar la cámara
  // y dimensionar la mesa de madera.
  const spreadHalfW = cardW * 3.0;
  const spreadHalfH = cardH * 1.2;
  const tableSize = Math.max(20, spreadHalfW * 3.5, spreadHalfH * 3.5);
  const shadowScale = Math.max(10, spreadHalfW * 2.4, spreadHalfH * 2.4);

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
        <planeGeometry args={[tableSize, tableSize]} />
        <meshStandardMaterial map={getWoodTexture()} roughness={0.75} metalness={0} />
      </mesh>

      <Cards magnets={magnets} sizeCm={sizeCm} />

      {/* Sombra de contacto suave, horneada una vez (escena estática). */}
      <ContactShadows
        frames={1}
        position={[0, 0.002, 0]}
        opacity={0.42}
        blur={2.4}
        scale={shadowScale}
        far={2.5}
      />
      {/* Encuadre con ángulo polar FIJO: arriba-3/4, mismo en desktop y móvil. */}
      <FitCameraPolar
        halfW={spreadHalfW}
        halfH={spreadHalfH}
        polarDeg={52}
        margin={1.22}
        targetY={0}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.5}
        minPolarAngle={0.4}
        maxPolarAngle={1.25}
        minDistance={4}
        maxDistance={28}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function PolaroidView3D({ magnets, sizeCm }: { magnets: Magnet3D[]; sizeCm?: string }) {
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
        <Scene magnets={magnets} sizeCm={sizeCm} />
      </Suspense>
    </Canvas>
  );
}
