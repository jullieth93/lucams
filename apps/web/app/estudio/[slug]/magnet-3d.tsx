"use client";

/*
 * MagnetMesh — imán/ficha con CUERPO 3D real (pase de realismo Lucy 2026-07-22).
 *
 * Antes los imanes de las escenas 3D eran `planeGeometry` sin grosor: al girar la cámara se
 * delataba el truco. Ahora la pieza se EXTRUYE (`ExtrudeGeometry`, depth ~0.04 + bisel leve en
 * los cantos) desde la MISMA silueta física con la que `buildMagnetTextures` recorta la textura
 * (espejo de `buildShapePath`: rounded-rect r=8/512 del ancho, elipse, corazón bezier
 * normalizado), así el borde del modelo coincide píxel a píxel con el PNG troquelado.
 *
 * Materiales (2 grupos del ExtrudeGeometry):
 *  - material-0 = tapas (cara impresa con la textura del slot; UV = coords del shape →
 *    repeat 1/w,1/h + offset 0.5,0.5). Brillo PET sutil via envMapIntensity (hay env-map
 *    procedural de StudioEnvironment en todas las escenas).
 *  - material-1 = canto (el blanco del material base — PVC/acrílico — que se ve de perfil).
 *
 * `backColor` opcional tapa el reverso (los separadores se ven por detrás al orbitar: el dorso
 * es cartulina sin imprimir, no la foto espejada).
 *
 * `textureRegion` opcional mapea solo una REGIÓN normalizada de la textura (y desde ARRIBA,
 * como se lee una imagen) a la cara impresa, con flip vertical opcional — es la base del
 * separador doblado (cada cara muestra el diseño orientado para leerse de pie).
 *
 * La textura se CLONA por pieza (transform propio): la galería interna de preview monta varias
 * escenas a la vez con la misma dataURL y tamaños distintos — compartir la instancia de
 * `useTexture` haría que el repeat/offset de una escena rompiera el mapeo de la otra.
 *
 * 2026-07-22 (ola 2B): helpers PUROS exportados para las escenas proporcionales —
 *  - `parseSizeCm`: "6.5×6.5" | "7.5x10" | "6" → cm reales (misma gramática que size-comparator).
 *  - `magnetWorldSizes`: tamaños físicos de escena (unidades de mundo) por imán a partir de sus
 *    cm reales + la escala de la escena (u/cm), con ajuste global uniforme a la celda del layout
 *    (un 7.5×10 se ve NOTABLEMENTE más grande que un 4×4.2, sin desbordar la región).
 *  - `coverRegion`: región normalizada tipo background-size:cover (sin deformar la textura).
 *  - `foldedStripMetrics`: geometría del separador doblado (largo visible de cada cara + arco de
 *    la cresta) — usado por FoldedStripMesh y testeado aparte.
 *
 * 2026-07-22 (ola 2C — feedback Lucy con fotos):
 *  - `cornerRadiusRatio`: radio de esquina de la silueta rectangular como FRACCIÓN del ancho
 *    (default 8/512, el espejo histórico de buildShapePath). Las fichas de letras (foto SARA) y
 *    los separadores reales tienen esquinas REDONDAS (~10% del lado) — antes el extruido quedaba
 *    casi en punta (1.6%) y delataba la esquina transparente de la textura.
 *  - `ExtrudedMagnetMesh`: el núcleo geometría+materiales con la textura YA cargada (el clon por
 *    pieza con la transform de región vive acá). MagnetMesh queda como wrapper que carga el
 *    dataURL con useTexture; el visor de detalle del calendario le pasa texturas con lifecycle
 *    propio (ventana con dispose) sin tocar el caché global de drei.
 *
 * 2026-07-22 (ola 3 — feedback Lucy):
 *  - `MAGNET_DEPTH`/`TILE_DEPTH`: grosores del extruido exportados. Las FICHAS DE LETRAS bajan
 *    UN PUNTO (0.04 → 0.025, −37.5%) manteniendo bisel y sombra — "no planas".
 *  - `FoldedStripMesh` queda cableado a las 2 CARAS REALES del Estudio (cara A al frente, cara B
 *    atrás vía `backDataUrl`) y gana `backLean` para recostar la trasera larga sobre la mesa.
 */

