/*
 * Helpers PUROS de cabeceras de seguridad (CSP, CORS allowlist) — extraídos de proxy.ts para
 * poder testearlos sin cargar el middleware entero (auditoría 2026-07-13). `isProd`/`isDev` van
 * como PARÁMETROS (no consts de módulo) → se pueden ejercitar ambas ramas.
 */

/** Cabeceras de seguridad estáticas aplicadas a toda respuesta. */
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Permissions-Policy: deny capacidades por default. /estudio/* podrá necesitar camera → override allí.
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
  "X-DNS-Prefetch-Control": "on",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
};

/**
 * Content-Security-Policy. En prod/preview: nonce + strict-dynamic (sin 'unsafe-inline' para
 * scripts). En dev: 'unsafe-inline'/'unsafe-eval' porque el dev server de Next inyecta HMR/overlay
 * que con nonce se romperían (el nonce se valida de verdad en un deploy prod-like).
 */
export function buildCsp(nonce: string, isProd: boolean): string {
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com https://checkout.wompi.co`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://checkout.wompi.co";
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.supabase.co https://*.coordinadora.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co https://api.venndelo.com https://api.anthropic.com https://api.wompi.co",
    "frame-src 'self' https://challenges.cloudflare.com https://checkout.wompi.co",
    "form-action 'self' https://checkout.wompi.co",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Allowlist de orígenes para CORS de las rutas API. */
export function getAllowedOrigins(isDev: boolean): (string | RegExp)[] {
  return [
    "https://lucamsshop.co",
    "https://www.lucamsshop.co",
    // Deployments de Vercel de ESTE equipo (ADR-062). El sufijo del scope del equipo
    // (`-jullieth93s-projects`) es OBLIGATORIO en las URLs de preview: antes era opcional, así que
    // `lucams-shop-<algo>.vercel.app` (sin scope) matcheaba → cualquiera podía registrar un proyecto
    // Vercel con ese nombre y recibir ACAO. El alias de producción `lucams-shop.vercel.app` (sin
    // scope) sigue permitido porque solo lo puede reclamar el dueño del proyecto.
    /^https:\/\/lucams-shop(-[a-z0-9][a-z0-9-]*-jullieth93s-projects)?\.vercel\.app$/,
    ...(isDev ? ["http://localhost:3000"] : []),
  ];
}

/** ¿El origen está en la allowlist? (CORS — solo estos orígenes reciben ACAO). */
export function isOriginAllowed(origin: string, isDev: boolean): boolean {
  return getAllowedOrigins(isDev).some((o) =>
    typeof o === "string" ? o === origin : o.test(origin),
  );
}
