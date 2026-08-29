/*
 * Tests de isCmsEditMode (C-9, auditoría 2026-08-24).
 *
 * La cookie `lucams_cms_edit` es auto-sembrable (`document.cookie=...`), así
 * que su sola presencia ya no revela las anotaciones data-cms-key: hace falta
 * una sesión admin real con rol de contenido. Se fija también la invariante de
 * rendimiento: cookie AUSENTE (todo el tráfico público) → cero lookups extra.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    cookieValue: undefined as string | undefined,
    admin: null as { user: { id: string }; admin: { role: string } } | null,
    getCurrentAdminCalls: 0,
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "lucams_cms_edit" && state.cookieValue !== undefined
        ? { name, value: state.cookieValue }
        : undefined,
  }),
}));
vi.mock("@/lib/auth", () => ({
  getCurrentAdmin: async () => {
    state.getCurrentAdminCalls++;
    return state.admin;
  },
}));

import { isCmsEditMode } from "./cms-edit-mode";

beforeEach(() => {
  state.cookieValue = undefined;
  state.admin = null;
  state.getCurrentAdminCalls = 0;
});

describe("isCmsEditMode", () => {
  it("cookie ausente (tráfico público) → false SIN consultar sesión (cero lookups)", async () => {
    expect(await isCmsEditMode()).toBe(false);
    expect(state.getCurrentAdminCalls).toBe(0);
  });

  it("cookie con valor distinto de '1' → false sin consultar sesión", async () => {
    state.cookieValue = "0";
    expect(await isCmsEditMode()).toBe(false);
    expect(state.getCurrentAdminCalls).toBe(0);
  });

  it.each(["SUPERADMIN", "CMS_EDITOR"])("cookie + admin %s (rol CONTENT) → true", async (role) => {
    state.cookieValue = "1";
    state.admin = { user: { id: "u1" }, admin: { role } };
    expect(await isCmsEditMode()).toBe(true);
  });

  it("cookie + admin SIN rol de contenido (MANAGER) → false", async () => {
    state.cookieValue = "1";
    state.admin = { user: { id: "u1" }, admin: { role: "MANAGER" } };
    expect(await isCmsEditMode()).toBe(false);
  });

  it("cookie auto-sembrada sin sesión admin → false (el hueco de C-9)", async () => {
    state.cookieValue = "1";
    state.admin = null;
    expect(await isCmsEditMode()).toBe(false);
  });
});
