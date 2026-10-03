/*
 * Unit tests — actions de CONTENIDO (mediateca).
 *
 * Regresión M-2 (auditoría cableado cliente↔admin 2026-10-02):
 * updateCmsMediaAltAction solo revalidaba /admin/contenido/mediateca → el alt,
 * servido al storefront dentro de getCmsImage/getCmsBanners (lib/cms.ts, tag
 * "cms", TTL 1h), quedaba stale hasta 1h. El fix añade updateTag("cms") tras
 * guardar, igual que publicar/despublicar/archivar.
 *
 * Upload y delete NO invalidan por diseño: el asset solo se ve cuando el campo
 * se guarda, y delete rechaza assets en uso (ver docstrings en actions.ts).
 *
 * Patrón: prisma/storage/cms-service/audit/guard/next/cache mockeados — mismo
 * harness que app/admin/(panel)/productos/image-actions.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { cmsMediaMocks, cmsServiceMocks, auditSpy, mockLogger, updateTagSpy, revalidatePathSpy } =
  vi.hoisted(() => ({
    cmsMediaMocks: {
      uploadCmsMedia: vi.fn(),
      updateCmsMediaAlt: vi.fn(),
      deleteCmsMedia: vi.fn(),
    },
    cmsServiceMocks: {
      createCmsField: vi.fn(),
      duplicateCmsField: vi.fn(),
      getCmsFieldById: vi.fn(),
      listCmsDraftFields: vi.fn(),
      moveCmsFieldToSection: vi.fn(),
      publishCmsFieldVersion: vi.fn(),
      saveCmsFieldDraft: vi.fn(),
      saveCmsFieldItems: vi.fn(),
      scheduleCmsFieldPublish: vi.fn(),
      softDeleteCmsField: vi.fn(),
      unpublishCmsField: vi.fn(),
      unscheduleCmsFieldPublish: vi.fn(),
      updateCmsPage: vi.fn(),
      updateCmsSection: vi.fn(),
    },
    auditSpy: { recordAdminAction: vi.fn(async () => {}) },
    mockLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    updateTagSpy: vi.fn(),
    revalidatePathSpy: vi.fn(),
  }));

vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: auditSpy.recordAdminAction }));
vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: vi.fn(async () => ({
    user: { id: "user1" },
    admin: { id: "admin1", role: "SUPERADMIN" },
  })),
}));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/lib/cms-media", () => cmsMediaMocks);
vi.mock("@/lib/storage", () => ({
  StorageError: class StorageError extends Error {},
}));
vi.mock("@/features/cms/service", () => ({
  CmsValidationError: class CmsValidationError extends Error {
    constructor(
      public field: "key" | "general",
      message: string,
    ) {
      super(message);
    }
  },
  ...cmsServiceMocks,
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

import { CmsValidationError } from "@/features/cms/service";
import { updateCmsMediaAltAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  cmsMediaMocks.updateCmsMediaAlt.mockResolvedValue(undefined);
});

describe("updateCmsMediaAltAction — invalidación storefront (M-2)", () => {
  it("guardar el alt emite updateTag('cms')", async () => {
    const fd = new FormData();
    fd.set("id", "media1");
    fd.set("alt", "Taza personalizada con foto de familia");

    const result = await updateCmsMediaAltAction(null, fd);

    expect(result).toEqual({ ok: true });
    expect(cmsMediaMocks.updateCmsMediaAlt).toHaveBeenCalledWith(
      "media1",
      "Taza personalizada con foto de familia",
    );
    expect(updateTagSpy).toHaveBeenCalledWith("cms");
    expect(updateTagSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin1",
        action: "cms.media.alt",
        entityType: "CmsMedia",
        entityId: "media1",
      }),
    );
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/contenido/mediateca");
  });

  it("sin id no guarda ni invalida", async () => {
    const result = await updateCmsMediaAltAction(null, new FormData());

    expect(result.error).toBeDefined();
    expect(cmsMediaMocks.updateCmsMediaAlt).not.toHaveBeenCalled();
    expect(updateTagSpy).not.toHaveBeenCalled();
  });

  it("error de validación del service no invalida la caché", async () => {
    cmsMediaMocks.updateCmsMediaAlt.mockRejectedValue(
      new CmsValidationError("general", "El texto alternativo es obligatorio."),
    );
    const fd = new FormData();
    fd.set("id", "media1");
    fd.set("alt", "");

    const result = await updateCmsMediaAltAction(null, fd);

    expect(result).toEqual({ error: "El texto alternativo es obligatorio." });
    expect(updateTagSpy).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
  });
});
