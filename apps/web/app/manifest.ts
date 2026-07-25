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
import { isCatalogMode } from "@/lib/store-mode";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lucams_shop — Tus recuerdos en imán",
    short_name: "Lucams_shop",
    // Etapa 1 (modo catálogo): sin checkout de pago ni envío calculado — la descripción
    // instalable no puede prometerlos. Derivada del flag, no hardcodeada, para que el
    // texto transaccional vuelva solo al activar el modo full.
    description: isCatalogMode()
      ? "E-commerce colombiano de imanes magnéticos personalizados. Estudio de personalización y cotización por WhatsApp: acordamos pago y envío contigo."
      : "E-commerce colombiano de imanes magnéticos personalizados. Estudio de personalización, pago en línea seguro y envío a 1.100+ destinos.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF8F0",
    theme_color: "#7C6AAD",
    lang: "es-CO",
    orientation: "portrait",
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
