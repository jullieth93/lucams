import type { Page } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";

vi.mock("@lucams/db", () => ({ PrismaClient: vi.fn() }));
vi.mock("./e2e/_helpers/mfa", () => ({
  dismissAdminHelpOnboarding: vi.fn(),
  enrollTotpFactor: vi.fn(),
}));

import { clickAndWaitForURL } from "./e2e/_setup/global.setup";

describe("clickAndWaitForURL", () => {
  it("registra la espera de navegación antes de hacer clic", async () => {
    const waitForURL = vi.fn(async () => undefined);
    const click = vi.fn(async () => {
      expect(waitForURL).toHaveBeenCalledTimes(1);
    });
    const page = {
      waitForLoadState: vi.fn(async () => undefined),
      getByRole: vi.fn(() => ({ click })),
      waitForURL,
    } as unknown as Page;

    await clickAndWaitForURL(page, /iniciar sesión/i, /\/admin\/login\/mfa/);

    expect(click).toHaveBeenCalledOnce();
    expect(waitForURL).toHaveBeenCalledWith(/\/admin\/login\/mfa/, { timeout: 30_000 });
  });

  it("rechaza tras cuatro intentos cuando la navegación no ocurre", async () => {
    const click = vi.fn(async () => undefined);
    const page = {
      waitForLoadState: vi.fn(async () => undefined),
      getByRole: vi.fn(() => ({ click })),
      waitForURL: vi.fn(async () => {
        throw new Error("timeout");
      }),
      locator: vi.fn(() => ({ innerText: vi.fn(async () => "") })),
      url: vi.fn(() => "http://localhost:4000/admin/login"),
    } as unknown as Page;

    await expect(clickAndWaitForURL(page, /ingresar/i, /\/admin\/login\/mfa/)).rejects.toThrow(
      "nunca navegó tras 4 intentos",
    );
    expect(click).toHaveBeenCalledTimes(4);
  });
});
