/*
 * Render/composición de previews de producción del Estudio (extraído de
 * studio-editor.tsx, donde convivía con el orquestador React).
 *
 * Contiene:
 *   - buildShapePath / clipProductionSnapshotToShape: silueta física del imán
 *     (heart/circle/rectangle) como Path2D y recorte de snapshots a esa forma.
 *   - buildCompositedPreview / buildBookmarkStripPreview: montajes Canvas2D de
 *     la "Vista previa" (grid de slots, tiras de separadores 2 caras).
 *   - buildMagnetTextures / combineStripTextures / rotateTextures90: texturas
 *     PNG por slot para las escenas 3D (nevera, libro).
 *
 * Todo es DOM/Canvas2D puro sobre snapshots Konva cacheados
 * (lib/slot-snapshot-cache) — sin estado de React ni cierres del editor.
 */

import type Konva from "konva";
import type { Magnet3D } from "../fridge-3d-view";
import type { CanvasDataV2 } from "../types";
import { previewFacePairOfUnit } from "./faces";
import { loadImage } from "./image-utils";
import { canvasToPreviewDataUrl } from "./preview-encode";
import type { PreviewUnitRange } from "./preview-units";
import { waitForSlotPhotosReady } from "./slot-photo-readiness";
import { snapshotSlotForPreview, yieldToMain } from "./slot-snapshot-cache";
import { MAGNET_TEXTURE_WIDTH_DEFAULT } from "./texture-resolution";

/**
 * Construye un Path2D según el shape del imán físico (heart/circle/rectangle).
 * El caller puede usarlo para `ctx.clip(path)` o `ctx.stroke(path)`.
 * El path está normalizado a objectBoundingBox 0-1 y se escala al cell.
 *
 * Coords del heart match el SVG clipPath inline de studio-slot.tsx
 * (M.3.b.UX.v13) para que el preview matchee 1:1 lo que ve el cliente
 * en el editor.
 */
function buildShapePath(
  shape: "rectangle" | "circle" | "heart" | "custom" | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
): Path2D {
  const path = new Path2D();
  if (!shape || shape === "rectangle" || shape === "custom") {
    const r = Math.min(8, w / 12);
    path.moveTo(x + r, y);
    path.lineTo(x + w - r, y);
    path.quadraticCurveTo(x + w, y, x + w, y + r);
    path.lineTo(x + w, y + h - r);
    path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    path.lineTo(x + r, y + h);
    path.quadraticCurveTo(x, y + h, x, y + h - r);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
    path.closePath();
    return path;
  }
  if (shape === "circle") {
    path.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    return path;
  }
  // heart — path normalizado matchea studio-slot.tsx SVG clipPath M.3.b.UX.v13
  const sx = (n: number) => x + n * w;
  const sy = (n: number) => y + n * h;
  path.moveTo(sx(0.5), sy(0.82));
  path.bezierCurveTo(sx(0.28), sy(0.68), sx(0.06), sy(0.52), sx(0.06), sy(0.32));
  path.bezierCurveTo(sx(0.06), sy(0.18), sx(0.16), sy(0.08), sx(0.28), sy(0.08));
  path.bezierCurveTo(sx(0.38), sy(0.08), sx(0.44), sy(0.12), sx(0.5), sy(0.22));
  path.bezierCurveTo(sx(0.56), sy(0.12), sx(0.62), sy(0.08), sx(0.72), sy(0.08));
  path.bezierCurveTo(sx(0.84), sy(0.08), sx(0.94), sy(0.18), sx(0.94), sy(0.32));
  path.bezierCurveTo(sx(0.94), sy(0.52), sx(0.72), sy(0.68), sx(0.5), sy(0.82));
  path.closePath();
  return path;
}

/**
 * ADR-063 FOTO1/T3 — recorta un snapshot de producción (ya limpio, sin realismo) a la SILUETA
 * física para heart/circle, dejando transparente afuera → la imprenta troquela por ese borde.
 * Rectángulo/custom no se tocan (el corte lo da el propio borde del PNG). Se usa en el fallback de
 * cliente (slots con filtro, que el render server-side no reproduce): así un corazón con filtro
 * imprime como corazón, igual que el corazón sin filtro (que sí pasa por el compositor canvas).
 */
