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
 *    cm reales + la escala de la escena (u/cm). TAMAÑO REAL SIEMPRE (decisión de producto
 *    2026-09-15): la pieza NUNCA se encoge — con más unidades la disposición crece y la cámara
 *    reencuadra (un 7.5×10 se ve NOTABLEMENTE más grande que un 4×4.2, en cualquier cantidad).
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
 *
 * 2026-07-23 (ola 4 — feedback Lucy):
 *  - BUG cara B NEGRA en el separador: el offset UV con `flipV` sumaba +rh de más → la cara
 *    trasera muestreaba FUERA de rango (v ≥ 1) y, con ClampToEdgeWrapping, estiraba la fila del
 *    borde superior del lienzo (transparente (0,0,0,0) → negro). Fix en `textureRegionTransform`
 *    (puro, testeado): el offset no cambia con flips y el muestreo queda siempre en la región.
 *  - La cara B además se veía ESPEJADA desde atrás (la cara gira ~π sobre X): `flipU` nuevo —
 *    flipV+flipU = rotación de 180° de la textura → el diseño B se lee derecho, de pie.
 *  - `TILE_DEPTH` baja OTRO punto (0.025 → 0.015): "siguen muy gruesas", sin llegar a planas.
 *
 * 2026-09-22 (reverso imán + cara B plana espejada):
 *  - REVERSO NEGRO: la cara contraria al diseño de los separadores doblados es el negro de la
 *    goma ferrita (MAGNET_BACK_COLOR), no el cartón crema — decisión del cliente.
 *  - FIX cara B ESPEJADA en el path plano (Alargados): la textura trasera se clonaba con
 *    flipU Y el mesh se rotaba π sobre Y → doble espejo. La rotación π YA espeja una vez, así
 *    el clon usa los flips de la región, sin forzar flipU. Además se eliminó el mesh BackSide
 *    extra (ola 18) que pintaba la cara B en la posición FRONTAL.
 *  - `backOptional` en FoldedStripMesh: sin cara B, la trasera se muestra NEGRA (no duplica A).
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
 * medido DESDE ARRIBA de la imagen (como se lee). `flipV` invierte el mapeo vertical y `flipU`
 * el horizontal (la cara trasera del separador doblado cuelga rotada ~180° sobre el pliegue:
 * flipV+flipU = rotación de 180° de la textura → el diseño B se lee DERECHO desde atrás, no
 * espejado ni cabeza abajo).
 */
export type TextureRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
  flipV?: boolean;
  flipU?: boolean;
};

const FULL_REGION: TextureRegion = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Transform de la textura clonada (repeat/offset) para mapear `region` sobre la tapa del
 * extruido. Los UV de la tapa del ExtrudeGeometry son las coordenadas CRUDAS del shape
 * (x ∈ [−w/2, w/2], y ∈ [−h/2, h/2]), así: u_img = x·repeat.x + offset.x, v_img = y·repeat.y +
 * offset.y. Con v medido desde ABAJO en three y `ry` desde ARRIBA en la imagen:
 *   sin flip:  u_img = rx + rw/2 + x·rw/w,   v_img = (1 − ry − rh) + (y/h + 0.5)·rh
 *   con flipU/flipV se niega el repeat correspondiente y el offset NO cambia — el muestreo
 *   queda SIEMPRE dentro de la región ([rx, rx+rw] × [1−ry−rh, 1−ry] ⊆ [0,1]²).
 * (Ola 4 — bug de la cara B NEGRA: el offset viejo sumaba +rh con flipV → v ≥ 1 fuera de rango;
 *  con ClampToEdgeWrapping toda la cara muestreaba la fila del borde superior del lienzo —
 *  transparente (0,0,0,0 → negro) u oscura — estirada.)
 */
