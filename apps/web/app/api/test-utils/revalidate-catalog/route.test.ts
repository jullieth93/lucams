import { afterEach, describe, expect, it, vi } from "vitest";

// Auditoría 2026-11-08 — la ruta solo existe con E2E_UTILS_TOKEN configurada y
// exige el header (timing-safe); con token válido invalida el tag "catalog"
// con revalidateTag (Next 16: updateTag es solo para Server Actions).
const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag }));

import { POST } from "./route";

const TOKEN = "test-token-123";

function req(token?: string) {
  return new Request("http://localhost/api/test-utils/revalidate-catalog", {
    method: "POST",
    headers: token ? { "x-e2e-utils-token": token } : {},
  });
}

afterEach(() => {
  delete process.env.E2E_UTILS_TOKEN;
  revalidateTag.mockClear();
});

describe("POST /api/test-utils/revalidate-catalog", () => {
  it("sin E2E_UTILS_TOKEN en el servidor → 404 (la ruta no existe a efectos prácticos)", async () => {
    const res = await POST(req(TOKEN));
    expect(res.status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("token ausente o incorrecto → 404 (nunca delata que la ruta existe)", async () => {
    process.env.E2E_UTILS_TOKEN = TOKEN;
    expect((await POST(req())).status).toBe(404);
    expect((await POST(req("otro"))).status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("token válido → invalida el tag catalog sin ventana stale (expire 0)", async () => {
    process.env.E2E_UTILS_TOKEN = TOKEN;
    const res = await POST(req(TOKEN));
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("catalog", { expire: 0 });
  });
});
