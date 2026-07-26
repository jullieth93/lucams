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
 * Content-Security-Policy. En prod/preview: nonce para scripts inline (sin 'unsafe-inline')
 * + 'self' para los chunks de Next. En dev: 'unsafe-inline'/'unsafe-eval' porque el dev
 * server de Next inyecta HMR/overlay que con nonce se romperían.
 *
 * Ola 18 fix (auditoría 2026-07-26): se retira 'strict-dynamic'. Con strict-dynamic la
 * allowlist de hosts ('self') queda INERTE (comportamiento CSP3) y SOLO corren scripts
 * con trust de nonce — los chunks lazy de Next (editores de sets vocales/abecedario,
 * formulario de login, partes del admin) se cargan sin ese trust y el navegador los
 * BLOQUEABA (consola: "violates CSP directive script-src ... 'strict-dynamic'"),
 * rompiendo la hidratación de esas páginas en producción. Con 'self' + nonce los chunks
 * de Next cargan y los inline siguen exigiendo nonce: la postura sigue siendo fuerte
 * (sin unsafe-inline ni unsafe-eval).
 */
export function buildCsp(nonce: string, isProd: boolean): string {
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com https://checkout.wompi.co`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://checkout.wompi.co";
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.supabase.co https://*.coordinadora.com",
    "font-src 'self' https://fonts.gstatic.com",
    // Solo hosts que el NAVEGADOR contacta: Supabase (auth/storage/realtime) + Wompi (widget/checkout).
    // El envío (Aveonline) y la IA (Gemini) se llaman SERVER-SIDE → no van en connect-src. Se retiran
    // api.venndelo.com y api.anthropic.com (muertos: ni el operador ni el proveedor de IA reales).
    "connect-src 'self' https://*.supabase.co https://api.wompi.co",
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
    "https://lucamsshop.com",
    "https://www.lucamsshop.com",
    // Deployments de Vercel de ESTE equipo (ADR-062). El sufijo del scope del equipo
    // (`-jullieth93s-projects`) es OBLIGATORIO en las URLs de preview: antes era opcional, así que
    // `lucams-shop-<algo>.vercel.app` (sin scope) matcheaba → cualquiera podía registrar un proyecto
    // Vercel con ese nombre y recibir ACAO. El alias de producción `lucams-shop.vercel.app` (sin
    // scope) sigue permitido porque solo lo puede reclamar el dueño del proyecto.
    /^https:\/\/lucams-shop(-[a-z0-9][a-z0-9-]*-jullieth93s-projects)?\.vercel\.app$/,
    // Dev: cualquier puerto de localhost. Estaba fijo en :3000, pero el dev server de este repo
    // corre en :4000 (Makefile) → el origen real de desarrollo NO estaba en la allowlist. Fijar un
    // puerto es una trampa recurrente; en dev el host ya es la garantía, el puerto no aporta nada.
    // NUNCA en producción: ahí `isDev` es false y localhost queda fuera (cubierto por test).
    ...(isDev ? [/^http:\/\/localhost:\d{1,5}$/] : []),
  ];
}

/** ¿El origen está en la allowlist? (CORS — solo estos orígenes reciben ACAO). */
export function isOriginAllowed(origin: string, isDev: boolean): boolean {
  return getAllowedOrigins(isDev).some((o) =>
    typeof o === "string" ? o === origin : o.test(origin),
  );
}
