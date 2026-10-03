/*
 * Unit tests — actions de OCASIONES (toggle inline).
 *
 * Regresión M-1 (auditoría cableado cliente↔admin 2026-10-02):
 * toggleOcasionActiveAction escribía prisma.ocasionTag.update DIRECTO, sin
 * updateTag("catalog") → pausar/activar una ocasión quedaba stale hasta 1h en
 * PLP, recomendador, /ocasion/[slug] y /api/catalog/ocasiones. El fix delega
 * en updateOcasionTag del service (que invalida, service.ts:134), mismo
 * patrón que toggleCategoryActiveAction.
 *
 * Estrategia: la action corre con el SERVICE REAL (solo prisma, redirects,
 * audit, guard, logger y next/cache mockeados) para cubrir la cadena completa
 * action → service → updateTag("catalog"). Mismo harness que
 * app/admin/(panel)/productos/image-actions.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, auditSpy, mockLogger, updateTagSpy, revalidatePathSpy, redirectMocks } =
  vi.hoisted(() => ({
    mockPrisma: {
      ocasionTag: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
    auditSpy: { recordAdminAction: vi.fn(async () => {}) },
    mockLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    updateTagSpy: vi.fn(),
    revalidatePathSpy: vi.fn(),
    redirectMocks: {
      createSlugRenameRedirect: vi.fn(async () => {}),
      archiveRedirectOccupyingPath: vi.fn(async () => {}),
    },
  }));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma, Prisma: { JsonNull: null } }));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: auditSpy.recordAdminAction }));
vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: vi.fn(async () => ({
    user: { id: "user1" },
    admin: { id: "admin1", role: "SUPERADMIN" },
  })),
}));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/features/redirects/service", () => ({
  createSlugRenameRedirect: redirectMocks.createSlugRenameRedirect,
  archiveRedirectOccupyingPath: redirectMocks.archiveRedirectOccupyingPath,
}));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathSpy,
  updateTag: updateTagSpy,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { toggleOcasionActiveAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.ocasionTag.update.mockResolvedValue({
    id: "oc1",
    slug: "dia-de-la-madre",
    isActive: true,
  });
});

describe("toggleOcasionActiveAction — invalidación storefront (M-1)", () => {
  it("activar delega en el service y emite updateTag('catalog')", async () => {
    const fd = new FormData();
    fd.set("id", "oc1");
    fd.set("next", "true");

    await toggleOcasionActiveAction(fd);

    // La escritura pasa por el service: setea updatedBy (auditoría de campo).
    expect(mockPrisma.ocasionTag.update).toHaveBeenCalledWith({
      where: { id: "oc1" },
      data: { isActive: true, updatedBy: "admin1" },
    });
    expect(updateTagSpy).toHaveBeenCalledWith("catalog");
    expect(updateTagSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin1",
        action: "ocasion.activate",
        entityType: "OcasionTag",
        entityId: "oc1",
      }),
    );
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/ocasiones");
    expect(revalidatePathSpy).toHaveBeenCalledWith("/productos");
  });

  it("pausar también emite updateTag('catalog')", async () => {
    mockPrisma.ocasionTag.update.mockResolvedValue({
      id: "oc1",
      slug: "dia-de-la-madre",
      isActive: false,
    });
    const fd = new FormData();
    fd.set("id", "oc1");
    fd.set("next", "false");

    await toggleOcasionActiveAction(fd);

    expect(mockPrisma.ocasionTag.update).toHaveBeenCalledWith({
      where: { id: "oc1" },
      data: { isActive: false, updatedBy: "admin1" },
    });
    expect(updateTagSpy).toHaveBeenCalledWith("catalog");
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ocasion.deactivate" }),
    );
  });

  it("sin id no escribe ni invalida", async () => {
    await toggleOcasionActiveAction(new FormData());

    expect(mockPrisma.ocasionTag.update).not.toHaveBeenCalled();
    expect(updateTagSpy).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
  });

  it("toggle sin cambio de slug no crea redirects (A11-02 no aplica)", async () => {
    const fd = new FormData();
    fd.set("id", "oc1");
    fd.set("next", "true");

    await toggleOcasionActiveAction(fd);

    expect(redirectMocks.createSlugRenameRedirect).not.toHaveBeenCalled();
    expect(redirectMocks.archiveRedirectOccupyingPath).not.toHaveBeenCalled();
  });
});
