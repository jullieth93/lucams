/*
 * ADR-063 FOTO4-B — REPISA: la(s) pieza(s) apoyada(s) sobre un estante de madera contra una pared
 * cálida (rincón decorado del hogar). Preview 2D procedural (cero assets externos), hermano del
 * flat-lay de regalo. WYSIWYG: un imán puede recostarse/apoyarse sobre una repisa, así que la escena
 * es físicamente válida (a diferencia de "colgado en un marco", que no lo sería para un imán).
 *
 * Todo se dibuja a mano: pared con degradado, estante con veta + canto + soportes, y la(s) pieza(s)
 * recostada(s) con su sombra sobre la madera y la pared.
 */

const S = 1080; // lienzo cuadrado (compartible)

type Piece = { dataUrl: string; wRatio: number; hRatio: number };

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("no se pudo cargar la pieza"));
    img.src = url;
  });
}

/**
 * Fracción (0..1) de la caja donde termina el contenido VISIBLE (última fila con alfa). Necesario
 * para POSAR la pieza sobre la repisa por su silueta real y no por el borde de su caja: un corazón
 * tiene ~18% de transparencia bajo su punta, así que apoyar la caja lo dejaría flotando. Se escanea
 * en baja resolución (barato) y es robusto para cualquier forma (corazón, círculo, rectángulo).
 */
function contentBottomFrac(img: CanvasImageSource): number {
  const N = 64;
  const c = document.createElement("canvas");
  c.width = N;
  c.height = N;
  const cx = c.getContext("2d");
  if (!cx) return 1;
  cx.drawImage(img, 0, 0, N, N);
  const data = cx.getImageData(0, 0, N, N).data;
  for (let y = N - 1; y >= 0; y--) {
    for (let x = 0; x < N; x++) {
      if (data[(y * N + x) * 4 + 3]! > 10) return (y + 1) / N;
    }
  }
  return 1;
}

/** Compone la escena de repisa con la(s) pieza(s) → dataURL PNG. */
export async function composeShelfFlatlay(pieces: Piece[]): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas ctx");

  // Pared cálida (degradado vertical, más luz arriba).
  const wall = ctx.createLinearGradient(0, 0, 0, S);
  wall.addColorStop(0, "#F4ECDE");
  wall.addColorStop(1, "#E6D6C0");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, S, S);

  // Estante de madera: plancha horizontal en el tercio inferior.
  const shelfY = S * 0.7;
  const shelfH = S * 0.05;
  const inset = S * 0.09;
  const shelfW = S - inset * 2;

  // Sombra que proyecta el estante sobre la pared (justo debajo).
  ctx.save();
  ctx.fillStyle = "rgba(70, 52, 34, 0.14)";
  ctx.beginPath();
  ctx.roundRect(inset + 6, shelfY + shelfH, shelfW - 12, 26, 8);
  ctx.fill();
  ctx.restore();

  // Cara superior (veta clara) + canto frontal (más oscuro).
  const wood = ctx.createLinearGradient(0, shelfY, 0, shelfY + shelfH);
  wood.addColorStop(0, "#CE9F6D");
  wood.addColorStop(1, "#B07E50");
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.roundRect(inset, shelfY, shelfW, shelfH, 7);
  ctx.fill();
  ctx.fillStyle = "#8E6540";
  ctx.beginPath();
  ctx.roundRect(inset, shelfY + shelfH - 10, shelfW, 12, 5);
  ctx.fill();

  // Soportes (dos escuadras bajo el estante).
  ctx.fillStyle = "#9A6E45";
  for (const bx of [inset + shelfW * 0.16, inset + shelfW * 0.84 - 16]) {
    ctx.beginPath();
    ctx.moveTo(bx, shelfY + shelfH);
    ctx.lineTo(bx + 16, shelfY + shelfH);
    ctx.lineTo(bx + 16, shelfY + shelfH + 40);
    ctx.closePath();
    ctx.fill();
  }

  // Pieza(s) recostada(s) sobre el estante, apoyadas contra la pared.
  const n = Math.min(pieces.length, 4);
  const imgs = await Promise.all(
    pieces.slice(0, n).map((p) => loadImg(p.dataUrl).catch(() => null)),
  );
  const availW = shelfW * 0.84;
  const cellW = availW / n;
  const seatY = shelfY + 3; // la superficie donde la SILUETA (no la caja) toca la madera

  for (let i = 0; i < n; i++) {
    const img = imgs[i];
    const p = pieces[i]!;
    if (!img) continue;
    const aspect = p.hRatio / p.wRatio;
    let h = S * (n === 1 ? 0.42 : 0.34);
    let w = h / aspect;
    if (w > cellW * 0.9) {
      w = cellW * 0.9;
      h = w * aspect;
    }
    const cx = S / 2 + (i - (n - 1) / 2) * cellW;
    const bottomFrac = contentBottomFrac(img); // dónde termina la silueta dentro de la caja
    const tilt = (i - (n - 1) / 2) * 0.02;

    // Sombra de contacto (elipse) donde la silueta toca la madera.
    ctx.save();
    ctx.fillStyle = "rgba(60, 46, 92, 0.2)";
    ctx.beginPath();
    ctx.ellipse(cx, seatY + 3, w * 0.42, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Pieza: pivota sobre el punto de contacto (leve inclinación tipo abanico) + sombra hacia la
    // pared. Se dibuja la caja subida `bottomFrac*h` para que la silueta —no la caja— pose en seatY.
    ctx.save();
    ctx.translate(cx, seatY);
    ctx.rotate(tilt);
    ctx.shadowColor = "rgba(61, 46, 92, 0.26)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = -8;
    ctx.drawImage(img, -w / 2, -bottomFrac * h, w, h);
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}
