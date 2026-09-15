"use client";

/*
 * FridgeView3D — vista previa 3D del pack de imanes pegados en una nevera (ADR-057 · P1.4).
 *
 * El "Diferenciador #1" prometido en CLAUDE.md: además del editor 2D, el cliente ve su diseño
 * como imanes REALES sobre una nevera, que puede girar/acercar. La textura de cada imán es el
 * snapshot del slot correspondiente (dataURL PNG con transparencia → respeta la silueta física:
 * rectángulo/corazón/círculo).
 *
 * Realismo (Lucy 2026-07-13, con foto de referencia: nevera convencional real):
 *  - Top-freezer de dos puertas, ALTA y esbelta, cuerpo GRIS SATINADO metálico (electrodoméstico
 *    real, no lavanda), cantos verticales redondeados y frente casi plano.
 *  - Manijas VERTICALES sobre el borde IZQUIERDO de cada puerta (como la referencia), tipo barra
 *    cromada satinada sobre un rebaje.
 *  - Freezer arriba (~1/3), refrigerador abajo (~2/3), sello/junta oscura entre puertas, patas en
 *    las 4 esquinas.
 *  - Los imanes son PEQUEÑOS y se agrupan en la parte alta de la puerta del refrigerador (como
 *    imanes de verdad). La nevera es de tamaño fijo (no crece con la cantidad de imanes).
 *  - 2026-07-22: los imanes ahora tienen CUERPO (MagnetMesh extruido desde su silueta, canto
 *    blanco del material base + brillo PET), ya no son planos sin grosor.
 *  - 2026-07-22 (ola 2B): los imanes ESCALAN a su tamaño físico real (sizeCm de la variante,
 *    o wCm/hCm por pieza): la nevera mide ~170 cm de alto (8.8 u → 0.0518 u/cm), así un
 *    7.5×10 se ve notablemente más grande que un 4×4.2.
 *  - 2026-09-15: TAMAÑO REAL SIEMPRE — se eliminó el encogimiento a la región fija de la puerta
 *    (con 12 unidades las piezas se veían miniatura). Ahora cada pieza conserva sus cm reales en
 *    cualquier cantidad: la disposición crece (más columnas/filas dentro de un ancho razonable
 *    de puerta, y si desborda, la cámara reencuadra nevera + clúster — FitCamera recibe los
 *    bounds del clúster). Además: shadow-camera de la luz key acotada explícita (antes se
 *    recortaba la sombra de la parte alta) y las patas APOYAN en el piso (antes flotaban ~2 cm
 *    sobre la sombra de contacto).
 *
 * Restricciones respetadas:
 *  - CSP estricta: CERO assets externos (nada de Environment/HDR/GLTF/fuentes de CDN de drei). El
 *    look metálico se logra con luces procedurales (hemisphere + direccionales), sin env-map.
 *  - Se monta SOLO client-side (WebGL/window) → se importa con dynamic ssr:false.
 *  - Sin WebGL → mensaje amable (no rompe el Estudio).
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, ContactShadows, Center } from "@react-three/drei";
import { FitCamera } from "./fit-camera";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { useIsTouch } from "./use-is-touch";
import { StudioEnvironment, StudioBackdrop } from "./studio-3d-environment";
import { MagnetMesh, magnetWorldSizes, type MagnetShape } from "./magnet-3d";

export type Magnet3D = {
  /** Snapshot PNG (dataURL) del imán, con transparencia fuera de la silueta. */
  dataUrl: string;
  /** Ancho físico relativo (unitTemplate.stage.width). */
  wRatio: number;
  /** Alto físico relativo (unitTemplate.stage.height). */
  hRatio: number;
  /** Silueta física (la misma del recorte) → MagnetMesh extruye el cuerpo con esta forma. */
  shape?: MagnetShape;
  /** Ancho real en cm (opcional — escala física en escena; si falta, se usa sizeCm de la vista). */
  wCm?: number;
  /** Alto real en cm (opcional). */
  hCm?: number;
  /** Radio de esquina como fracción del ancho (opcional — p.ej. fichas de letras redondas 0.10;
   *  si falta, el default 8/512 que espeja el recorte de la textura). */
  cornerRadiusRatio?: number;
  /** Ola 10 — índice de slot original (para separadores 2 caras). */
  slotIndex?: number;
  /** Ola 10 — URL del asset cargado (null si vacío). Para caras B sin foto, duplicar cara A. */
  assetUrl?: string | null;
};

