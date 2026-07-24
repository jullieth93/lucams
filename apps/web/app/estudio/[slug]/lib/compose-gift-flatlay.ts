/*
 * ADR-063 FOTO3 — flat-lay de REGALO del fotoimán. Preview emocional (distinto a las vistas 3D): la
 * pieza vista de arriba en un contexto de obsequio (fondo cálido tipo lino + cinta + moño + etiqueta
 * "Para ti"). Compositor 2D en el canvas del navegador. No es archivo de producción, es un preview.
 *
 * La escena se dibuja PROCEDURALMENTE (cero assets externos): fondo con degradado, cinta, moño y
 * etiqueta trazados a mano. La(s) pieza(s) vienen del snapshot recortado a la silueta (transparente
 * afuera), así un corazón se ve como corazón sobre el papel de regalo.
 */

const S = 1080; // lienzo cuadrado (compartible)

type Piece = { dataUrl: string; wRatio: number; hRatio: number; shape?: "rectangle" | "circle" | "heart" | "custom" };

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("no se pudo cargar la pieza"));
    img.src = url;
  });
}

/** Un moño simple (dos lazos + nudo) centrado en (cx,cy). */
function drawBow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  // Lazo izquierdo
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.bezierCurveTo(cx - r * 1.6, cy - r, cx - r * 1.6, cy + r, cx, cy);
  ctx.fill();
  // Lazo derecho
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.bezierCurveTo(cx + r * 1.6, cy - r, cx + r * 1.6, cy + r, cx, cy);
  ctx.fill();
  // Colas
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.3, cy);
  ctx.lineTo(cx - r * 0.9, cy + r * 1.9);
  ctx.lineTo(cx - r * 0.1, cy + r * 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.3, cy);
  ctx.lineTo(cx + r * 0.9, cy + r * 1.9);
  ctx.lineTo(cx + r * 0.1, cy + r * 1.4);
  ctx.closePath();
  ctx.fill();
  // Nudo
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.42, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#E85B9F";
  ctx.fill();
  ctx.restore();
}

/** Recorta el ctx a la silueta física (mismo path que buildShapePath en el editor). */
function clipShape(
  ctx: CanvasRenderingContext2D,
  shape: Piece["shape"],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.beginPath();
  if (shape === "circle") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === "heart") {
    const s = Math.min(w, h);
    const ox = x + (w - s) / 2;
    const oy = y + (h - s) / 2;
    const r = s / 2;
    const cx = ox + r;
    const cy = oy + r * 0.88;
    ctx.moveTo(cx, cy + r * 0.72);
    ctx.bezierCurveTo(cx - r * 1.1, cy - r * 0.2, cx - r, cy - r, cx - r * 0.5, cy - r * 0.78);
    ctx.bezierCurveTo(cx - r * 0.1, cy - r * 1.1, cx, cy - r * 0.75, cx, cy - r * 0.6);
    ctx.bezierCurveTo(cx, cy - r * 0.75, cx + r * 0.1, cy - r * 1.1, cx + r * 0.5, cy - r * 0.78);
    ctx.bezierCurveTo(cx + r, cy - r, cx + r * 1.1, cy - r * 0.2, cx, cy + r * 0.72);
  } else {
    // rectangle / custom: rectángulo con esquinas redondeas suaves.
    const r = Math.min(28, w * 0.06, h * 0.06);
    ctx.roundRect(x, y, w, h, r);
  }
  ctx.closePath();
  ctx.clip();
}

/** Compone el flat-lay de regalo con la(s) pieza(s) → dataURL PNG. */
export async function composeGiftFlatlay(pieces: Piece[]): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas ctx");

  // Fondo cálido tipo papel de regalo (degradado radial suave).
  const bg = ctx.createRadialGradient(S * 0.5, S * 0.42, S * 0.1, S * 0.5, S * 0.5, S * 0.75);
  bg.addColorStop(0, "#FBF3E7");
  bg.addColorStop(1, "#EAD9C2");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // Cinta diagonal (esquina superior-izquierda) + moño.
  ctx.save();
  ctx.fillStyle = "rgba(93, 217, 209, 0.85)"; // turquesa de marca
  ctx.translate(S * 0.2, S * 0.2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillRect(-S, -55, S * 2, 46);
  ctx.fillRect(-S, 20, S * 2, 46);
  ctx.restore();
  drawBow(ctx, S * 0.2, S * 0.2, 44, "#5DD9D1");

  // Pieza(s): 1 grande centrada; varias en fila. Sombra suave para "posarlas" sobre el papel.
  // Ola 15 — reducimos el área para dejar márgenes generosos y evitar que la pieza o
  // la etiqueta de regalo toquen los bordes del lienzo.
  const n = Math.min(pieces.length, 5);
  const imgs = await Promise.all(
    pieces.slice(0, n).map((p) => loadImg(p.dataUrl).catch(() => null)),
  );
  const areaW = S * 0.36;
  const cellW = n === 1 ? areaW : (S * 0.52) / n;

  for (let i = 0; i < n; i++) {
    const img = imgs[i];
    const p = pieces[i]!;
    if (!img) continue;
    const aspect = p.hRatio / p.wRatio;
    let w = n === 1 ? areaW : cellW * 0.82;
    let h = w * aspect;
    const maxH = S * 0.38;
    if (h > maxH) {
      h = maxH;
      w = h / aspect;
    }
    const cx = n === 1 ? S * 0.52 : S * 0.5 + (i - (n - 1) / 2) * cellW;
    const cy = n === 1 ? S * 0.52 : S * 0.53;
    ctx.save();
    ctx.shadowColor = "rgba(61, 46, 92, 0.28)";
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 20;
    if (p.shape && p.shape !== "rectangle") {
      clipShape(ctx, p.shape, cx - w / 2, cy - h / 2, w, h);
    }
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }

  // Etiqueta de regalo "Para ti" con cordón (abajo a la derecha, más centrada).
  ctx.save();
  ctx.translate(S * 0.72, S * 0.80);
  ctx.rotate(-0.12);
  // cordón
  ctx.strokeStyle = "#B79A78";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-40, -70);
  ctx.lineTo(6, -6);
  ctx.stroke();
  // tarjeta
  ctx.fillStyle = "#FFFDF9";
  ctx.strokeStyle = "#E0CDB0";
  ctx.lineWidth = 2;
  const tw = 190;
  const th = 96;
  ctx.beginPath();
  ctx.roundRect(-tw / 2, 0, tw, th, 12);
  ctx.fill();
  ctx.stroke();
  // agujerito del cordón
  ctx.beginPath();
  ctx.arc(6, 12, 5, 0, Math.PI * 2);
  ctx.strokeStyle = "#C9B18E";
  ctx.stroke();
  // texto
  ctx.fillStyle = "#7C6AAD";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 34px "Fredoka", system-ui, sans-serif';
  ctx.fillText("Para ti", 0, th / 2 - 6);
  ctx.font = "26px system-ui, sans-serif";
  ctx.fillText("🎁", 0, th / 2 + 26);
  ctx.restore();

  return canvas.toDataURL("image/png");
}
