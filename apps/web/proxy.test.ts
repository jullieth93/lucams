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
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
}));
vi.mock("@/features/redirects/service", () => ({
  lookupActiveRedirect: async () => state.redirect,
  incrementRedirectHit: async () => {},
}));
vi.mock("@/lib/product-redirects", () => ({
  PRODUCT_REDIRECTS: { "old-magnet": "new-magnet?variant=v_123" },
}));

import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function makeReq(
  path: string,
  opts: { method?: string; cookies?: Record<string, string>; origin?: string } = {},
): NextRequest {
  const req = new NextRequest(new URL(`https://lucamsshop.co${path}`), {
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
  vi.unstubAllEnvs();
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

  it("con sesión NO redirige a login", async () => {
    state.user = { id: "u1" };
    const res = await proxy(makeReq("/admin/pedidos"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location") ?? "").not.toContain("/admin/login");
  });
});

describe("proxy · idle-timeout admin (30 min)", () => {
  it("expira la sesión tras 30+ min inactiva y limpia cookies sb-*", async () => {
    state.user = { id: "u1" };
    const stale = String(Date.now() - 31 * 60 * 1000);
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
  });

  it("dentro de la ventana NO expira", async () => {
    state.user = { id: "u1" };
    const fresh = String(Date.now() - 60 * 1000);
    const res = await proxy(makeReq("/admin/pedidos", { cookies: { admin_last_activity: fresh } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location") ?? "").not.toContain("expired");
  });

  it("sin cookie de actividad no expira (primera visita) y sella la marca", async () => {
    state.user = { id: "u1" };
    const res = await proxy(makeReq("/admin/pedidos"));
    expect(res.status).toBe(200);
    expect(res.cookies.get("admin_last_activity")?.value).toBeTruthy();
  });

  it("entrar a /admin/login borra la marca (sesión nueva no hereda timestamp viejo)", async () => {
    const res = await proxy(
      makeReq("/admin/login", { cookies: { admin_last_activity: String(Date.now()) } }),
    );
    // delete() emite un Set-Cookie que vacía el valor → una sesión nueva arranca el reloj limpio.
    expect(res.cookies.get("admin_last_activity")?.value ?? "").toBe("");
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
});

describe("proxy · CORS /api", () => {
  it("bloquea con 403 un origen no permitido", async () => {
    const res = await proxy(makeReq("/api/algo", { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("un origen permitido recibe Access-Control-Allow-Origin", async () => {
    const res = await proxy(makeReq("/api/algo", { origin: "https://lucamsshop.co" }));
    expect(res.headers.get("access-control-allow-origin")).toBe("https://lucamsshop.co");
  });
});
