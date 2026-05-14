/*
 * Proxy (middleware) — punto de entrada para TODA request HTTP que llegue a la app.
 *
 * Next.js 16 renombró `middleware.ts` → `proxy.ts` y restringe el runtime a
 * Node.js (edge ya no soportado en proxy). Documentado en
 * `apps/web/node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
 * y en ADR-024.
 *
 * Responsabilidades en orden:
 *   1. Generar `X-Request-Id` (UUID v4) y exponerlo en response para correlación.
 *   2. Refrescar la sesión Supabase si está cerca de expirar — el patrón
 *      `getAll/setAll` del @supabase/ssr garantiza que las nuevas cookies se
 *      escriben en la response. Sin esto, las sesiones SSR mueren prematuramente.
 *   3. CORS estricto en `/api/*`: bloquea orígenes no listados.
 *   4. Security headers (HSTS, X-Frame-Options, CSP, etc.) — ver
 *      docs/SECURITY.md § Headers de seguridad.
 *
 * NO se hace acá:
 *   - Auth gate `/admin/*` — pendiente cuando exista la sección admin.
 *   - Rate limit — pendiente, vive en `lib/rate-limit.ts` (ADR-016).
 *   - CSRF — Server Actions de Next 16 son inmunes; API routes con cookies
 *     se protegen con `SameSite=Lax` por defecto.
 *
 * Referencias:
 *   - Next.js 16 proxy: docs/upgrading/version-16.md § middleware to proxy
 *   - Supabase SSR session refresh: https://supabase.com/docs/guides/auth/server-side
 *   - docs/SECURITY.md § Headers de seguridad, § CORS
 *   - docs/CONVENTIONS.md § Request ID
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PRODUCT_REDIRECTS } from "@/lib/product-redirects";

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Permissions-Policy: deny capacidades por default. /estudio/* (Fase 3
  // editor canvas) podrá necesitar camera — se override allí.
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
  "X-DNS-Prefetch-Control": "on",
  // Cross-Origin isolation: COOP same-origin protege contra cross-window
  // attacks (window.opener exploits). CORP same-site previene cross-origin
  // resource leak. COEP credentialless permite imágenes Unsplash sin
  // crossorigin attr (vs require-corp que rompería el catálogo de fotos
  // hot-linked).
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
};

// `upgrade-insecure-requests` solo en producción/preview (donde Vercel
// sirve HTTPS). En dev local servimos por HTTP plano (localhost o IP
// LAN de la VM) — incluirlo rompería todos los recursos CSS/JS/font al
// forzar al browser a promoverlos a HTTPS que no existe.
const IS_PROD_DEPLOY =
  process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://checkout.wompi.co",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co https://*.coordinadora.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co https://api.venndelo.com https://api.anthropic.com https://api.wompi.co",
  "frame-src 'self' https://challenges.cloudflare.com https://checkout.wompi.co",
  "form-action 'self' https://checkout.wompi.co",
  "base-uri 'self'",
  "object-src 'none'",
  ...(IS_PROD_DEPLOY ? ["upgrade-insecure-requests"] : []),
].join("; ");

const ALLOWED_ORIGINS: (string | RegExp)[] = [
  "https://lucamsshop.co",
  "https://www.lucamsshop.co",
  /^https:\/\/lucams-shop(-[a-z0-9]+)?(-jullieth93s-projects)?\.vercel\.app$/,
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000"] : []),
];

function isOriginAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.some((o) => (typeof o === "string" ? o === origin : o.test(origin)));
}

export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const origin = request.headers.get("origin");

  // M.3.b.CAT.8 — Redirects 301 de slugs legacy (productos archivados al
  // consolidar familias) hacia el producto base + variant pre-seleccionado.
  // Mapa generado por make consolidate-product-families.
  if (path.startsWith("/producto/")) {
    const slug = path.slice("/producto/".length).split("/")[0];
    const target = PRODUCT_REDIRECTS[slug];
    if (target) {
      // target ya viene como "base-slug?variant=v_id"
      const targetUrl = new URL(`/producto/${target}`, request.url);
      return NextResponse.redirect(targetUrl, 301);
    }
  }

  // Maintenance gate: env flag NEXT_PUBLIC_MAINTENANCE_MODE=1 redirige
  // todo el tráfico público a /maintenance. Excepciones:
  //  - /maintenance (la misma página)
  //  - /admin/* (admins pueden seguir trabajando)
  //  - /api/health/* (healthchecks externos siguen funcionando)
  //  - /_next assets (Next infrastructure)
  if (
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "1" &&
    !path.startsWith("/maintenance") &&
    !path.startsWith("/admin") &&
    !path.startsWith("/api/health") &&
    !path.startsWith("/_next")
  ) {
    return NextResponse.redirect(new URL("/maintenance", request.url));
  }

  if (isApi && origin && !isOriginAllowed(origin)) {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: { "X-Request-Id": requestId },
    });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate /admin/* — requiere sesión Supabase. La verificación adicional
  // de que el user efectivamente tiene fila AdminUser activa la hacemos
  // en las pages (`getCurrentAdmin()`), porque no podemos correr Prisma
  // dentro del proxy (Edge-runtime safe). Acá solo nos aseguramos de
  // que NO se sirvan páginas admin a anónimos.
  //
  // Excepción: /admin/login es público (es donde el user se autentica).
  const isAdminPath = path.startsWith("/admin") && !path.startsWith("/admin/login");
  if (isAdminPath && !user) {
    const redirectUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  response.headers.set("X-Request-Id", requestId);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(k, v);
  }
  response.headers.set("Content-Security-Policy", CSP);

  if (isApi && origin && isOriginAllowed(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)",
  ],
};
