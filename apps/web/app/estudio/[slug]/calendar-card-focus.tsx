"use client";

/*
 * CalendarCardFocus — visor de DETALLE 1-a-1 de las tarjetas mes del calendario (ola 2C,
 * feedback Lucy: "quiero ver cada tarjeta DE CERCA pasando de izquierda a derecha 1, 2, 3… 12").
 *
 * 2026-07-22 (ola 3 — Lucy: "detalle primero, espacio después"): el flujo se INVIERTE. Este
 * visor es ahora la vista INICIAL del modal del calendario ("Ver mi calendario" abre DE UNA el
 * detalle "Tarjeta 1 de 12"); ARRIBA queda la acción "Míralo en tu espacio" que lleva a la
 * galería (nevera/corcho), y desde la galería se vuelve al detalle con "Volver al detalle".
 * Esc baja UN nivel: acá (raíz) CIERRA el modal; en la galería regresa a este visor. Vive como
 * overlay DENTRO del modal de la galería, que pausa su useDialogA11y mientras este está activo.
 *
 * Decisiones:
 *  - UNA tarjeta grande ACOSTADA sobre la mesa, mirada desde ~62° (lenguaje visual del libro
 *    acostado): suficiente para leer el mes y los festivos impresos en la textura compuesta.
 *    Escala física 0.54 u/cm → la tarjeta de 7.5×10 cm mide 4.05×5.4 u (ancho del cm real,
 *    alto del aspecto del lienzo — misma regla que magnetWorldSizes).
 *  - SIN autoRotate: es una vista de LECTURA (el movimiento solo viene del usuario → amable con
 *    prefers-reduced-motion por construcción). Órbita manual acotada.
 *  - Texturas por VENTANA (tarjeta actual ±1) con dispose al salir de la ventana y al desmontar
 *    (useWindowTextures): recorrer las 12 no deja ~44MB de GPU vivos ni pasa por el caché
 *    global de drei useTexture. La malla es ExtrudedMagnetMesh con la textura base del loader
 *    (el clon por pieza se dispone solo).
 *  - a11y: role="dialog" con useDialogA11y (foco inicial + trap + Esc + retorno), navegación con
 *    ← → y botones grandes, posición anunciada con aria-live.
 *
 * CSP estricta: cero assets externos · client-only (WebGL) → se importa con dynamic ssr:false.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import type * as THREE from "three";
import { ChevronLeft, ChevronRight, Home, X } from "lucide-react";
import { useDialogA11y } from "./use-dialog-a11y";
import { useIsTouch } from "./use-is-touch";
import { useWindowTextures } from "./use-window-textures";
import { FitCameraPolar } from "./fit-camera-polar";
import { StudioEnvironment, StudioBackdrop } from "./studio-3d-environment";
import { ExtrudedMagnetMesh } from "./magnet-3d";
import type { Magnet3D } from "./fridge-3d-view";

/** Escala física del visor: 1 cm real → 0.54 u de mundo (la tarjeta 7.5×10 llena el encuadre). */
const U_PER_CM = 0.54;
/** Esquinas levemente redondas de la tarjeta impresa (2.5% del ancho ~2 mm reales). */
const CARD_CORNER_RATIO = 0.025;
/** Giro natural de la tarjeta sobre la mesa (como recién puesta, no en escuadra). */
const CARD_YAW = -0.14;

function Scene({ card, texture }: { card: Magnet3D; texture: THREE.Texture | null }) {
  // Ancho del cm real (o 7.5 por defecto), alto del aspecto del lienzo — regla magnetWorldSizes.
  const w = (card.wCm ?? 7.5) * U_PER_CM;
  const h = w * (card.hRatio / card.wRatio);
  return (
    <>
      <StudioEnvironment intensity={0.9} />
      <StudioBackdrop position={[0, -0.02, -5]} scale={[26, 14, 6]} />
      <hemisphereLight args={["#fff6ea", "#e0d6c6", 0.34]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[4, 6, 7]}
        intensity={1.05}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={6}
        shadow-camera-bottom={-5}
        shadow-camera-far={24}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-5, 3, 4]} intensity={0.28} />

      {/* La tarjeta acostada sobre la mesa (reverso papel sin imprimir al orbitar bajo). */}
      <group rotation={[0, CARD_YAW, 0]}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ExtrudedMagnetMesh
            texture={texture}
            width={w}
            height={h}
            shape="rectangle"
            depth={0.03}
            backColor="#F4EFE3"
            cornerRadiusRatio={CARD_CORNER_RATIO}
          />
        </group>
      </group>

      <ContactShadows
        frames={1}
        position={[0, 0.004, 0]}
        opacity={0.38}
        blur={2.4}
        scale={12}
        far={4}
      />
      {/* Lectura desde ~62° sobre la horizontal: la grilla del mes y los festivos se leen. */}
      <FitCameraPolar
        halfW={w / 2 + 0.15}
        halfH={1.55}
        polarDeg={62}
        margin={1.15}
        targetY={0.03}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        minPolarAngle={0.55}
        maxPolarAngle={Math.PI / 1.75}
        minDistance={3.5}
        maxDistance={40}
        target={[0, 0.03, 0]}
      />
    </>
  );
}

