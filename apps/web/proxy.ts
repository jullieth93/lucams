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
 *      NO aplica a /api/* (los route handlers crean su propio cliente y SÍ
 *      pueden persistir cookies; refrescar acá también solo alimentaba la
 *      carrera del refresh token de un solo uso — 2026-10-22). Y el setAll
 *      ignora los BORRADOS de cookies sb-*-auth-token: la request que pierde
 *      una carrera de refresh recibe SIGNED_OUT y, sin ese filtro, su response
 *      borraba la sesión recién refrescada por la ganadora (logout fantasma).
 *   3. CORS estricto en `/api/*`: bloquea orígenes no listados.
 *   4. Security headers (HSTS, X-Frame-Options, CSP, etc.) — ver
 *      docs/SECURITY.md § Headers de seguridad.
 *   5. Auth gate `/admin/*`: redirige anónimos a /admin/login (la verificación
 *      de fila AdminUser activa la hacen las pages con getCurrentAdmin()).
 *   6. Idle-timeout admin (A7): 30 min sin actividad → limpia sesión + re-login.
 *      SOLO en navegación real: un prefetch RSC nunca revoca ni renueva la
 *      marca (ADR-162 — un prefetch de «PANEL ADMIN» con la marca vieja mataba
 *      la sesión entera del usuario, tienda incluida).
 *   7. Idle-timeout cliente (2026-10-12, refinado 2026-10-22): la sesión de
 *      cliente persiste 30 días renovándose con actividad (ventana deslizante,
 *      cookie firmada `customer_last_activity`); >30 días sin actividad o marca
 *      FORJADA → signOut global + borrado de sb-* + redirect a `/` (o
 *      /login?next= si la ruta requiere sesión). Marca AUSENTE con sesión
 *      válida (JWT ya verificado por getUser) → se re-sella, no se revoca.
 *      Prefetch excluido. Política completa en lib/customer-activity.ts.
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
import { productNotFoundResponse } from "@/lib/product-not-found";
import { getStorefrontProductSlugs } from "@/features/products/public-service";
import { logger } from "@/lib/logger";
import {
  ADMIN_ACTIVITY_COOKIE,
  ADMIN_IDLE_LIMIT_MS,
  adminActivityCookieOptions,
  readAdminActivityMark,
  sealAdminActivityMark,
} from "@/lib/admin-activity";
import { buildCsp, isOriginAllowed, SECURITY_HEADERS } from "@/lib/security-headers";
import {
  CUSTOMER_ACTIVITY_COOKIE,
  CUSTOMER_IDLE_LIMIT_MS,
  CUSTOMER_SESSION_REQUIRED_PREFIXES,
  customerActivityCookieOptions,
  inspectCustomerActivityMark,
  sealCustomerActivityMark,
} from "@/lib/customer-activity";
import { incrementRedirectHit, lookupActiveRedirectCached } from "@/features/redirects/service";

// Cookies de sesión de Supabase Auth (`sb-<ref>-auth-token[.N]`, chunked por
// tamaño). El setAll del proxy IGNORA sus borrados (valor vacío): la única vía
// que los produce acá es el SIGNED_OUT que dispara el cliente Auth cuando un
// refresh concurrente pierde la carrera del refresh token de un solo uso, y
// aplicarlo borraba la sesión recién refrescada por la request ganadora
// («logout fantasma» al recargar/navegar, 2026-10-22). Los cierres legítimos
// (logout explícito, idle-timeouts) borran por sus propias responses.
const AUTH_TOKEN_COOKIE_RE = /^sb-[^-]+-auth-token(\.\d+)?$/;

// B-8 (auditoría cableado cliente↔admin 2026-10-02): el lookup de UrlRedirect
// vive en lookupActiveRedirectCached (features/redirects/service.ts) —
// unstable_cache con tag "redirects" sobre la Data Cache COMPARTIDA de Next,
// en vez del Map in-memory TTL 60s por instancia que había acá (en Vercel
// multi-instancia las copias divergían hasta 60s). Las mutaciones admin
// emiten updateTag("redirects") → el redirect nuevo aplica de inmediato; el
// revalidate de 60s queda como red de seguridad para cambios por fuera de la
// app. El runtime del proxy en Next 16 es Node.js fijo (ver encabezado), así
// que unstable_cache funciona. Si la DB falla, .catch(() => null) deja pasar
// la request sin redirect (fallback de siempre: el sitio no se cae por un
// redirect que no resolvió).

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

// F-20 (pre-launch audit 2026-09-04): pin `Cache-Control: private, no-store` on private page
// GETs so the header does not depend on each route's rendering strategy — Next sends it on its
// own only for DYNAMIC pages, while a prerendered segment would go out with `s-maxage=31536000`
// (next/dist/docs/01-app/02-guides/cdn-caching.md). Only page GETs: POSTs to these paths are
// Server Actions and /api/* manages its own Cache-Control. RSC fetches for client navigations
// are GETs on the same path and take the same header — they feed the client router's in-memory
// cache, not the HTTP cache, so there is no interference with the RSC payload.
const PRIVATE_PAGE_PREFIXES = ["/mi-cuenta", "/checkout", "/admin"];

function isPrivatePageGet(method: string, path: string, isApi: boolean): boolean {
  return (
    method === "GET" &&
    !isApi &&
    PRIVATE_PAGE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
  );
}

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
    const dynamicRedirect = await lookupActiveRedirectCached(redirectPath).catch(() => null);
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

  // SEO-001 (auditoría SEO 2026-10-28) — 404 HTTP REAL para PDPs inexistentes.
  // El segmento /producto/[slug] tiene loading.tsx: Next confirma el shell con 200
  // antes de que el notFound() del page/generateMetadata resuelva (streaming) y la
  // PDP inexistente salía como soft 404 (200 + noindex — verificado en producción).
  // Acá se decide ANTES del render contra el set cacheado de slugs vivos (tag
  // "catalog": las mutaciones admin lo invalidan en el acto → un producto recién
  // creado no cae en falso 404). FAIL-OPEN: si la consulta falla (DB caída), se
  // deja pasar el request — nunca 404 en falso por un error transitorio.
  // Va DESPUÉS de los redirects (legacy + UrlRedirect admin): una URL vieja con
  // redirect registrado redirige, no 404.
  if (path.startsWith("/producto/") && request.method === "GET") {
    const slug = path.slice("/producto/".length).split("/")[0];
    const liveSlugs = await getStorefrontProductSlugs().catch(() => null);
    if (liveSlugs && !liveSlugs.includes(slug)) {
      return withSecurityHeaders(productNotFoundResponse(), requestId);
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

  // Sesión Supabase — SOLO para requests que no son /api/* (2026-10-22): los
  // route handlers de /api crean su propio cliente (lib/supabase/server.ts) y
  // SÍ pueden persistir las cookies refrescadas (cookie store mutable); hacer
  // también el getUser acá sumaba un competidor innecesario a la carrera del
  // refresh token de un solo uso (los polls de /api/vitals, render-status,
  // etc. eran los racers más frecuentes) y una llamada al Auth server por
  // request sin beneficio.
  if (!isApi) {
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
            // Fix «logout fantasma» (2026-10-22): los refresh tokens de Supabase
            // son DE UN SOLO USO. Con el access token expirado, requests
            // CONCURRENTES (navegación + prefetches RSC + otra pestaña) disparan
            // refreshes simultáneos; la request que pierde la carrera recibe
            // SIGNED_OUT del cliente Auth y @supabase/ssr intenta BORRAR las
            // cookies sb-*-auth-token EN SU RESPONSE (applyServerStorage) — si
            // esa response llega al browser después de la ganadora, borra la
            // sesión recién refrescada: logout silencioso al recargar/navegar
            // (documentado en el README del paquete, § "Concurrent requests
            // with the same expired session"). Acá se IGNORA ese borrado: los
            // cierres de sesión legítimos no dependen de esta vía — el logout
            // explícito borra desde la action (app/auth/logout, cliente de
            // lib/supabase/server.ts) y los idle-timeout de este proxy borran
            // sobre su response de redirect, no sobre `response`.
            const safe = cookiesToSet.filter(
              ({ name, value }) => !(value === "" && AUTH_TOKEN_COOKIE_RE.test(name)),
            );
            // Trazas de diagnóstico de sesión (2026-10-22, bug «logout al
            // recargar»): volumen bajo — solo requests que escriben sesión.
            if (safe.length < cookiesToSet.length) {
              logger.info({ event: "proxy.session.wipe_ignored", requestId, path });
            } else if (safe.some(({ name }) => AUTH_TOKEN_COOKIE_RE.test(name))) {
              logger.info({ event: "proxy.session.refreshed", requestId, path });
            }
            if (safe.length === 0) return;
            for (const { name, value } of safe) {
              request.cookies.set(name, value);
            }
            response = nextWithNonce();
            for (const { name, value, options } of safe) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Traza de diagnóstico (2026-10-22): request CON cookie de sesión pero sin
    // user válido = la sesión murió server-side (o el token es inválido) — el
    // caso reportado por el owner. Solo se loguea cuando HAY cookie (volumen
    // bajo: tráfico con sesión únicamente).
    const hasAuthCookie = request.cookies.getAll().some((c) => AUTH_TOKEN_COOKIE_RE.test(c.name));
    if (hasAuthCookie && !user) {
      logger.warn({ event: "proxy.session.auth_cookie_but_no_user", requestId, path });
    }

    // Gate /admin/* — requiere sesión Supabase. La verificación adicional
    // de que el user efectivamente tiene fila AdminUser activa la hacemos
    // en las pages (`getCurrentAdmin()`), porque no podemos correr Prisma
    // dentro del proxy (Edge-runtime safe). Acá solo nos aseguramos de
    // que NO se sirvan páginas admin a anónimos.
    //
    // Excepción: /admin/login es público (es donde el user se autentica).
    const isAdminPath = path.startsWith("/admin") && !path.startsWith("/admin/login");

    // Prefetch RSC (Next lo dispara solo por tener un <Link> visible — p. ej.
    // «PANEL ADMIN» en el header del storefront): NO es actividad del usuario y
    // NUNCA debe gatillar acciones destructivas (la revocación del idle-timeout
    // mata la sesión ENTERA, tienda incluida — bug owner 2026-10-22). En
    // prefetch: no se renueva la marca (prefetch ≠ actividad) y no se revoca;
    // si la marca está vencida se responde el redirect de expiración SIN tocar
    // la sesión — el timeout completo (signOut + borrado) corre solo en la
    // navegación REAL al panel.
    //
    // OJO Next 16 (verificado con trazas en STG 2026-10-22): el propio Next
    // ELIMINA los headers Flight internos (`rsc`, `next-router-prefetch`,
    // `next-router-state-tree`) antes de entregar la request al proxy
    // (next/dist/docs/.../proxy.md § "RSC requests and rewrites") — el check de
    // `next-router-prefetch` acá es defensa en profundidad por si eso cambia,
    // NO la garantía. La garantía real contra el bug es de origen: los enlaces
    // del storefront al panel llevan prefetch={false} (site-header.tsx y
    // shop-mega-menu.tsx), así que ese prefetch ni siquiera se emite.
    const isPrefetch =
      request.headers.get("next-router-prefetch") !== null ||
      request.headers.get("purpose") === "prefetch" ||
      request.headers.get("sec-purpose") === "prefetch";
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
        // Prefetch: redirect de expiración SIN revocar ni borrar cookies — la
        // sesión sigue viva para la tienda; la navegación REAL al panel (abajo,
        // rama no-prefetch) ejecuta el timeout completo.
        if (isPrefetch) {
          const url = new URL("/admin/login", request.url);
          url.searchParams.set("expired", "1");
          return withSecurityHeaders(NextResponse.redirect(url), requestId);
        }
        // B-8: además de borrar cookies en el browser, revocamos el refresh token
        // server-side (scope global = todas las sesiones del user en GoTrue).
        // Best-effort: si el Auth server falla, el borrado local igual se hace.
        logger.warn({
          event: "proxy.session.revoke",
          kind: "admin-idle",
          requestId,
          path,
          markAgeMs: last ? now - last : null,
          // Diagnóstico del bug de prefetch (2026-10-22): saber CON QUÉ headers
          // llegó la request que disparó la revocación.
          nrp: request.headers.get("next-router-prefetch"),
          purpose: request.headers.get("purpose"),
          rsc: request.headers.get("rsc"),
          secFetchMode: request.headers.get("sec-fetch-mode"),
          referer: request.headers.get("referer") ? "present" : null,
        });
        await supabase.auth.signOut({ scope: "global" }).catch(() => {});
        const url = new URL("/admin/login", request.url);
        url.searchParams.set("expired", "1");
        const expired = withSecurityHeaders(NextResponse.redirect(url), requestId);
        for (const c of request.cookies.getAll()) {
          if (c.name.startsWith("sb-")) expired.cookies.delete(c.name);
        }
        // La cookie admin tiene path=/admin: el delete debe llevar el mismo path
        // o el browser no la borra de verdad.
        expired.cookies.delete({ name: ADMIN_ACTIVITY_COOKIE, path: "/admin" });
        return expired;
      }
      // Prefetch con marca fresca: no renovar (prefetch ≠ actividad del usuario).
      if (!isPrefetch) {
        response.cookies.set(
          ADMIN_ACTIVITY_COOKIE,
          sealAdminActivityMark(now),
          adminActivityCookieOptions(),
        );
      }
    }

    // Idle-timeout CLIENTE (30 días deslizante — política completa en
    // lib/customer-activity.ts): si la marca tiene >30 días —O está PRESENTE con
    // FIRMA INVÁLIDA (forjada — fail-closed, criterio B-8)— revocamos el
    // refresh token (scope global), limpiamos las cookies sb-* + la marca y
    // redirigimos a `/`; si la ruta requiere sesión (/mi-cuenta/*) el redirect es
    // a /login?next=<ruta> para volver tras re-ingresar. Ventana deslizante: en
    // cada request autenticada renovamos la marca.
    //
    // Marca AUSENTE con sesión válida (2026-10-22): se RE-SELLA y se sigue, ya
    // no se revoca — el JWT ya fue verificado contra el Auth server por el
    // getUser de arriba, y la ausencia tiene causas legítimas (sesiones previas
    // a la feature, evicción del browser); cerrar ahí era el logout espurio
    // reportado por el owner.
    //
    // Alcance deliberado:
    //   - Solo cuando HAY sesión (`user`): el chequeo no aplica a anónimos.
    //   - No /api/*: ni siquiera entran a este bloque (ver arriba).
    //   - No /admin/*: gobernado por el idle-timeout admin de 30 min (arriba).
    //   - No /auth/* (callback/logout): gestionan su propio ciclo de sesión
    //     (callback SELLA la marca tras el exchange PKCE; logout la borra).
    //   - No prefetch (2026-10-22): no renueva ni revoca — un prefetch no es
    //     actividad del usuario y una revocación disparada por prefetch es
    //     invisible (mismo bug que el bloque admin de arriba).
    const isAuthFlowPath = path.startsWith("/auth/");
    if (user && !path.startsWith("/admin") && !isAuthFlowPath && !isPrefetch) {
      const mark = inspectCustomerActivityMark(
        request.cookies.get(CUSTOMER_ACTIVITY_COOKIE)?.value,
      );
      const now = Date.now();
      if (
        mark.status === "invalid" ||
        (mark.status === "valid" && now - mark.at > CUSTOMER_IDLE_LIMIT_MS)
      ) {
        logger.warn({
          event: "proxy.session.revoke",
          kind: "customer-idle",
          markStatus: mark.status,
          requestId,
          path,
        });
        // Best-effort (igual que admin): si el Auth server falla, el borrado
        // local de cookies igual se hace.
        await supabase.auth.signOut({ scope: "global" }).catch(() => {});
        const requiresSession = CUSTOMER_SESSION_REQUIRED_PREFIXES.some(
          (p) => path === p || path.startsWith(`${p}/`),
        );
        const url = new URL(requiresSession ? "/login" : "/", request.url);
        if (requiresSession) {
          url.searchParams.set("error", "sesion-expirada");
          url.searchParams.set("next", path);
        }
        const expired = withSecurityHeaders(NextResponse.redirect(url), requestId);
        for (const c of request.cookies.getAll()) {
          if (c.name.startsWith("sb-")) expired.cookies.delete(c.name);
        }
        expired.cookies.delete(CUSTOMER_ACTIVITY_COOKIE);
        return expired;
      }
      response.cookies.set(
        CUSTOMER_ACTIVITY_COOKIE,
        sealCustomerActivityMark(now),
        customerActivityCookieOptions(),
      );
    }
  }

  withSecurityHeaders(response, requestId);
  response.headers.set("Content-Security-Policy", cspValue);

  if (isPrivatePageGet(request.method, path, isApi)) {
    response.headers.set("Cache-Control", "private, no-store");
  }

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
