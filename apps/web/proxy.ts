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
 *   5. Auth gate `/admin/*`: redirige anónimos a /admin/login (la verificación
 *      de fila AdminUser activa la hacen las pages con getCurrentAdmin()).
 *   6. Idle-timeout admin (A7): 30 min sin actividad → limpia sesión + re-login.
 *
 * NO se hace acá:
 *   - Rate limit — vive en `lib/rate-limit.ts` (ADR-016), aplicado en las actions.
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
import {
  ADMIN_ACTIVITY_COOKIE,
  ADMIN_IDLE_LIMIT_MS,
  adminActivityCookieOptions,
  readAdminActivityMark,
  sealAdminActivityMark,
} from "@/lib/admin-activity";
import { buildCsp, isOriginAllowed, SECURITY_HEADERS } from "@/lib/security-headers";
import { incrementRedirectHit, lookupActiveRedirect } from "@/features/redirects/service";

// Cache in-memory para UrlRedirect lookups: evita hit DB en cada request.
// TTL 60s — Lucy cambia un redirect y se ve aplicado en < 1min. Trade-off
// aceptable vs latencia: con tráfico real, sin cache esto serían N requests
// DB por minuto solo para misses (la mayoría de paths NO tienen redirect).
type RedirectCacheEntry = {
  value: { toPath: string; statusCode: number } | null;
  expiresAt: number;
};
const redirectCache = new Map<string, RedirectCacheEntry>();
const REDIRECT_CACHE_TTL_MS = 60_000;

async function getRedirectWithCache(
  path: string,
): Promise<{ toPath: string; statusCode: number } | null> {
  const cached = redirectCache.get(path);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const result = await lookupActiveRedirect(path).catch(() => null);
  redirectCache.set(path, { value: result, expiresAt: now + REDIRECT_CACHE_TTL_MS });
  return result;
}

// #30 — preserva el query entrante (UTM de campañas: link viejo de la bio de Instagram) al
// redirigir. Las claves que el destino YA define ganan (p. ej. el ?variant= de PRODUCT_REDIRECTS).
// Solo se aplica a destinos internos/relativos (no filtramos UTM internos a hosts externos).
function preserveIncomingQuery(target: URL, incoming: URLSearchParams): URL {
  const owned = new Set(target.searchParams.keys());
  incoming.forEach((value, key) => {
    if (!owned.has(key)) target.searchParams.append(key, value);
  });
  return target;
}

// SECURITY_HEADERS, buildCsp e isOriginAllowed viven en lib/security-headers.ts (puros, testeados).

// `upgrade-insecure-requests` (dentro de buildCsp) solo en prod/preview (Vercel sirve HTTPS). En
// dev local servimos por HTTP plano → incluirlo rompería los recursos. isDev alimenta la allowlist
// CORS (localhost solo en dev).
const IS_PROD_DEPLOY =
  process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
const IS_DEV = process.env.NODE_ENV === "development";