type FridgeView3DProps = {
  magnets: Magnet3D[];
  cols: number;
  /** sizeCm de la variante elegida (ej "6.5×6.5", "7.5×10") — escala física de los imanes. */
  sizeCm?: string;
};

// ── Nevera de tamaño FIJO (no depende de la cantidad de imanes) ──
// Proporción de nevera convencional real (alta y esbelta): H/W ≈ 2.5.
const FRIDGE_W = 3.5;
const FRIDGE_H = 8.8;
const FRIDGE_D = 1.5;
const FREEZER_FRAC = 0.31; // ~1/3 superior = freezer
const DOOR_Z = FRIDGE_D / 2; // frente del cuerpo

// Layout del frente (puertas casi cubren la cara, con margen y una junta central).
const M = 0.15; // margen del panel frontal respecto al borde del cuerpo
const DOOR_GAP = 0.12; // junta oscura entre freezer y refrigerador
const AVAIL_H = FRIDGE_H - 2 * M;
const FREEZER_DOOR_H = FREEZER_FRAC * AVAIL_H - DOOR_GAP / 2;
const FRIDGE_DOOR_H = (1 - FREEZER_FRAC) * AVAIL_H - DOOR_GAP / 2;
const DOOR_W = FRIDGE_W - 2 * M;
const FREEZER_CY = FRIDGE_H / 2 - M - FREEZER_DOOR_H / 2;
const FRIDGE_CY = -FRIDGE_H / 2 + M + FRIDGE_DOOR_H / 2;
const GAP_CY = FRIDGE_H / 2 - M - FREEZER_DOOR_H - DOOR_GAP / 2;
const DOOR_T = 0.14; // grosor del panel de puerta (sobresale del cuerpo)
const DOOR_FACE_Z = DOOR_Z + DOOR_T / 2; // cara frontal de la puerta

// Clúster de imanes a TAMAÑO REAL (2026-09-15): la región ya no ENCOGE las piezas — solo define
// los límites estéticos de la disposición sobre la puerta del refrigerador. Si el clúster real
// desborda estos límites, FitCamera reencuadra nevera + clúster (nunca se encoge una pieza).
const MAGNET_GAP = 0.06; // aire entre piezas vecinas del clúster
const MAX_CLUSTER_W = DOOR_W * 0.78; // deja libre la manija (borde izq.) y margen derecho
const CLUSTER_TOP_Y = GAP_CY - DOOR_GAP / 2 - 0.15; // apenas bajo la junta del freezer
const CLUSTER_BOT_Y = FRIDGE_CY - FRIDGE_DOOR_H / 2 + 0.25; // margen sobre el borde inferior
const MAGNET_REGION_CY = FRIDGE_CY + FRIDGE_DOOR_H * 0.22; // ancla estética: clúster chico, zona alta
const MAGNET_Z = DOOR_FACE_Z + 0.04; // centro del cuerpo extruido (canto visible sobre el panel)

// Escala física de la escena: nevera top-freezer real ~170 cm de alto (y ~68 cm de ancho —
// FRIDGE_W 3.5 u cuadra con la misma escala: 3.5/8.8·170 = 67.6 cm ✓).
const FRIDGE_U_PER_CM = FRIDGE_H / 170;

