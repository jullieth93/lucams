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
 *  - SIN autoRotate: es una vista de LECTURA (el movimiento solo viene del usuario). Órbita
 *    manual acotada.
 *  - frameloop="demand": nada se anima solo, así que pintar a 60 fps continuos quemaba GPU y
 *    batería mientras el cliente simplemente LEE el mes. Con "demand" el lienzo pinta al montar
 *    y solo cuando algo cambia: OrbitControls llama invalidate() en su evento "change" (drag,
 *    zoom, inercia), FitCameraPolar invalida al reencuadrar y <InvalidateOnChange> cubre la
 *    llegada ASÍNCRONA de la textura (useWindowTextures) al pasar de tarjeta.
 *  - prefers-reduced-motion: se apaga el damping de OrbitControls — la inercia sigue moviendo la
 *    escena DESPUÉS de soltar, que es justo el movimiento post-interacción que WCAG 2.3.3 pide
 *    evitar. Con la preferencia activa la tarjeta se detiene donde la sueltas.
 *  - Texturas por VENTANA (tarjeta actual ±1) con dispose al salir de la ventana y al desmontar
 *    (useWindowTextures): recorrer las 12 no deja ~44MB de GPU vivos ni pasa por el caché
 *    global de drei useTexture. La malla es ExtrudedMagnetMesh con la textura base del loader
 *    (el clon por pieza se dispone solo).
 *  - a11y: role="dialog" con useDialogA11y (foco inicial + trap + Esc + retorno), navegación con
 *    ← → y botones grandes, posición anunciada con aria-live.
 *
 * 2026-10-23 (decisión owner) — pager de DOS NIVELES con calendario multi-set (hasta 4 sets):
 * las tarjetas llegan aplanadas por set (set 0 = tarjetas 1..12, set 1 = 13..24…) con
 * `cardsPerSet` y `cardLabels` (meses, los mismos labels de los slots del editor). El nivel
 * TARJETA (Anterior/Siguiente + ← →) recorre SOLO las tarjetas del set actual con wrap-around
 * DENTRO del set (no cruza al siguiente), el nivel SET son chips «Set N de M» que saltan a la
 * tarjeta 1 del set elegido, y el indicador aria-live anuncia mes + set («Enero — Set 1 de 3»).
 * Con 1 solo set (sin `cardsPerSet` o setCount = 1) el comportamiento es el histórico: recorrido
 * lineal por todas las tarjetas y título «Tarjeta N de M», sin UI de set. Mismo idioma de
 * navegación del pager por set del 3D de lettersets (letter-set-editor, misma fecha).
 *
 * CSP estricta: cero assets externos · client-only (WebGL) → se importa con dynamic ssr:false.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import type * as THREE from "three";
import { ChevronLeft, ChevronRight, Home, X } from "lucide-react";
import { useDialogA11y } from "./use-dialog-a11y";
import { CLOSE_X_CLASS } from "@/components/ui/close-x-button";
import { useIsTouch } from "./use-is-touch";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { useWindowTextures } from "./use-window-textures";
import { FitCameraPolar } from "./fit-camera-polar";
import { StudioEnvironment, StudioBackdrop } from "./studio-3d-environment";
import {
  ExtrudedMagnetMesh,
  realWorldDepth,
  CALENDAR_CARD_THICKNESS_CM,
  MAGNET_BACK_COLOR,
} from "./magnet-3d";
import type { Magnet3D } from "./fridge-3d-view";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

/** Escala física del visor: 1 cm real → 0.54 u de mundo (la tarjeta 7.5×10 llena el encuadre). */
const U_PER_CM = 0.54;
/** Esquinas levemente redondas de la tarjeta impresa (2.5% del ancho ~2 mm reales). */
const CARD_CORNER_RATIO = 0.025;
/** Giro natural de la tarjeta sobre la mesa (como recién puesta, no en escuadra). */
const CARD_YAW = -0.14;

