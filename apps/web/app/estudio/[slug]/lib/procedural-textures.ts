/*
 * Texturas PROCEDURALES (canvas 2D → CanvasTexture) para las escenas 3D del Estudio.
 * CSP-safe: cero assets externos, todo se dibuja en runtime (pase de realismo Lucy 2026-07-22).
 *
 * Singletons perezosos: cada textura se crea UNA vez por sesión y se reusa entre escenas (los
 * componentes que las usan son client-only, dynamic ssr:false → `document` siempre existe).
 * No se disponan: viven lo que vive la pestaña, como cualquier módulo cacheado.
 */

import * as THREE from "three";

function makeTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeat: [number, number] = [1, 1],
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el contexto 2D para la textura procedural");
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Corcho del tablero (room-board "cork"): base + miles de gránulos claros/oscuros. */
let cork: THREE.CanvasTexture | null = null;
export function getCorkTexture(): THREE.CanvasTexture {
  if (cork) return cork;
  cork = makeTexture(
    512,
    (ctx, s) => {
      ctx.fillStyle = "#C99A63";
      ctx.fillRect(0, 0, s, s);
      const specks = ["#A97943", "#B3854F", "#D9AC74", "#8F6537", "#E2B983"];
      for (let i = 0; i < 6500; i++) {
        const r = 0.4 + Math.random() * 1.3;
        ctx.globalAlpha = 0.2 + Math.random() * 0.45;
        ctx.fillStyle = specks[i % specks.length]!;
        ctx.beginPath();
        ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Gránulos alargados (trozos de corcho) — pocos, para no saturar.
      for (let i = 0; i < 220; i++) {
        ctx.globalAlpha = 0.12 + Math.random() * 0.25;
        ctx.fillStyle = specks[(i * 3) % specks.length]!;
        ctx.save();
        ctx.translate(Math.random() * s, Math.random() * s);
        ctx.rotate(Math.random() * Math.PI);
        ctx.fillRect(-3 - Math.random() * 4, -1, 6 + Math.random() * 8, 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
    [2, 2],
  );
  return cork;
}

/**
 * Canto del bloque de páginas (libro): líneas horizontales finas con jitter — las hojas vistas
 * de frente. repeat vertical alto para que se lean ~cientos de hojas, no 40.
 */
let pageEdges: THREE.CanvasTexture | null = null;
export function getPageEdgesTexture(): THREE.CanvasTexture {
  if (pageEdges) return pageEdges;
  pageEdges = makeTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = "#FBF7EE";
      ctx.fillRect(0, 0, s, s);
      let y = 1;
      while (y < s) {
        const dark = Math.random() < 0.18;
        ctx.strokeStyle = dark
          ? `rgba(168, 150, 120, ${0.35 + Math.random() * 0.3})`
          : `rgba(196, 180, 152, ${0.22 + Math.random() * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + Math.random() * 0.6);
        ctx.lineTo(s, y + Math.random() * 0.6);
        ctx.stroke();
        y += 3 + Math.random() * 4;
      }
    },
    [1, 6],
  );
  return pageEdges;
}

/** Madera clara de mesa (escena Polaroid): vetas largas + separaciones de tabla + nudos. */
let wood: THREE.CanvasTexture | null = null;
export function getWoodTexture(): THREE.CanvasTexture {
  if (wood) return wood;
  wood = makeTexture(
    512,
    (ctx, s) => {
      ctx.fillStyle = "#DDB892";
      ctx.fillRect(0, 0, s, s);
      // Vetas horizontales onduladas.
      for (let i = 0; i < 90; i++) {
        const y0 = Math.random() * s;
        const amp = 2 + Math.random() * 5;
        const freq = 0.008 + Math.random() * 0.02;
        ctx.strokeStyle = `rgba(150, 108, 66, ${0.05 + Math.random() * 0.14})`;
        ctx.lineWidth = 0.8 + Math.random() * 1.6;
        ctx.beginPath();
        for (let x = 0; x <= s; x += 8) {
          const y = y0 + Math.sin(x * freq + i) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Nudos: arcos concéntricos suaves.
      for (let i = 0; i < 4; i++) {
        const cx = Math.random() * s;
        const cy = Math.random() * s;
        for (let r = 3; r < 16; r += 3) {
          ctx.strokeStyle = `rgba(140, 98, 58, ${0.1 + Math.random() * 0.1})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, r * 1.6, r, 0.3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Separación de tablas cada 128px (con su línea de luz al lado).
      for (let x = 128; x < s; x += 128) {
        ctx.fillStyle = "rgba(110, 76, 44, 0.32)";
        ctx.fillRect(x - 1, 0, 2, s);
        ctx.fillStyle = "rgba(240, 214, 178, 0.5)";
        ctx.fillRect(x + 1, 0, 1, s);
      }
    },
    [3, 3],
  );
  return wood;
}
