/*
 * Unit tests — actions de CATEGORÍAS: parse de visibleFilters y
 * featuredProductSlug (storefront 2026-10-20, campos editables desde el admin).
 *
 * Estrategia: la action corre con el SERVICE REAL (solo prisma, redirects,
 * audit, guard, logger y next/cache mockeados) para cubrir la cadena completa
 * FormData → parsePayload → schema → service → prisma. Mismo harness que
 * app/admin/(panel)/ocasiones/actions.test.ts.
 *
 * Lo que se fija acá:
 *   - visibleFilters llega en orden de marcado (checkboxes) y puede traer
 *     basura (HTML editado a mano) → se persiste filtrado a keys conocidas
 *     y en ORDEN CANÓNICO (lib/visible-filters.toCanonicalVisibleFilters).
 *   - featuredProductSlug: "" → null (sin destacado); formato inválido →
 *     fieldErrors sin tocar la DB; válido → persiste en minúsculas.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, auditSpy, mockLogger, updateTagSpy, revalidatePathSpy, redirectMocks } =
  vi.hoisted(() => ({
    mockPrisma: {
      category: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
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

import { createCategoryAction, updateCategoryAction } from "./actions";

/** FormData mínimo válido del form de categorías + overrides. */
function buildFormData(over: Record<string, string | string[]> = {}): FormData {
  const fd = new FormData();
  fd.set("name", "Categoría Test");
  fd.set("slug", "categoria-test");
  fd.set("description", "");
  fd.set("parentId", "");
  fd.set("icon", "");
  fd.set("gradient", "");
  fd.set("richDescription", "");
  fd.set("useCase", "");
  fd.set("defaultSort", "");
  fd.set("featuredProductSlug", "");
  fd.set("isActive", "on");
  for (const [k, v] of Object.entries(over)) {
    if (Array.isArray(v)) {
      fd.delete(k);
      for (const item of v) fd.append(k, item);
    } else {
      fd.set(k, v);
    }
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  // findUnique: por slug (conflict check) → null (libre); por id (prevCategory /
  // parent actual en update) → la categoría existente con el MISMO slug (sin
  // rename → no se crean redirects A11-02).
  mockPrisma.category.findUnique.mockImplementation(({ where }: { where: { id?: string } }) =>
    where.id ? { id: where.id, slug: "categoria-test", parentId: null } : null,
  );
  mockPrisma.category.findFirst.mockResolvedValue(null); // nextOrderInGroup → 0
  mockPrisma.category.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "c1", ...data }),
  );
  mockPrisma.category.update.mockImplementation(
    ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      Promise.resolve({ id: where.id, parentId: null, ...data }),
  );
});

describe("updateCategoryAction — visibleFilters / featuredProductSlug", () => {
  it("persiste visibleFilters filtrado a keys conocidas y en orden canónico", async () => {
    const fd = buildFormData({
      // Orden de marcado + una key inyectada a mano que no existe.
      visibleFilters: ["ocasion", "hack-inyectada", "buscar", "precio"],
      featuredProductSlug: "prod-estrella",
    });
    fd.set("id", "c1");

    const result = await updateCategoryAction(null, fd);

    expect(result).toEqual({});
    expect(mockPrisma.category.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({
        visibleFilters: ["buscar", "precio", "ocasion"], // canónico, no orden de clic
        featuredProductSlug: "prod-estrella",
      }),
    });
    expect(updateTagSpy).toHaveBeenCalledWith("catalog");
  });

  it("sin checkboxes marcados → visibleFilters [] (= todos) y slug vacío → null", async () => {
    const fd = buildFormData(); // sin visibleFilters; featuredProductSlug ""
    fd.set("id", "c1");

    const result = await updateCategoryAction(null, fd);

    expect(result).toEqual({});
    expect(mockPrisma.category.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ visibleFilters: [], featuredProductSlug: null }),
    });
  });

  it("featuredProductSlug con formato inválido → fieldErrors y NO toca la DB", async () => {
    const fd = buildFormData({ featuredProductSlug: "Slug Con Espacios!!" });
    fd.set("id", "c1");

    const result = await updateCategoryAction(null, fd);

    expect(result.error).toBe("Datos inválidos.");
    expect(result.fieldErrors?.featuredProductSlug?.[0]).toMatch(/minúsculas, números y guiones/);
    expect(mockPrisma.category.update).not.toHaveBeenCalled();
    expect(updateTagSpy).not.toHaveBeenCalled();
  });

  it("featuredProductSlug válido se normaliza a minúsculas antes de validar", async () => {
    const fd = buildFormData({ featuredProductSlug: "  Prod-Estrella  " });
    fd.set("id", "c1");

    const result = await updateCategoryAction(null, fd);

    expect(result).toEqual({});
    expect(mockPrisma.category.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ featuredProductSlug: "prod-estrella" }),
    });
  });
});

describe("createCategoryAction — visibleFilters / featuredProductSlug", () => {
  it("crea con ambos campos (normalizados) y redirige al listado", async () => {
    const fd = buildFormData({
      visibleFilters: ["precio", "buscar"],
      featuredProductSlug: "prod-estrella",
    });

    await expect(createCategoryAction(null, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockPrisma.category.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: "categoria-test",
        visibleFilters: ["buscar", "precio"],
        featuredProductSlug: "prod-estrella",
        createdBy: "admin1",
      }),
    });
    expect(updateTagSpy).toHaveBeenCalledWith("catalog");
  });

  it("featuredProductSlug inválido en creación → fieldErrors, no crea nada", async () => {
    const fd = buildFormData({ featuredProductSlug: "no_es_slug" });

    const result = await createCategoryAction(null, fd);

    expect(result.error).toBe("Datos inválidos.");
    expect(result.fieldErrors?.featuredProductSlug).toBeDefined();
    expect(mockPrisma.category.create).not.toHaveBeenCalled();
  });
});