/**
 * Pide UN frame cada vez que `token` cambia. Con frameloop="demand" el lienzo no repinta solo:
 * la textura de la tarjeta llega asíncrona (useWindowTextures) y sin este disparo pasar de mes
 * dejaba la tarjeta anterior —o el papel en blanco— congelada en pantalla.
 */
function InvalidateOnChange({ token }: { token: unknown }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
  }, [invalidate, token]);
  return null;
}

function Scene({
  card,
  texture,
  reduced,
  magnet,
}: {
  card: Magnet3D;
  texture: THREE.Texture | null;
  reduced: boolean;
  /** 2026-10-29 (owner) — variante CON IMÁN: reverso negro de goma ferrita. */
  magnet?: boolean;
}) {
  // Ancho del cm real (o 7.5 por defecto), alto del aspecto del lienzo — regla magnetWorldSizes.
  const w = (card.wCm ?? 7.5) * U_PER_CM;
  const h = w * (card.hRatio / card.wRatio);
  return (
    <>
      {/* Calibración 2026-10-05 (cara impresa = foto original): la tarjeta mira a +Y (acostada)
        → irradiancia ≈ 1.0: key 0.75·cos(≈53°) ≈ 0.45 + hemi 0.28 + ambient 0.22 + fill ≈ 0.12
        → ≈ 1.07 (antes key 1.05 + hemi 0.34 → ≈ 1.31 directo, sobre-expuesta). */}
      <StudioEnvironment intensity={0.9} />
      <StudioBackdrop position={[0, -0.02, -5]} scale={[26, 14, 6]} />
      <hemisphereLight args={["#fff6ea", "#e0d6c6", 0.28]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[4, 6, 7]}
        intensity={0.75}
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

      {/* La tarjeta acostada sobre la mesa (reverso papel sin imprimir al orbitar bajo).
          Grosor 2026-10-12: se ALINEA al sistema de grosor físico (Fase 2.11) — cartulina
          de calendario CALENDAR_CARD_THICKNESS_CM (0.04 cm) × U_PER_CM = 0.0216 u; antes una
          constante de mundo fija 0.03 u que divergía de las escenas nevera/mural. */}
      <group rotation={[0, CARD_YAW, 0]}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ExtrudedMagnetMesh
            texture={texture}
            width={w}
            height={h}
            shape="rectangle"
            depth={realWorldDepth(U_PER_CM, CALENDAR_CARD_THICKNESS_CM)}
            // 2026-10-29 (owner): con imán el reverso es el negro de la goma
            // ferrita; sin imán conserva el papel crema de siempre.
            backColor={magnet ? MAGNET_BACK_COLOR : "#F4EFE3"}
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
        // Sin damping la escena se detiene al soltar (WCAG 2.3.3): la inercia es movimiento que
        // sigue después de la interacción. También evita la cadena change→invalidate→frame que
        // el amortiguado mantiene viva unos segundos tras cada arrastre.
        enableDamping={!reduced}
        minPolarAngle={0.55}
        maxPolarAngle={Math.PI / 1.75}
        // Se conserva 3.5 (revisión zoom 2026-10-05): la tarjeta (~5.4 u de
        // alto, escala 0.54 u/cm) ya desborda el alto de pantalla a esa
        // distancia — sobra para leer la grilla del mes.
        minDistance={3.5}
        maxDistance={40}
        target={[0, 0.03, 0]}
      />
      {/* Último en el árbol: su effect corre DESPUÉS del reencuadre de FitCameraPolar. */}
      <InvalidateOnChange token={texture} />
    </>
  );
}