import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

export type MagnetShape = "rectangle" | "circle" | "heart" | "custom";

// ──────────────────────────────────────────────────────────────────
//  Helpers puros (sin three en runtime → testeables en vitest node)
// ──────────────────────────────────────────────────────────────────

/**
 * Parsea "6.5×6.5", "7.5x10", "6" → { wCm, hCm }. Con un solo número asume cuadrado/diámetro.
 * Misma gramática que `parseSize` de lib/size-comparator.ts (duplicada acá porque ese módulo no
 * exporta el parser y los helpers 3D no deben acoplarse a copy de marketing).
 */
export function parseSizeCm(sizeCm: string | undefined): { wCm: number; hCm: number } | null {
  if (!sizeCm) return null;
  const m = sizeCm.match(/^(\d+(?:\.\d+)?)(?:\s*[×x]\s*(\d+(?:\.\d+)?))?$/i);
  if (!m) return null;
  const w = parseFloat(m[1]!);
  const h = m[2] ? parseFloat(m[2]) : w;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { wCm: w, hCm: h };
}

/**
 * Región normalizada de textura para la cara impresa de MagnetMesh. Coordenadas 0..1 con `y`
 * medido DESDE ARRIBA de la imagen (como se lee). `flipV` invierte el mapeo vertical (para la
 * cara trasera del separador doblado, que cuelga rotada 180° sobre el pliegue).
 */
export type TextureRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
  flipV?: boolean;
};

const FULL_REGION: TextureRegion = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Equivalente a background-size:cover en coordenadas de región: la mayor sub-región centrada de
 * la imagen (aspecto `srcAspect` = w/h) que llena una cara de aspecto `dstAspect` sin deformar.
 */