export async function clipProductionSnapshotToShape(
  dataUrl: string,
  shape: "rectangle" | "circle" | "heart" | "custom" | undefined,
): Promise<string> {
  if (!shape || shape === "rectangle" || shape === "custom") return dataUrl;
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo crear contexto canvas para recorte de silueta"));
        return;
      }
      ctx.save();
      ctx.clip(buildShapePath(shape, 0, 0, c.width, c.height));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      ctx.restore();
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("No se pudo cargar snapshot para recorte de silueta"));
    img.src = dataUrl;
  });
}

/**
 * Componer preview del grid completo via Canvas API nativo. Toma los snapshots
 * individuales de cada slot Konva stage y los apila en un mosaico con el
 * gridLayout. Resultado: 1 PNG 1080×~810 (según rows) que el cart muestra.
 */
export async function buildCompositedPreview(
  canvasData: CanvasDataV2,
  stages: Map<number, Konva.Stage | null>,
  shape?: "rectangle" | "circle" | "heart" | "custom",
  opts?: { unitRange?: PreviewUnitRange },
): Promise<string> {
  const { gridLayout, unitTemplate, slots } = canvasData;
  // Ronda 2 QA (2026-10-08) — misma carrera que el libro 3D: sin la espera, un
  // preview abierto justo tras subir fotos hornea el placeholder de carga.
  await waitForSlotPhotosReady(slots, stages);
  // Modelo multi-unidad (2026-09-09): con N unidades multi-slot el gridLayout
  // describe UNA unidad — la Vista previa muestra TODAS las unidades (lo que el
  // cliente va a recibir): las TIRAS se disponen lado a lado (cada una es una
  // pieza continua vertical) y el resto de unidades se apilan en vertical.
  // Fase 2 · item 2.2 (2026-10-07) — `unitRange`: componer UNA unidad aislada
  // (la página del pager de la modal) en vez del montaje completo.
  const range = opts?.unitRange;
  const rangeSlots = range
    ? slots.filter((s) => s.slotIndex >= range.start && s.slotIndex < range.end)
    : slots;
  const unitSlots = range ? rangeSlots.length : (canvasData.unitSlots ?? slots.length);
  const unitCount = range ? 1 : (canvasData.unitCount ?? 1);
  const multiUnit = !range && unitCount > 1 && unitSlots > 1;
  // Cell size: 360×(360 * aspect) por slot en el preview
  const cellW = 360;
  const cellH = Math.floor(360 * (unitTemplate.stage.height / unitTemplate.stage.width));
  const gap = gridLayout.gap;
  // Con unitRange (página de UNA unidad del pager) las filas/columnas se
  // recalculan sobre los slots del rango: el gridLayout puede describir el
  // diseño COMPLETO (packs de imán suelto: 12 slots en 3×4) y pintar una
  // página de 6 con rows=4 dejaría media página en blanco.
  const layoutCols = range
    ? Math.max(1, Math.min(gridLayout.cols, rangeSlots.length))
    : gridLayout.cols;
  const layoutRows = range
    ? Math.max(1, Math.ceil(rangeSlots.length / layoutCols))
    : gridLayout.rows;
  // Ola 4 — TIRA photobooth (1 col, gap 0): la pieza es CONTINUA — sin stroke por celda
  // (separaba las fotos); se dibuja un solo borde exterior al final.
  const isStripPreview = layoutCols === 1 && gridLayout.gap === 0 && rangeSlots.length > 1;
  const unitGap = 32; // separación ENTRE unidades (dentro de la unidad manda gridLayout.gap)
  const unitGridW = layoutCols * cellW + (layoutCols - 1) * gap;
  const unitGridH = layoutRows * cellH + (layoutRows - 1) * gap;
  const canvasW =
    multiUnit && isStripPreview ? unitCount * unitGridW + (unitCount - 1) * unitGap : unitGridW;
  const canvasH =
    multiUnit && !isStripPreview ? unitCount * unitGridH + (unitCount - 1) * unitGap : unitGridH;

  const compositeCanvas = document.createElement("canvas");
  compositeCanvas.width = canvasW;
  compositeCanvas.height = canvasH;
  const ctx = compositeCanvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear contexto canvas para preview");

  // Background brand-cream
  ctx.fillStyle = "#FFF8F0";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Apilar cada slot — clipping por shape del imán físico para que el
  // preview muestre la silueta real (corazón, círculo, etc.) y no un
  // rectángulo. El Konva Stage devuelve siempre un rectángulo
  // (clipping CSS no se traduce a toDataURL); el clip va acá en Canvas2D.
  //
  // Paquete J (2026-10-02, auditoría §E-4 candidato #2): los snapshots se
  // CACHEAN por slot (solo se re-rasteriza lo que cambió desde el último
  // preview/3D — ver lib/slot-snapshot-cache), cediendo al event loop entre
  // slots, y las decodificaciones dataURL→Image van EN PARALELO. Antes eran
  // N toDataURL síncronos + N decodes secuenciales en el MISMO click.
  const slotShots: Array<{ slot: (typeof slots)[number]; dataUrl: string }> = [];
  for (const slot of rangeSlots) {
    const stage = stages.get(slot.slotIndex);
    if (!stage) continue;
    slotShots.push({
      slot,
      dataUrl: snapshotSlotForPreview(stage, slot, {
        unitTemplate,
        borderColor: canvasData.borderColor ?? null,
      }),
    });
    await yieldToMain();
  }
  const images = await Promise.all(slotShots.map((s) => loadImage(s.dataUrl)));

  slotShots.forEach(({ slot }, i) => {
    const img = images[i]!;
    // Posición DENTRO de la unidad (multi-unidad: gridLayout = 1 unidad; con
    // unitRange, el índice relativo al inicio del rango de la página).
    const indexInUnit = multiUnit
      ? slot.slotIndex % unitSlots
      : slot.slotIndex - (range?.start ?? 0);
    const unitIndex = multiUnit ? Math.floor(slot.slotIndex / unitSlots) : 0;
    const col = indexInUnit % layoutCols;
    const row = Math.floor(indexInUnit / layoutCols);
    const unitOffsetX = multiUnit && isStripPreview ? unitIndex * (unitGridW + unitGap) : 0;
    const unitOffsetY = multiUnit && !isStripPreview ? unitIndex * (unitGridH + unitGap) : 0;
    const x = unitOffsetX + col * (cellW + gap);
    const y = unitOffsetY + row * (cellH + gap);
    const path = buildShapePath(shape, x, y, cellW, cellH);
    // 1) Foto clipeada al shape (sin fill blanco previo — la propia foto
    //    es el fondo). Sombra externa via stroke ancho + transparencia.
    ctx.save();
    ctx.clip(path);
    ctx.drawImage(img, x, y, cellW, cellH);
    ctx.restore();
    // 2) Borde visible para destacar la silueta sobre el fondo crema
    //    (Lucy 2026-05-21: "el corazón y el fondo es blanco y no se
    //    detalla bien el contorno"). Ola 4 — en modo TIRA se omite el
    //    stroke por celda: la pieza es continua (solo borde exterior).
    if (!isStripPreview) {
      ctx.save();
      ctx.strokeStyle = "rgba(124, 106, 173, 0.7)"; // brand-purple/70
      ctx.lineWidth = 2.5;
      ctx.stroke(path);
      ctx.restore();
    }
  });

  // Ola 4 — TIRA: un solo borde exterior alrededor de cada pieza continua
  // (multi-unidad: un borde por TIRA, no uno global que las agrupe).
  if (isStripPreview) {
    for (let u = 0; u < unitCount; u++) {
      const ox = multiUnit ? u * (unitGridW + unitGap) : 0;
      ctx.save();
      ctx.strokeStyle = "rgba(124, 106, 173, 0.7)";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(ox + 1.25, 1.25, unitGridW - 2.5, unitGridH - 2.5);
      ctx.restore();
    }
  }

  // 2026-09-22 — WebP q0.85 (fallback JPEG si el navegador no lo soporta en
  // toDataURL): el PNG sin compresión superaba el límite de 3 MB del servidor.
  return canvasToPreviewDataUrl(compositeCanvas);
}

