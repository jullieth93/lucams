/*
 * ADR-063 T7 — "Hoja de armado" (armado.png): una hoja de contacto para la imprenta/empaque. Muestra
 * cada pieza del pedido en miniatura con su etiqueta (mes del calendario o "Pieza N") y su estado de
 * moderación, para que quien produce sepa QUÉ va DÓNDE y no imprima nada sin aprobar. Se genera
 * server-side con @napi-rs/canvas y se mete al ZIP de producción junto a los PNGs 300 DPI.
 */

import "server-only";
import path from "node:path";

type CanvasMod = typeof import("@napi-rs/canvas");
let _mod: CanvasMod | null = null;
async function loadCanvas(): Promise<CanvasMod> {
  if (!_mod) _mod = await import("@napi-rs/canvas");
  return _mod;
}

let fontsReady: boolean | null = null;
function ensureFonts(mod: CanvasMod): boolean {
  if (fontsReady !== null) return fontsReady;
  try {
    const dir = path.join(process.cwd(), "assets", "fonts");
    const ok =
      mod.GlobalFonts.registerFromPath(path.join(dir, "Fredoka.ttf"), "Fredoka") &&
      mod.GlobalFonts.registerFromPath(path.join(dir, "Inter.ttf"), "Inter");
    fontsReady = Boolean(ok);
  } catch {
    fontsReady = false;
  }
  return fontsReady;
}

export type AssemblyPiece = {
  /** Etiqueta legible: "Enero 2027" o "Pieza 1". */
  label: string;
  /** APPROVED | PENDING | REJECTED. */
  moderationStatus: string;
  /** Nombre del producto de esta pieza (agrupación visual). */
  productName: string;
  /** PNG 300 DPI de la pieza (para la miniatura). */
  png: Buffer;
};

// #14 — exportado para poder aseverar el mapeo de estado sin OCR en los tests. No cambia comportamiento.
export const STATUS_META: Record<string, { color: string; text: string }> = {
  APPROVED: { color: "#2E8B57", text: "aprobado" },
  PENDING: { color: "#C98A1E", text: "SIN APROBAR — NO IMPRIMIR" },
  REJECTED: { color: "#C0392B", text: "RECHAZADO — NO IMPRIMIR" },
};

const W = 1240;
const PAD = 44;
const COLS = 3;
const GAP = 28;
const HEADER_H = 150;
const FOOTER_H = 96;
const LABEL_H = 64;

/** Compone la hoja de armado. Devuelve un PNG (Buffer). */
export async function composeAssemblySheet(opts: {
  orderNumber: string;
  createdAtLabel: string;
  pieces: AssemblyPiece[];
}): Promise<Buffer> {
  const mod = await loadCanvas();
  const fontsOk = ensureFonts(mod);
  const titleFont = fontsOk ? "Fredoka" : "sans-serif";
  const bodyFont = fontsOk ? "Inter" : "sans-serif";

  const cellW = Math.floor((W - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const thumbH = cellW; // miniatura cuadrada (encaja fotoimán y página de calendario recortada)
  const cellH = thumbH + LABEL_H;
  const rows = Math.max(1, Math.ceil(opts.pieces.length / COLS));
  const H = HEADER_H + rows * cellH + (rows - 1) * GAP + FOOTER_H;

  const canvas = mod.createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Fondo crema de marca.
  ctx.fillStyle = "#FFF8F0";
  ctx.fillRect(0, 0, W, H);

  // Header.
  ctx.fillStyle = "#3D2E5C";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 46px ${titleFont}`;
  ctx.fillText("Hoja de armado", PAD, 74);
  ctx.fillStyle = "#7C6AAD";
  ctx.font = `600 26px ${bodyFont}`;
  ctx.fillText(`Pedido ${opts.orderNumber} · ${opts.createdAtLabel}`, PAD, 112);
  ctx.strokeStyle = "#E7DFD3";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, HEADER_H - 18);
  ctx.lineTo(W - PAD, HEADER_H - 18);
  ctx.stroke();

  // Grilla de piezas.
  for (let i = 0; i < opts.pieces.length; i++) {
    const piece = opts.pieces[i]!;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD + col * (cellW + GAP);
    const y = HEADER_H + row * (cellH + GAP);

    const st = STATUS_META[piece.moderationStatus] ?? STATUS_META.PENDING!;

    // Marco de la miniatura: color de alerta si no está aprobada.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, y, cellW, thumbH);
    ctx.strokeStyle = piece.moderationStatus === "APPROVED" ? "#E7DFD3" : st.color;
    ctx.lineWidth = piece.moderationStatus === "APPROVED" ? 1 : 3;
    ctx.strokeRect(x, y, cellW, thumbH);

    // Miniatura (contain, centrada).
    try {
      const img = await mod.loadImage(piece.png);
      if (img.width && img.height) {
        const scale = Math.min((cellW - 16) / img.width, (thumbH - 16) / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, x + (cellW - dw) / 2, y + (thumbH - dh) / 2, dw, dh);
      }
    } catch {
      // pieza ilegible → deja el marco vacío (se nota en la hoja).
    }

    // Etiqueta + estado.
    ctx.textAlign = "left";
    ctx.fillStyle = "#2A2140";
    ctx.font = `700 24px ${bodyFont}`;
    ctx.fillText(piece.label, x + 2, y + thumbH + 30);
    ctx.fillStyle = st.color;
    ctx.font = `600 20px ${bodyFont}`;
    ctx.fillText(`● ${st.text}`, x + 2, y + thumbH + 56);
  }

  // Footer / leyenda.
  const fy = H - FOOTER_H + 20;
  ctx.textAlign = "left";
  ctx.font = `600 20px ${bodyFont}`;
  const legend: [string, string][] = [
    ["#2E8B57", "aprobado"],
    ["#C98A1E", "sin aprobar (no imprimir)"],
    ["#C0392B", "rechazado (no imprimir)"],
  ];
  let lx = PAD;
  for (const [color, text] of legend) {
    ctx.fillStyle = color;
    ctx.fillText("●", lx, fy + 22);
    ctx.fillStyle = "#3D2E5C";
    ctx.fillText(` ${text}`, lx + 18, fy + 22);
    lx += 24 + ctx.measureText(text).width + 54;
  }

  return canvas.toBuffer("image/png");
}