export function coverRegion(srcAspect: number, dstAspect: number): TextureRegion {
  if (srcAspect <= 0 || dstAspect <= 0) return FULL_REGION;
  if (Math.abs(srcAspect - dstAspect) < 1e-3) return FULL_REGION;
  if (srcAspect < dstAspect) {
    // La imagen es más angosta/alta que la cara → recorta banda vertical centrada.
    const h = srcAspect / dstAspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = dstAspect / srcAspect;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/** Tamaño físico por defecto cuando falta el dato de cm (imán cuadrado típico de la tienda). */
const DEFAULT_MAGNET_CM = 6.5;

/**
 * Tamaños físicos en unidades de mundo para una tira de imanes, dados sus cm reales y la escala
 * de la escena (`uPerCm` = unidades de mundo por centímetro, derivada del tamaño real del
 * escenario: nevera ~170 cm de alto, tablero ~45 cm de ancho).
 *
 * Reglas:
 *  - Por pieza manda `wCm/hCm` del propio Magnet3D; si falta, se usa `fallbackSizeCm` (sizeCm de
 *    la variante del producto); si ninguna fuente tiene cm para TODAS las piezas → null (el
 *    caller cae al layout viejo de ajuste-a-celda, p.ej. letras del nombre).
 *  - El ASPECTO físico lo manda wRatio/hRatio (el template): la textura nunca se deforma; los cm
 *    fijan la ESCALA (ancho), el alto se deriva del aspecto.
 *  - Ajuste global UNIFORME a la celda: un solo factor f ≤ 1 para todas las piezas, así un
 *    7.5×10 siempre se ve más grande que un 4×4.2 (verdad física), solo encogiendo todo si el
 *    más grande no cabe en su celda.
 */
export function magnetWorldSizes(
  items: readonly { wRatio: number; hRatio: number; wCm?: number; hCm?: number }[],
  uPerCm: number,
  opts: { cellW: number; cellH: number; gap: number; fallbackSizeCm?: string },
): { w: number; h: number }[] | null {
  const parsed = parseSizeCm(opts.fallbackSizeCm);
  const anyCm = items.some((m) => m.wCm ?? m.hCm ?? parsed);
  if (!anyCm) return null;
  const sizes = items.map((m) => {
    const aspect = m.hRatio / m.wRatio;
    const wCm = m.wCm ?? parsed?.wCm ?? (m.hCm ? m.hCm / aspect : DEFAULT_MAGNET_CM);
    const w = wCm * uPerCm;
    return { w, h: w * aspect };
  });
  const maxW = Math.max(...sizes.map((s) => s.w));
  const maxH = Math.max(...sizes.map((s) => s.h));
  if (!(maxW > 0) || !(maxH > 0)) return null; // cm inválidos (0/NaN) → ajuste-a-celda
  const f = Math.min(1, (opts.cellW - opts.gap) / maxW, (opts.cellH - opts.gap) / maxH);
  return sizes.map((s) => ({ w: s.w * f, h: s.h * f }));
}

/**
 * Métricas del separador magnético DOBLADO (tira impresa de stripW × stripL que se pliega sobre
 * un borde redondeado de radio `rFold`; las dos caras cierran por el imán).
 *
 *  - `foldAngle`: ángulo que GIRA el material en el pliegue = ángulo entre una cara y la otra
 *    medido por fuera (π = doblado plano sobre una hoja; ~2.16 sobre el lomo de un libro en
 *    carpa, donde cada cara se abre δ = (π − foldAngle)/2 de la vertical).
 *  - `delta`: esa apertura por cara — es lo que rota cada grupo de cara sobre X.
 *  - `crestArc`: arco de la cresta sobre el borde = foldAngle (la cresta abraza tangencialmente
 *    desde la cara frontal hasta la trasera: thetaStart = delta, thetaLength = foldAngle).
 *  - `hang`: largo visible de cada cara — la cresta COME tira: hang = (stripL − rFold·crestArc)/2.
 *
 * Marco local del componente: eje del pliegue = X, la cara frontal cuelga hacia −Y en el lado
 * +Z (rotada −delta sobre X), la trasera en el lado −Z (rotada π+delta).
 */
export function foldedStripMetrics(
  stripL: number,
  rFold: number,
  foldAngle: number,
): {
  delta: number;
  hang: number;
  /** Arco de la cresta (rad) = foldAngle, acotado a [0, π]. */
  crestArc: number;
} {
  const crestArc = Math.min(Math.PI, Math.max(0, foldAngle));
  const delta = (Math.PI - foldAngle) / 2;
  const hang = Math.max(0.05, (stripL - rFold * crestArc) / 2);
  return { delta, hang, crestArc };
}

// ──────────────────────────────────────────────────────────────────
//  MagnetMesh — pieza extruida con cara impresa
// ──────────────────────────────────────────────────────────────────

/** Radio de esquina histórico de la silueta rectangular: espejo del clip de la textura
 *  (roundRect r = min(8, w/12) px sobre texW=512 → 8/512 del ancho). */
const LEGACY_CORNER_RATIO = 8 / 512;

/** Grosor del cuerpo extruido de un IMÁN (sin contar el bisel). */
export const MAGNET_DEPTH = 0.04;
/** Grosor de las FICHAS DE LETRAS (tablero memo, ola 3 — Lucy: "bajar UN PUNTO, no planas"):
 *  37.5% más delgadas que el imán; el bisel y la sombra se mantienen → relieve, no plana. */
export const TILE_DEPTH = 0.025;

/** Silueta física centrada en el origen (unidades de mundo). Espejo exacto de buildShapePath. */
function buildSilhouette(
  shape: MagnetShape,
  w: number,
  h: number,
  radiusRatio = LEGACY_CORNER_RATIO,
): THREE.Shape {
  if (shape === "circle") {
    const s = new THREE.Shape();
    s.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
    return s;
  }
  if (shape === "heart") {
    // Mismo corazón bezier normalizado (0..1) de buildShapePath; canvas y-down → three y-up.
    const px = (n: number) => (n - 0.5) * w;
    const py = (n: number) => (0.5 - n) * h;
    const s = new THREE.Shape();
    s.moveTo(px(0.5), py(0.82));
    s.bezierCurveTo(px(0.28), py(0.68), px(0.06), py(0.52), px(0.06), py(0.32));
    s.bezierCurveTo(px(0.06), py(0.18), px(0.16), py(0.08), px(0.28), py(0.08));
    s.bezierCurveTo(px(0.38), py(0.08), px(0.44), py(0.12), px(0.5), py(0.22));
    s.bezierCurveTo(px(0.56), py(0.12), px(0.62), py(0.08), px(0.72), py(0.08));
    s.bezierCurveTo(px(0.84), py(0.08), px(0.94), py(0.18), px(0.94), py(0.32));
    s.bezierCurveTo(px(0.94), py(0.52), px(0.72), py(0.68), px(0.5), py(0.82));
    s.closePath();
    return s;
  }
  // rectangle/custom — radio = radiusRatio del ancho (default: el clip de la textura,
  // r = 8/512). Acotado a la mitad del lado corto para no degenerar la silueta.
  const r = Math.min(w * radiusRatio, Math.min(w, h) / 2);
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  s.closePath();
  return s;
}

/**
 * Núcleo geometría+materiales de la pieza extruida, con la textura YA cargada. La textura se
 * CLONA por pieza (transform propio de repeat/offset derivado de la región): la galería interna
 * de preview monta varias escenas a la vez con la misma textura base y tamaños distintos —
 * compartir la instancia haría que el repeat/offset de una escena rompiera el mapeo de la otra.
 * El clon se dispone al desmontar; la textura BASE pertenece al caller (caché de drei o un
 * loader con ventana) y NO se dispone acá.
 */
export function ExtrudedMagnetMesh({
  texture,
  width,
  height,
  shape = "rectangle",
  depth = MAGNET_DEPTH,
  edgeColor = "#F6F1E8",
  backColor,
  textureRegion,
  cornerRadiusRatio,
  position = [0, 0, 0],
}: {
  /** Textura base (null = cargando → cara en color papel). La propiedad queda en el caller. */
  texture: THREE.Texture | null;
  width: number;
  height: number;
  shape?: MagnetShape;
  /** Grosor del cuerpo (sin contar el bisel). Imanes MAGNET_DEPTH, fichas TILE_DEPTH. */
  depth?: number;
  /** Color del canto (material base blanco por defecto). */
  edgeColor?: string;
  /** Si se define, dibuja una tapa trasera lisa de este color (reverso sin imprimir). */
  backColor?: string;
  /** Región normalizada de la textura (y desde arriba) para la cara impresa. Default: completa. */
  textureRegion?: TextureRegion;
  /** Radio de esquina como fracción del ancho (default 8/512 — espejo de buildShapePath). */
  cornerRadiusRatio?: number;
  position?: [number, number, number];
}) {
  const { x: rx, y: ry, w: rw, h: rh, flipV } = textureRegion ?? FULL_REGION;
  // Clon por pieza: UV de la tapa = coords del shape → repeat/offset derivados de la región.
  //   sin flip:  v_img = (1 − ry − rh) + v·rh
  //   con flipV: v_img = (1 − ry) − v·rh                    (v = y/height + 0.5)
  // Deps en primitivas (no en el objeto región): el caller puede pasarla inline sin recrear la
  // textura en cada render.
  const tex = useMemo(() => {
    if (!texture) return null;
    const t = texture.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.repeat.set(rw / width, (flipV ? -rh : rh) / height);
    t.offset.set(rx + rw / 2, 1 - ry - rh / 2 + (flipV ? rh : 0));
    t.needsUpdate = true;
    return t;
  }, [texture, width, height, rx, ry, rw, rh, flipV]);
  useEffect(() => () => tex?.dispose(), [tex]);

  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildSilhouette(shape, width, height, cornerRadiusRatio), {
      depth,
      bevelEnabled: true,
      bevelThickness: depth * 0.2,
      bevelSize: 0.008,
      bevelSegments: 2,
      curveSegments: 28,
      steps: 1,
    });
    g.center(); // centra Z (X/Y ya vienen centrados) → cara frontal en +(depth/2 + bisel)
    return g;
  }, [shape, width, height, depth, cornerRadiusRatio]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const backGeo = useMemo(
    () =>
      backColor
        ? new THREE.ShapeGeometry(buildSilhouette(shape, width, height, cornerRadiusRatio), 28)
        : null,
    [backColor, shape, width, height, cornerRadiusRatio],
  );
  useEffect(() => () => backGeo?.dispose(), [backGeo]);

  const backZ = -(depth / 2 + depth * 0.2) - 0.0012;

  return (
    <group position={position}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          attach="material-0"
          map={tex}
          color={tex ? "#ffffff" : "#FDFBF4"}
          roughness={0.38}
          metalness={0}
          envMapIntensity={1.15}
        />
        <meshStandardMaterial
          attach="material-1"
          color={edgeColor}
          roughness={0.45}
          metalness={0}
          envMapIntensity={0.9}
        />
      </mesh>
      {backGeo && backColor ? (
        <mesh geometry={backGeo} position={[0, 0, backZ]} rotation={[0, Math.PI, 0]}>
          <meshStandardMaterial color={backColor} roughness={0.85} metalness={0} />
        </mesh>
      ) : null}
    </group>
  );
}

