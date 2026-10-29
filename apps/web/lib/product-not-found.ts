/*
 * Página 404 estática de marca para /producto/<slug> inexistente, servida
 * desde el proxy (SEO-001, auditoría SEO 2026-10-28).
 *
 * Por qué existe: el segmento PDP tiene loading.tsx, así que Next confirma el
 * shell con 200 antes de que notFound() resuelva (streaming) y la PDP
 * inexistente salía como soft 404 (200 + noindex — verificado en producción).
 * El proxy decide el 404 ANTES del render consultando el set cacheado de
 * slugs vivos (getStorefrontProductSlugSet, tag "catalog").
 *
 * Es HTML autocontenido (inline, sin CSS/JS del bundle): el proxy no puede
 * renderizar el not-found.tsx de la app. Mantiene los colores de marca y el
 * mensaje en español; Google solo necesita el status 404.
 */

import { NextResponse } from "next/server";

const PRODUCT_404_HTML = `<!doctype html>
<html lang="es-CO">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Producto no encontrado · Lucams Shop</title>
  </head>
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff8f0;font-family:system-ui,sans-serif;color:#3d2e5c;text-align:center;padding:2rem">
    <main>
      <img src="/brand/lucams-logo.png" alt="Lucams Shop" width="120" height="120" style="border-radius:1.5rem" />
      <h1 style="font-size:1.75rem;margin:1.5rem 0 0.5rem">Este producto ya no está disponible 👀</h1>
      <p style="color:#3d2e5caa;max-width:26rem;margin:0 auto 1.5rem">
        Probablemente lo movimos de lugar o el link tiene un typo. Te ayudamos a volver:
      </p>
      <a href="/productos" style="display:inline-block;background:#7c6aad;color:#fff;text-decoration:none;font-weight:600;padding:0.75rem 1.75rem;border-radius:9999px">
        Ver catálogo →
      </a>
    </main>
  </body>
</html>`;

export function productNotFoundResponse(): NextResponse {
  return new NextResponse(PRODUCT_404_HTML, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // No cachear: el set de slugs vivos cambia con cada alta de producto.
      "cache-control": "no-store",
    },
  });
}
