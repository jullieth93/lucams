/*
 * OG image global (#26) — reemplaza el og-image.png que era una copia 468×468 del logo declarada
 * como 1200×630. Generada con next/og (versionada, sin bloquear en arte): fondo crema de marca +
 * logo embebido + claim. Se sirve como PNG 1200×630 real en /opengraph-image.
 *
 * El convention opengraph-image aplica a este segmento y todos sus descendientes, así que las
 * landings (/ocasion, /productos/[cat]/[sub], PDP) la heredan vía `parent.openGraph.images`.
 */

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "Lucams_shop — Tus recuerdos en imán";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public/brand/lucams-logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFF8F0",
        gap: 36,
      }}
    >
      <img src={logoSrc} width={280} height={280} alt="" />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 68, fontWeight: 700, color: "#3D2E5C" }}>Lucams_shop</div>
        <div style={{ fontSize: 40, color: "#7C6AAD" }}>Tus recuerdos en imán</div>
      </div>
    </div>,
    { ...size },
  );
}
