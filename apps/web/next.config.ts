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
};

export default nextConfig;
