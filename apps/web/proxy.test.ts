/*
 * Tests del middleware `proxy()` (auditoría 2026-07-16).
 *
 * Ejercen el comportamiento REAL de proxy.ts —no helpers extraídos— con Supabase
 * (getUser) y el servicio de redirects mockeados. Cubren los tres flujos que la
 * auditoría marcó sin cobertura: gate anónimo /admin, idle-timeout admin, y la
 * PRECEDENCIA de redirects (product → dinámico → maintenance). Los helpers puros
 * de CSP/CORS ya viven testeados en lib/security-headers.test.ts; acá se prueba el
 * cableado y el orden de decisiones.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Estado mutable compartido con los mocks (hoisted: vi.mock se eleva sobre los imports).
const { state } = vi.hoisted(() => ({
  state: {
    user: null as { id: string } | null,
    redirect: null as { toPath: string; statusCode: number } | null,
    lastLookupPath: null as string | null, // #29 — captura la llave con que el proxy consulta
    cookieOptions: null as Record<string, unknown> | null, // B-2 — lo pasado a createServerClient
    signOutCalls: [] as Array<{ scope?: string }>, // B-8 — revocación server-side al expirar
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options?: { cookieOptions?: Record<string, unknown> },
  ) => {
    state.cookieOptions = options?.cookieOptions ?? null;
    return {
      auth: {
        getUser: async () => ({ data: { user: state.user } }),
        signOut: async (opts?: { scope?: string }) => {
          state.signOutCalls.push(opts ?? {});
        },
      },
    };
  },
}));
vi.mock("@/features/redirects/service", () => ({
  lookupActiveRedirect: async (p: string) => {
    state.lastLookupPath = p;
    return state.redirect;
  },
  incrementRedirectHit: async () => {},
}));
vi.mock("@/lib/product-redirects", () => ({
  PRODUCT_REDIRECTS: { "old-magnet": "new-magnet?variant=v_123" },
}));

import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { readAdminActivityMark, sealAdminActivityMark } from "@/lib/admin-activity";

function makeReq(
  path: string,
  opts: { method?: string; cookies?: Record<string, string>; origin?: string } = {},
): NextRequest {
  const req = new NextRequest(new URL(`https://lucamsshop.com${path}`), {
    method: opts.method ?? "GET",
    headers: opts.origin ? { origin: opts.origin } : {},
  });
  if (opts.cookies) {
    for (const [k, v] of Object.entries(opts.cookies)) req.cookies.set(k, v);
  }
  return req;
}

beforeEach(() => {
  state.user = null;
  state.redirect = null;
  state.lastLookupPath = null;
  state.cookieOptions = null;
  state.signOutCalls = [];
  vi.unstubAllEnvs();
  // B-8 — la marca de actividad va firmada con HMAC (CSRF_SECRET), mismo
  // patrón que checkout-session: se fija acá para tests deterministas.
  vi.stubEnv("CSRF_SECRET", "test-secret-fijo-proxy");
});

describe("proxy · gate /admin para anónimos", () => {
  it("redirige anónimo de /admin/* a /admin/login", async () => {
    const res = await proxy(makeReq("/admin/pedidos"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("deja pasar /admin/login sin sesión (es público)", async () => {
    const res = await proxy(makeReq("/admin/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("con sesión (y marca fresca) NO redirige a login", async () => {
    state.user = { id: "u1" };
    // Marca fresca FIRMADA (B-8): aísla el gate anónimo del idle-timeout (una
    // request admin autenticada SIN marca válida ahora expira — ver abajo).
    const fresh = sealAdminActivityMark(Date.now() - 60 * 1000);
    const res = await proxy(makeReq("/admin/pedidos", { cookies: { admin_last_activity: fresh } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location") ?? "").not.toContain("/admin/login");
  });
});

describe("proxy · idle-timeout admin (30 min)", () => {
  it("expira la sesión tras 30+ min inactiva, limpia cookies sb-* y REVOCA server-side (B-8)", async () => {
    state.user = { id: "u1" };
    const stale = sealAdminActivityMark(Date.now() - 31 * 60 * 1000);
    const res = await proxy(
      makeReq("/admin/pedidos", {
        cookies: { admin_last_activity: stale, "sb-access-token": "tok" },
      }),
    );
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/admin/login");
    expect(loc).toContain("expired=1");
    // La cookie de sesión Supabase queda marcada para borrado (valor vaciado).
    expect(res.cookies.get("sb-access-token")?.value ?? "").toBe("");
    // B-8: además del borrado local, revoca el refresh token en el Auth server.
    expect(state.signOutCalls).toEqual([{ scope: "global" }]);
  });

  it("dentro de la ventana NO expira y renueva la marca FIRMADA (B-8)", async () => {
    state.user = { id: "u1" };
    const fresh = sealAdminActivityMark(Date.now() - 60 * 1000);
    const res = await proxy(makeReq("/admin/pedidos", { cookies: { admin_last_activity: fresh } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location") ?? "").not.toContain("expired");
    expect(state.signOutCalls).toEqual([]);
    // La marca renovada viaja firmada: verifica con el lector del módulo.
    const renewed = res.cookies.get("admin_last_activity")?.value ?? "";
    const ts = readAdminActivityMark(renewed);
    expect(ts).not.toBeNull();
    expect(Math.abs((ts ?? 0) - Date.now())).toBeLessThan(10_000);
  });

  it("marca AUSENTE en path admin autenticado → EXPIRA (manipulada/vencida, no 'primera visita')", async () => {
    // La acción de login sella la marca al autenticarse, así que una request admin
    // autenticada sin marca solo ocurre si la borraron (evasión del idle-timeout).
    state.user = { id: "u1" };
    const res = await proxy(makeReq("/admin/pedidos", { cookies: { "sb-access-token": "tok" } }));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/admin/login");
    expect(loc).toContain("expired=1");
    expect(res.cookies.get("sb-access-token")?.value ?? "").toBe("");
    expect(state.signOutCalls).toEqual([{ scope: "global" }]);
  });

  it("marca SIN FIRMA (timestamp plano, formato pre-B-8 o forjado) → EXPIRA", async () => {
    // B-8: un atacante con cookies robadas fabricaba `admin_last_activity=<now>`
    // y evadía el timeout; con la marca firmada el valor plano ya no verifica.
    state.user = { id: "u1" };
    const res = await proxy(
      makeReq("/admin/pedidos", {
        cookies: { admin_last_activity: String(Date.now()), "sb-access-token": "tok" },
      }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("expired=1");
    expect(state.signOutCalls).toEqual([{ scope: "global" }]);
  });

  it("marca con firma MANIPULADA → EXPIRA", async () => {
    state.user = { id: "u1" };
    const good = sealAdminActivityMark(Date.now());
    const tampered = `${good.slice(0, -2)}xx`; // firma alterada, misma longitud
    const res = await proxy(
      makeReq("/admin/pedidos", { cookies: { admin_last_activity: tampered } }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("expired=1");
  });

  it("/admin/login NO borra la marca (la sella la acción de login, no el proxy)", async () => {
    const res = await proxy(
      makeReq("/admin/login", { cookies: { admin_last_activity: String(Date.now()) } }),
    );
    // El proxy ya no toca la marca en /admin/login; la acción de login la sobrescribe con `now`.
    expect(res.cookies.get("admin_last_activity")).toBeUndefined();
  });
});

describe("proxy · precedencia de redirects", () => {
  it("PRODUCT_REDIRECTS (301) gana aunque exista un UrlRedirect dinámico", async () => {
    state.redirect = { toPath: "/otro", statusCode: 302 };
    const res = await proxy(makeReq("/producto/old-magnet"));
    expect(res.status).toBe(301);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/producto/new-magnet");
    expect(loc).toContain("variant=v_123");
  });

  it("el UrlRedirect dinámico gana sobre el modo mantenimiento", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAINTENANCE_MODE", "1");
    state.redirect = { toPath: "/destino", statusCode: 301 };
    const res = await proxy(makeReq("/promo-vieja"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toContain("/destino");
  });

  it("mantenimiento redirige tráfico público a /maintenance", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAINTENANCE_MODE", "1");
    const res = await proxy(makeReq("/productos-listado"));
    expect(res.headers.get("location")).toContain("/maintenance");
  });

  it("mantenimiento NO afecta /admin", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAINTENANCE_MODE", "1");
    state.user = { id: "u1" };
    const res = await proxy(makeReq("/admin/pedidos"));
    expect(res.headers.get("location") ?? "").not.toContain("/maintenance");
  });

  it("NO consulta UrlRedirect dinámico en paths /admin", async () => {
    state.user = { id: "u1" };
    state.redirect = { toPath: "/destino", statusCode: 301 };
    const res = await proxy(makeReq("/admin/contenido"));
    expect(res.headers.get("location") ?? "").not.toContain("/destino");
  });

  // #30 — preservación de query entrante (UTM de campañas)
  it("#30 PRODUCT_REDIRECTS preserva los UTM entrantes", async () => {
    const res = await proxy(makeReq("/producto/old-magnet?utm_source=ig&utm_campaign=bio"));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("variant=v_123");
    expect(loc).toContain("utm_source=ig");
    expect(loc).toContain("utm_campaign=bio");
  });

  it("#30 el query del destino gana sobre el entrante (variant no se pisa)", async () => {
    const res = await proxy(makeReq("/producto/old-magnet?variant=zzz"));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("variant=v_123");
    expect(loc).not.toContain("variant=zzz");
  });

  it("#30 UrlRedirect relativo preserva los UTM entrantes", async () => {
    state.redirect = { toPath: "/destino", statusCode: 301 };
    const res = await proxy(makeReq("/promo-vieja?utm_source=ig"));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/destino");
    expect(loc).toContain("utm_source=ig");
  });

  // #29 — el proxy consulta el UrlRedirect con la llave en minúsculas. Path único para evitar el
  // cache in-memory (60s) que persiste entre tests → un path ya cacheado no volvería a hacer lookup.
  it("#29 normaliza fromPath a minúsculas para el lookup", async () => {
    state.redirect = { toPath: "/destino", statusCode: 301 };
    await proxy(makeReq("/CamelCase-Unico-29"));
    expect(state.lastLookupPath).toBe("/camelcase-unico-29");
  });
});

describe("proxy · CORS /api", () => {
  it("bloquea con 403 un origen no permitido", async () => {
    const res = await proxy(makeReq("/api/algo", { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("un origen permitido recibe Access-Control-Allow-Origin", async () => {
    const res = await proxy(makeReq("/api/algo", { origin: "https://lucamsshop.com" }));
    expect(res.headers.get("access-control-allow-origin")).toBe("https://lucamsshop.com");
  });
});

// A-5 (auditoría 2026-08-24): los early returns del proxy salían SIN security
// headers ni CSP porque los headers solo se seteaban sobre `response` al final.
describe("proxy · security headers en early returns (A-5)", () => {
  const expectSecurityHeaders = (res: { headers: Headers }) => {
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  };

  it("redirect 301 de /producto/* lleva los headers (sin CSP — 3xx sin body)", async () => {
    const res = await proxy(makeReq("/producto/old-magnet"));
    expect(res.status).toBe(301);
    expectSecurityHeaders(res);
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("redirect dinámico UrlRedirect lleva los headers", async () => {
    state.redirect = { toPath: "/destino-a5", statusCode: 302 };
    const res = await proxy(makeReq("/ruta-a5-dinamica"));
    expect(res.status).toBe(302);
    expectSecurityHeaders(res);
  });

  it("redirect de mantenimiento lleva los headers", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAINTENANCE_MODE", "1");
    const res = await proxy(makeReq("/productos-listado"));
    expectSecurityHeaders(res);
  });

  it("el 403 de CORS lleva headers Y CSP (tiene body renderizable)", async () => {
    const res = await proxy(makeReq("/api/algo", { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expectSecurityHeaders(res);
    expect(res.headers.get("content-security-policy")).toContain("default-src");
  });

  it("el redirect del gate /admin (anónimo) lleva los headers", async () => {
    const res = await proxy(makeReq("/admin/pedidos"));
    expect(res.status).toBe(307);
    expectSecurityHeaders(res);
  });

  it("el redirect de idle-timeout lleva los headers", async () => {
    state.user = { id: "u1" };
    const res = await proxy(makeReq("/admin/pedidos", { cookies: { "sb-access-token": "t" } }));
    expect(res.status).toBe(307);
    expectSecurityHeaders(res);
  });
});

// F-20 (pre-launch audit 2026-09-04): private pages must emit `Cache-Control: private, no-store`
// explicitly, not implicitly via their rendering strategy. Page GETs only: POSTs to these paths
// are Server Actions and /api/* manages its own Cache-Control.
describe("proxy · Cache-Control en páginas privadas (F-20)", () => {
  it("GET /mi-cuenta → private, no-store", async () => {
    const res = await proxy(makeReq("/mi-cuenta"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("GET /mi-cuenta/pedidos (subruta) → private, no-store", async () => {
    const res = await proxy(makeReq("/mi-cuenta/pedidos"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("GET /checkout/datos → private, no-store", async () => {
    const res = await proxy(makeReq("/checkout/datos"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("GET /admin/login (público pero bajo el prefijo /admin) → private, no-store", async () => {
    const res = await proxy(makeReq("/admin/login"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("GET /admin/pedidos autenticado (marca fresca) → private, no-store", async () => {
    state.user = { id: "u1" };
    const fresh = sealAdminActivityMark(Date.now() - 60 * 1000);
    const res = await proxy(makeReq("/admin/pedidos", { cookies: { admin_last_activity: fresh } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("POST bajo /mi-cuenta (Server Action) → SIN el header", async () => {
    const res = await proxy(makeReq("/mi-cuenta", { method: "POST" }));
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("GET /api/* → SIN el header (las API gestionan el suyo)", async () => {
    const res = await proxy(makeReq("/api/algo", { origin: "https://lucamsshop.com" }));
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("GET de página pública → SIN el header", async () => {
    const res = await proxy(makeReq("/pagina-publica-f20"));
    expect(res.headers.get("cache-control")).toBeNull();
  });
});

// B-2 (auditoría 2026-08-24): createServerClient recibe cookieOptions con
// `Secure` explícito según el despliegue (IS_PROD_DEPLOY se fija a nivel de
// módulo → la rama `true` se prueba con un import fresco del proxy).
describe("proxy · cookieOptions de la sesión Supabase (B-2)", () => {
  it("secure=false fuera de prod/preview (dev local HTTP)", async () => {
    await proxy(makeReq("/api/algo", { origin: "https://lucamsshop.com" }));
    expect(state.cookieOptions).toEqual({ secure: false, sameSite: "lax" });
  });

  it("secure=true cuando VERCEL_ENV=production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.resetModules();
    const { proxy: proxyProd } = await import("./proxy");
    await proxyProd(makeReq("/api/algo", { origin: "https://lucamsshop.com" }));
    expect(state.cookieOptions).toEqual({ secure: true, sameSite: "lax" });
  });
});
