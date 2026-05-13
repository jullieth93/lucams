/*
 * manifest.json — Web App Manifest (PWA básica).
 *
 * Permite que Android/iOS muestren "Agregar a pantalla principal" con
 * icono kawaii Lucams + colores brand. No estamos haciendo PWA
 * completa (sin service worker, sin offline) — solo manifest para
 * SEO/UX nativo y para mejorar Lighthouse PWA score.
 *
 * Ref: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
 */

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lucams_shop — Tus recuerdos en imán",
    short_name: "Lucams_shop",
    description:
      "E-commerce colombiano de imanes magnéticos personalizados. Estudio de personalización, pago contraentrega y envío a 1.100+ destinos.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF8F0",
    theme_color: "#7C6AAD",
    lang: "es-CO",
    orientation: "portrait",
    icons: [
      {
        src: "/brand/lucams-logo.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/lucams-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/lucams-logo.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["shopping", "lifestyle"],
  };
}
