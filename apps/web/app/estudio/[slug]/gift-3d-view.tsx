"use client";

/*
 * GiftView3D — escena 3D de REGALO (ADR-063): el fotoimán como obsequio — caja con cinta y
 * moño, etiqueta "Para ti" y las piezas del diseño del cliente como protagonistas.
 *
 * 2026-10-26 (decisión owner: "3D completo ahora") — REEMPLAZA al flat-lay 2D histórico
 * (lib/compose-gift-flatlay.ts, PNG 1080×1080 servido como <img> plano que se distorsionaba al
 * acercar). Misma composición emocional del 2D (papel cálido, cinta turquesa de marca, etiqueta
 * "Para ti") pero en react-three-fiber con el estándar de nevera/libro/polaroid: OrbitControls
 * con límites, texturas del diseño (Magnet3D), env-map procedural, sombra horneada y pill de
 * gestos de la galería.
 *
 * Composición:
 *  - Caja de regalo sobre mesa de madera (veta procedural compartida): papel crema, cinta
 *    turquesa cruzada (turquesa de marca, como el flat-lay) y moño estilizado (dos lazos toro +
 *    nudo) con colas.
 *  - Etiqueta "Para ti" colgando del moño contra la cara frontal (textura procedural — el MISMO
 *    texto del flat-lay histórico).
 *  - Las piezas van RECOSTADAS contra la cara frontal de la caja (leaningPose de
 *    lib/leaning-scene-layout — contacto físico real); las que exceden la fila van ACOSTADAS
 *    sobre la mesa delante (flatGridLayout, como las polaroids sueltas).
 *  - TAMAÑO REAL SIEMPRE: la caja CRECE con la fila (ancho y, si las piezas son altas —tiras—,
 *    alto) para que el apoyo sea físicamente válido; la cámara reencuadra el conjunto.
 *
 * Restricciones (idénticas a las demás escenas): CSP estricta (cero assets externos) ·
 * client-only (WebGL) → la galería lo importa con dynamic ssr:false.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { FitCameraPolar } from "./fit-camera-polar";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { StudioEnvironment } from "./studio-3d-environment";
import { MagnetMesh, magnetWorldSizes, realWorldDepth } from "./magnet-3d";
import { getWoodTexture } from "./lib/procedural-textures";
import { fanYaw, flatGridLayout, leaningPose, leaningRowLayout } from "./lib/leaning-scene-layout";
import type { Magnet3D } from "./fridge-3d-view";

export type GiftView3DProps = {
  magnets: Magnet3D[];
  /** sizeCm de la variante elegida (ej "6.5×6.5") — escala física de las piezas. */
  sizeCm?: string;
  /** Grosor FÍSICO de la pieza en cm (default: 2 mm del fotoimán — misma regla que nevera). */
  thicknessCm?: number;
};

// Escala del mundo: 0.09 u/cm — un fotoimán de 6.5 cm ≈ 0.59 u y la caja base ≈ 14 cm de alto.
const GIFT_U_PER_CM = 0.09;
const LEAN_RAD = (12 * Math.PI) / 180;
const ROW_GAP = 0.14; // ~1.6 cm entre piezas recostadas
const FLAT_GAP = 0.18; // separación de las piezas acostadas
const MAX_LEANING = 6; // las que caben recostadas contra la caja; el resto va acostado
const MIN_BOX_W = 2.0; // ~22 cm
const MIN_BOX_H = 1.3; // ~14 cm
const BOX_D = 1.3; // fondo fijo (~14 cm, caja casi cúbica)
const BOX_MARGIN_X = 0.45; // la cara de la caja sobrepasa la fila de piezas
const BOX_TOP_CLEARANCE = 0.25; // aire entre la punta de la pieza recostada y el tope de la caja
const RIBBON_W = 0.2;
const RIBBON_COLOR = "#5DD9D1"; // turquesa de marca (el mismo del flat-lay 2D)
const BOX_COLOR = "#FBF6EE"; // papel crema
const FALLBACK_PIECE_H = 0.55; // sin dato de cm (fallback defensivo): ~6.1 cm
const FACE_EPS = 0.01; // epsilon de la punta contra la cara de la caja (anti-z-fighting)

