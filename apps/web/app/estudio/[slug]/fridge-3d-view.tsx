"use client";

/*
 * FridgeView3D — vista previa 3D del pack de imanes pegados en una nevera (ADR-057 · P1.4).
 *
 * El "Diferenciador #1" prometido en CLAUDE.md: además del editor 2D, el cliente ve su diseño
 * como imanes REALES sobre una nevera, que puede girar/acercar. La textura de cada imán es el
 * snapshot del slot correspondiente (dataURL PNG con transparencia → respeta la silueta física:
 * rectángulo/corazón/círculo).
 *
 * Realismo (Ola 30 — 2026-09-15, feedback dueña: "no se ve alineado al tamaño de una nevera,
 * como muy grandes… hazla más grande, inclusive puede ser un nevecón"):
 *  - NEVECÓN SIDE-BY-SIDE: dos puertas VERTICALES de cuerpo completo con junta central, de
 *    dimensiones reales 178 cm alto × 91 ancho × 75 fondo (FRIDGE_SCENE en lib/cluster-layout,
 *    fuente única de verdad compartida con los tests de proporción). Antes era un top-freezer
 *    de 170×68 cm — tan ANGOSTO que una tira de 6.5 cm era ~10% del ancho y dominaba la escena;
 *    ahora la tira es ~15% del ALTO (26.5/178) y un fotoimán de 6.5 cm ~7% del ancho de puerta.
 *  - Cuerpo GRIS SATINADO metálico (electrodoméstico real), cantos redondeados, paneles
 *    biselados, manijas VERTICALES en los bordes de la JUNTA central (como un side-by-side
 *    real), patas en las 4 esquinas. Mismo estilo/materiales de siempre.
 *  - 2026-07-22: los imanes tienen CUERPO (MagnetMesh extruido desde su silueta, canto blanco
 *    del material base + brillo PET), no son planos sin grosor.
 *  - 2026-09-15: TAMAÑO REAL SIEMPRE — cada pieza conserva sus cm reales en cualquier cantidad
 *    (uPerCm = 8.8 u / 178 cm): cuando una columna supera el alto útil de las puertas se ABREN
 *    más columnas balanceadas (lib/cluster-layout, compartido con el tablero), y si el conjunto
 *    desborda, la cámara reencuadra nevera + clúster (FitCamera recibe los bounds; maxDistance
 *    holgado para que el reencuadre no quede topeado en móvil vertical). El clúster se reparte
 *    sobre AMBAS puertas (región ancha, ancla en zona alta). Además: shadow-camera de la luz
 *    key acotada explícita y las patas APOYAN en el piso.
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
import { clusterLayout, FRIDGE_SCENE } from "./lib/cluster-layout";

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

// ── Nevecón SIDE-BY-SIDE de tamaño FIJO (no depende de la cantidad de imanes) ──
// Dimensiones REALES 178×91×75 cm (Ola 30): las constantes físicas viven en FRIDGE_SCENE
// (lib/cluster-layout) — fuente única compartida con los tests de proporción.
const FRIDGE_W = FRIDGE_SCENE.wU; // ≈ 4.499 u ↔ 91 cm
const FRIDGE_H = FRIDGE_SCENE.hU; // 8.8 u ↔ 178 cm
const FRIDGE_D = FRIDGE_SCENE.dU; // ≈ 3.708 u ↔ 75 cm
const DOOR_Z = FRIDGE_D / 2; // frente del cuerpo

// Layout del frente: dos puertas VERTICALES de cuerpo completo con junta central oscura.
const M = 0.15; // margen de cada puerta respecto al borde del cuerpo
const DOOR_GAP = 0.12; // junta vertical entre las dos puertas
const DOOR_H = FRIDGE_H - 2 * M;
const DOOR_W = (FRIDGE_W - 2 * M - DOOR_GAP) / 2; // cada puerta ≈ 2.04 u ↔ ~41 cm
const DOOR_CX = DOOR_W / 2 + DOOR_GAP / 2; // |x| del centro de cada puerta
const DOOR_T = 0.14; // grosor del panel de puerta (sobresale del cuerpo)
const DOOR_FACE_Z = DOOR_Z + DOOR_T / 2; // cara frontal de la puerta

// Clúster de imanes a TAMAÑO REAL sobre AMBAS puertas (región/ancla en FRIDGE_SCENE.cluster):
// cuando una columna supera el alto útil se ABREN más columnas (lib/cluster-layout); si el
// conjunto desborda, FitCamera reencuadra nevera + clúster (nunca se encoge una pieza).
const MAGNET_GAP = FRIDGE_SCENE.cluster.gap;
const MAGNET_Z = DOOR_FACE_Z + 0.04; // centro del cuerpo extruido (canto visible sobre el panel)

// Escala física de la escena: nevecón real de 178 cm de alto (8.8 u → 0.04944 u/cm; el ancho
// 4.499 u ↔ 91 cm y el fondo 3.708 u ↔ 75 cm cuadran con la MISMA escala ✓).
const FRIDGE_U_PER_CM = FRIDGE_SCENE.uPerCm;

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

/** Manija vertical en el borde de la JUNTA central: canal oscuro embutido + grip fino satinado.
 *  `side` = +1 borde derecho de la puerta (puerta izquierda), −1 borde izquierdo (puerta der.). */
