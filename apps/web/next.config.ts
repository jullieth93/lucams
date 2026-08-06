import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite que el dev server acepte requests HMR / dev-resources desde
  // hosts distintos a localhost. Necesario cuando se navega a la app
  // por la IP LAN de la VM (192.168.x.x) o por el dev domain ngrok en
  // lugar de localhost — Next 16 bloquea esos accesos por default por
  // seguridad. Esta lista NO aplica en producción (Vercel no usa next dev).
  allowedDevOrigins: [
    "192.168.20.180",
    "localhost",
    "127.0.0.1",
    "kebab-late-batting.ngrok-free.dev",
  ],

  // Optimización de imágenes remotas. Next 16 requiere `remotePatterns`
  // (deprecated `domains`). Permitimos:
  //   - Supabase Storage bucket público product-images (fotos uploaded
  //     vía admin UI cuando Lucy tenga material real).
  //   - Unsplash CDN (fotos demo hot-linked en seed-products.mjs hasta
  //     que Lucy reemplace por foto real).
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "zxkucphbsfygakgxcnik.supabase.co",
        pathname: "/storage/v1/object/public/product-images/**",
      },
      {
        // Estudio M.3.b — preview compositado del grid (multi-slot snapshot)
        // visible en cart/order para que el cliente vea su diseño final.
        // Bucket `design-previews` es público (no signed URL).
        protocol: "https",
        hostname: "zxkucphbsfygakgxcnik.supabase.co",
        pathname: "/storage/v1/object/public/design-previews/**",
      },
      {
        // Mediateca CMS (roadmap B5) — imágenes administrables del sitio
        // (banners, hero, logos). Bucket `cms-media` público.
        protocol: "https",
        hostname: "zxkucphbsfygakgxcnik.supabase.co",
        pathname: "/storage/v1/object/public/cms-media/**",
      },
      {
        // Supabase STG (lucams-stg) — mismos buckets públicos que prod, para que
        // los previews muestren previews del diseño/imágenes (antes: optimizer 400
        // en /carrito y /checkout, verificación E2E 2026-08-05).
        protocol: "https",
        hostname: "mjbdiqdkykhsixvqlrrp.supabase.co",
        pathname: "/storage/v1/object/public/{product-images,design-previews,cms-media}/**",
      },
      {
        // Stack LOCAL de Supabase (dev diario): la API Kong escucha en :54321.
        // Sin esto, next/image rechazaba los previews del diseño y /carrito moría
        // con HTTP 500 en local (verificación E2E 2026-08-05).
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/{product-images,design-previews,cms-media}/**",
      },
      {
        // Mismo stack local vía nombre (algunos flujos generan URLs con localhost).
        protocol: "http",
        hostname: "localhost",
        port: "54321",
        pathname: "/storage/v1/object/public/{product-images,design-previews,cms-media}/**",
      },
      {
        // Mismo stack local vía IP LAN de la VM (navegación desde otros dispositivos
        // — la URL pública del stack usa la IP desde 2026-08-02). Si la VM cambia de
        // IP, actualizar esta entrada y NEXT_PUBLIC_SUPABASE_URL en .env.local.
        protocol: "http",
        hostname: "192.168.20.180",
        port: "54321",
        pathname: "/storage/v1/object/public/{product-images,design-previews,cms-media}/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        // Placeholder de imágenes genéricas de tests/seeds (productos sin foto real aún).
        protocol: "https",
        hostname: "cdn.lucams.test",
      },
    ],
  },

  // M.3.b.fix (2026-05-13) — Next.js 16 redujo el default de
  // `serverActions.bodySizeLimit` de 4 MB (Next 15) a 1 MB.
  //
  // Casos que requieren headroom:
  //   - saveCanvasAction: canvasData V2 con slots[] + signed URLs Supabase
  //     ~600 B/slot. Hasta 20 slots (calendarios) + plantillas → ~50KB típico.
  //   - finalizeDesignAction (2026-05-21): refactor a FormData con blobs.
  //     Envía preview (~1-2 MB) + N production PNGs (~2-5 MB c/u). Para
  //     producto 6-slot promedio: ~18-30 MB total. Subimos a 50 MB para
  //     cubrir caso límite de 20 slots × 2-3 MB c/u (~40-60 MB).
  //
  // POR QUÉ FormData en finalize en vez de dataURL JSON:
  //   - React Flight protocol (Server Actions wire format) tiene un límite
  //     de profundidad de array (~20 niveles). Strings base64 grandes los
  //     chunkea internamente y dispara "Maximum array nesting exceeded".
  //   - FormData con Blob bypassea el JSON serializer — bytes raw vía
  //     multipart. Sin límite de "array nesting", solo de body size.
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },

  // ADR-057 Fase A1b — @napi-rs/canvas y sharp son módulos NATIVOS (binarios
  // precompilados): deben resolverse en runtime, no bundlearse por el compilador.
  // sharp requiere además su plataforma específica (@img/sharp-*) para funcionar
  // en el runtime serverless de Vercel.
  serverExternalPackages: ["@napi-rs/canvas", "sharp"],

  // ADR-057 Fase A1b — el render de producción server-side (finalizeDesign) registra las
  // fuentes de marca desde assets/fonts/ vía fs. Hay que incluirlas en el bundle serverless
  // de Vercel para que estén disponibles en runtime (si faltan, el render cae al PNG del
  // cliente por el fallback — no rompe, pero el texto no se renderiza server-side).
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/**"],
  },
};

export default nextConfig;