/**
 * Etiqueta "Para ti" procedural (el MISMO texto del flat-lay de regalo histórico): tarjeta
 * crema con filete, agujero del cordón arriba y el texto en morado de marca.
 */
let tagTex: THREE.CanvasTexture | null = null;
function getGiftTagTexture(): THREE.CanvasTexture {
  if (tagTex) return tagTex;
  const W = 256;
  const H = 160;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el contexto 2D para la etiqueta del regalo");
  ctx.fillStyle = "#FFFDF9";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#E0CDB0";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(6, 6, W - 12, H - 12, 18);
  ctx.stroke();
  // Agujero del cordón (arriba al centro).
  ctx.beginPath();
  ctx.arc(W / 2, 26, 9, 0, Math.PI * 2);
  ctx.strokeStyle = "#C9B18E";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#7C6AAD"; // morado de marca
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 52px "Fredoka", system-ui, sans-serif';
  ctx.fillText("Para ti", W / 2, 88);
  ctx.font = "34px system-ui, sans-serif";
  ctx.fillText("🎁", W / 2, 128);
  tagTex = new THREE.CanvasTexture(canvas);
  tagTex.colorSpace = THREE.SRGBColorSpace;
  tagTex.anisotropy = 8;
  return tagTex;
}

/** La caja de regalo: cuerpo de papel + cinta turquesa cruzada que la envuelve. */
function GiftBox({ w, h }: { w: number; h: number }) {
  const ribbon = (
    <meshStandardMaterial
      color={RIBBON_COLOR}
      roughness={0.32}
      metalness={0.05}
      envMapIntensity={1.3}
    />
  );
  return (
    <group>
      <RoundedBox
        args={[w, h, BOX_D]}
        radius={0.05}
        smoothness={4}
        position={[0, h / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={BOX_COLOR}
          roughness={0.6}
          metalness={0}
          envMapIntensity={0.7}
        />
      </RoundedBox>
      {/* Cinta A (lazo en x): cubre cara frontal, tapa y trasera. */}
      <mesh position={[0, h / 2, BOX_D / 2 + 0.002]}>
        <boxGeometry args={[RIBBON_W, h + 0.03, 0.024]} />
        {ribbon}
      </mesh>
      <mesh position={[0, h / 2, -BOX_D / 2 - 0.002]}>
        <boxGeometry args={[RIBBON_W, h + 0.03, 0.024]} />
        {ribbon}
      </mesh>
      <mesh position={[0, h + 0.002, 0]}>
        <boxGeometry args={[RIBBON_W, 0.024, BOX_D + 0.028]} />
        {ribbon}
      </mesh>
      {/* Cinta B (lazo en z): tapa + costados. */}
      <mesh position={[0, h + 0.002, 0]}>
        <boxGeometry args={[w + 0.028, 0.024, RIBBON_W]} />
        {ribbon}
      </mesh>
      <mesh position={[w / 2 + 0.002, h / 2, 0]}>
        <boxGeometry args={[0.024, h + 0.03, RIBBON_W]} />
        {ribbon}
      </mesh>
      <mesh position={[-w / 2 - 0.002, h / 2, 0]}>
        <boxGeometry args={[0.024, h + 0.03, RIBBON_W]} />
        {ribbon}
      </mesh>
    </group>
  );
}

/** El moño sobre la tapa: dos lazos toro achatados y abiertos + nudo + colas caídas al frente. */
function Bow({ y }: { y: number }) {
  const material = (
    <meshStandardMaterial
      color={RIBBON_COLOR}
      roughness={0.32}
      metalness={0.05}
      envMapIntensity={1.3}
    />
  );
  return (
    <group position={[0, y, 0]}>
      <mesh position={[-0.13, 0.05, 0]} rotation={[1.05, 0, 0.55]} scale={[1, 1, 0.6]} castShadow>
        <torusGeometry args={[0.15, 0.045, 12, 24]} />
        {material}
      </mesh>
      <mesh position={[0.13, 0.05, 0]} rotation={[1.05, 0, -0.55]} scale={[1, 1, 0.6]} castShadow>
        <torusGeometry args={[0.15, 0.045, 12, 24]} />
        {material}
      </mesh>
      <mesh position={[0, 0.04, 0.02]} scale={[1, 0.75, 0.8]} castShadow>
        <sphereGeometry args={[0.075, 16, 12]} />
        {material}
      </mesh>
      <mesh position={[-0.09, 0.015, 0.2]} rotation={[0.15, 0.5, 0]}>
        <boxGeometry args={[0.07, 0.014, 0.34]} />
        {material}
      </mesh>
      <mesh position={[0.09, 0.015, 0.2]} rotation={[0.15, -0.5, 0]}>
        <boxGeometry args={[0.07, 0.014, 0.34]} />
        {material}
      </mesh>
    </group>
  );
}

/** Cordón de la etiqueta: cilindro fino entre dos puntos (del moño a la tarjeta). */
function GiftString({
  from,
  to,
}: {
  from: [number, number, number];
  to: [number, number, number];
}) {
  const { mid, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
    return { mid: a.clone().add(b).multiplyScalar(0.5), quat, len };
    // Los puntos son constantes por layout (se derivan de la caja); deps por valor.
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[0.008, 0.008, len, 6]} />
      <meshStandardMaterial color="#B79A78" roughness={0.9} metalness={0} />
    </mesh>
  );
}

/** Etiqueta "Para ti" apoyada contra la cara frontal de la caja, colgando del cordón. */
function GiftTag({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]} rotation={[-0.1, -0.12, 0.16]}>
      <RoundedBox args={[0.52, 0.32, 0.024]} radius={0.03} smoothness={3} castShadow>
        <meshStandardMaterial color="#FFFDF9" roughness={0.8} metalness={0} />
      </RoundedBox>
      <mesh position={[0, 0, 0.0135]}>
        <planeGeometry args={[0.48, 0.3]} />
        <meshStandardMaterial map={getGiftTagTexture()} roughness={0.75} metalness={0} />
      </mesh>
    </group>
  );
}