function Handle({
  doorW,
  handleH,
  side,
}: {
  doorW: number;
  handleH: number;
  side: 1 | -1;
}) {
  const x = side * (doorW / 2 - 0.22);
  return (
    <group>
      {/* Canal embutido (rebaje oscuro donde entran los dedos) */}
      <RoundedBox
        args={[0.13, handleH + 0.16, 0.05]}
        radius={0.02}
        smoothness={3}
        position={[x, 0, DOOR_FACE_Z - 0.005]}
      >
        <meshStandardMaterial color="#5A5E64" roughness={0.75} metalness={0.15} />
      </RoundedBox>
      {/* Grip fino cromado (sobresale poco → integrado, no un tirador grueso) */}
      <RoundedBox
        args={[0.055, handleH, 0.075]}
        radius={0.025}
        smoothness={4}
        position={[x, 0, DOOR_FACE_Z + 0.055]}
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

/** Una puerta full-height del side-by-side: cuerpo saliente + panel biselado interno (borde con
 *  groove) + manija en el borde de la junta central (`handleSide`). */
function Door({
  width,
  height,
  centerX,
  handleSide,
}: {
  width: number;
  height: number;
  centerX: number;
  handleSide: 1 | -1;
}) {
  return (
    <group position={[centerX, 0, 0]}>
      {/* Cuerpo de la puerta */}
      <RoundedBox
        args={[width, height, DOOR_T]}
        radius={0.08}
        smoothness={5}
        position={[0, 0, DOOR_Z]}
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
        position={[0, 0, DOOR_FACE_Z + 0.012]}
        receiveShadow
      >
        <meshStandardMaterial
          color={PANEL_COLOR}
          roughness={0.36}
          metalness={0.34}
          envMapIntensity={1.4}
        />
      </RoundedBox>
      <Handle doorW={width} handleH={height * 0.55} side={handleSide} />
    </group>
  );
}

/** El nevecón side-by-side: cuerpo + dos puertas full-height + junta central vertical + patas. */
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

      {/* Junta/sello oscuro VERTICAL entre las dos puertas */}
      <mesh position={[0, 0, DOOR_Z + 0.03]}>
        <boxGeometry args={[DOOR_GAP, DOOR_H + 0.04, 0.02]} />
        <meshStandardMaterial color={SEAM_COLOR} roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Puerta izquierda (freezer) y derecha (refrigerador), manijas en la junta central */}
      <Door width={DOOR_W} height={DOOR_H} centerX={-DOOR_CX} handleSide={1} />
      <Door width={DOOR_W} height={DOOR_H} centerX={DOOR_CX} handleSide={-1} />

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
 * cualquier cantidad (2 unidades se ven igual de grandes que 12). La matemática vive en
 * lib/cluster-layout (compartida con el tablero) y la región en FRIDGE_SCENE.cluster (ambas
 * puertas, ancla en zona alta): las columnas pedidas se respetan mientras quepan a lo ancho
 * razonable y, cuando una columna supera el ALTO útil, se ABREN más columnas balanceadas (≤ 1
 * pieza de diferencia) — nunca se encoge una pieza. Si el conjunto desborda las puertas,
 * FitCamera reencuadra nevera + clúster (bounds devueltos acá).
 */
function fridgeClusterLayout(
  magnets: Magnet3D[],
  cols: number,
  sizeCm?: string,
): { items: FridgeItem[]; halfW: number; halfH: number } {
  const physical = magnetWorldSizes(magnets, FRIDGE_U_PER_CM, { fallbackSizeCm: sizeCm });
  if (physical) {
    const layout = clusterLayout(physical, {
      maxW: FRIDGE_SCENE.cluster.maxW,
      maxH: FRIDGE_SCENE.cluster.topY - FRIDGE_SCENE.cluster.bottomY,
      gap: MAGNET_GAP,
      preferCols: cols,
      anchorY: FRIDGE_SCENE.cluster.anchorY,
      topY: FRIDGE_SCENE.cluster.topY,
      bottomY: FRIDGE_SCENE.cluster.bottomY,
    });
    return {
      items: layout.items.map((it, i) => ({ m: magnets[i]!, w: it.w, h: it.h, x: it.x, y: it.y })),
      halfW: layout.halfW,
      halfH: layout.halfH,
    };
  }
  // Sin dato de cm (p.ej. letras del nombre): ajuste-a-celda histórico sobre la región vieja.
  const regionW = FRIDGE_SCENE.cluster.maxW;
  const regionH = DOOR_H * 0.28;
  const anchorY = FRIDGE_SCENE.cluster.anchorY;
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
    const y = anchorY + ((rows - 1) / 2 - row) * cellH;
    return { m, w, h, x, y };
  });
  return { items, halfW: regionW / 2, halfH: Math.abs(anchorY) + regionH / 2 };
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
      {/* #12 — encuadra el nevecón al aspecto del viewport (fit-to-height).
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
        maxDistance={60}
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