// Materiales (gris satinado de electrodoméstico; metalness baja para verse bien sin env-map).
const BODY_COLOR = "#9297A0";
const DOOR_COLOR = "#A0A5AE";
const PANEL_COLOR = "#989DA6"; // panel biselado interno (un pelo más oscuro)
const SEAM_COLOR = "#34373D";
const HANDLE_COLOR = "#C9CDD4";
const FOOT_COLOR = "#212227";

/** Un imán con CUERPO: extruido desde su silueta (canto blanco del material + brillo PET). */
function Magnet({
  m,
  width,
  height,
  position,
}: {
  m: Magnet3D;
  width: number;
  height: number;
  position: [number, number, number];
}) {
  return (
    <MagnetMesh
      dataUrl={m.dataUrl}
      width={width}
      height={height}
      shape={m.shape}
      cornerRadiusRatio={m.cornerRadiusRatio}
      position={position}
    />
  );
}

/** Manija vertical sobre el borde izquierdo: canal oscuro embutido + grip fino satinado. */
function Handle({ doorW, centerY, handleH }: { doorW: number; centerY: number; handleH: number }) {
  const x = -doorW / 2 + 0.22;
  return (
    <group>
      {/* Canal embutido (rebaje oscuro donde entran los dedos) */}
      <RoundedBox
        args={[0.13, handleH + 0.16, 0.05]}
        radius={0.02}
        smoothness={3}
        position={[x, centerY, DOOR_FACE_Z - 0.005]}
      >
        <meshStandardMaterial color="#5A5E64" roughness={0.75} metalness={0.15} />
      </RoundedBox>
      {/* Grip fino cromado (sobresale poco → integrado, no un tirador grueso) */}
      <RoundedBox
        args={[0.055, handleH, 0.075]}
        radius={0.025}
        smoothness={4}
        position={[x, centerY, DOOR_FACE_Z + 0.055]}
        castShadow
      >
        <meshStandardMaterial
          color={HANDLE_COLOR}
          roughness={0.2}
          metalness={0.7}
          envMapIntensity={1.9}
        />
      </RoundedBox>
    </group>
  );
}

/** Una puerta: cuerpo saliente + panel biselado interno (borde con groove) + manija. */
function Door({ width, height, centerY }: { width: number; height: number; centerY: number }) {
  return (
    <group>
      {/* Cuerpo de la puerta */}
      <RoundedBox
        args={[width, height, DOOR_T]}
        radius={0.08}
        smoothness={5}
        position={[0, centerY, DOOR_Z]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={DOOR_COLOR}
          roughness={0.28}
          metalness={0.42}
          envMapIntensity={1.5}
        />
      </RoundedBox>
      {/* Panel interno con bisel: apenas proud + un pelo más oscuro → el escalón lee como un
          groove perimetral (detalle de nevera real, sin texturas). */}
      <RoundedBox
        args={[width - 0.36, height - 0.36, 0.03]}
        radius={0.06}
        smoothness={4}
        position={[0, centerY, DOOR_FACE_Z + 0.012]}
        receiveShadow
      >
        <meshStandardMaterial
          color={PANEL_COLOR}
          roughness={0.36}
          metalness={0.34}
          envMapIntensity={1.4}
        />
      </RoundedBox>
      <Handle doorW={width} centerY={centerY} handleH={height * 0.7} />
    </group>
  );
}

/** La nevera top-freezer: cuerpo + dos puertas + junta + patas. */
function Fridge() {
  const feetX = FRIDGE_W / 2 - 0.32;
  const feetZ = FRIDGE_D / 2 - 0.32;
  return (
    <group>
      {/* Cuerpo (cantos redondeados) */}
      <RoundedBox
        args={[FRIDGE_W, FRIDGE_H, FRIDGE_D]}
        radius={0.26}
        smoothness={6}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={BODY_COLOR}
          roughness={0.34}
          metalness={0.34}
          envMapIntensity={1.4}
        />
      </RoundedBox>

      {/* Junta/sello oscuro entre freezer y refrigerador */}
      <mesh position={[0, GAP_CY, DOOR_Z + 0.03]}>
        <boxGeometry args={[DOOR_W + 0.04, DOOR_GAP, 0.02]} />
        <meshStandardMaterial color={SEAM_COLOR} roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Freezer (arriba) y refrigerador (abajo) */}
      <Door width={DOOR_W} height={FREEZER_DOOR_H} centerY={FREEZER_CY} />
      <Door width={DOOR_W} height={FRIDGE_DOOR_H} centerY={FRIDGE_CY} />

      {/* Patas en las 4 esquinas (la base de la pata APOYA en el piso: centro = piso + alto/2) */}
      {[
        [-feetX, -feetZ],
        [feetX, -feetZ],
        [-feetX, feetZ],
        [feetX, feetZ],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, -FRIDGE_H / 2 - 0.23, z]} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.22, 16]} />
          <meshStandardMaterial color={FOOT_COLOR} roughness={0.5} metalness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

