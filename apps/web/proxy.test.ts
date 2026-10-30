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
    redirectLookupError: null as Error | null, // B-8 — simula DB caída en el lookup cacheado
    lastLookupPath: null as string | null, // #29 — captura la llave con que el proxy consulta
    cookieOptions: null as Record<string, unknown> | null, // B-2 — lo pasado a createServerClient
    signOutCalls: [] as Array<{ scope?: string }>, // B-8 — revocación server-side al expirar
    getUserCalls: 0, // 2026-10-22 — /api/* ya no toca la sesión en el proxy
    wipeOnGetUser: false, // simula el SIGNED_OUT del refresh perdedor (borrado sb-*)
    refreshOnGetUser: false, // simula un TOKEN_REFRESHED (set normal de la cookie)
    totpVerified: true, // 2026-10-29 — gate MFA-enroll del proxy (default: admin enrolado)
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options?: {
      cookieOptions?: Record<string, unknown>;
      cookies?: {
        setAll: (
          cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>,
        ) => void;
      };
    },
  ) => {
    state.cookieOptions = options?.cookieOptions ?? null;
    return {
      auth: {
        getUser: async () => {
          state.getUserCalls++;
          // El SIGNED_OUT del cliente Auth tras un refresh fallido hace que
          // @supabase/ssr borre las cookies de sesión vía setAll (valor vacío).
          if (state.wipeOnGetUser) {
            options?.cookies?.setAll([
              { name: "sb-proy-auth-token", value: "", options: { maxAge: 0 } },
              { name: "sb-proy-auth-token.0", value: "", options: { maxAge: 0 } },
            ]);
          }
          if (state.refreshOnGetUser) {
            options?.cookies?.setAll([{ name: "sb-proy-auth-token", value: "nuevo", options: {} }]);
          }
          return { data: { user: state.user } };
        },
        signOut: async (opts?: { scope?: string }) => {
          state.signOutCalls.push(opts ?? {});
        },
        // 2026-10-29 — gate «MFA obligatorio» en el proxy (bug pantalla en
        // blanco del enroll): el mock declara el factor según state.totpVerified
        // (default true — los tests históricos asumen admin ya enrolado).
        mfa: {
          listFactors: async () => ({
            data: {
              all:
                state.totpVerified === false
                  ? []
                  : [{ factor_type: "totp", status: "verified" }],
            },
          }),
        },
      },
    };
  },
}));
vi.mock("@/features/redirects/service", () => ({
  lookupActiveRedirectCached: async (p: string) => {
    state.lastLookupPath = p;
    if (state.redirectLookupError) throw state.redirectLookupError;
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
import {
  CUSTOMER_IDLE_LIMIT_MS,
  readCustomerActivityMark,
  sealCustomerActivityMark,
} from "@/lib/customer-activity";

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
  state.redirectLookupError = null;
  state.lastLookupPath = null;
  state.cookieOptions = null;
  state.signOutCalls = [];
  state.getUserCalls = 0;
  state.wipeOnGetUser = false;
  state.refreshOnGetUser = false;
  state.totpVerified = true;
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

describe("proxy · gate MFA obligatorio (B-1) en el proxy (2026-10-29)", () => {
  // Antes el gate era un redirect() de React en el layout del (panel): en
  // navegaciones RSC (soft nav) dejaba la página en blanco/en bucle hasta un
  // refresh manual. En el proxy es un redirect HTTP real que el router sigue
  // como navegación de documento. El gate del layout sigue como backstop.
  const freshMark = () => sealAdminActivityMark(Date.now() - 60 * 1000);

  it("admin SIN TOTP verificado → redirect a /admin/seguridad?enroll=required", async () => {
    state.user = { id: "u1" };
    state.totpVerified = false;
    const res = await proxy(
      makeReq("/admin/pedidos", { cookies: { admin_last_activity: freshMark() } }),
    );
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/admin/seguridad");
    expect(loc).toContain("enroll=required");
  });

  it("admin sin TOTP en /admin/seguridad → NO redirige (es la pantalla de enrolamiento)", async () => {
    state.user = { id: "u1" };
    state.totpVerified = false;
    const res = await proxy(
      makeReq("/admin/seguridad", { cookies: { admin_last_activity: freshMark() } }),
    );
    expect(res.status).toBe(200);
  });

  it("admin CON TOTP verificado → pasa normal", async () => {
    state.user = { id: "u1" };
    const res = await proxy(
      makeReq("/admin/pedidos", { cookies: { admin_last_activity: freshMark() } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location") ?? "").not.toContain("/admin/seguridad");
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

  // 2026-10-22 — bug owner «la sesión se pierde sola»: el prefetch RSC del link
  // «PANEL ADMIN» del header disparaba el idle-timeout admin (signOut GLOBAL →
  // mata la sesión entera, tienda incluida) sin que el usuario fuera al panel.
  describe("prefetch RSC nunca revoca ni renueva marcas", () => {
    const prefetchReq = (path: string, cookies: Record<string, string>, prefetchValue = "1") => {
      const req = new NextRequest(new URL(`https://lucamsshop.com${path}`), {
        headers: { "next-router-prefetch": prefetchValue },
      });
      for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
      return req;
    };

    it("prefetch admin con marca VENCIDA → redirect de expiración SIN revocar ni borrar cookies", async () => {
      state.user = { id: "u1" };
      const stale = sealAdminActivityMark(Date.now() - 31 * 60 * 1000);
      const res = await proxy(
        prefetchReq("/admin/dashboard", {
          admin_last_activity: stale,
          "sb-access-token": "tok",
        }),
      );
      expect(res.status).toBe(307);
      expect(res.headers.get("location") ?? "").toContain("expired=1");
      expect(state.signOutCalls).toEqual([]); // ← la sesión NO se toca
      expect(res.cookies.get("sb-access-token")).toBeUndefined();
    });

    it.each(["1", "2", "3"])(
      "el valor %s del header (estrategias del Segment Cache de Next 16) también es prefetch",
      async (value) => {
        state.user = { id: "u1" };
        const stale = sealAdminActivityMark(Date.now() - 31 * 60 * 1000);
        const res = await proxy(
          prefetchReq(
            "/admin/dashboard",
            { admin_last_activity: stale, "sb-access-token": "tok" },
            value,
          ),
        );
        expect(res.status).toBe(307);
        expect(state.signOutCalls).toEqual([]);
      },
    );

    it("prefetch admin con marca FRESCA → 200 sin renovar la marca ni revocar", async () => {
      state.user = { id: "u1" };
      const fresh = sealAdminActivityMark(Date.now() - 60 * 1000);
      const res = await proxy(prefetchReq("/admin/pedidos", { admin_last_activity: fresh }));
      expect(res.status).toBe(200);
      expect(state.signOutCalls).toEqual([]);
      expect(res.cookies.get("admin_last_activity")).toBeUndefined(); // no re-sella en prefetch
    });

    it("prefetch de storefront con marca de cliente VENCIDA → no revoca ni re-sella", async () => {
      state.user = { id: "u1" };
      const stale = sealCustomerActivityMark(Date.now() - CUSTOMER_IDLE_LIMIT_MS - 60_000);
      const res = await proxy(
        prefetchReq("/productos-listado", {
          customer_last_activity: stale,
          "sb-access-token": "tok",
        }),
      );
      expect(res.status).toBe(200);
      expect(state.signOutCalls).toEqual([]);
      expect(res.cookies.get("customer_last_activity")).toBeUndefined();
    });
  });

  it("/admin/login NO borra la marca (la sella la acción de login, no el proxy)", async () => {
    const res = await proxy(
      makeReq("/admin/login", { cookies: { admin_last_activity: String(Date.now()) } }),
    );
    // El proxy ya no toca la marca en /admin/login; la acción de login la sobrescribe con `now`.
    expect(res.cookies.get("admin_last_activity")).toBeUndefined();
  });
});

/*
 * Idle-timeout CLIENTE (2026-10-12, refinado 2026-10-22): sesión persistente de
 * 30 días con ventana DESLIZANTE (cada request autenticada re-sella la marca
 * firmada `customer_last_activity`); >30 días sin actividad —o marca FORJADA
 * (firma inválida, criterio B-8)— → signOut global + borrado sb-* + redirect a
 * `/` (o /login?next= si la ruta requiere sesión). Marca AUSENTE con sesión
 * válida → se re-sella, no se revoca.
 */
describe("proxy · idle-timeout cliente (30 días deslizante)", () => {
  it("marca con >30 días → expira: signOut global, borra sb-* y la marca, redirect a /", async () => {
    state.user = { id: "u1" };
    const stale = sealCustomerActivityMark(Date.now() - CUSTOMER_IDLE_LIMIT_MS - 60_000);
    const res = await proxy(
      makeReq("/productos-listado", {
        cookies: { customer_last_activity: stale, "sb-access-token": "tok" },
      }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://lucamsshop.com/");
    expect(res.cookies.get("sb-access-token")?.value ?? "").toBe("");
    expect(res.cookies.get("customer_last_activity")?.value ?? "").toBe("");
    expect(state.signOutCalls).toEqual([{ scope: "global" }]);
  });

  it("marca FRESCA → no expira y RENUEVA la marca firmada (ventana deslizante)", async () => {
    state.user = { id: "u1" };
    const fresh = sealCustomerActivityMark(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 días
    const res = await proxy(
      makeReq("/productos-listado", { cookies: { customer_last_activity: fresh } }),
    );
    expect(res.status).toBe(200);
    expect(state.signOutCalls).toEqual([]);
    const renewed = res.cookies.get("customer_last_activity")?.value ?? "";
    const ts = readCustomerActivityMark(renewed);
    expect(ts).not.toBeNull();
    expect(Math.abs((ts ?? 0) - Date.now())).toBeLessThan(10_000);
  });

  it("marca AUSENTE con sesión VÁLIDA → NO revoca: re-sella la marca y sigue (2026-10-22)", async () => {
    // El JWT ya fue verificado contra el Auth server por getUser; la ausencia
    // tiene causas legítimas (sesión previa a la feature, evicción del
    // browser). Cerrar acá era el logout espurio reportado por el owner.
    state.user = { id: "u1" };
    const res = await proxy(
      makeReq("/productos-listado", { cookies: { "sb-access-token": "tok" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(state.signOutCalls).toEqual([]);
    const renewed = res.cookies.get("customer_last_activity")?.value ?? "";
    const ts = readCustomerActivityMark(renewed);
    expect(ts).not.toBeNull();
    expect(Math.abs((ts ?? 0) - Date.now())).toBeLessThan(10_000);
  });

  it("marca con firma INVÁLIDA (forjada) → expira", async () => {
    state.user = { id: "u1" };
    const res = await proxy(
      makeReq("/productos-listado", {
        cookies: { customer_last_activity: String(Date.now()), "sb-access-token": "tok" },
      }),
    );
    expect(res.status).toBe(307);
    expect(state.signOutCalls).toEqual([{ scope: "global" }]);
  });

  it("ruta que REQUIERE sesión (/mi-cuenta) → redirect a /login con next + error, no a /", async () => {
    state.user = { id: "u1" };
    const stale = sealCustomerActivityMark(Date.now() - CUSTOMER_IDLE_LIMIT_MS - 60_000);
    const res = await proxy(
      makeReq("/mi-cuenta/pedidos", { cookies: { customer_last_activity: stale } }),
    );
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/login");
    expect(loc).toContain("error=sesion-expirada");
    expect(loc).toContain("next=" + encodeURIComponent("/mi-cuenta/pedidos"));
  });

  it("sin sesión NO hay chequeo (anónimos navegan sin marca y sin redirect)", async () => {
    const res = await proxy(makeReq("/productos-listado"));
    expect(res.status).toBe(200);
    expect(res.cookies.get("customer_last_activity")).toBeUndefined();
    expect(state.signOutCalls).toEqual([]);
  });

  it("/api/* queda EXCLUIDA del chequeo aun con marca vencida (contratos JSON intactos)", async () => {
    state.user = { id: "u1" };
    const stale = sealCustomerActivityMark(Date.now() - CUSTOMER_IDLE_LIMIT_MS - 60_000);
    const res = await proxy(
      makeReq("/api/algo", {
        origin: "https://lucamsshop.com",
        cookies: { customer_last_activity: stale },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(state.signOutCalls).toEqual([]);
  });

  it("/admin/* queda EXCLUIDO del chequeo cliente (lo gobierna el idle-timeout admin)", async () => {
    state.user = { id: "u1" };
    const freshAdmin = sealAdminActivityMark(Date.now() - 60 * 1000);
    // Sin marca de cliente: si el chequeo aplicara acá, expiraría (fail-closed).
    const res = await proxy(
      makeReq("/admin/pedidos", { cookies: { admin_last_activity: freshAdmin } }),
    );
    expect(res.status).toBe(200);
    expect(state.signOutCalls).toEqual([]);
    expect(res.cookies.get("customer_last_activity")).toBeUndefined();
  });

  it("/auth/* queda EXCLUIDO (callback/logout gestionan su propio ciclo de sesión)", async () => {
    state.user = { id: "u1" };
    const res = await proxy(makeReq("/auth/callback?code=x", { method: "GET" }));
    expect(res.status).toBe(200);
    expect(state.signOutCalls).toEqual([]);
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

  // #29 — el proxy consulta el UrlRedirect con la llave en minúsculas. El mock no tiene caché
  // (B-8: la caché ahora es unstable_cache dentro del service mockeado), así que cada request
  // vuelve a hacer lookup.
  it("#29 normaliza fromPath a minúsculas para el lookup", async () => {
    state.redirect = { toPath: "/destino", statusCode: 301 };
    await proxy(makeReq("/CamelCase-Unico-29"));
    expect(state.lastLookupPath).toBe("/camelcase-unico-29");
  });

  // B-8 — fallback ante DB caída: el lookup cacheado rechaza y la request sigue
  // su curso sin redirect (el sitio no se cae por un redirect que no resolvió).
  it("si el lookup de redirects falla (DB caída), la request continúa sin redirect", async () => {
    state.redirectLookupError = new Error("db down");
    const res = await proxy(makeReq("/ruta-con-db-caida-b8"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
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
    // Desde 2026-10-22 el cliente de sesión NO se crea para /api/*: el test usa
    // una ruta de página para que el proxy instancie createServerClient.
    await proxy(makeReq("/productos-listado"));
    expect(state.cookieOptions).toEqual({ secure: false, sameSite: "lax" });
  });

  it("secure=true cuando VERCEL_ENV=production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.resetModules();
    const { proxy: proxyProd } = await import("./proxy");
    await proxyProd(makeReq("/productos-listado"));
    expect(state.cookieOptions).toEqual({ secure: true, sameSite: "lax" });
  });
});

// 2026-10-22 — fix «logout fantasma» del storefront: (a) /api/* no crea cliente
// de sesión en el proxy (los route handlers se autogestionan y persisten
// cookies), (b) el setAll ignora los borrados de cookies sb-*-auth-token que
// produce el SIGNED_OUT de la request perdedora de una carrera de refresh.
describe("proxy · sesión Supabase — carrera de refresh y /api", () => {
  it("/api/* NO llama getUser ni renueva la marca de cliente", async () => {
    state.user = { id: "u1" };
    const res = await proxy(makeReq("/api/vitals", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(state.getUserCalls).toBe(0);
    expect(res.cookies.get("customer_last_activity")).toBeUndefined();
  });

  it("página normal SÍ llama getUser (refresh de sesión vigente)", async () => {
    await proxy(makeReq("/productos-listado"));
    expect(state.getUserCalls).toBe(1);
  });

  it("IGNORA el borrado de cookies sb-*-auth-token del SIGNED_OUT perdedor", async () => {
    state.wipeOnGetUser = true;
    const res = await proxy(makeReq("/productos-listado"));
    expect(res.cookies.get("sb-proy-auth-token")).toBeUndefined();
    expect(res.cookies.get("sb-proy-auth-token.0")).toBeUndefined();
  });

  it("un set NORMAL de la cookie de sesión (TOKEN_REFRESHED) sí se propaga", async () => {
    state.refreshOnGetUser = true;
    const res = await proxy(makeReq("/productos-listado"));
    expect(res.cookies.get("sb-proy-auth-token")?.value).toBe("nuevo");
  });
});
