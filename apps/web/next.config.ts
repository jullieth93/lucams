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
        protocol: "https",
        hostname: "images.unsplash.com",
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

  // ADR-057 Fase A1b — @napi-rs/canvas es un módulo NATIVO (binario precompilado): debe
  // resolverse en runtime, no bundlearse por el compilador.
  serverExternalPackages: ["@napi-rs/canvas"],

  // ADR-057 Fase A1b — el render de producción server-side (finalizeDesign) registra las
  // fuentes de marca desde assets/fonts/ vía fs. Hay que incluirlas en el bundle serverless
  // de Vercel para que estén disponibles en runtime (si faltan, el render cae al PNG del
  // cliente por el fallback — no rompe, pero el texto no se renderiza server-side).
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/**"],
  },
};

export default nextConfig;
