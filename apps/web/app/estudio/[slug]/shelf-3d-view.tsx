"use client";

/*
 * ShelfView3D — escena 3D de REPISA (ADR-063): el fotoimán recostado sobre un estante de
 * madera contra una pared cálida del hogar.
 *
 * 2026-10-26 (decisión owner: "3D completo ahora") — REEMPLAZA al flat-lay 2D histórico
 * (lib/compose-shelf-flatlay.ts, PNG 1080×1080 servido como <img> plano: al acercar se
 * pixelaba — el zoom del cliente no tenía dónde resolver detalle). Ahora es una escena
 * react-three-fiber con el MISMO estándar que nevera/libro/polaroid: OrbitControls con
 * límites, texturas del diseño del cliente (Magnet3D), env-map procedural, sombra horneada
 * y pill de gestos de la galería.
 *
 * Composición (equivalente 3D del flat-lay):
 *  - Pared procedural (degradado cálido + grano de estuco sutil, canvas 2D → CanvasTexture).
 *  - Estante de madera (tabla con la veta procedural compartida + dos escuadras con riostra
 *    diagonal) apoyado contra la pared; su LARGO se adapta a la fila de piezas.
 *  - Las piezas van RECOSTADAS contra la pared sobre la tabla (leaningPose de
 *    lib/leaning-scene-layout: la esquina inferior apoya en la madera y la superior toca la
 *    pared — contacto físico real, nada flota) con un abanico leve de yaw (fanYaw).
 *  - TAMAÑO REAL SIEMPRE (misma regla que nevera/libro): los cm reales de la variante vía
 *    magnetWorldSizes; si la fila desborda, el estante crece y la cámara reencuadra.
 *
 * Restricciones (idénticas a las demás escenas): CSP estricta (cero assets externos, texturas
 * procedurales en runtime) · client-only (WebGL) → la galería lo importa con dynamic ssr:false.
 */

import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { FitCameraPolar } from "./fit-camera-polar";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { StudioEnvironment } from "./studio-3d-environment";
import { MagnetMesh, magnetWorldSizes, realWorldDepth, MAGNET_BACK_COLOR } from "./magnet-3d";
import { getWoodTexture } from "./lib/procedural-textures";
import { fanYaw, leaningPose, leaningRowLayout } from "./lib/leaning-scene-layout";
import type { Magnet3D } from "./fridge-3d-view";

export type ShelfView3DProps = {
  magnets: Magnet3D[];
  /** sizeCm de la variante elegida (ej "6.5×6.5") — escala física de las piezas. */
  sizeCm?: string;
  /** Grosor FÍSICO de la pieza en cm (default: 2 mm del fotoimán — misma regla que nevera). */
  thicknessCm?: number;
  /** 2026-10-29 (owner) — variante CON IMÁN: reverso negro de goma ferrita. */
  magnet?: boolean;
};

// Escala del mundo: 0.055 u/cm (como la nevera) — una tabla de ~60 cm ≈ 3.3 u y un fotoimán de
// 6.5 cm ≈ 0.36 u.
const SHELF_U_PER_CM = 0.055;
const LEAN_RAD = (11 * Math.PI) / 180; // recostadas contra la pared (~11°)
const ROW_GAP = 0.16; // ~2.9 cm entre piezas
const FAN_STEP = 0.03; // abanico leve de yaw por pieza
const SHELF_T = 0.12; // grosor de la tabla (~2.2 cm)
const SHELF_D = 0.58; // fondo de la tabla (~10.5 cm)
const SHELF_TOP_Y = 0; // superficie donde posan las piezas
const WALL_Z = 0; // cara de la pared (mira a +Z; las piezas quedan delante)
const MIN_SHELF_L = 2.8; // largo mínimo de la tabla (~51 cm, estético con 1 pieza)
const SHELF_MARGIN_X = 0.34; // la tabla sobrepasa la fila de piezas a cada lado
const FALLBACK_PIECE_H = 0.4; // sin dato de cm (fallback defensivo): ~7.3 cm de alto
const WALL_EPS = 0.012; // epsilon de la punta contra la pared (anti-z-fighting)
const BRACKET_COLOR = "#8E6540"; // madera más oscura (el canto del flat-lay histórico)

/**
 * Pared cálida procedural: degradado vertical (más luz arriba, como el flat-lay 2D) + grano de
 * estuco muy sutil. Singleton perezoso por sesión (mismo patrón que lib/procedural-textures).
 */