export function textureRegionTransform(
  region: TextureRegion,
  width: number,
  height: number,
): { repeat: [number, number]; offset: [number, number] } {
  const { x: rx, y: ry, w: rw, h: rh, flipV, flipU } = region;
  return {
    repeat: [(flipU ? -rw : rw) / width, (flipV ? -rh : rh) / height],
    offset: [rx + rw / 2, 1 - ry - rh / 2],
  };
}

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
 *  - TAMAÑO REAL SIEMPRE (2026-09-15): ya NO hay ajuste a la celda — la pieza conserva su tamaño
 *    físico en cualquier cantidad (un 7.5×10 siempre se ve más grande que un 4×4.2). Cuando el
 *    clúster no cabe en la región, el CALLER redistribuye (más filas/columnas) y la cámara
 *    reencuadra el conjunto; encoger las piezas está prohibido.
 */
export function magnetWorldSizes(
  items: readonly { wRatio: number; hRatio: number; wCm?: number; hCm?: number }[],
  uPerCm: number,
  opts: { fallbackSizeCm?: string } = {},
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
  return sizes;
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
/** Grosor de las FICHAS DE LETRAS (tablero memo). Ola 3 (2026-07-22): "bajar UN PUNTO, no
 *  planas" (0.04 → 0.025, −37.5%). Ola 4 (2026-07-23 — Lucy: "siguen muy gruesas"): OTRO
 *  punto (0.025 → 0.015, −40% más; 62.5% bajo el imán) con bisel y sombra intactos → relieve
 *  fino, no plana. El z del tablero deriva de este depth (totalThickness) → no se hunden. */
export const TILE_DEPTH = 0.015;

/** Negro del IMÁN (goma ferrita sin laminar): el reverso de los separadores magnéticos — la
 *  cara contraria al diseño — y el reverso completo cuando la cara B es opcional y falta
 *  (backOptional). NO es el cartón crema histórico (#F1EBDD): decisión del cliente 2026-09-22. */
export const MAGNET_BACK_COLOR = "#1A1A1A";

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
  backTexture,
  textureRegion,
  cornerRadiusRatio,
  blankColor = "#FDFBF4",
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
  /** Ola 17 — textura de la cara TRASERA real (cara B del Estudio). Manda sobre backColor:
   *  la tapa trasera se dibuja con SU diseño (flipU para leerse derecho desde atrás). */
  backTexture?: THREE.Texture | null;
  /** Región normalizada de la textura (y desde arriba) para la cara impresa. Default: completa. */
  textureRegion?: TextureRegion;
  /** Radio de esquina como fracción del ancho (default 8/512 — espejo de buildShapePath). */
  cornerRadiusRatio?: number;
  /** Color de la tapa frontal cuando NO hay textura (cargando → papel; reverso de imán sin
   *  imprimir → MAGNET_BACK_COLOR). */
  blankColor?: string;
  position?: [number, number, number];
}) {
  const { x: rx, y: ry, w: rw, h: rh, flipV, flipU } = textureRegion ?? FULL_REGION;
  // Clon por pieza: UV de la tapa = coords del shape → repeat/offset derivados de la región
  // (textureRegionTransform, puro y testeado: el muestreo queda siempre dentro de la región,
  // también con flips — ola 4, bug de la cara B negra).
  // Deps en primitivas (no en el objeto región): el caller puede pasarla inline sin recrear la
  // textura en cada render.
  const tex = useMemo(() => {
    if (!texture) return null;
    const t = texture.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    const { repeat, offset } = textureRegionTransform(
      { x: rx, y: ry, w: rw, h: rh, flipV, flipU },
      width,
      height,
    );
    t.repeat.set(repeat[0], repeat[1]);
    t.offset.set(offset[0], offset[1]);
    t.needsUpdate = true;
    return t;
  }, [texture, width, height, rx, ry, rw, rh, flipV, flipU]);
  useEffect(() => () => tex?.dispose(), [tex]);

  // Ola 18 — el extruido usa SOLO material-1 (canto) en todas sus caras. Las tapas se
  // dibujan por separado con ShapeGeometry, así la tapa trasera puede llevar la textura
  // de la cara B sin que la tapa trasera del extruido (que antes compartía material-0
  // con la frontal) la tape mostrando la misma foto.
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
    g.center(); // centra Z (X/Y ya vienen centrados) → canto alrededor de z=0
    // Forzar material-1 (canto) en TODAS las caras: las tapas del extruido quedan del
    // color del canto y son reemplazadas visualmente por las ShapeGeometry front/back.
    g.clearGroups();
    g.addGroup(0, Infinity, 1);
    return g;
  }, [shape, width, height, depth, cornerRadiusRatio]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const faceGeo = useMemo(
    () => new THREE.ShapeGeometry(buildSilhouette(shape, width, height, cornerRadiusRatio), 28),
    [shape, width, height, cornerRadiusRatio],
  );
  useEffect(() => () => faceGeo.dispose(), [faceGeo]);

  const backGeo = useMemo(
    () =>
      backColor || backTexture
        ? new THREE.ShapeGeometry(buildSilhouette(shape, width, height, cornerRadiusRatio), 28)
        : null,
    [backColor, backTexture, shape, width, height, cornerRadiusRatio],
  );
  useEffect(() => () => backGeo?.dispose(), [backGeo]);

  // Textura clonada para la cara TRASERA real (cara B): MISMA región y flips que la frontal.
  // La tapa trasera es una ShapeGeometry rotada π sobre Y, y esa rotación YA espeja la textura
  // una vez (al verla desde atrás se lee derecha). Forzar flipU acá (ola 17/18) la espejaba
  // por SEGUNDA vez → la cara B se veía en espejo en el path plano (Alargados). 2026-09-22.
  const backTex = useMemo(() => {
    if (!backTexture) return null;
    const t = backTexture.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    const { repeat, offset } = textureRegionTransform(
      { x: rx, y: ry, w: rw, h: rh, flipV, flipU },
      width,
      height,
    );
    t.repeat.set(repeat[0], repeat[1]);
    t.offset.set(offset[0], offset[1]);
    t.needsUpdate = true;
    return t;
  }, [backTexture, width, height, rx, ry, rw, rh, flipV, flipU]);
  useEffect(() => () => backTex?.dispose(), [backTex]);

  const frontZ = depth / 2 + depth * 0.2 + 0.0012;
  const backZ = -(depth / 2 + depth * 0.2) - 0.0012;

  return (
    <group position={position}>
      {/* Canto extruido (sin tapas) — material base blanco del imán. */}
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={edgeColor}
          roughness={0.45}
          metalness={0}
          envMapIntensity={0.9}
        />
      </mesh>
      {/* Tapa frontal con la cara A del Estudio. */}
      <mesh geometry={faceGeo} position={[0, 0, frontZ]} castShadow receiveShadow>
        <meshStandardMaterial
          map={tex}
          color={tex ? "#ffffff" : blankColor}
          roughness={0.38}
          metalness={0}
          envMapIntensity={1.15}
        />
      </mesh>
      {/* Tapa trasera REAL en su posición física (backZ): la rotación π sobre Y deja la cara B
          leyéndose derecha desde atrás (sin flip extra en la textura — eso la espejaba dos
          veces). El mesh BackSide extra de la ola 18 (cara B en la posición FRONTAL) se
          eliminó 2026-09-22: pintaba el reverso flotando sobre la cara A. */}
      {backGeo && backTexture ? (
        <mesh geometry={backGeo} position={[0, 0, backZ]} rotation={[0, Math.PI, 0]} castShadow>
          <meshStandardMaterial
            map={backTex}
            color={backTex ? "#ffffff" : "#FDFBF4"}
            roughness={0.5}
            metalness={0}
            envMapIntensity={1.0}
          />
        </mesh>
      ) : backGeo && backColor ? (
        <mesh geometry={backGeo} position={[0, 0, backZ]} rotation={[0, Math.PI, 0]} castShadow>
          <meshStandardMaterial color={backColor} roughness={0.85} metalness={0} />
        </mesh>
      ) : null}
    </group>
  );
}