/**
 * Ola 3 (Lucy 2026-07-22) — Preview de confirmación para SEPARADORES 2 CARAS:
 * una TIRA DESPLEGADA por unidad física sobre fondo crema. Es el espejo
 * pequeño de la pieza física que el cliente va a recibir, no una grilla de
 * caras sueltas. Las esquinas exteriores se redondean (troquel).
 *
 * 2026-09-22 — orientación REAL del doblez (feedback QA STG): el separador
 * plegable se pliega por la MITAD de la tira vertical (2×12: 2cm ancho × 12cm
 * alto, doblez en la punta de 2cm) → la tira del preview es VERTICAL con filete
 * de doblez HORIZONTAL en la unión. Las unidades se disponen lado a lado en el
 * montaje.
 * 2026-09-25 (corrección del owner — la convención anterior A arriba/B abajo
 * estaba mal) — geometría "CABEZAS AL DOBLEZ": Cara B en la MITAD SUPERIOR
 * ROTADA 180°, Cara A en la MITAD INFERIOR DERECHA. El separador cuelga del
 * borde superior de la página; con ambas cabezas apuntando al doblez, las dos
 * caras se leen derechas al doblar. EXACTAMENTE como producción
 * (composeFaceStrips) y el libro 3D. Bonus UX: la cara principal (A) se ve
 * derecha en la preview. El texto del modal dice "así se imprime la tira" y la
 * imagen la heredan carrito/admin/correos → fidelidad total a imprenta.
 *  - noFold (Alargados planos): la pieza no se pliega → caras lado a lado
 *    (frente | reverso, B SIN rotar — montaje espalda con espalda) y unidades
 *    apiladas, SIN filete de doblez.
 *  - backOptional: una cara B vacía se dibuja EN BLANCO (REGLA ÚNICA, decisión
 *    owner 2026-10-07 — revierte la regla espejo del Paquete A/D 2026-10-02;
 *    producción genera el PNG blanco en blank-back-face.ts; el slot efectivo lo
 *    resuelve previewFacePairOfUnit: faceB = null → rect blanco puro),
 *    nunca espejo de la cara A ni con el placeholder del editor.
 *  - foldCaption: indicación del tamaño desplegado bajo cada tira (texto CMS
 *    ya resuelto por el caller, ej. "Doblez · Desplegado: 2×12 cm").
 */
