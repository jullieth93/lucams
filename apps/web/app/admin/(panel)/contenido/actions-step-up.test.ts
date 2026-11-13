import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaReauthRequiredError } from "@/lib/admin-reauth";

const mocks = vi.hoisted(() => ({
  requireRecentMfa: vi.fn(async () => {}),
  requireAdminAction: vi.fn(async () => ({
    user: { id: "user1", email: "admin@lucamsshop.com" },
    admin: { id: "admin1", role: "SUPERADMIN" },
  })),
  recordAdminAction: vi.fn(async () => {}),
  getCmsFieldById: vi.fn(),
  getCmsSectionPageSlug: vi.fn(),
  createCmsField: vi.fn(),
  duplicateCmsField: vi.fn(),
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
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/admin-reauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-reauth")>();
  return { ...actual, requireRecentMfa: mocks.requireRecentMfa };
});
vi.mock("@/lib/admin-rbac-guard", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: mocks.recordAdminAction }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/storage", () => ({ StorageError: class StorageError extends Error {} }));
vi.mock("@/lib/cms-media", () => ({
  deleteCmsMedia: vi.fn(),
  updateCmsMediaAlt: vi.fn(),
  uploadCmsMedia: vi.fn(),
}));
vi.mock("@/features/cms/service", () => ({
  CmsValidationError: class CmsValidationError extends Error {},
  createCmsField: mocks.createCmsField,
  duplicateCmsField: mocks.duplicateCmsField,
  getCmsFieldById: mocks.getCmsFieldById,
  getCmsSectionPageSlug: mocks.getCmsSectionPageSlug,
  listCmsDraftFields: mocks.listCmsDraftFields,
  moveCmsFieldToSection: mocks.moveCmsFieldToSection,
  publishCmsFieldVersion: mocks.publishCmsFieldVersion,
  saveCmsFieldDraft: mocks.saveCmsFieldDraft,
  saveCmsFieldItems: mocks.saveCmsFieldItems,
  scheduleCmsFieldPublish: mocks.scheduleCmsFieldPublish,
  softDeleteCmsField: mocks.softDeleteCmsField,
  unpublishCmsField: mocks.unpublishCmsField,
  unscheduleCmsFieldPublish: mocks.unscheduleCmsFieldPublish,
  updateCmsPage: mocks.updateCmsPage,
  updateCmsSection: mocks.updateCmsSection,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  updateTag: mocks.updateTag,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  createCmsFieldAction,
  deleteCmsFieldAction,
  publishAllCmsDraftsAction,
  publishCmsFieldAction,
  saveCmsFieldAction,
  saveCmsFieldItemsAction,
  scheduleCmsPublishAction,
} from "./actions";

const FIELD_ID = `c${"a".repeat(24)}`;
const VERSION_ID = `c${"b".repeat(24)}`;
const SECTION_ID = `c${"c".repeat(24)}`;

function field(pageSlug = "global") {
  return {
    id: FIELD_ID,
    key: "site.test",
    kind: "SETTING",
    section: { page: { slug: pageSlug } },
    versions: [{ id: VERSION_ID }],
  };
}

function saveForm() {
  const fd = new FormData();
  fd.set("id", FIELD_ID);
  fd.set("body", "Nuevo valor");
  return fd;
}

function createForm() {
  const fd = new FormData();
  fd.set("sectionId", SECTION_ID);
  fd.set("key", "site.new_setting");
  fd.set("kind", "SETTING");
  fd.set("label", "Nuevo ajuste");
  fd.set("type", "TEXT");
  fd.set("category", "global");
  fd.set("body", "Valor inicial");
  return fd;
}

function versionForm() {
  const fd = new FormData();
  fd.set("fieldId", FIELD_ID);
  fd.set("versionId", VERSION_ID);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCmsFieldById.mockResolvedValue(field());
  mocks.getCmsSectionPageSlug.mockResolvedValue("global");
  mocks.listCmsDraftFields.mockResolvedValue([field()]);
});

describe("CMS global — step-up MFA obligatorio", () => {
  it("saveCmsFieldAction rechaza MFA vencido sin crear una versión", async () => {
    mocks.requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());

    const result = await saveCmsFieldAction(null, saveForm());

    expect(result.reauthRequired).toBe(true);
    expect(mocks.saveCmsFieldDraft).not.toHaveBeenCalled();
    expect(mocks.recordAdminAction).not.toHaveBeenCalled();
  });

  it("saveCmsFieldItemsAction rechaza MFA vencido sin reemplazar filas", async () => {
    mocks.requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());
    const fd = new FormData();
    fd.set("id", FIELD_ID);
    fd.set("items", JSON.stringify([{ label: "Uno" }]));

    const result = await saveCmsFieldItemsAction(null, fd);

    expect(result.reauthRequired).toBe(true);
    expect(mocks.saveCmsFieldItems).not.toHaveBeenCalled();
    expect(mocks.recordAdminAction).not.toHaveBeenCalled();
  });

  it("createCmsFieldAction rechaza MFA vencido antes de crear un ajuste global", async () => {
    mocks.requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());

    const result = await createCmsFieldAction(null, createForm());

    expect(result.reauthRequired).toBe(true);
    expect(mocks.getCmsSectionPageSlug).toHaveBeenCalledWith(SECTION_ID);
    expect(mocks.createCmsField).not.toHaveBeenCalled();
  });

  it("publishCmsFieldAction rechaza MFA vencido sin publicar ni redirigir", async () => {
    mocks.requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());

    const result = await publishCmsFieldAction(versionForm());

    expect(result?.reauthRequired).toBe(true);
    expect(mocks.publishCmsFieldVersion).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("deleteCmsFieldAction rechaza MFA vencido sin archivar el campo", async () => {
    mocks.requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());

    const result = await deleteCmsFieldAction(versionForm());

    expect(result?.reauthRequired).toBe(true);
    expect(mocks.softDeleteCmsField).not.toHaveBeenCalled();
    expect(mocks.recordAdminAction).not.toHaveBeenCalled();
  });

  it("scheduleCmsPublishAction rechaza MFA vencido sin programar la publicación", async () => {
    mocks.requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());
    const fd = versionForm();
    fd.set("publishAt", "2099-01-01T10:00");

    const result = await scheduleCmsPublishAction(fd);

    expect(result?.reauthRequired).toBe(true);
    expect(mocks.scheduleCmsFieldPublish).not.toHaveBeenCalled();
  });

  it("publishAllCmsDraftsAction no deja un bypass para borradores globales", async () => {
    mocks.requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());

    const result = await publishAllCmsDraftsAction(new FormData());

    expect(result?.reauthRequired).toBe(true);
    expect(mocks.publishCmsFieldVersion).not.toHaveBeenCalled();
    expect(mocks.recordAdminAction).not.toHaveBeenCalled();
  });

  it("un campo editorial fuera de global conserva su flujo sin step-up", async () => {
    mocks.getCmsFieldById.mockResolvedValue(field("home"));

    const result = await saveCmsFieldAction(null, saveForm());

    expect(result.ok).toBe(true);
    expect(mocks.requireRecentMfa).not.toHaveBeenCalled();
    expect(mocks.saveCmsFieldDraft).toHaveBeenCalledOnce();
  });

  it("createCmsFieldAction rechaza una sección inexistente sin pedir MFA ni escribir", async () => {
    mocks.getCmsSectionPageSlug.mockResolvedValueOnce(null);

    const result = await createCmsFieldAction(null, createForm());

    expect(result.error).toBe("Sección no encontrada.");
    expect(mocks.requireRecentMfa).not.toHaveBeenCalled();
    expect(mocks.createCmsField).not.toHaveBeenCalled();
  });
});