type FridgeItem = { m: Magnet3D; w: number; h: number; x: number; y: number };

/**
 * Disposición del clúster a TAMAÑO REAL (2026-09-15): cada pieza conserva sus cm reales en
 * cualquier cantidad (2 unidades se ven igual de grandes que 12). Las columnas pedidas se
 * respetan mientras el clúster quepa en el ancho razonable de la puerta; si no cabe, se
 * REDISTRIBUYE en más filas (nunca se encoge una pieza). Si ni así cabe sobre la puerta, el
 * clúster desborda y FitCamera reencuadra nevera + clúster (bounds devueltos acá).
 */
function fridgeClusterLayout(
  magnets: Magnet3D[],
  cols: number,
  sizeCm?: string,
): { items: FridgeItem[]; halfW: number; halfH: number } {
  const physical = magnetWorldSizes(magnets, FRIDGE_U_PER_CM, { fallbackSizeCm: sizeCm });
  if (physical) {
    const maxW = Math.max(...physical.map((s) => s.w));
    const maxH = Math.max(...physical.map((s) => s.h));
    // Columnas que caben a tamaño real en el ancho razonable de puerta (mínimo 1).
    const fitCols = Math.max(1, Math.floor((MAX_CLUSTER_W + MAGNET_GAP) / (maxW + MAGNET_GAP)));
    const effCols = Math.max(1, Math.min(cols, fitCols));
    const rows = Math.max(1, Math.ceil(magnets.length / effCols));
    const clusterW = effCols * maxW + (effCols - 1) * MAGNET_GAP;
    const clusterH = rows * maxH + (rows - 1) * MAGNET_GAP;
    // Centro vertical: ancla estética en la zona alta, acotada para que el clúster quede sobre
    // la puerta mientras quepa; si es más alto que la puerta, se centra en ella (la cámara abre).
    const span = CLUSTER_TOP_Y - CLUSTER_BOT_Y;
    const cy =
      clusterH >= span
        ? (CLUSTER_TOP_Y + CLUSTER_BOT_Y) / 2
        : Math.min(
            Math.max(MAGNET_REGION_CY, CLUSTER_BOT_Y + clusterH / 2),
            CLUSTER_TOP_Y - clusterH / 2,
          );
    const items = magnets.map((m, i) => {
      const { w, h } = physical[i]!;
      const col = i % effCols;
      const row = Math.floor(i / effCols);
      const x = (col - (effCols - 1) / 2) * (maxW + MAGNET_GAP);
      const y = cy + ((rows - 1) / 2 - row) * (maxH + MAGNET_GAP);
      return { m, w, h, x, y };
    });
    return { items, halfW: clusterW / 2, halfH: Math.abs(cy) + clusterH / 2 };
  }
  // Sin dato de cm (p.ej. letras del nombre): ajuste-a-celda histórico sobre la región vieja.
  const regionW = MAX_CLUSTER_W;
  const regionH = FRIDGE_DOOR_H * 0.28;
  const rows = Math.max(1, Math.ceil(magnets.length / cols));
  const cellW = regionW / cols;
  const cellH = regionH / rows;
  const items = magnets.map((m, i) => {
    const aspect = m.hRatio / m.wRatio;
    let w = cellW - MAGNET_GAP;
    let h = w * aspect;
    if (h > cellH - MAGNET_GAP) {
      h = cellH - MAGNET_GAP;
      w = h / aspect;
    }
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * cellW;
    const y = MAGNET_REGION_CY + ((rows - 1) / 2 - row) * cellH;
    return { m, w, h, x, y };
  });
  return { items, halfW: regionW / 2, halfH: Math.abs(MAGNET_REGION_CY) + regionH / 2 };
}