// A-5 (auditoría 2026-08-24): los early returns (redirects 3xx, 403 de CORS) también
// llevan X-Request-Id + SECURITY_HEADERS — antes salían pelados porque los headers
// solo se seteaban sobre `response` al final del flujo. La CSP se agrega aparte SOLO
// al 403 (tiene body renderizable); los redirects 3xx sin body no la necesitan.
function withSecurityHeaders(res: NextResponse, requestId: string): NextResponse {
  res.headers.set("X-Request-Id", requestId);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

// CSP por nonce (C3, Lucy 2026-06-27). script-src usa nonce + 'self' (Ola 18 fix,
// auditoría 2026-07-26: se retiró 'strict-dynamic' porque bloqueaba los chunks lazy
// de Next — editores de sets, login, admin — ver lib/security-headers.ts): los
// scripts inline exigen el nonce y los chunks de Next cargan por 'self'. style-src
// mantiene 'unsafe-inline' a propósito: los atributos style="" inline NO aceptan nonce
// (el nonce solo aplica a elementos <style>/<script>) y removerlo rompería toda
// la UI. 'unsafe-eval' solo en dev (HMR + stacks de React); en prod no se usa.
// Guía oficial: node_modules/next/.../guides/content-security-policy.md
export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const origin = request.headers.get("origin");

  // CSP por nonce (C3): un nonce nuevo por request. Se inyecta en los request
  // headers (x-nonce + Content-Security-Policy) para que Next lo aplique a sus
  // scripts durante el SSR, y en el response header para el browser. Helper que
  // clona los headers ACTUALES del request (incluye cookies ya refrescadas por
  // Supabase) + agrega el nonce.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspValue = buildCsp(nonce, IS_PROD_DEPLOY);
  const nextWithNonce = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", cspValue);
    // Pathname autoritativo para los server components (el layout admin lo usa para el
    // guard RBAC canAccessAdminPath). Se SETea desde el servidor → sobrescribe cualquier
    // x-pathname que envíe el cliente (no spoofeable).
    headers.set("x-pathname", path);
    return NextResponse.next({ request: { headers } });
  };

  // M.3.b.CAT.8 — Redirects 301 de slugs legacy (productos archivados al
  // consolidar familias) hacia el producto base + variant pre-seleccionado.
  // Mapa generado por make consolidate-product-families.
  if (path.startsWith("/producto/")) {
    const slug = path.slice("/producto/".length).split("/")[0];
    const target = PRODUCT_REDIRECTS[slug];
    if (target) {
      // target ya viene como "base-slug?variant=v_id"; #30 preserva UTM entrantes.
      const targetUrl = preserveIncomingQuery(
        new URL(`/producto/${target}`, request.url),
        request.nextUrl.searchParams,
      );
      return withSecurityHeaders(NextResponse.redirect(targetUrl, 301), requestId);
    }
  }

  // Sub-fase C.3 — UrlRedirect admin-managed (301/302 dinámicos).
  // Solo se consulta para GET de páginas (no API, no assets) para evitar
  // overhead en requests irrelevantes.
  if (
    !isApi &&
    !path.startsWith("/_next/") &&
    !path.startsWith("/admin/") &&
    request.method === "GET"
  ) {
    // #29 — el match de fromPath es case-insensitive: se normaliza a minúsculas en la escritura
    // (createRedirect), así que la llave del lookup y del hit también se normaliza acá.
    const redirectPath = path.toLowerCase();
    const dynamicRedirect = await getRedirectWithCache(redirectPath);
    if (dynamicRedirect) {
      // Incremento de hit count en background (no espera). Si falla, se ignora.
      void incrementRedirectHit(redirectPath);
      const isAbsolute = /^https?:\/\//i.test(dynamicRedirect.toPath);
      const targetUrl = isAbsolute
        ? dynamicRedirect.toPath
        : // #30 — preserva UTM entrantes solo para destinos internos.
          preserveIncomingQuery(
            new URL(dynamicRedirect.toPath, request.url),
            request.nextUrl.searchParams,
          );
      return withSecurityHeaders(
        NextResponse.redirect(targetUrl, dynamicRedirect.statusCode),
        requestId,
      );
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
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/maintenance", request.url)),
      requestId,
    );
  }

  if (isApi && origin && !isOriginAllowed(origin, IS_DEV)) {
    // El 403 SÍ lleva CSP (tiene body "Forbidden" renderizable) — A-5.
    const forbidden = withSecurityHeaders(
      new NextResponse("Forbidden", { status: 403 }),
      requestId,
    );
    forbidden.headers.set("Content-Security-Policy", cspValue);
    return forbidden;
  }

  let response = nextWithNonce();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // B-2 (auditoría 2026-08-24): `Secure` explícito en despliegues HTTPS
      // (prod/preview) — sin él, la cookie sb-* viajaría por HTTP plano en el
      // primer contacto pre-HSTS. `httpOnly` queda en false (default del
      // paquete, no sobreescribible aquí sin romper el browser client): el
      // cliente del navegador lee la sesión desde document.cookie (reto MFA,
      // lib/supabase/browser.ts) — la exposición a XSS la mitiga la CSP por
      // nonce de arriba, no httpOnly.
      cookieOptions: { secure: IS_PROD_DEPLOY, sameSite: "lax" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = nextWithNonce();
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
    return withSecurityHeaders(NextResponse.redirect(redirectUrl), requestId);
  }

  // Idle-timeout admin (A7 · ADR-062 P1 · plan de producción): si pasaron >30 min
  // sin actividad —O la marca está AUSENTE o con FIRMA INVÁLIDA— limpiamos las
  // cookies de sesión Supabase (sb-*) + la marca y forzamos re-login. La marca la
  // SELLA la acción de login al autenticarse (lib/admin-activity) y va firmada con
  // HMAC (B-8): una request admin autenticada sin marca —o con una marca forjada,
  // p. ej. `admin_last_activity=<now>` fabricado con cookies robadas— se trata
  // como stale (cierra el hueco de "ausente = primera visita" y el de marca no
  // firmada). Ventana deslizante: en cada request admin renovamos la marca.
  if (isAdminPath && user) {
    const last = readAdminActivityMark(request.cookies.get(ADMIN_ACTIVITY_COOKIE)?.value);
    const now = Date.now();
    if (!last || now - last > ADMIN_IDLE_LIMIT_MS) {
      // B-8: además de borrar cookies en el browser, revocamos el refresh token
      // server-side (scope global = todas las sesiones del user en GoTrue).
      // Best-effort: si el Auth server falla, el borrado local igual se hace.
      await supabase.auth.signOut({ scope: "global" }).catch(() => {});
      const url = new URL("/admin/login", request.url);
      url.searchParams.set("expired", "1");
      const expired = withSecurityHeaders(NextResponse.redirect(url), requestId);
      for (const c of request.cookies.getAll()) {
        if (c.name.startsWith("sb-")) expired.cookies.delete(c.name);
      }
      expired.cookies.delete(ADMIN_ACTIVITY_COOKIE);
      return expired;
    }
    response.cookies.set(
      ADMIN_ACTIVITY_COOKIE,
      sealAdminActivityMark(now),
      adminActivityCookieOptions(),
    );
  }

  withSecurityHeaders(response, requestId);
  response.headers.set("Content-Security-Policy", cspValue);

  if (isApi && origin && isOriginAllowed(origin, IS_DEV)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }

  // Nota: ya NO borramos la marca al entrar a /admin/login. La marca la sella la
  // acción de login (seg. abajo), que sobrescribe cualquier valor viejo con `now` —
  // así una sesión nueva arranca fresca sin heredar un timestamp previo, y una marca
  // ausente en un path admin autenticado se interpreta como manipulada (no "nueva").

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)",
  ],
};
