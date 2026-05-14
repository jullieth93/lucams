import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite que el dev server acepte requests HMR / dev-resources desde
  // hosts distintos a localhost. Necesario cuando se navega a la app
  // por la IP LAN de la VM (192.168.x.x) en lugar de localhost — Next 16
  // bloquea esos accesos por default por seguridad. Esta lista NO aplica
  // en producción (Vercel no usa next dev).
  allowedDevOrigins: ["192.168.20.180", "localhost", "127.0.0.1"],

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
  // `serverActions.bodySizeLimit` de 4 MB (Next 15) a 1 MB. El Estudio
  // del Personalización envía `saveCanvasAction` con canvasData V2 que
  // incluye unitTemplate (~5-10 KB), slots[] con signed URLs Supabase
  // (~600 bytes/slot con token JWT), gridLayout + metadata. Para 20 slots
  // (calendarios con 12 fotos × 1 mes) + cambios de plantilla acumulados
  // puede acercarse al límite. Subimos a 10 MB para holgura.
  //
  // `finalizeDesignAction` (N PNGs 300 DPI base64) tiene su propio cap
  // en Zod schema (productionDataUrls total ≤ 120 MB) pero NO pasa por
  // este límite porque el productionDataUrl se compone client-side y se
  // envía via FormData de uploadDesignAssetAction (NO Server Action JSON).
  //
  // Defense in depth: Zod en SaveCanvasSchema limita el JSON deserializado
  // a 1 MB (validación tipo-safe post-parse). Body limit 10 MB es solo
  // para evitar 413 antes del parse — el límite real lo aplica Zod.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
