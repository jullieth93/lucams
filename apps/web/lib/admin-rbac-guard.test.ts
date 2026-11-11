/*
 * Tests del guard central de Server Actions admin (ADR-062 P0-1).
 *
 * El corazón del fix: una sesión aal1 (solo contraseña — p.ej. robada — con MFA
 * inscrito pero sin completar el 2º factor) DEBE ser rechazada al invocar cualquier
 * acción mutante, no solo al renderizar el layout. Verifica también el gate de rol,
 * que el chequeo aal2 solo aplica cuando la cuenta tiene 2 pasos activos, y el
 * enrolamiento forzado (auditoría 2026-08-24 · B-1): un admin SIN factor TOTP
 * verificado va a /admin/seguridad?enroll=required (salvo que ya esté ahí).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROLE_SETS } from "./admin-rbac";

const { state } = vi.hoisted(() => ({
  state: {
    session: null as { admin: { id: string; role: string } } | null,
    aal: null as { currentLevel: string; nextLevel: string } | null,
    aalError: null as Error | null,
    aalThrows: false,
    factors: null as { all: Array<{ factor_type: string; status: string }> } | null,
    factorsError: null as Error | null,
    factorsThrows: false,
    pathname: "",
  },
}));

class RedirectError extends Error {
  constructor(public to: string) {
    super("REDIRECT:" + to);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(state.pathname ? { "x-pathname": state.pathname } : {}),
}));
vi.mock("@/lib/auth", () => ({
  getCurrentAdmin: async () => state.session,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: async () => {
          if (state.aalThrows) throw new Error("mfa aal transport error");
          return { data: state.aal, error: state.aalError };
        },
        listFactors: async () => {
          if (state.factorsThrows) throw new Error("mfa factors transport error");
          return { data: state.factors, error: state.factorsError };
        },
      },
    },
  }),
}));

import { requireAdminAction, requireCapability, verifyAdminRouteAccess } from "./admin-rbac-guard";
import { ADMIN_ACTIVITY_COOKIE, sealAdminActivityMark } from "./admin-activity";

const VERIFIED_TOTP = { all: [{ factor_type: "totp", status: "verified" }] };

beforeEach(() => {
  state.session = null;
  state.aal = null;
  state.aalError = null;
  state.aalThrows = false;
  state.factors = VERIFIED_TOTP;
  state.factorsError = null;
  state.factorsThrows = false;
  state.pathname = "";
});

async function expectRedirect(fn: () => Promise<unknown>, to: string) {
  await expect(fn()).rejects.toMatchObject({ to });
}

describe("requireAdminAction", () => {
  it("sin sesión → redirige a /admin/login", async () => {
    state.session = null;
    await expectRedirect(() => requireAdminAction(), "/admin/login");
  });

  it("BLOCKER: sesión aal1 con MFA inscrito → redirige a /admin/login/mfa (aborta la acción)", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER }),
      "/admin/login/mfa",
    );
  });

  it("sesión aal2 con rol correcto → pasa y devuelve la sesión", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    const s = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
    expect(s.admin.id).toBe("a1");
  });

  it("rol no permitido (aal2 ok) → redirige a /admin/dashboard?denied=1", async () => {
    state.session = { admin: { id: "a1", role: "FULFILLMENT" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER }),
      "/admin/dashboard?denied=1",
    );
  });

  it("CMS_EDITOR con rol no permitido → redirige a SU home (/admin/contenido?denied=1, anti-loop)", async () => {
    state.session = { admin: { id: "c1", role: "CMS_EDITOR" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER }),
      "/admin/contenido?denied=1",
    );
  });

  it("CMS_EDITOR ejecuta actions de contenido (set CONTENT)", async () => {
    state.session = { admin: { id: "c1", role: "CMS_EDITOR" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    const s = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });
    expect(s.admin.id).toBe("c1");
  });

  it("MANAGER NO ejecuta actions de contenido (set CONTENT) → su home es el dashboard", async () => {
    state.session = { admin: { id: "m1", role: "MANAGER" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT }),
      "/admin/dashboard?denied=1",
    );
  });

  it("B-1: sin factor TOTP (nextLevel aal1) → enrolamiento forzado (/admin/seguridad?enroll=required)", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal1", nextLevel: "aal1" };
    state.factors = { all: [] };
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER }),
      "/admin/seguridad?enroll=required",
    );
  });

  it("B-1: factor TOTP sin verificar cuenta como sin factor → enrolamiento forzado", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal1", nextLevel: "aal1" };
    state.factors = { all: [{ factor_type: "totp", status: "unverified" }] };
    await expectRedirect(() => requireAdminAction(), "/admin/seguridad?enroll=required");
  });

  it("B-1 + SEC-03: sin factor en /admin/seguridad BLOQUEA acciones mutantes por defecto (exige allowMfaEnrollment explícito)", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal1", nextLevel: "aal1" };
    state.factors = { all: [] };
    state.pathname = "/admin/seguridad";

    // Cualquier Server Action privilegiada invocada vía POST /admin/seguridad debe abortar.
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS }),
      "/admin/seguridad?enroll=required",
    );

    // Solo la página de enrolamiento inicial (allowMfaEnrollment: true) puede renderizarse sin factor.
    const s = await requireAdminAction({
      roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS,
      allowMfaEnrollment: true,
    });
    expect(s.admin.id).toBe("a1");
  });

  it("SEC-03: admin YA enrolado en /admin/seguridad con allowMfaEnrollment:true pero en aal1 o aal null → exige MFA", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.factors = VERIFIED_TOTP;
    state.pathname = "/admin/seguridad";

    state.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS, allowMfaEnrollment: true }),
      "/admin/login/mfa",
    );

    state.aal = null;
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS, allowMfaEnrollment: true }),
      "/admin/login/mfa",
    );
  });

  it("SEC-03: listFactors con error o null en /admin/seguridad falla cerrado a /admin/login (sin loop)", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.pathname = "/admin/seguridad";
    state.factors = null;
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS, allowMfaEnrollment: true }),
      "/admin/login",
    );

    state.factors = { all: [] };
    state.factorsError = new Error("auth down");
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS, allowMfaEnrollment: true }),
      "/admin/login",
    );
  });

  it("SEC-03: AAL null, error de API, excepción o currentLevel !== aal2 → falla cerrado a /admin/login/mfa", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };

    // 1. data = null
    state.aal = null;
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER }),
      "/admin/login/mfa",
    );

    // 2. aal1 + nextLevel aal1 (inconsistencia de claims con factor verificado)
    state.aal = { currentLevel: "aal1", nextLevel: "aal1" };
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER }),
      "/admin/login/mfa",
    );

    // 3. Error devuelto por Supabase Auth incluso si data viniera poblada
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    state.aalError = new Error("jwt decode failed");
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER }),
      "/admin/login/mfa",
    );

    // 4. Excepción de transporte en getAuthenticatorAssuranceLevel
    state.aalError = null;
    state.aalThrows = true;
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER }),
      "/admin/login/mfa",
    );
  });

  it("B-1: el check de enrolamiento también aplica con aal2:false (es anterior e independiente)", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.factors = null; // listFactors falló/vacío → fail-closed al enrolamiento
    await expectRedirect(
      () => requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER, aal2: false }),
      "/admin/seguridad?enroll=required",
    );
  });

  it("aal2:false salta el chequeo de MFA (para acciones donde no aplica)", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    const s = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER, aal2: false });
    expect(s.admin.id).toBe("a1");
  });

  it("MANAGER accede a acción MANAGER_UP (catálogo)", async () => {
    state.session = { admin: { id: "m1", role: "MANAGER" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    const s = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
    expect(s.admin.id).toBe("m1");
  });

  it("CMS_EDITOR entra a /admin/seguridad (ALL_PLUS_CMS — autoservicio MFA obligatorio)", async () => {
    state.session = { admin: { id: "c1", role: "CMS_EDITOR" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    const s = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });
    expect(s.admin.id).toBe("c1");
  });

  it("S17: requireCapability permite CUSTOMER_SUPPORT en support:manage y bloquea contacts:merge", async () => {
    state.session = { admin: { id: "cs1", role: "CUSTOMER_SUPPORT" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    const s = await requireCapability("support:manage");
    expect(s.admin.id).toBe("cs1");

    await expectRedirect(() => requireCapability("contacts:merge"), "/admin/dashboard?denied=1");
  });

  it("S17: verifyAdminRouteAccess por capability permite FINANCE_ANALYST en finance:export_csv y bloquea MANAGER", async () => {
    state.session = { admin: { id: "fin1", role: "FINANCE_ANALYST" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    const okRes = await verifyAdminRouteAccess({ capability: "finance:export_csv" });
    expect(okRes.ok).toBe(true);

    state.session = { admin: { id: "mgr1", role: "MANAGER" } };
    expect(await verifyAdminRouteAccess({ capability: "finance:export_csv" })).toEqual({
      ok: false,
      status: 403,
      reason: "FORBIDDEN_ROLE",
    });
  });
});

describe("verifyAdminRouteAccess ([SEC-01] — Route Handlers)", () => {
  beforeEach(() => {
    process.env.CSRF_SECRET =
      process.env.CSRF_SECRET || "test-csrf-secret-at-least-32-chars-long!!";
  });

  it("sin sesión → 401 UNAUTHENTICATED", async () => {
    state.session = null;
    expect(await verifyAdminRouteAccess({ roles: ADMIN_ROLE_SETS.ALL })).toEqual({
      ok: false,
      status: 401,
      reason: "UNAUTHENTICATED",
    });
  });

  it("sesión aal1 (solo contraseña, sin 2º factor) → 403 MFA_REQUIRED", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    expect(await verifyAdminRouteAccess({ roles: ADMIN_ROLE_SETS.ALL })).toEqual({
      ok: false,
      status: 403,
      reason: "MFA_REQUIRED",
    });
  });

  it("SEC-03: verifyAdminRouteAccess falla cerrado ante AAL null, error o excepción, y ante error en listFactors", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };

    state.aal = null;
    expect(await verifyAdminRouteAccess({ roles: ADMIN_ROLE_SETS.ALL })).toEqual({
      ok: false,
      status: 403,
      reason: "MFA_REQUIRED",
    });

    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    state.aalError = new Error("auth error");
    expect(await verifyAdminRouteAccess({ roles: ADMIN_ROLE_SETS.ALL })).toEqual({
      ok: false,
      status: 403,
      reason: "MFA_REQUIRED",
    });

    state.aalError = null;
    state.aalThrows = true;
    expect(await verifyAdminRouteAccess({ roles: ADMIN_ROLE_SETS.ALL })).toEqual({
      ok: false,
      status: 403,
      reason: "MFA_REQUIRED",
    });

    state.aalThrows = false;
    state.factorsError = new Error("factors error");
    expect(await verifyAdminRouteAccess({ roles: ADMIN_ROLE_SETS.ALL })).toEqual({
      ok: false,
      status: 403,
      reason: "MFA_REQUIRED",
    });

    state.factorsError = null;
    state.factorsThrows = true;
    expect(await verifyAdminRouteAccess({ roles: ADMIN_ROLE_SETS.ALL })).toEqual({
      ok: false,
      status: 403,
      reason: "MFA_REQUIRED",
    });
  });

  it("cuenta admin sin factor TOTP verificado → 403 MFA_NOT_ENROLLED", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.factors = { all: [] };
    state.aal = { currentLevel: "aal1", nextLevel: "aal1" };
    expect(await verifyAdminRouteAccess({ roles: ADMIN_ROLE_SETS.ALL })).toEqual({
      ok: false,
      status: 403,
      reason: "MFA_NOT_ENROLLED",
    });
  });

  it("CMS_EDITOR con aal2 → 403 FORBIDDEN_ROLE en rutas operativas (ALL)", async () => {
    state.session = { admin: { id: "c1", role: "CMS_EDITOR" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    expect(await verifyAdminRouteAccess({ roles: ADMIN_ROLE_SETS.ALL })).toEqual({
      ok: false,
      status: 403,
      reason: "FORBIDDEN_ROLE",
    });
  });

  it("checkIdle:true rechaza request sin cookie admin_last_activity o vencida (>30m)", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };

    const noCookieReq = new Request("http://localhost/admin/email-templates/order/preview");
    expect(
      await verifyAdminRouteAccess({
        roles: ADMIN_ROLE_SETS.SUPER,
        req: noCookieReq,
        checkIdle: true,
      }),
    ).toEqual({
      ok: false,
      status: 401,
      reason: "IDLE_EXPIRED",
    });

    const staleMark = sealAdminActivityMark(Date.now() - 35 * 60 * 1000);
    const staleReq = new Request("http://localhost/admin/email-templates/order/preview", {
      headers: { cookie: `${ADMIN_ACTIVITY_COOKIE}=${encodeURIComponent(staleMark)}` },
    });
    expect(
      await verifyAdminRouteAccess({
        roles: ADMIN_ROLE_SETS.SUPER,
        req: staleReq,
        checkIdle: true,
      }),
    ).toEqual({
      ok: false,
      status: 401,
      reason: "IDLE_EXPIRED",
    });
  });

  it("checkIdle:true permite sesión aal2 + rol válido + marca fresca", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    const freshMark = sealAdminActivityMark(Date.now() - 5 * 60 * 1000);
    const req = new Request("http://localhost/admin/email-templates/order/preview", {
      headers: { cookie: `${ADMIN_ACTIVITY_COOKIE}=${encodeURIComponent(freshMark)}` },
    });
    const res = await verifyAdminRouteAccess({
      roles: ADMIN_ROLE_SETS.SUPER,
      req,
      checkIdle: true,
    });
    expect(res.ok).toBe(true);
  });
});