function Magnets({ items }: { items: FridgeItem[] }) {
  return (
    <>
      {items.map(({ m, w, h, x, y }, i) => (
        <Magnet key={i} m={m} width={w} height={h} position={[x, y, MAGNET_Z]} />
      ))}
    </>
  );
}

function Scene({ magnets, cols, sizeCm }: FridgeView3DProps) {
  // #16 — no autorrotar si el usuario pide reducir movimiento.
  const reduced = usePrefersReducedMotion();
  // Clúster a tamaño real + sus bounds: la cámara encuadra nevera Y clúster completo.
  const layout = useMemo(() => fridgeClusterLayout(magnets, cols, sizeCm), [magnets, cols, sizeCm]);
  return (
    <>
      {/* FB5 — env-map procedural (reflejos PBR reales) + backdrop de estudio (contexto/asiento). La
        iluminación directa baja porque el entorno ya aporta ambiente; el key mantiene el brillo y la
        sombra proyectada. */}
      <StudioEnvironment intensity={1} />
      <StudioBackdrop position={[0, -FRIDGE_H / 2 - 0.34, -5]} scale={[42, 24, 9]} />
      <hemisphereLight args={["#ffffff", "#cfc9c2", 0.28]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[5, 8, 7]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={10}
        shadow-camera-bottom={-8}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-6, 3, 4]} intensity={0.3} />

      <Center>
        <group>
          <Fridge />
          <Magnets items={layout.items} />
        </group>
      </Center>

      {/* Escena estática (el autoRotate mueve la CÁMARA, no la nevera) → sombra horneada 1 vez. */}
      <ContactShadows
        frames={1}
        position={[0, -FRIDGE_H / 2 - 0.34, 0]}
        opacity={0.5}
        blur={2.8}
        scale={16}
        far={6}
      />
      {/* #12 — encuadra la nevera (alta y angosta) al aspecto del viewport (fit-to-height).
          2026-09-15: si el clúster a tamaño real desborda la puerta, el encuadre crece hasta
          cubrir nevera + clúster completo (las piezas NUNCA se encogen). */}
      <FitCamera
        halfW={Math.max(FRIDGE_W / 2 + 0.1, layout.halfW + 0.1)}
        halfH={Math.max(FRIDGE_H / 2, layout.halfH)}
        margin={1.12}
        camY={0.4}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.8}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 1.9}
        minDistance={7}
        maxDistance={30}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function FridgeView3D({ magnets, cols, sizeCm }: FridgeView3DProps) {
  const isTouch = useIsTouch();
  if (magnets.length === 0) {
    return (
      <div className="text-brand-muted flex h-full items-center justify-center p-8 text-center text-sm">
        Agrega al menos una foto para ver tus imanes en la nevera 3D.
      </div>
    );
  }
  return (
    <Canvas
      shadows
      dpr={isTouch ? [1, 1.5] : [1, 2]}
      camera={{ position: [0, 0.4, 14.5], fov: 40 }}
      gl={{ preserveDrawingBuffer: false, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#FFF8F0"]} />
      <Suspense fallback={null}>
        <Scene magnets={magnets} cols={cols} sizeCm={sizeCm} />
      </Suspense>
    </Canvas>
  );
}