export default function CalendarCardFocus({
  cards,
  index,
  onIndexChange,
  onClose,
  onOpenGallery,
}: {
  /** Las tarjetas mes (texturas compuestas) en orden 1..12. */
  cards: Magnet3D[];
  /** Índice de la tarjeta enfocada (0-based). */
  index: number;
  onIndexChange: (next: number) => void;
  /** Cierra el modal completo (este visor es la vista raíz del flujo del calendario). */
  onClose: () => void;
  /** Sube UN nivel: cambia a la galería de escenas (nevera/corcho) dentro del mismo modal. */
  onOpenGallery: () => void;
}) {
  const isTouch = useIsTouch();
  const n = cards.length;
  const i = Math.min(Math.max(index, 0), Math.max(0, n - 1));
  const card = cards[i];

  // Texturas por ventana (tarjeta actual ±1, precarga los vecinos → siguiente/anterior sale al
  // instante) con dispose al salir de la ventana y al desmontar el visor. El hook es DOM-safe
  // (no usa hooks de R3F) → vive acá, no dentro del Canvas.
  const urls = useMemo(() => cards.map((c) => c.dataUrl), [cards]);
  const texture = useWindowTextures(urls, i, 1);

  // #15 — foco inicial + trap + Escape (cierra el modal: este visor es la raíz del flujo) +
  // retorno de foco al botón que abrió.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose });

  const go = useCallback(
    (delta: number) => {
      if (n === 0) return;
      onIndexChange((i + delta + n) % n);
    },
    [i, n, onIndexChange],
  );

  // Navegación por teclado ← → (el trap/Escape lo maneja useDialogA11y sobre el mismo nodo).
  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    };
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [go]);

  if (!card) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Tarjeta ${i + 1} de ${n} en detalle`}
      tabIndex={-1}
      className="bg-brand-purple-dark/90 absolute inset-0 z-10 flex flex-col outline-none"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-white sm:px-6">
        <span className="font-display text-lg font-bold" aria-live="polite">
          Tarjeta {i + 1} de {n}
        </span>
        <div className="flex items-center gap-2">
          {/* Ola 3 — "detalle primero, espacio después": desde el detalle se SUBE a la galería
            (nevera/corcho) dentro del mismo modal; allá hay "Volver al detalle" para regresar. */}
          <button
            type="button"
            onClick={onOpenGallery}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-bold text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
          >
            <Home className="h-4 w-4" aria-hidden />
            <span>Míralo en tu espacio</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1">
        <Canvas
          shadows
          dpr={isTouch ? [1, 1.5] : [1, 2]}
          camera={{ position: [0, 5, 5], fov: 40 }}
          gl={{ preserveDrawingBuffer: false, antialias: true }}
          style={{ width: "100%", height: "100%" }}
        >
          <color attach="background" args={["#F5EDE2"]} />
          <Suspense fallback={null}>
            <Scene card={card} texture={texture} />
          </Suspense>
        </Canvas>
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1.5 text-center text-xs text-white">
          {isTouch
            ? "Arrastra para girar · pellizca para acercar"
            : "← → para cambiar de tarjeta · arrastra para girar"}
        </p>
      </div>

      {/* Navegación mes anterior / siguiente (objetivos táctiles grandes). */}
      <div className="flex items-center justify-center gap-3 px-4 pt-1 pb-4">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Tarjeta anterior"
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white/15 px-5 text-sm font-bold text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
          <span>Anterior</span>
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Tarjeta siguiente"
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white/15 px-5 text-sm font-bold text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <span>Siguiente</span>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
