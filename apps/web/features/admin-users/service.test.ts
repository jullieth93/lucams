/*
 * Anti-lockout de admin-users (auditoría v3 · #13) — UNIT test con prisma mockeado.
 *
 * Por qué unit y no integración: el invariante "último SUPERADMIN activo" cuenta SUPERADMINs de
 * forma GLOBAL, y la Supabase de dev compartida SIEMPRE tiene el admin real (SUPERADMIN activo)
 * como backup → el caso "es el último" no se puede reproducir con fixtures aislados. Mockeando el
 * conteo se prueba la lógica de forma determinista, sin DB y sin contaminar /admin real; corre en
 * el gate por-PR (no necesita Postgres/GoTrue).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, adminSignOut } = vi.hoisted(() => {
  const prismaObj = {
    adminUser: {
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prismaObj.$transaction.mockImplementation(
    async (cb: (tx: typeof prismaObj) => Promise<unknown>) => cb(prismaObj),
  );
  return {
    mockPrisma: prismaObj,
    adminSignOut: vi.fn(async () => ({ error: null })),
  };
});
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { auth: { admin: { signOut: adminSignOut } } },
}));
vi.mock("server-only", () => ({}));

import { AdminUserValidationError, changeAdminRole, toggleAdminActive } from "./service";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
  );
  mockPrisma.adminUser.update.mockResolvedValue({});
});

describe("admin-users — anti-lockout y blindaje de sesiones (#13)", () => {
  describe("changeAdminRole", () => {
    it("rechaza cambiar tu propio rol (sin consultar la DB)", async () => {
      await expect(changeAdminRole("me", "MANAGER", "me")).rejects.toBeInstanceOf(
        AdminUserValidationError,
      );
      expect(mockPrisma.adminUser.findFirst).not.toHaveBeenCalled();
    });

    it("rechaza degradar al ÚLTIMO SUPERADMIN activo (sin backup) y NO actualiza", async () => {
      mockPrisma.adminUser.findFirst.mockResolvedValue({
        id: "a1",
        role: "SUPERADMIN",
        isActive: true,
        email: "x@y.z",
      });
      mockPrisma.adminUser.count.mockResolvedValue(0); // no hay otro SUPERADMIN activo
      await expect(changeAdminRole("a1", "MANAGER", "actor")).rejects.toBeInstanceOf(
        AdminUserValidationError,
      );
      expect(mockPrisma.adminUser.update).not.toHaveBeenCalled();
    });

    it("permite degradar un SUPERADMIN si hay otro activo (backup)", async () => {
      mockPrisma.adminUser.findFirst.mockResolvedValue({
        id: "a1",
        role: "SUPERADMIN",
        isActive: true,
        email: "x@y.z",
      });
      mockPrisma.adminUser.count.mockResolvedValue(1); // sí hay backup
      await changeAdminRole("a1", "MANAGER", "actor");
      expect(mockPrisma.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: "MANAGER" }) }),
      );
    });

    it("no aplica el anti-lockout al degradar un no-SUPERADMIN (no consulta el conteo)", async () => {
      mockPrisma.adminUser.findFirst.mockResolvedValue({
        id: "a1",
        role: "MANAGER",
        isActive: true,
        email: "x@y.z",
      });
      await changeAdminRole("a1", "FULFILLMENT", "actor");
      expect(mockPrisma.adminUser.count).not.toHaveBeenCalled();
      expect(mockPrisma.adminUser.update).toHaveBeenCalled();
    });

    it("rechaza si el admin no existe", async () => {
      mockPrisma.adminUser.findFirst.mockResolvedValue(null);
      await expect(changeAdminRole("nope", "MANAGER", "actor")).rejects.toBeInstanceOf(
        AdminUserValidationError,
      );
    });
  });

  describe("toggleAdminActive", () => {
    it("rechaza desactivarte a ti mismo (sin consultar la DB)", async () => {
      await expect(toggleAdminActive("me", "me")).rejects.toBeInstanceOf(AdminUserValidationError);
      expect(mockPrisma.adminUser.findFirst).not.toHaveBeenCalled();
    });

    it("rechaza desactivar al ÚLTIMO SUPERADMIN activo y NO actualiza", async () => {
      mockPrisma.adminUser.findFirst.mockResolvedValue({
        id: "a1",
        role: "SUPERADMIN",
        isActive: true,
        email: "x@y.z",
      });
      mockPrisma.adminUser.count.mockResolvedValue(0);
      await expect(toggleAdminActive("a1", "actor")).rejects.toBeInstanceOf(
        AdminUserValidationError,
      );
      expect(mockPrisma.adminUser.update).not.toHaveBeenCalled();
    });

    it("permite desactivar un SUPERADMIN si hay otro activo y revoca sus sesiones Supabase", async () => {
      mockPrisma.adminUser.findFirst.mockResolvedValue({
        id: "a1",
        supabaseUserId: "sb_target_1",
        role: "SUPERADMIN",
        isActive: true,
        email: "x@y.z",
      });
      mockPrisma.adminUser.count.mockResolvedValue(1);
      mockPrisma.adminUser.update.mockResolvedValueOnce({
        id: "a1",
        isActive: false,
        email: "x@y.z",
      });
      await toggleAdminActive("a1", "actor");
      expect(mockPrisma.adminUser.update).toHaveBeenCalled();
      expect(adminSignOut).toHaveBeenCalledWith("sb_target_1", "global");
    });
  });
});
