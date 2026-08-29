/*
 * Tests de POST /api/admin/cms/edit-mode (E-1 + B-6, auditoría 2026-08-24).
 *
 * - E-1: `next` pasa por isSafeInternalPath (real, sin mock) — backslash,
 *   caracteres de control y protocol-relative caen a "/". El op=disable NO
 *   tiene guard (por diseño), así que su redirect era el vector de open
 *   redirect: esas ramas se fijan acá.
 * - B-6: op=enable exige requireAdminAction (sesión + aal2 + rol CONTENT) y
 *   siembra la cookie con Secure en prod/preview.
 *
 * requireAdminAction/recordAdminAction/CMS_EDIT_COOKIE van mockeados (su
 * lógica interna tiene cobertura propia); acá se prueba el cableado de la
 * ruta. El mock del guard imita a next/navigation: redirect() nunca retorna,
 * lanza NEXT_REDIRECT (mismo patrón que lib/stage-guard.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    session: null as { user: { id: string }; admin: { id: string; role: string } } | null,
    auditCalls: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: async () => {
    if (!state.session) {
      const err = new Error("NEXT_REDIRECT:/admin/login");
      (err as unknown as { digest: string }).digest = "NEXT_REDIRECT;replace;/admin/login;307;";
      throw err;
    }
    return state.session;
  },
}));
vi.mock("@/lib/admin-audit", () => ({
  recordAdminAction: async (entry: Record<string, unknown>) => {
    state.auditCalls.push(entry);
  },
}));
vi.mock("@/lib/cms-edit-mode", () => ({ CMS_EDIT_COOKIE: "lucams_cms_edit" }));

import { POST } from "./route";

function makeReq(op: string, next?: string): Request {
  const body = new URLSearchParams({ op });
  if (next !== undefined) body.set("next", next);
  return new Request("https://lucamsshop.com/api/admin/cms/edit-mode", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

beforeEach(() => {
  state.session = null;
  state.auditCalls = [];
  vi.unstubAllEnvs();
});

describe("op=disable (sin guard, por diseño) · E-1 open redirect", () => {
  it("RECHAZA next con backslash `/\\evil.com` → cae a '/'", async () => {
    const res = await POST(makeReq("disable", "/\\evil.com"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://lucamsshop.com/");
  });

  it("RECHAZA next protocol-relative `//evil.com` y con caracteres de control", async () => {
    for (const evil of ["//evil.com", "/catalogo\n@evil.com", "  //evil.com"]) {
      const res = await POST(makeReq("disable", evil));
      expect(res.headers.get("location")).toBe("https://lucamsshop.com/");
    }
  });

  it("acepta un next interno seguro y borra la cookie", async () => {
    const res = await POST(makeReq("disable", "/admin/contenido"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://lucamsshop.com/admin/contenido");
    expect(res.headers.get("set-cookie")).toMatch(/lucams_cms_edit=;/);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });
});

describe("op=enable · B-6 (sesión + aal2 + rol CONTENT vía requireAdminAction)", () => {
  it("sin sesión: NEXT_REDIRECT del guard se propaga (no se traga) y NO siembra cookie ni audita", async () => {
    await expect(POST(makeReq("enable"))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(state.auditCalls).toEqual([]);
  });

  it("con sesión válida: siembra la cookie (8h, httpOnly), audita y redirige a next", async () => {
    state.session = { user: { id: "u1" }, admin: { id: "a1", role: "CMS_EDITOR" } };
    const res = await POST(makeReq("enable", "/"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://lucamsshop.com/");
    expect(state.auditCalls).toEqual([
      {
        actorId: "a1",
        action: "cms.edit_mode.enable",
        entityType: "CmsEditMode",
        entityId: "lucams_cms_edit",
      },
    ]);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("lucams_cms_edit=1");
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Max-Age=28800/);
  });

  it("la cookie lleva Secure solo en despliegues HTTPS (prod/preview)", async () => {
    state.session = { user: { id: "u1" }, admin: { id: "a1", role: "SUPERADMIN" } };
    const devRes = await POST(makeReq("enable"));
    expect(devRes.headers.get("set-cookie") ?? "").not.toMatch(/Secure/);

    vi.stubEnv("VERCEL_ENV", "preview");
    const previewRes = await POST(makeReq("enable"));
    expect(previewRes.headers.get("set-cookie") ?? "").toMatch(/Secure/);
  });

  it("el redirect de enable también pasa por el validador (E-1)", async () => {
    state.session = { user: { id: "u1" }, admin: { id: "a1", role: "CMS_EDITOR" } };
    const res = await POST(makeReq("enable", "/\\evil.com"));
    expect(res.headers.get("location")).toBe("https://lucamsshop.com/");
  });
});