export function MagnetMesh({
  dataUrl,
  width,
  height,
  shape = "rectangle",
  depth = MAGNET_DEPTH,
  edgeColor = "#F6F1E8",
  backColor,
  textureRegion,
  cornerRadiusRatio,
  position = [0, 0, 0],
}: {
  dataUrl: string;
  width: number;
  height: number;
  shape?: MagnetShape;
  /** Grosor del cuerpo (sin contar el bisel). Imanes MAGNET_DEPTH, fichas TILE_DEPTH. */
  depth?: number;
  /** Color del canto (material base blanco por defecto). */
  edgeColor?: string;
  /** Si se define, dibuja una tapa trasera lisa de este color (reverso sin imprimir). */
  backColor?: string;
  /** Región normalizada de la textura (y desde arriba) para la cara impresa. Default: completa. */
  textureRegion?: TextureRegion;
  /** Radio de esquina como fracción del ancho (default 8/512 — espejo de buildShapePath). */
  cornerRadiusRatio?: number;
  position?: [number, number, number];
}) {
  const base = useTexture(dataUrl);
  return (
    <ExtrudedMagnetMesh
      texture={base}
      width={width}
      height={height}
      shape={shape}
      depth={depth}
      edgeColor={edgeColor}
      backColor={backColor}
      textureRegion={textureRegion}
      cornerRadiusRatio={cornerRadiusRatio}
      position={position}
    />
  );
}