export default function CalendarCardFocus({
  cards,
  index,
  onIndexChange,
  onClose,
  onOpenGallery,
  cardsPerSet,
  cardLabels,
  magnet,
}: {
  /** Las tarjetas mes (texturas compuestas) en orden 1..12, aplanadas por set si hay N sets. */
  cards: Magnet3D[];
  /** Índice de la tarjeta enfocada (0-based, global sobre todos los sets). */
  index: number;
  onIndexChange: (next: number) => void;
  /** Cierra el modal completo (este visor es la vista raíz del flujo del calendario). */
  onClose: () => void;
  /** Sube UN nivel: cambia a la galería de escenas (nevera/corcho) dentro del mismo modal.
   *  undefined (Fase 1A — variante SIN IMÁN): no hay escenas que asuman imán → el botón
   *  «Míralo en tu espacio» no se renderiza. */
  onOpenGallery?: () => void;
  /** 2026-10-23 — tarjetas POR SET (12 en el calendario; la fuente real es
   *  canvasData.unitSlots). Con N > 1 sets activa el pager de dos niveles
   *  (recorrido por tarjeta DENTRO del set + chips de salto por set). undefined/≥ n
   *  = un solo set (comportamiento histórico). */
  cardsPerSet?: number;
  /** Labels por tarjeta (meses «Enero»…«Diciembre», repetidos por set — los mismos
   *  de los slots del editor). Alimentan el indicador «Enero — Set 1 de 3». */
  cardLabels?: readonly string[];
  /** 2026-10-29 (owner) — variante CON IMÁN: el reverso de la tarjeta se pinta
   *  del negro de la goma ferrita (MAGNET_BACK_COLOR); sin imán, papel crema. */
  magnet?: boolean;
}) {
  const isTouch = useIsTouch();
  const reduced = usePrefersReducedMotion();
  const texts = useStudioTexts();
  const n = cards.length;
  const i = Math.min(Math.max(index, 0), Math.max(0, n - 1));
  const card = cards[i];

  // Pager de dos niveles (2026-10-23): el set de la tarjeta actual y cuántos sets hay.
  // perSet queda acotado a n (un cardsPerSet mayor que el total = un solo set).
  const perSet =
    cardsPerSet && cardsPerSet > 0 ? Math.min(cardsPerSet, Math.max(1, n)) : Math.max(1, n);
  const setCount = Math.max(1, Math.ceil(n / perSet));
  const activeSet = Math.min(Math.floor(i / perSet), setCount - 1);
  // Indicador aria-live: con 1 set el histórico «Tarjeta N de M»; con N sets, mes + set
  // («Enero — Set 1 de 3» — el «Set N de M» es el MISMO texto CMS del pager de sets del
  // editor, unidades.unidadDe + nombreSet; sin label de tarjeta queda solo el set).
  const setLabel = fillStudioText(texts.unidades.unidadDe, {
    nombre: texts.unidades.nombreSet,
    n: activeSet + 1,
    total: setCount,
  });
  const cardLabel = cardLabels?.[i];
  const title =
    setCount > 1
      ? cardLabel
        ? `${cardLabel} — ${setLabel}`
        : setLabel
      : fillStudioText(texts.escenas.calTitulo, { n: i + 1, total: n });

  // Texturas por ventana (tarjeta actual ±1, precarga los vecinos → siguiente/anterior sale al
  // instante) con dispose al salir de la ventana y al desmontar el visor. El hook es DOM-safe
  // (no usa hooks de R3F) → vive acá, no dentro del Canvas.
  const urls = useMemo(() => cards.map((c) => c.dataUrl), [cards]);
  const texture = useWindowTextures(urls, i, 1);

  // #15 — foco inicial + trap + Escape (cierra el modal: este visor es la raíz del flujo) +
  // retorno de foco al botón que abrió.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose });

  // Nivel TARJETA (2026-10-23): wrap-around DENTRO del set actual — Anterior/Siguiente
  // nunca cruza al set vecino (para eso están los chips de set). Con 1 set perSet = n y
  // el comportamiento es el lineal histórico.
  const go = useCallback(
    (delta: number) => {
      if (n === 0) return;
      const within = ((((i % perSet) + delta) % perSet) + perSet) % perSet;
      onIndexChange(activeSet * perSet + within);
    },
    [i, n, perSet, activeSet, onIndexChange],
  );
  // Nivel SET: salto directo a la tarjeta 1 del set elegido (chips «Set N de M»).
  const goToSet = useCallback(
    (set: number) => {
      onIndexChange(Math.min(set, setCount - 1) * perSet);
    },
    [setCount, perSet, onIndexChange],
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
      aria-label={fillStudioText(texts.lienzo.tarjetaDetalleAria, { n: i + 1, total: n })}
      tabIndex={-1}
      className="bg-brand-purple-dark/90 absolute inset-0 z-10 flex flex-col outline-none"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-white sm:px-6">
        <span className="font-display text-lg font-bold" aria-live="polite">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {/* Ola 3 — "detalle primero, espacio después": desde el detalle se SUBE a la galería
            (nevera/corcho) dentro del mismo modal; allá hay "Volver al detalle" para regresar.
            Fase 1A — sin onOpenGallery (variante SIN IMÁN) el botón no aplica: no hay escenas. */}
          {onOpenGallery && (
            <button
              type="button"
              onClick={onOpenGallery}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-bold text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
            >
              <Home className="h-4 w-4" aria-hidden />
              <span>{texts.escenas.calBtnEspacio}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={texts.comun.cerrar}
            className={CLOSE_X_CLASS + " h-10 w-10"}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1">
        <Canvas
          shadows
          // Vista de LECTURA sin animación propia → se pinta bajo demanda, no a 60 fps continuos.
          frameloop="demand"
          // dpr hasta 2 también en táctil (2026-10-05): el cap 1.5 se veía
          // borroso en retina móvil al leer la grilla del mes de cerca.
          // Trade-off rendimiento: ×1.78 más píxeles/frame — mitigado por
          // frameloop="demand" (solo repinta al orbitar o cambiar de mes).
          dpr={[1, 2]}
          camera={{ position: [0, 5, 5], fov: 40 }}
          gl={{ preserveDrawingBuffer: false, antialias: true }}
          style={{ width: "100%", height: "100%" }}
        >
          <color attach="background" args={["#F5EDE2"]} />
          <Suspense fallback={null}>
            <Scene card={card} texture={texture} reduced={reduced} magnet={magnet} />
          </Suspense>
        </Canvas>
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1.5 text-center text-xs text-white">
          {isTouch ? texts.escenas.calHintTouch : texts.escenas.calHintMouse}
        </p>
      </div>

      {/* Nivel SET del pager de dos niveles (2026-10-23): chips «Set N de M» que saltan a
          la tarjeta 1 del set elegido. Mismo idioma de chips del pager de sets del editor
          (unidades.unidadDe + nombreSet), solo cuando hay más de un set. */}
      {setCount > 1 && (
        <nav
          aria-label={texts.unidades.pagerAria}
          className="flex flex-wrap items-center justify-center gap-2 px-4 pt-1"
        >
          {Array.from({ length: setCount }, (_, s) => (
            <button
              key={s}
              type="button"
              onClick={() => goToSet(s)}
              aria-pressed={s === activeSet}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-bold transition-colors focus:ring-2 focus:ring-white focus:outline-none ${
                s === activeSet
                  ? "text-brand-purple-dark bg-white"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              {fillStudioText(texts.unidades.unidadDe, {
                nombre: texts.unidades.nombreSet,
                n: s + 1,
                total: setCount,
              })}
            </button>
          ))}
        </nav>
      )}

      {/* Navegación mes anterior / siguiente (objetivos táctiles grandes). */}
      <div className="flex items-center justify-center gap-3 px-4 pt-1 pb-4">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={texts.lienzo.tarjetaAnteriorAria}
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white/15 px-5 text-sm font-bold text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
          <span>{texts.comun.anterior}</span>
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={texts.lienzo.tarjetaSiguienteAria}
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white/15 px-5 text-sm font-bold text-white transition-colors hover:bg-white/25 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <span>{texts.comun.siguiente}</span>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
