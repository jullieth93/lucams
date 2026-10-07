/*
 * Cara B EN BLANCO para producción (decisión owner 2026-10-07 — REVIERTE la
 * regla espejo del Paquete D, 2026-10-02).
 *
 * Productos backOptional (separadores magnéticos doblados y alargados planos,
 * facesPerUnit=2): cuando el cliente diseña solo la cara A de una unidad, la
 * cara B se IMPRIME EN BLANCO — nunca espejo de la A. Lo que imprenta recibe es
 * un PNG BLANCO PURO con las dimensiones y densidad (DPI) EXACTAS de la cara A
 * de su pareja, así la tira desplegada (composeFaceStrips) queda A | blanco con
 * la geometría correcta del troquel (no un hueco ni un slot faltante).
 *
 * El mismo blanco es el que muestran la Vista Previa del Estudio
 * (previewFacePairOfUnit, lib/faces.ts) y el libro 3D (BLANK_FACE_COLOR,
 * magnet-3d.tsx) — una sola regla en los tres renders.
 *
 * sharp es nativo: el service lo importa de forma PEREZOSA (ver nota de imports
 * en service.ts) igual que los demás motores de render.
 */

import sharp from "./sharp-safe";

/** DPI por defecto del PNG blanco si la cara A de referencia no declara densidad. */
const PRODUCTION_DPI = 300;

/**
 * PNG blanco puro (#FFFFFF, sin alfa) con las dimensiones y densidad (DPI) del
 * buffer de referencia — la cara A de la pareja. Es la cara B que imprenta
 * imprime cuando el cliente no la diseñó.
 */
export async function blankBackFacePng(reference: Buffer): Promise<Buffer> {
  const meta = await sharp(reference).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("No se pudieron leer las dimensiones de la cara A para la B en blanco");
  }
  return sharp({
    create: { width: meta.width, height: meta.height, channels: 3, background: "#FFFFFF" },
  })
    .withMetadata({ density: meta.density ?? PRODUCTION_DPI })
    .png()
    .toBuffer();
}

/**
 * Cara B opcional (backOptional, 2026-09-22; blanco desde 2026-10-07): expande
 * un array de buffers que solo cubre los slots REQUERIDOS a uno con un buffer
 * por slot del canvas, generando una cara BLANCA (del tamaño/DPI de la cara A
 * de su pareja, slot i−1) en cada cara B vacía (2k+1). Sin caras B vacías es
 * identidad. Antes duplicaba la cara A (regla espejo, revertida).
 */
export async function expandMissingBackFaces(
  buffers: Buffer[],
  requiredSlotIndexes: number[],
  slotCount: number,
): Promise<Buffer[]> {
  if (requiredSlotIndexes.length === slotCount) return buffers;
  const byIndex = new Map(requiredSlotIndexes.map((slotIndex, k) => [slotIndex, buffers[k]!]));
  const out: Buffer[] = [];
  for (let i = 0; i < slotCount; i++) {
    const own = byIndex.get(i);
    if (own) {
      out.push(own);
      continue;
    }
    const faceA = byIndex.get(i - 1);
    if (!faceA) {
      // No debería: el guard de finalización exige TODAS las caras A.
      throw new Error(
        `INCOMPLETE_SLOTS: la cara B vacía del slot ${i + 1} no tiene su cara A de referencia`,
      );
    }
    out.push(await blankBackFacePng(faceA));
  }
  return out;
}

/**
 * Sustituye, en un array COMPLETO de buffers por slot, las caras B vacías por
 * la cara BLANCA del tamaño/DPI de su cara A (slot i−1). Se usa tras el render
 * server-side: el motor exige un asset por slot, así la B vacía llega como una
 * copia de trabajo de la A (ver canvasForRender en finalizeDesign) que acá se
 * descarta y se reemplaza por el blanco real que imprenta debe recibir.
 */
export async function blankOutEmptyBackFaces(
  buffers: Buffer[],
  emptyBackSlots: ReadonlySet<number>,
): Promise<Buffer[]> {
  if (emptyBackSlots.size === 0) return buffers;
  const out = buffers.slice();
  for (const i of emptyBackSlots) {
    const faceA = out[i - 1];
    if (!faceA) {
      throw new Error(
        `INCOMPLETE_SLOTS: la cara B vacía del slot ${i + 1} no tiene su cara A de referencia`,
      );
    }
    out[i] = await blankBackFacePng(faceA);
  }
  return out;
}