// ──────────────────────────────────────────────────────────────────
//  FoldedStripMesh — separador magnético doblado sobre un borde
// ──────────────────────────────────────────────────────────────────

/** Grosor de la cartulina plastificada (~0.4 mm a la escala de las escenas, 0.3 u/cm). */
const CARD_THICK = 0.012;

/**
 * La tira impresa (stripW × stripL, unidades de mundo) doblada a la mitad sobre un borde: dos
 * caras con grosor de cartulina + cresta redondeada sobre el pliegue. Marco local: eje del
 * pliegue = X (la cresta corre a lo ancho de la tira); cara frontal cuelga hacia −Y del lado +Z
 * con el diseño mirando a +Z; la trasera cuelga del lado −Z con el diseño mirando a −Z.
 *
 * Caras impresas (ola 3 — 2 CARAS REALES del Estudio): la frontal lleva la cara A (`dataUrl`) y
 * la trasera la cara B (`backDataUrl`) — la convención slot par/impar la resuelve el caller
 * (book-view-3d vía bookmarkFaceUnits). Cada lienzo es UNA cara con su aspecto exacto, así la
 * cara 3D muestra el diseño COMPLETO, orientado para leerse de pie desde su lado, sin re-cortar
 * el encuadre del cliente (coverRegion = región completa cuando la geometría respeta el aspecto;
 * si no cuadra, recorte cover centrado sin deformar).
 *
 * `backLean` (ola 3): apertura EXTRA de la cara trasera para recostar su punta sobre la mesa
 * cuando la cara es larga y colgando libre la atravesaría (la calcula separatorPlacement).
 *
 * `foldAngle` = ángulo entre las dos caras: π = doblado plano (sobre una hoja); ~2.16 = sobre
 * el lomo de un libro en carpa (28° de apertura por cara). La cresta (medio cilindro hueco de
 * cartulina) solo se dibuja cuando el arco es visible (> ~2°).
 */
