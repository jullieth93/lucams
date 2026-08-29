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
    factors: null as { all: Array<{ factor_type: string; status: string }> } | null,
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
        getAuthenticatorAssuranceLevel: async () => ({ data: state.aal }),
        listFactors: async () => ({ data: state.factors }),
      },
    },
  }),
}));

import { requireAdminAction } from "./admin-rbac-guard";

const VERIFIED_TOTP = { all: [{ factor_type: "totp", status: "verified" }] };

beforeEach(() => {
  state.session = null;
  state.aal = null;
  state.factors = VERIFIED_TOTP;
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

  it("B-1: sin factor PERO ya en /admin/seguridad → no redirige (anti-loop: es la pantalla de enrolamiento)", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal1", nextLevel: "aal1" };
    state.factors = { all: [] };
    state.pathname = "/admin/seguridad";
    const s = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });
    expect(s.admin.id).toBe("a1");
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
});
