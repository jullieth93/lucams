/*
 * Tests del guard central de Server Actions admin (ADR-062 P0-1).
 *
 * El corazón del fix: una sesión aal1 (solo contraseña — p.ej. robada — con MFA
 * inscrito pero sin completar el 2º factor) DEBE ser rechazada al invocar cualquier
 * acción mutante, no solo al renderizar el layout. Verifica también el gate de rol y
 * que el chequeo de MFA solo aplica cuando la cuenta tiene 2 pasos activos.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROLE_SETS } from "./admin-rbac";

const { state } = vi.hoisted(() => ({
  state: {
    session: null as { admin: { id: string; role: string } } | null,
    aal: null as { currentLevel: string; nextLevel: string } | null,
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
vi.mock("@/lib/auth", () => ({
  getCurrentAdmin: async () => state.session,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.aal }) } },
  }),
}));

import { requireAdminAction } from "./admin-rbac-guard";

beforeEach(() => {
  state.session = null;
  state.aal = null;
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

  it("sin MFA inscrito (nextLevel aal1) → no bloquea (el candado solo aplica con 2 pasos activos)", async () => {
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal1", nextLevel: "aal1" };
    const s = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
    expect(s.admin.id).toBe("a1");
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
});
