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
import { SITE_NAME, SITE_TITLE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_TITLE,
    short_name: SITE_NAME,
    description:
      "E-commerce colombiano de imanes magnéticos personalizados. Estudio de personalización, pago en línea seguro y envío a 1.100+ destinos.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF8F0",
    theme_color: "#7C6AAD",
    lang: "es-CO",
    // Sin `orientation` (= "any"): la tienda se usa también en horizontal
    // (escenas 3D, Estudio en tablet) — declarar "portrait" bloquearía la
    // rotación cuando se instala como app (decisión 2026-11-03).
    // #31 — íconos con dimensiones REALES (antes el mismo PNG 468×468 se declaraba como 192 y 512).
    // La variante maskable lleva el logo a ~80% centrado sobre lavanda #7C6AAD (safe-zone) para que
    // Android no recorte la insignia al aplicar la máscara.
    icons: [
      {
        src: "/icons/lucams-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/lucams-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/lucams-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["shopping", "lifestyle"],
  };
}
