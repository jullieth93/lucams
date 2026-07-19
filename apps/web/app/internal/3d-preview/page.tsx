/*
 * Preview de las escenas 3D del Estudio (dev-only) — herramienta de iteración del pase de realismo
 * (FB5). NUNCA en un deploy Vercel (VERCEL_ENV definido) — mismo patrón que /internal/correos y
 * /internal/plantilla-preview (ADR-048). noindex.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Preview3DGallery } from "./gallery";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Preview3DPage() {
  if (process.env.VERCEL_ENV) notFound();
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#FFF8F0",
        minHeight: "100vh",
        padding: "24px 20px 64px",
        color: "#3D2E5C",
      }}
    >
      <header style={{ maxWidth: 1280, margin: "0 auto 20px" }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, opacity: 0.6, margin: 0 }}>
          HERRAMIENTA INTERNA · SOLO DEV
        </p>
        <h1 style={{ fontSize: 26, margin: "4px 0 4px" }}>🧊 Preview de escenas 3D</h1>
        <p style={{ fontSize: 14, opacity: 0.8, margin: 0 }}>
          Las 3 escenas con imanes de muestra, para iterar el realismo (FB5) y capturar con
          Chromium.
        </p>
      </header>
      <Preview3DGallery />
    </main>
  );
}