let wallTex: THREE.CanvasTexture | null = null;
function getWallTexture(): THREE.CanvasTexture {
  if (wallTex) return wallTex;
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el contexto 2D para la pared procedural");
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, "#F7EFE3"); // crema claro arriba
  g.addColorStop(1, "#E9DAC4"); // cálido abajo (paleta del flat-lay histórico)
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // Grano de estuco: moteado apenas visible (la pared real nunca es uniforme).
  for (let i = 0; i < 900; i++) {
    ctx.globalAlpha = 0.02 + Math.random() * 0.03;
    ctx.fillStyle = Math.random() < 0.5 ? "#CBB694" : "#FFFFFF";
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  ctx.globalAlpha = 1;
  wallTex = new THREE.CanvasTexture(canvas);
  wallTex.colorSpace = THREE.SRGBColorSpace;
  return wallTex;
}

/** La tabla de madera: veta procedural compartida (la misma de la mesa Polaroid), con el
 *  repeat ajustado al largo para que la veta corra a lo largo y no se estire. */
function ShelfPlank({ length }: { length: number }) {
  const wood = useMemo(() => {
    const t = getWoodTexture().clone();
    t.repeat.set(Math.max(1, length / 1.5), 0.4);
    t.needsUpdate = true;
    return t;
  }, [length]);
  useEffect(() => () => wood.dispose(), [wood]);
  return (
    <RoundedBox
      args={[length, SHELF_T, SHELF_D]}
      radius={0.03}
      smoothness={4}
      position={[0, SHELF_TOP_Y - SHELF_T / 2, WALL_Z + SHELF_D / 2]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial map={wood} roughness={0.62} metalness={0} envMapIntensity={0.7} />
    </RoundedBox>
  );
}

/** Escuadra bajo la tabla: placa vertical contra la pared + riostra diagonal al frente. */
function Bracket({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <RoundedBox
        args={[0.07, 0.3, 0.07]}
        radius={0.02}
        smoothness={3}
        position={[0, SHELF_TOP_Y - SHELF_T - 0.13, WALL_Z + 0.1]}
        castShadow
      >
        <meshStandardMaterial color={BRACKET_COLOR} roughness={0.7} metalness={0} />
      </RoundedBox>
      {/* Riostra diagonal: de la placa (bajo, contra la pared) al borde frontal de la tabla. */}
      <RoundedBox
        args={[0.05, 0.44, 0.05]}
        radius={0.015}
        smoothness={3}
        position={[0, SHELF_TOP_Y - SHELF_T - 0.12, WALL_Z + 0.28]}
        rotation={[0.92, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color={BRACKET_COLOR} roughness={0.7} metalness={0} />
      </RoundedBox>
    </group>
  );
}

type ShelfLayout = {
  pieces: { m: Magnet3D; w: number; h: number; x: number; yaw: number }[];
  shelfL: number;
  topY: number;
};

function Scene({ magnets, sizeCm, thicknessCm, magnet }: ShelfView3DProps) {
  // #16 — no autorrotar si el usuario pide reducir movimiento.
  const reduced = usePrefersReducedMotion();
  const layout = useMemo<ShelfLayout>(() => {
    const physical = magnetWorldSizes(magnets, SHELF_U_PER_CM, { fallbackSizeCm: sizeCm });
    const sizes =
      physical ??
      magnets.map((m) => {
        const aspect = m.hRatio / m.wRatio;
        return { w: FALLBACK_PIECE_H / aspect, h: FALLBACK_PIECE_H };
      });
    const { xs, rowW } = leaningRowLayout(sizes, ROW_GAP);
    return {
      pieces: sizes.map((s, i) => ({
        m: magnets[i]!,
        w: s.w,
        h: s.h,
        x: xs[i]!,
        yaw: fanYaw(i, sizes.length, FAN_STEP),
      })),
      shelfL: Math.max(MIN_SHELF_L, rowW + 2 * SHELF_MARGIN_X),
      topY: Math.max(...sizes.map((s) => s.h)),
    };
  }, [magnets, sizeCm]);
  // Grosor físico de la pieza (2 mm del fotoimán por defecto — misma regla Fase 2.11).
  const depth =
    thicknessCm === undefined
      ? realWorldDepth(SHELF_U_PER_CM)
      : realWorldDepth(SHELF_U_PER_CM, thicknessCm);

  // Encuadre: centro vertical entre el tope de las piezas y las escuadras; el contenido en z
  // es delgado (pared + tabla) así que el halfH lo manda el alto de las piezas.
  const targetY = layout.topY / 2 - 0.12;
  const halfH = Math.max(layout.topY + 0.15 - targetY, targetY + 0.55);
  const halfW = layout.shelfL / 2 + 0.15;

  return (
    <>
      {/* Misma calibración que la nevera (2026-10-05): irradiancia difusa ≈ 1.0 sobre la cara
        impresa (casi vertical, mirando a +Z con 11° de recosto) — key 0.85 + hemi 0.28 +
        ambient 0.18 + fill 0.25. */}
      <StudioEnvironment intensity={1} />
      <hemisphereLight args={["#ffffff", "#d8cbbb", 0.28]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[4, 6, 7]}
        intensity={0.85}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-Math.max(4, halfW + 1)}
        shadow-camera-right={Math.max(4, halfW + 1)}
        shadow-camera-top={6}
        shadow-camera-bottom={-4}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-6, 3, 5]} intensity={0.25} />

      {/* Pared procedural (recibe la sombra suave de las piezas recostadas). */}
      <mesh position={[0, 3, WALL_Z - 0.01]} receiveShadow>
        <planeGeometry args={[30, 18]} />
        <meshStandardMaterial map={getWallTexture()} roughness={0.95} metalness={0} />
      </mesh>
      {/* Piso de madera (se descubre al orbitar hacia abajo — la repisa no flota en el vacío). */}
      <mesh position={[0, -3.2, 8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 18]} />
        <meshStandardMaterial map={getWoodTexture()} roughness={0.78} metalness={0} />
      </mesh>

      <ShelfPlank length={layout.shelfL} />
      <Bracket x={-layout.shelfL * 0.33} />
      <Bracket x={layout.shelfL * 0.33} />

      {layout.pieces.map(({ m, w, h, x, yaw }, i) => {
        const pose = leaningPose(h, LEAN_RAD, SHELF_TOP_Y, WALL_Z + WALL_EPS, depth);
        return (
          <group key={i} position={[x, 0, 0]} rotation={[0, yaw, 0]}>
            <group position={[0, pose.y, pose.z]} rotation={[pose.tiltX, 0, 0]}>
              <MagnetMesh
                dataUrl={m.dataUrl}
                width={w}
                height={h}
                shape={m.shape}
                depth={depth}
                cornerRadiusRatio={m.cornerRadiusRatio}
                backColor={magnet ? MAGNET_BACK_COLOR : undefined}
              />
            </group>
          </group>
        );
      })}

      {/* Escena estática (el autoRotate mueve la CÁMARA) → sombra horneada 1 vez sobre la tabla. */}
      <ContactShadows
        frames={1}
        position={[0, SHELF_TOP_Y + 0.002, WALL_Z + SHELF_D / 2]}
        opacity={0.4}
        blur={2.2}
        scale={Math.max(6, layout.shelfL * 1.5)}
        far={2}
      />
      {/* Encuadre con ángulo polar FIJO (casi frontal, apenas desde arriba): la repisa se lee
        igual en desktop y móvil. */}
      <FitCameraPolar
        halfW={halfW}
        halfH={halfH}
        polarDeg={74}
        margin={1.14}
        targetY={targetY}
        targetZ={0.25}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.6}
        minPolarAngle={Math.PI / 4.5}
        maxPolarAngle={Math.PI / 1.95}
        // Zoom móvil: un fotoimán de 6.5 cm (h ≈ 0.36 u) a 1.05 u del target ocupa
        // ≈ 47% del alto (fov 40°: 0.36/(2·1.05·0.364)) — el objetivo ≥50% se roza y
        // el piso físico manda: más cerca la cámara rozaría la tabla (frente z≈0.58).
        minDistance={1.05}
        maxDistance={60}
        target={[0, targetY, 0.25]}
      />
    </>
  );
}

export default function ShelfView3D({ magnets, sizeCm, thicknessCm, magnet }: ShelfView3DProps) {
  if (magnets.length === 0) {
    return (
      <div className="text-brand-muted flex h-full items-center justify-center p-8 text-center text-sm">
        Agrega al menos una foto para ver tu diseño en la repisa 3D.
      </div>
    );
  }
  return (
    <Canvas
      shadows
      // dpr hasta 2 también en táctil (mismo criterio 2026-10-05 del resto de escenas):
      // nitidez retina en zoom cercano; escena estática con sombra horneada.
      dpr={[1, 2]}
      camera={{ position: [0, 1.1, 5.5], fov: 40 }}
      gl={{ preserveDrawingBuffer: false, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#FFF8F0"]} />
      <Suspense fallback={null}>
        <Scene magnets={magnets} sizeCm={sizeCm} thicknessCm={thicknessCm} magnet={magnet} />
      </Suspense>
    </Canvas>
  );
}
