import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaReauthRequiredError } from "@/lib/admin-reauth";

const mocks = vi.hoisted(() => ({
  requireRecentMfa: vi.fn(async () => {}),
  requireAdminAction: vi.fn(async () => ({
    user: { id: "user1", email: "admin@lucamsshop.com" },
    admin: { id: "admin1", role: "SUPERADMIN" },
  })),
  recordAdminAction: vi.fn(async () => {}),
  getEmailTemplate: vi.fn(),
  upsert: vi.fn(async () => {}),
  deleteMany: vi.fn(async () => {}),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
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
vi.mock("@/lib/db", () => ({
  prisma: {
    emailTemplateOverride: { upsert: mocks.upsert, deleteMany: mocks.deleteMany },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/features/emails/overrides", () => ({
  EMAIL_OVERRIDE_KEYS: ["SUBJECT", "PREHEADER", "HEADING"],
}));
vi.mock("@/features/emails/registry", () => ({ getEmailTemplate: mocks.getEmailTemplate }));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  updateTag: mocks.updateTag,
}));

import { saveEmailOverrideAction } from "./actions";

function form(value = "Asunto personalizado") {
  const fd = new FormData();
  fd.set("templateId", "order-confirmation");
  fd.set("key", "SUBJECT");
  fd.set("value", value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEmailTemplate.mockReturnValue({ renderSample: vi.fn() });
});

describe("saveEmailOverrideAction — step-up MFA", () => {
  it("rechaza MFA vencido sin guardar ni auditar el override", async () => {
    mocks.requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());

    const result = await saveEmailOverrideAction(null, form());

    expect(result.reauthRequired).toBe(true);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.recordAdminAction).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("también exige MFA reciente antes de restaurar el texto original", async () => {
    mocks.requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());

    const result = await saveEmailOverrideAction(null, form(""));

    expect(result.reauthRequired).toBe(true);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.recordAdminAction).not.toHaveBeenCalled();
  });

  it("con MFA fresco guarda, invalida la caché y audita", async () => {
    const result = await saveEmailOverrideAction(null, form());

    expect(result.ok).toBe(true);
    expect(mocks.requireRecentMfa).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { templateId_key: { templateId: "order-confirmation", key: "SUBJECT" } },
      }),
    );
    expect(mocks.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "email_template.override_save" }),
    );
    expect(mocks.updateTag).toHaveBeenCalledWith("email-overrides");
  });

  it("una plantilla desconocida se rechaza antes de pedir MFA o tocar DB", async () => {
    mocks.getEmailTemplate.mockReturnValueOnce(null);

    const result = await saveEmailOverrideAction(null, form());

    expect(result.error).toBe("Plantilla desconocida.");
    expect(mocks.requireRecentMfa).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
