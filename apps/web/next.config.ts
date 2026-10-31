import type { NextConfig } from "next";

// Badge de versión del footer: en Vercel usamos el sha del commit
// (VERCEL_GIT_COMMIT_SHA, inyectado por la plataforma en build); en CI u otro
// ambiente se puede setear NEXT_PUBLIC_BUILD_VERSION explícita. En local no
// hay ninguna de las dos → no se expone la variable y el footer no renderiza
// badge (evita el "vdev" sin sentido).
const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA;
// El badge es una herramienta de soporte/depuración: solo se expone fuera de
// producción (VERCEL_ENV=production lo oculta; local/preview lo muestran).
const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.VERCEL_ENV ?? "development";

const nextConfig: NextConfig = {
  env: {
    ...(buildVersion ? { NEXT_PUBLIC_BUILD_VERSION: buildVersion } : {}),
    NEXT_PUBLIC_APP_ENV: appEnv,
  },
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
    // Next 16 bloquea por default que el optimizer fetchee IPs privadas/loopback
    // (guard SSRF — breaking change, ver docs upgrading/version-16). En dev el
    // stack local de Supabase Storage vive en 127.0.0.1/localhost/IP-LAN: sin
    // este flag TODAS las imágenes de storage devuelven 400 en local. Se activa
    // solo fuera de producción; en Vercel el optimizer solo fetchea supabase.co
    // (IP pública) y el guard queda intacto.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    // ADR-135 (2026-10-09): el default de Next 16 es 4h (14400s). Las imágenes
    // del catálogo/galería viven en paths con UUID (cada upload = objeto nuevo,
    // la URL es efectivamente inmutable), así que el TTL largo no tiene costo
    // de staleness y cada MISS evita un fetch + re-encode del optimizer en
    // serverless (medido en el incidente 2026-10-08: imágenes LCP compitiendo
    // con el JS en móvil 4G).
    minimumCacheTTL: 604_800, // 7 días
    remotePatterns: [
      {
        protocol: "https",
        hostname: "zxkucphbsfygakgxcnik.supabase.co",
        pathname: "/storage/v1/object/public/product-images/**",
      },
      {
        // Mediateca CMS (roadmap B5) — imágenes administrables del sitio
        // (banners, hero, logos). Bucket `cms-media` público.
        protocol: "https",
        hostname: "zxkucphbsfygakgxcnik.supabase.co",
        pathname: "/storage/v1/object/public/cms-media/**",
      },
      {
        // Supabase STG (lucams-stg) — mismos buckets públicos que prod.
        // LUC-SEC-001 (2026-10-30): `design-previews` ya NO es público — los
        // previews de diseños salen por el handler same-origin
        // /api/design-preview/* (no requiere remotePatterns).
        protocol: "https",
        hostname: "mjbdiqdkykhsixvqlrrp.supabase.co",
        pathname: "/storage/v1/object/public/{product-images,cms-media}/**",
      },
      {
        // Stack LOCAL de Supabase (dev diario): la API Kong escucha en :54321.
        // (Los previews de diseños van por /api/design-preview/* same-origin
        // desde LUC-SEC-001 — ya no necesitan patrón acá.)
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/{product-images,cms-media}/**",
      },
      {
        // Mismo stack local vía nombre (algunos flujos generan URLs con localhost).
        protocol: "http",
        hostname: "localhost",
        port: "54321",
        pathname: "/storage/v1/object/public/{product-images,cms-media}/**",
      },
      {
        // Mismo stack local vía IP LAN de la VM (navegación desde otros dispositivos
        // — la URL pública del stack usa la IP desde 2026-08-02). Si la VM cambia de
        // IP, actualizar esta entrada y NEXT_PUBLIC_SUPABASE_URL en .env.local.
        protocol: "http",
        hostname: "192.168.20.180",
        port: "54321",
        pathname: "/storage/v1/object/public/{product-images,cms-media}/**",
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
  // LUC-SEC-006 (auditoría 2026-10-30) — el 50 MB cubría un flujo MUERTO (los
  // PNG de producción ya van por tickets firmados directo a Storage, ADR-081).
  // Inventario REAL por action (tope de su propia validación):
  //   - uploadGalleryImageAction (admin): ≤2 masters × 15 MB = 30 MB (strip
  //     2-caras) — la EXCEPCIÓN que fija el global. Autenticada + role-gated
  //     (MANAGER_UP), sin superficie anónima.
  //   - finalizeDesignAction: preview ≤8 MB + slot inline ≤20 MB (name-editor)
  //     = 28 MB tope de validación (observado PRD: ~1 MB).
  //   - uploadDesignPreviewPagesAction: ≤24 páginas × 1 MB = 24 MB (cap por
  //     página bajado de 2 MB: 2× el máximo observado en PRD, 0.49 MB).
  //   - uploadProductImagesAction (admin): lotes de ≤4 × 5 MB = 20 MB
  //     (chunked en el cliente desde LUC-SEC-006).
  //   - uploadDesignAssetAction: 1 foto ≤10 MB + overhead multipart.
  //   - saveCanvasAction y demás: JSON ≤2 MB.
  // Global = 32 MB: la excepción de galería (30 MB) + overhead. Bajar más exige
  // partir la subida de masters 2-caras en dos llamadas — diferido, documentado.
  //
  // POR QUÉ FormData en finalize en vez de dataURL JSON:
  //   - React Flight protocol (Server Actions wire format) tiene un límite
  //     de profundidad de array (~20 niveles). Strings base64 grandes los
  //     chunkea internamente y dispara "Maximum array nesting exceeded".
  //   - FormData con Blob bypassea el JSON serializer — bytes raw vía
  //     multipart. Sin límite de "array nesting", solo de body size.
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
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