export function MagnetMesh({
  dataUrl,
  backDataUrl,
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
  /** Ola 17 — diseño de la cara TRASERA real (cara B). Default: la misma de la frontal. */
  backDataUrl?: string;
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
  // Sin cara B explícita se reuso la frontal (mismo URL → mismo caché de drei, sin doble fetch).
  const back = useTexture(backDataUrl ?? dataUrl);
  return (
    <ExtrudedMagnetMesh
      texture={base}
      width={width}
      height={height}
      shape={shape}
      depth={depth}
      edgeColor={edgeColor}
      backColor={backColor}
      backTexture={backDataUrl ? back : null}
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
 *
 * 2026-09-22 (reverso NEGRO imán): la cara contraria al diseño (la tapa trasera de cada cara)
 * es el negro de la goma ferrita (MAGNET_BACK_COLOR), no el cartón crema — decisión del cliente.
 * Con `backOptional` y cara B faltante, la TRASERA completa se muestra negra (reverso sin
 * imprimir) en vez de duplicar la cara A.
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
  backOptional = false,
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
  /** Cara B OPCIONAL: si falta `backDataUrl`, la trasera se muestra NEGRA (reverso del imán
   *  sin imprimir) en vez de duplicar la cara A. Default false (duplica A, histórico). */
  backOptional?: boolean;
  position?: [number, number, number];
}) {
  const { delta, hang, crestArc } = foldedStripMetrics(stripL, rFold, foldAngle);
  const region = coverRegion(wRatio / hRatio, stripW / hang);
  const blankBack = backOptional && !backDataUrl;

  return (
    <group position={position}>
      {/* Cara frontal: cuelga hacia −Y del lado +Z, diseño mirando a +Z (de pie). La tapa
          trasera de CADA cara es el negro del imán (la cara contraria al diseño). */}
      <group rotation={[-delta, 0, 0]}>
        <MagnetMesh
          dataUrl={dataUrl}
          width={stripW}
          height={hang}
          depth={CARD_THICK}
          edgeColor={cardColor}
          backColor={MAGNET_BACK_COLOR}
          textureRegion={region}
          cornerRadiusRatio={cornerRadiusRatio}
          position={[0, -hang / 2, rFold]}
        />
      </group>
      {/* Cara trasera: rotada ~π sobre el pliegue (cuelga del lado −Z, diseño a −Z). flipV +
          flipU = rotación de 180° de la textura: compensa EXACTO la rotación del mesh sobre X,
          así el diseño B se lee DERECHO (de pie, no espejado) al mirarla desde atrás.
          backDataUrl = cara B REAL de la unidad (ola 3); backLean la recuesta sobre la mesa
          cuando es larga. Con backOptional y sin cara B: pieza NEGRA completa (reverso del
          imán sin imprimir) en vez de duplicar la cara A. */}
      <group rotation={[Math.PI + delta + backLean, 0, 0]}>
        {blankBack ? (
          <ExtrudedMagnetMesh
            texture={null}
            width={stripW}
            height={hang}
            depth={CARD_THICK}
            edgeColor={MAGNET_BACK_COLOR}
            blankColor={MAGNET_BACK_COLOR}
            backColor={MAGNET_BACK_COLOR}
            cornerRadiusRatio={cornerRadiusRatio}
            position={[0, hang / 2, rFold]}
          />
        ) : (
          <MagnetMesh
            dataUrl={backDataUrl ?? dataUrl}
            width={stripW}
            height={hang}
            depth={CARD_THICK}
            edgeColor={cardColor}
            backColor={MAGNET_BACK_COLOR}
            textureRegion={{ ...region, flipV: true, flipU: true }}
            cornerRadiusRatio={cornerRadiusRatio}
            position={[0, hang / 2, rFold]}
          />
        )}
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