type GiftLayout = {
  leaning: { m: Magnet3D; w: number; h: number; x: number; yaw: number }[];
  flat: { m: Magnet3D; w: number; h: number; x: number; z: number; spin: number }[];
  boxW: number;
  boxH: number;
  maxZ: number; // borde frontal total de la escena (incluye las acostadas)
  flatHalfW: number;
};

function Scene({ magnets, sizeCm, thicknessCm }: GiftView3DProps) {
  // #16 — no autorrotar si el usuario pide reducir movimiento.
  const reduced = usePrefersReducedMotion();
  const layout = useMemo<GiftLayout>(() => {
    const physical = magnetWorldSizes(magnets, GIFT_U_PER_CM, { fallbackSizeCm: sizeCm });
    const sizes =
      physical ??
      magnets.map((m) => {
        const aspect = m.hRatio / m.wRatio;
        return { w: FALLBACK_PIECE_H / aspect, h: FALLBACK_PIECE_H };
      });
    const leaningSizes = sizes.slice(0, MAX_LEANING);
    const flatSizes = sizes.slice(MAX_LEANING);
    const { xs, rowW } = leaningRowLayout(leaningSizes, ROW_GAP);
    const maxLeanH = Math.max(...leaningSizes.map((s) => s.h));
    // La caja CRECE con la fila (TAMAÑO REAL SIEMPRE): el ancho cubre la fila y el alto deja la
    // punta de la pieza recostada POR DEBAJO del tope — el apoyo es físicamente válido también
    // con tiras largas (26.5 cm).
    const boxW = Math.max(MIN_BOX_W, rowW + 2 * BOX_MARGIN_X);
    const boxH = Math.max(MIN_BOX_H, maxLeanH * Math.cos(LEAN_RAD) + BOX_TOP_CLEARANCE);
    const supportZ = BOX_D / 2 + FACE_EPS;
    const frontZ = supportZ + maxLeanH * Math.sin(LEAN_RAD);
    const grid = flatGridLayout(flatSizes, FLAT_GAP);
    const flatCenterZ = frontZ + 0.24 + grid.halfH;
    return {
      leaning: leaningSizes.map((s, i) => ({
        m: magnets[i]!,
        w: s.w,
        h: s.h,
        x: xs[i]!,
        yaw: fanYaw(i, leaningSizes.length, 0.03),
      })),
      flat: flatSizes.map((s, i) => ({
        m: magnets[MAX_LEANING + i]!,
        w: s.w,
        h: s.h,
        x: grid.positions[i]!.x,
        z: flatCenterZ + grid.positions[i]!.z,
        // Giro natural determinista (sin aleatoriedad por render).
        spin: (i % 2 === 0 ? 1 : -1) * (0.1 + (i % 3) * 0.05),
      })),
      boxW,
      boxH,
      maxZ: flatSizes.length > 0 ? flatCenterZ + grid.halfH : frontZ + 0.1,
      flatHalfW: grid.halfW,
    };
  }, [magnets, sizeCm]);
  const depth =
    thicknessCm === undefined
      ? realWorldDepth(GIFT_U_PER_CM)
      : realWorldDepth(GIFT_U_PER_CM, thicknessCm);

  // Encuadre: el target queda entre la caja y las piezas; halfH considera el alto de la caja
  // (con moño) Y la proyección del fondo de la mesa ocupado (cos del polar).
  const polarDeg = 58;
  const cosPolar = Math.cos((polarDeg * Math.PI) / 180);
  const targetY = layout.boxH * 0.36;
  const targetZ = layout.maxZ * 0.28;
  const halfH = Math.max(
    layout.boxH + 0.35 - targetY,
    targetY,
    (layout.maxZ - targetZ) * cosPolar,
    (targetZ + BOX_D / 2) * cosPolar,
  );
  const halfW = Math.max(layout.boxW / 2, layout.flatHalfW) + 0.25;

  // Etiqueta: apoyada en el tercio derecho de la cara frontal; el cordón baja del moño.
  const tagPos: [number, number, number] = [
    layout.boxW * 0.27,
    layout.boxH * 0.5,
    BOX_D / 2 + 0.055,
  ];
  const stringFrom: [number, number, number] = [0.04, layout.boxH + 0.08, 0.14];
  const stringTo: [number, number, number] = [tagPos[0] - 0.1, tagPos[1] + 0.22, tagPos[2] - 0.02];

  return (
    <>
      {/* Misma calibración que la nevera (2026-10-05): irradiancia difusa ≈ 1.0 sobre la cara
        impresa (casi vertical contra la caja). */}
      <StudioEnvironment intensity={1} />
      <hemisphereLight args={["#ffffff", "#d8cbbb", 0.28]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[5, 7, 6]}
        intensity={0.85}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-Math.max(5, halfW + 1)}
        shadow-camera-right={Math.max(5, halfW + 1)}
        shadow-camera-top={Math.max(5, layout.boxH + 2)}
        shadow-camera-bottom={-4}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-6, 3, 5]} intensity={0.25} />

      {/* Mesa de madera clara procedural (la misma de la escena Polaroid). */}
      <mesh position={[0, -0.002, 6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 26]} />
        <meshStandardMaterial map={getWoodTexture()} roughness={0.75} metalness={0} />
      </mesh>

      <GiftBox w={layout.boxW} h={layout.boxH} />
      <Bow y={layout.boxH + 0.03} />
      <GiftString from={stringFrom} to={stringTo} />
      <GiftTag x={tagPos[0]} y={tagPos[1]} z={tagPos[2]} />

      {/* Piezas recostadas contra la cara frontal de la caja (contacto físico real). */}
      {layout.leaning.map(({ m, w, h, x, yaw }, i) => {
        const pose = leaningPose(h, LEAN_RAD, 0, BOX_D / 2 + FACE_EPS, depth);
        return (
          <group key={`lean-${i}`} position={[x, 0, 0]} rotation={[0, yaw, 0]}>
            <group position={[0, pose.y, pose.z]} rotation={[pose.tiltX, 0, 0]}>
              <MagnetMesh
                dataUrl={m.dataUrl}
                width={w}
                height={h}
                shape={m.shape}
                depth={depth}
                cornerRadiusRatio={m.cornerRadiusRatio}
              />
            </group>
          </group>
        );
      })}

      {/* Las que no caben contra la caja van ACOSTADAS sobre la mesa, delante (como las
          polaroids sueltas): spin natural en el plano y luego acostar (−90° X). */}
      {layout.flat.map(({ m, w, h, x, z, spin }, i) => (
        <group key={`flat-${i}`} position={[x, depth * 0.7 + 0.004, z]} rotation={[0, spin, 0]}>
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <MagnetMesh
              dataUrl={m.dataUrl}
              width={w}
              height={h}
              shape={m.shape}
              depth={depth}
              cornerRadiusRatio={m.cornerRadiusRatio}
            />
          </group>
        </group>
      ))}

      {/* Escena estática (el autoRotate mueve la CÁMARA) → sombra horneada 1 vez sobre la mesa. */}
      <ContactShadows
        frames={1}
        position={[0, 0.002, 0]}
        opacity={0.42}
        blur={2.4}
        scale={Math.max(9, halfW * 2.4, layout.maxZ * 1.6)}
        far={3}
      />
      <FitCameraPolar
        halfW={halfW}
        halfH={halfH}
        polarDeg={polarDeg}
        margin={1.18}
        targetY={targetY}
        targetZ={targetZ}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.6}
        minPolarAngle={0.45}
        maxPolarAngle={1.35}
        // Zoom móvil: un fotoimán de 6.5 cm (h ≈ 0.59 u) a 1.5 u del target ocupa
        // ≈ 54% del alto (fov 40°) — objetivo ≥50%. Piso físico: a 1.5 u la cámara
        // queda sobre la mesa y por encima de la caja en todo el rango polar.
        minDistance={1.5}
        maxDistance={45}
        target={[0, targetY, targetZ]}
      />
    </>
  );
}

export default function GiftView3D({ magnets, sizeCm, thicknessCm }: GiftView3DProps) {
  if (magnets.length === 0) {
    return (
      <div className="text-brand-muted flex h-full items-center justify-center p-8 text-center text-sm">
        Agrega al menos una foto para ver tu regalo 3D.
      </div>
    );
  }
  return (
    <Canvas
      shadows
      // dpr hasta 2 también en táctil (mismo criterio 2026-10-05 del resto de escenas):
      // nitidez retina en zoom cercano; escena estática con sombra horneada.
      dpr={[1, 2]}
      camera={{ position: [0, 2.2, 5.2], fov: 40 }}
      gl={{ preserveDrawingBuffer: false, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Papel cálido del flat-lay histórico como fondo de la escena. */}
      <color attach="background" args={["#F7EDDF"]} />
      <Suspense fallback={null}>
        <Scene magnets={magnets} sizeCm={sizeCm} thicknessCm={thicknessCm} />
      </Suspense>
    </Canvas>
  );
}
