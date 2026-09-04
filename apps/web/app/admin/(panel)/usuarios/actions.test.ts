/*
 * Wiring F-10 (auditoría pre-lanzamiento 2026-09-04): las acciones de gestión
 * de admins (promover, cambiar rol, activar/desactivar) exigen aal2 RECIENTE.
 * Con elevación vieja devuelven el marcador `reauthRequired` SIN tocar el
 * servicio ni redirigir (la UI abre el modal TOTP y reintenta); con elevación
 * fresca siguen su flujo normal (redirect incluido).
 *
 * Se usa el módulo REAL de lib/admin-reauth con el amr controlado por el stub
 * de Supabase. Todo lo demás mockeado (sin DB ni Supabase).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, redirect, promoteToAdmin, changeAdminRole, toggleAdminActive } = vi.hoisted(() => ({
  state: {
    aal: null as {
      currentLevel: string | null;
      nextLevel: string | null;
      currentAuthenticationMethods: unknown;
    } | null,
  },
  redirect: vi.fn(),
  promoteToAdmin: vi.fn(async () => ({
    id: "adm_new",
    email: "nuevo@lucamsshop.com",
    role: "MANAGER",
  })),
  changeAdminRole: vi.fn(async () => ({ role: "MANAGER", email: "admin@lucamsshop.com" })),
  toggleAdminActive: vi.fn(async () => ({ isActive: false, email: "admin@lucamsshop.com" })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: vi.fn(async () => ({
    user: { id: "sb_user_1" },
    admin: { id: "adm_1", role: "SUPERADMIN" },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.aal }) } },
  }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: vi.fn(async () => {}) }));
vi.mock("@/features/admin-users/service", () => ({
  promoteToAdmin,
  changeAdminRole,
  toggleAdminActive,
  AdminUserValidationError: class AdminUserValidationError extends Error {
    constructor(
      message: string,
      public field: string,
    ) {
      super(message);
    }
  },
}));

import { changeAdminRoleAction, promoteAdminAction, toggleAdminActiveAction } from "./actions";

const NOW = new Date("2026-09-04T15:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

function aal2WithTotp(secondsAgo: number) {
  return {
    currentLevel: "aal2",
    nextLevel: "aal2",
    currentAuthenticationMethods: [
      { method: "password", timestamp: NOW_SEC - 1800 },
      { method: "totp", timestamp: NOW_SEC - secondsAgo },
    ],
  };
}

function promoteForm(): FormData {
  const fd = new FormData();
  fd.set("email", "nuevo@lucamsshop.com");
  fd.set("role", "MANAGER");
  return fd;
}

function idRoleForm(role = "MANAGER"): FormData {
  const fd = new FormData();
  fd.set("id", "adm_target");
  fd.set("role", role);
  return fd;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  state.aal = aal2WithTotp(60);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("acciones de gestión de admins — step-up MFA (F-10)", () => {
  it("promoteAdminAction con aal2 viejo → reauthRequired, sin promover ni redirigir", async () => {
    state.aal = aal2WithTotp(20 * 60);

    const res = await promoteAdminAction(null, promoteForm());

    expect(res.reauthRequired).toBe(true);
    expect(res.error).toMatch(/confirmar tu identidad/);
    expect(promoteToAdmin).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("promoteAdminAction con aal2 fresco → promueve y redirige como antes", async () => {
    await promoteAdminAction(null, promoteForm());

    expect(promoteToAdmin).toHaveBeenCalledWith("nuevo@lucamsshop.com", "MANAGER", "adm_1");
    expect(redirect).toHaveBeenCalledWith("/admin/usuarios?promoted=1");
  });

  it("changeAdminRoleAction con aal2 viejo → marcador, sin cambiar rol", async () => {
    state.aal = aal2WithTotp(20 * 60);

    const res = await changeAdminRoleAction(idRoleForm());

    expect(res).toEqual({ reauthRequired: true });
    expect(changeAdminRole).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("changeAdminRoleAction con aal2 fresco → cambia el rol y redirige", async () => {
    await changeAdminRoleAction(idRoleForm());

    expect(changeAdminRole).toHaveBeenCalledWith("adm_target", "MANAGER", "adm_1");
    expect(redirect).toHaveBeenCalledWith("/admin/usuarios?role_changed=1");
  });

  it("toggleAdminActiveAction con aal2 viejo → marcador, sin desactivar", async () => {
    state.aal = aal2WithTotp(20 * 60);

    const fd = new FormData();
    fd.set("id", "adm_target");
    const res = await toggleAdminActiveAction(fd);

    expect(res).toEqual({ reauthRequired: true });
    expect(toggleAdminActive).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("toggleAdminActiveAction con aal2 fresco → desactiva y redirige", async () => {
    const fd = new FormData();
    fd.set("id", "adm_target");
    await toggleAdminActiveAction(fd);

    expect(toggleAdminActive).toHaveBeenCalledWith("adm_target", "adm_1");
    expect(redirect).toHaveBeenCalledWith("/admin/usuarios?deactivated=1");
  });
});
