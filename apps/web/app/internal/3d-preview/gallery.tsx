"use client";

/*
 * Galería de preview de las escenas 3D (dev-only) — herramienta de iteración para el pase de
 * realismo (feedback Lucy FB5). Genera imanes de muestra (dataURL en canvas, sin depender del
 * Estudio) y monta las 3 escenas 3D para poder capturarlas con Chromium y comparar antes/después.
 */

import { useEffect, useState } from "react";
import nextDynamic from "next/dynamic";
import type { Magnet3D } from "../../estudio/[slug]/fridge-3d-view";

const FridgeView3D = nextDynamic(() => import("../../estudio/[slug]/fridge-3d-view"), {
  ssr: false,
});
const RoomBoardView3D = nextDynamic(() => import("../../estudio/[slug]/room-board-view-3d"), {
  ssr: false,
});
const BookView3D = nextDynamic(() => import("../../estudio/[slug]/book-view-3d"), { ssr: false });

/** Dibuja un imán-foto de muestra (rounded rect con gradiente + marco blanco) en un canvas transparente. */
function photoMagnet(seed: number, w = 360, h = 360): Magnet3D {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const pad = 10;
  const r = 26;
  // Marco blanco (imán físico) con esquinas redondeadas.
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, r);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  // Foto interior (gradiente que varía por seed).
  const inset = pad + 14;
  roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, r - 8);
  ctx.clip();
  const hues = [
    ["#5DD9D1", "#E85B9F"],
    ["#F58A6F", "#FFD93D"],
    ["#7C6AAD", "#5DD9D1"],
    ["#FFD93D", "#F58A6F"],
    ["#E85B9F", "#7C6AAD"],
    ["#5DD9D1", "#FFD93D"],
  ];
  const [a, b] = hues[seed % hues.length];
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return { dataUrl: c.toDataURL("image/png"), wRatio: 1, hRatio: 1 };
}

/** Dibuja una ficha de letra de muestra (para el tablero del nombre). */
function letterMagnet(ch: string, color: string, w = 300, h = 380): Magnet3D {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  roundRect(ctx, 8, 8, w - 16, h - 16, 34);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `800 ${Math.round(w * 0.55)}px "Baloo 2", "Fredoka", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch, w / 2, h / 2 + 6);
  return { dataUrl: c.toDataURL("image/png"), wRatio: w / h, hRatio: 1 };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type Samples = { magnets: Magnet3D[]; letters: Magnet3D[]; bookmarks: Magnet3D[] };

export function Preview3DGallery() {
  // Los imanes de muestra se dibujan con canvas (client-only) → se generan al montar, no en SSR.
  const [s, setSamples] = useState<Samples | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canvas es client-only, se genera una vez al montar
    setSamples({
      magnets: Array.from({ length: 6 }, (_, i) => photoMagnet(i)),
      letters: [
        letterMagnet("M", "#E85B9F"),
        letterMagnet("I", "#F58A6F"),
        letterMagnet("A", "#FFD93D"),
      ],
      bookmarks: [photoMagnet(2, 260, 380), photoMagnet(4, 260, 380)],
    });
  }, []);
  const magnets = s?.magnets ?? null;
  const letters = s?.letters ?? null;
  const bookmarks = s?.bookmarks ?? null;

  const scenes: Array<{ title: string; node: React.ReactNode }> = [
    {
      title: "Nevera (fotoimanes)",
      node: magnets ? <FridgeView3D magnets={magnets} cols={3} /> : null,
    },
    {
      title: "Tablero (nombre)",
      node: letters ? <RoomBoardView3D magnets={letters} cols={3} style="memo" /> : null,
    },
    {
      title: "Libro (separadores)",
      node: bookmarks ? <BookView3D bookmarks={bookmarks} /> : null,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gap: 20,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        maxWidth: 1280,
        margin: "0 auto",
      }}
    >
      {scenes.map((s) => (
        <section
          key={s.title}
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid rgba(124,106,173,0.18)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 14px", fontSize: 14, fontWeight: 700, color: "#3D2E5C" }}>
            {s.title}
          </div>
          <div style={{ height: 460, background: "#FFF8F0" }}>{s.node}</div>
        </section>
      ))}
    </div>
  );
}