export function FoldedStripMesh({
  dataUrl,
  backDataUrl,
  wRatio,
  hRatio,
  stripW,
  stripL,
  foldAngle,
  rFold,
  cardColor = "#F1EBDD",
  cornerRadiusRatio,
  backLean = 0,
  position = [0, 0, 0],
}: {
  dataUrl: string;
  /** Diseño de la cara TRASERA (cara B de la unidad). Default: el mismo de la frontal. */
  backDataUrl?: string;
  /** Aspecto del lienzo del diseño (stage.width / stage.height) para el recorte cover. */
  wRatio: number;
  hRatio: number;
  /** Ancho de la tira (dimensión corta) en unidades de mundo. */
  stripW: number;
  /** Largo total de la tira desplegada (dimensión larga) en unidades de mundo. */
  stripL: number;
  /** Ángulo entre caras (rad). π = plano; π − 2·0.49 ≈ 2.16 = carpa de libro. */
  foldAngle: number;
  /** Radio del pliegue (grosor del borde abrazado + holgura de la cartulina). */
  rFold: number;
  cardColor?: string;
  /** Radio de esquina de las caras como fracción del ancho (esquinas redondas del separador). */
  cornerRadiusRatio?: number;
  /** Apertura extra de la cara trasera (rad) para recostarla sobre la mesa. Default 0. */
  backLean?: number;
  position?: [number, number, number];
}) {
  const { delta, hang, crestArc } = foldedStripMetrics(stripL, rFold, foldAngle);
  const region = coverRegion(wRatio / hRatio, stripW / hang);

  return (
    <group position={position}>
      {/* Cara frontal: cuelga hacia −Y del lado +Z, diseño mirando a +Z (de pie). */}
      <group rotation={[-delta, 0, 0]}>
        <MagnetMesh
          dataUrl={dataUrl}
          width={stripW}
          height={hang}
          depth={CARD_THICK}
          edgeColor={cardColor}
          backColor={cardColor}
          textureRegion={region}
          cornerRadiusRatio={cornerRadiusRatio}
          position={[0, -hang / 2, rFold]}
        />
      </group>
      {/* Cara trasera: rotada π sobre el pliegue (cuelga del lado −Z, diseño a −Z, de pie al
          mirarla desde atrás: flipV compensa la rotación). backDataUrl = cara B REAL de la
          unidad (ola 3); backLean la recuesta sobre la mesa cuando es larga. */}
      <group rotation={[Math.PI + delta + backLean, 0, 0]}>
        <MagnetMesh
          dataUrl={backDataUrl ?? dataUrl}
          width={stripW}
          height={hang}
          depth={CARD_THICK}
          edgeColor={cardColor}
          backColor={cardColor}
          textureRegion={{ ...region, flipV: true }}
          cornerRadiusRatio={cornerRadiusRatio}
          position={[0, hang / 2, rFold]}
        />
      </group>
      {/* Cresta del pliegue: tubo parcial de cartulina abrazando el borde, tangente a ambas
          caras (thetaStart = delta sobre el eje del pliegue, arco = crestArc; sin tapas). */}
      {crestArc > 0.03 ? (
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0]}>
          <cylinderGeometry args={[rFold, rFold, stripW, 20, 1, true, delta, crestArc]} />
          <meshStandardMaterial
            color={cardColor}
            roughness={0.85}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
    </group>
  );
}