export async function buildBookmarkStripPreview(
  canvasData: CanvasDataV2,
  stages: Map<number, Konva.Stage | null>,
  cornerRadiusPx?: number,
  opts?: { noFold?: boolean; backOptional?: boolean; foldCaption?: string; unitIndex?: number },
): Promise<string> {
  const { unitTemplate, slots } = canvasData;
  // Ronda 2 QA (2026-10-08) — misma carrera que el libro 3D: esperar a que las
  // fotos estén decodificadas antes de rasterizar (si no, placeholder lila).
  await waitForSlotPhotosReady(slots, stages);
  const noFold = opts?.noFold === true;
  const backOptional = opts?.backOptional === true;
  const foldCaption = opts?.foldCaption;
  const totalUnits = Math.floor(slots.length / 2);
  // Fase 2 · item 2.2 (2026-10-07) — `unitIndex`: componer SOLO esa unidad (la
  // página del pager de la modal) en vez del montaje con todas.
  const unitIndexes =
    opts?.unitIndex !== undefined
      ? [Math.min(Math.max(0, opts.unitIndex), Math.max(0, totalUnits - 1))]
      : Array.from({ length: totalUnits }, (_, u) => u);
  const units = unitIndexes.length;
  const faceW = 300;
  const faceH = Math.round(faceW * (unitTemplate.stage.height / unitTemplate.stage.width));
  const pad = 24;
  const gap = 18;
  const captionH = foldCaption ? 20 : 0; // renglón de la indicación bajo la tira
  // Geometría de la tira por unidad: plegable = VERTICAL (A sobre B, 1 cara de
  // ancho × 2 de alto); noFold = horizontal (A | B) como siempre.
  const stripW = noFold ? faceW * 2 : faceW;
  const stripH = noFold ? faceH : faceH * 2;
  // Montaje: plegables → unidades LADO A LADO (cada tira es alta); noFold →
  // unidades apiladas en vertical (cada tira es ancha).
  const canvasW = noFold ? stripW + pad * 2 : pad * 2 + units * stripW + (units - 1) * gap;
  const canvasH = noFold
    ? pad * 2 + units * (stripH + captionH) + (units - 1) * gap
    : pad * 2 + stripH + captionH;

  const compositeCanvas = document.createElement("canvas");
  compositeCanvas.width = canvasW;
  compositeCanvas.height = canvasH;
  const ctx = compositeCanvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear contexto canvas para preview de tiras");

  ctx.fillStyle = "#FFF8F0";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Radio de esquina de la tira escalado al tamaño del preview (mismo criterio
  // que el troquel de producción: cornerRadiusPx lógico del stage de la cara).
  const scale = faceW / unitTemplate.stage.width;
  const radius = Math.max(6, Math.round((cornerRadiusPx ?? 0) * scale));

  // Paquete J (2026-10-02) — snapshots cacheados por slot + decodificación EN
  // PARALELO antes de pintar (antes: toDataURL + decode secuencial por cara en
  // el mismo click). La cara B vacía (backOptional) NO se rasteriza: su rect se
  // pinta en blanco puro (faceB = null — owner 2026-10-07).
  const unitFaces: Array<{ faceA: number; faceB: number | null }> = [];
  const faceSlotIndices = new Set<number>();
  for (const unit of unitIndexes) {
    const pair = previewFacePairOfUnit(slots, unit, backOptional);
    unitFaces.push(pair);
    faceSlotIndices.add(pair.faceA);
    if (pair.faceB !== null) faceSlotIndices.add(pair.faceB);
  }
  const faceImages = new Map<number, HTMLImageElement>();
  const faceJobs: Array<Promise<void>> = [];
  for (const slotIndex of faceSlotIndices) {
    const stage = stages.get(slotIndex);
    const slot = slots.find((s) => s.slotIndex === slotIndex);
    if (!stage || !slot) continue;
    const dataUrl = snapshotSlotForPreview(stage, slot, {
      unitTemplate,
      borderColor: canvasData.borderColor ?? null,
    });
    faceJobs.push(
      loadImage(dataUrl).then((img) => {
        faceImages.set(slotIndex, img);
      }),
    );
    await yieldToMain();
  }
  await Promise.all(faceJobs);

  for (let ui = 0; ui < unitIndexes.length; ui++) {
    // Cara B vacía (backOptional) → faceB = null: su rect se pinta EN BLANCO,
    // exactamente lo que producción imprime (REGLA ÚNICA, owner 2026-10-07 —
    // previewFacePairOfUnit, lib/faces.ts). `ui` = posición en el montaje (con
    // unitIndex siempre 0 — una sola tira centrada en su página).
    const { faceA, faceB } = unitFaces[ui]!;
    const x = noFold ? pad : pad + ui * (stripW + gap);
    const y = noFold ? pad + ui * (stripH + captionH + gap) : pad;
    // Rect de cada cara dentro de la tira: plegable = apiladas con CABEZAS AL
    // DOBLEZ (2026-09-25, corrección del owner — la convención anterior A arriba
    // / B abajo estaba mal): Cara B en la MITAD SUPERIOR (se rota 180° al pintar,
    // abajo) y Cara A en la MITAD INFERIOR derecha — ambas cabezas apuntan al
    // doblez horizontal central, así al doblar la tira sobre el borde superior de
    // la página ambas caras cuelgan leyéndose derechas (igual que producción y
    // el 3D). Bonus UX: la cara principal del cliente se ve derecha en la
    // preview. noFold = lado a lado (A izquierda, B derecha), sin rotar.
    const faceRect = (i: number) =>
      noFold
        ? { fx: x + i * faceW, fy: y, fw: faceW, fh: faceH }
        : { fx: x, fy: y + (1 - i) * faceH, fw: faceW, fh: faceH };
    // Troquel redondeado de la tira: clipeamos A+B al mismo roundRect → la
    // silueta impresa coincide con la de producción (WYSIWYG).
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, stripW, stripH, radius);
    ctx.clip();
    for (const [i, slotIndex] of [faceA, faceB].entries()) {
      const { fx, fy, fw, fh } = faceRect(i);
      if (slotIndex === null) {
        // Cara B vacía → EN BLANCO puro (decisión owner 2026-10-07): es la cara
        // blanca que imprenta recibe (blankBackFacePng) y la que muestra el 3D.
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(fx, fy, fw, fh);
        continue;
      }
      const img = faceImages.get(slotIndex);
      if (!img) continue;
      if (!noFold && i === 1) {
        // 2026-09-25 — "cabezas al doblez": la Cara B va en la MITAD
        // SUPERIOR de la tira, ROTADA 180° — al doblar la tira sobre el
        // borde superior de la página ambas caras cuelgan leyéndose
        // derechas. Igual que producción (composeFaceStrips) y el libro
        // 3D — la preview es fiel a imprenta (la heredan
        // carrito/admin/correos).
        ctx.save();
        ctx.translate(fx + fw / 2, fy + fh / 2);
        ctx.rotate(Math.PI);
        ctx.drawImage(img, -fw / 2, -fh / 2, fw, fh);
        ctx.restore();
      } else {
        ctx.drawImage(img, fx, fy, fw, fh);
      }
    }
    ctx.restore();
    // Filete del doblez (pliegue central de la tira) + borde sutil de la
    // silueta. Plegables: filete HORIZONTAL en la unión (a mitad de la tira
    // vertical). noFold (Alargados): pieza PLANA → sin filete.
    ctx.save();
    if (!noFold) {
      ctx.strokeStyle = "rgba(124, 106, 173, 0.55)"; // brand-purple/55
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x + 4, y + faceH);
      ctx.lineTo(x + faceW - 4, y + faceH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = "rgba(124, 106, 173, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, stripW, stripH, radius);
    ctx.stroke();
    ctx.restore();
    // Indicación del tamaño total desplegado bajo la tira (mismo texto CMS que
    // la tarjeta-unidad del lienzo).
    if (foldCaption) {
      ctx.save();
      ctx.fillStyle = "rgba(60, 45, 100, 0.85)";
      ctx.font = "600 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(foldCaption, x + stripW / 2, y + stripH + 14);
      ctx.restore();
    }
  }

  return canvasToPreviewDataUrl(compositeCanvas);
}

/**
 * Ola 6 (Lucy 2026-07-23) — Tiras magnéticas photobooth: la pieza física es UNA tira continua
 * con N fotos apiladas verticalmente. En la nevera 3D no queremos N imanes sueltos; combinamos
 * los slots de cada tira en un solo Magnet3D con su textura vertical y proporción de tira.
 *
 * El `sizeCm` del producto ya describe la TIRA COMPLETA (p. ej. 5×15 cm), no cada celda, así que
 * conservamos `wCm`/`hCm` tal cual si vienen. El alto de la textura combinada sí crece con la
 * cantidad de fotos (`hRatio *= chunk.length`), de modo que `magnetWorldSizes` derive el tamaño
 * físico respetando el aspecto real de la textura sin deformarla.
 */
export async function combineStripTextures(
  magnets: Magnet3D[],
  slotsPerStrip: number,
): Promise<Magnet3D[]> {
  if (magnets.length <= 1) return magnets;
  const out: Magnet3D[] = [];
  for (let i = 0; i < magnets.length; i += slotsPerStrip) {
    const chunk = magnets.slice(i, i + slotsPerStrip);
    if (chunk.length === 1) {
      out.push(chunk[0]!);
      continue;
    }
    const first = chunk[0]!;
    const images = await Promise.all(chunk.map((m) => loadImage(m.dataUrl)));
    const w = images[0]!.naturalWidth;
    const h = images[0]!.naturalHeight;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h * images.length;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear contexto canvas para tira 3D");
    images.forEach((img, idx) => ctx.drawImage(img, 0, h * idx));
    out.push({
      dataUrl: c.toDataURL("image/png"),
      wRatio: first.wRatio,
      hRatio: first.hRatio * chunk.length,
      shape: first.shape,
      // El fallback sizeCm del producto describe la tira completa; no duplicamos medidas.
      wCm: first.wCm,
      hCm: first.hCm,
      cornerRadiusRatio: first.cornerRadiusRatio,
    });
  }
  return out;
}

/**
 * Ola 6 (Lucy 2026-07-23) — Separadores rectangulares: el lienzo del Estudio es horizontal
 * (cara A/B una al lado de la otra), pero en el libro 3D la tira doblada se pone de PIE
 * (largo a lo largo del borde). Rotamos 90° la textura y el lienzo para que el diseño se
 * lea derecho sobre la cara 2×6 cm (o 4.2×4 cm) sin deformarse.
 */
export async function rotateTextures90(magnets: Magnet3D[]): Promise<Magnet3D[]> {
  return Promise.all(
    magnets.map(async (m) => {
      const img = await loadImage(m.dataUrl);
      const c = document.createElement("canvas");
      c.width = img.naturalHeight;
      c.height = img.naturalWidth;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("No se pudo crear contexto canvas para rotar textura");
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      return {
        ...m,
        dataUrl: c.toDataURL("image/png"),
        wRatio: m.hRatio,
        hRatio: m.wRatio,
      };
    }),
  );
}

// P1.4 — Genera una textura PNG por slot para la vista 3D: el snapshot del imán recortado a su
// silueta física (transparente afuera), para que en la nevera 3D cada imán tenga su forma real
// (rectángulo/corazón/círculo) y no un rectángulo. Reusa buildShapePath (misma silueta que el
// preview 2D). Devuelve, además, la proporción física para escalar el plano en la escena.

export async function buildMagnetTextures(
  canvasData: CanvasDataV2,
  stages: Map<number, Konva.Stage | null>,
  shape?: "rectangle" | "circle" | "heart" | "custom",
  // 2026-10-05 — ancho de textura por tamaño físico de la pieza (antes 512 fijo:
  // borroso con el zoom cercano nuevo + dpr 2). Ver lib/texture-resolution.ts.
  texWidth: number = MAGNET_TEXTURE_WIDTH_DEFAULT,
): Promise<Magnet3D[]> {
  const { unitTemplate, slots } = canvasData;
  // Sin esta espera el snapshot puede caer en la ventana "foto subida pero aún no
  // decodificada en Konva" y la textura sale con el placeholder lila (ver doc arriba).
  await waitForSlotPhotosReady(slots, stages);
  const texW = texWidth;
  const texH = Math.max(
    64,
    Math.round(texW * (unitTemplate.stage.height / unitTemplate.stage.width)),
  );
  // Paquete J (2026-10-02) — snapshots cacheados por slot + decodificación EN
  // PARALELO (antes: N toDataURL + N decodes secuenciales dentro del click
  // "3D"/"en tu espacio"). El recorte a la silueta queda síncrono pero cede
  // al event loop entre slots.
  const slotShots: Array<{ slot: (typeof slots)[number]; dataUrl: string }> = [];
  for (const slot of slots) {
    const stage = stages.get(slot.slotIndex);
    if (!stage) continue;
    slotShots.push({
      slot,
      dataUrl: snapshotSlotForPreview(stage, slot, {
        unitTemplate,
        borderColor: canvasData.borderColor ?? null,
      }),
    });
    await yieldToMain();
  }
  const images = await Promise.all(slotShots.map((s) => loadImage(s.dataUrl)));

  const out: Magnet3D[] = [];
  for (const [i, { slot }] of slotShots.entries()) {
    const img = images[i]!;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const c = document.createElement("canvas");
      c.width = texW;
      c.height = texH;
      const ctx = c.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo crear contexto canvas para textura 3D"));
        return;
      }
      // Recorte a la silueta física → transparencia fuera (sin fondo).
      const path = buildShapePath(shape, 0, 0, texW, texH);
      ctx.save();
      ctx.clip(path);
      ctx.drawImage(img, 0, 0, texW, texH);
      ctx.restore();
      resolve(c.toDataURL("image/png"));
    });
    out.push({
      dataUrl,
      wRatio: unitTemplate.stage.width,
      hRatio: unitTemplate.stage.height,
      // La silueta viaja con la textura → las escenas 3D extruyen el cuerpo con la misma forma.
      shape,
      // Ola 10 — metadata del slot para agrupar caras de separadores.
      slotIndex: slot.slotIndex,
      assetUrl: slot.assetUrl,
    });
    await yieldToMain();
  }
  return out;
}
