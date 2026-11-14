import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaReauthRequiredError } from "@/lib/admin-reauth";

const mocks = vi.hoisted(() => ({
  requireRecentMfa: vi.fn(async () => {}),
  requireAdminAction: vi.fn(async () => ({
    user: { id: "user1" },
    admin: { id: "admin1", role: "SUPERADMIN" },
  })),
  recordAdminAction: vi.fn(async () => {}),
  createRedirect: vi.fn(),
  updateRedirect: vi.fn(),
  archiveRedirect: vi.fn(),
  restoreRedirect: vi.fn(),
  toggleRedirectActive: vi.fn(),
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
vi.mock("@/features/redirects/service", () => ({
  RedirectValidationError: class RedirectValidationError extends Error {},
  createRedirect: mocks.createRedirect,
  updateRedirect: mocks.updateRedirect,
  archiveRedirect: mocks.archiveRedirect,
  restoreRedirect: mocks.restoreRedirect,
  toggleRedirectActive: mocks.toggleRedirectActive,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { createRedirectAction, updateRedirectAction } from "./actions";

function form(toPath: string) {
  const fd = new FormData();
  fd.set("id", "redirect1");
  fd.set("fromPath", "/antigua");
  fd.set("toPath", toPath);
  fd.set("statusCode", "301");
  fd.set("description", "Prueba");
  fd.set("isActive", "on");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createRedirect.mockImplementation(async (input) => ({
    id: "redirect1",
    fromPath: input.fromPath,
    toPath: input.toPath,
  }));
  mocks.updateRedirect.mockImplementation(async (input) => ({
    id: input.id,
    fromPath: "/antigua",
    toPath: input.toPath,
  }));
});

describe("redirects externos — step-up MFA", () => {
  it("createRedirectAction bloquea un destino externo con MFA vencido", async () => {
    mocks.requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());

    const result = await createRedirectAction(null, form("https://example.com/destino"));

    expect(result.reauthRequired).toBe(true);
    expect(mocks.createRedirect).not.toHaveBeenCalled();
    expect(mocks.recordAdminAction).not.toHaveBeenCalled();
  });

  it("updateRedirectAction bloquea un destino externo con MFA vencido", async () => {
    mocks.requireRecentMfa.mockRejectedValueOnce(new MfaReauthRequiredError());

    const result = await updateRedirectAction(null, form("http://example.com/destino"));

    expect(result.reauthRequired).toBe(true);
    expect(mocks.updateRedirect).not.toHaveBeenCalled();
    expect(mocks.recordAdminAction).not.toHaveBeenCalled();
  });

  it("createRedirectAction permite un externo con MFA fresco", async () => {
    await expect(createRedirectAction(null, form("https://example.com/destino"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mocks.requireRecentMfa).toHaveBeenCalledOnce();
    expect(mocks.createRedirect).toHaveBeenCalledOnce();
    expect(mocks.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "redirect.create" }),
    );
  });

  it("updateRedirectAction permite un externo con MFA fresco", async () => {
    await expect(
      updateRedirectAction(null, form("https://example.com/actualizado")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.requireRecentMfa).toHaveBeenCalledOnce();
    expect(mocks.updateRedirect).toHaveBeenCalledOnce();
    expect(mocks.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "redirect.update" }),
    );
  });

  it("un destino interno conserva el flujo sin step-up", async () => {
    await expect(createRedirectAction(null, form("/legal/garantias"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mocks.requireRecentMfa).not.toHaveBeenCalled();
    expect(mocks.createRedirect).toHaveBeenCalledOnce();
  });
});
