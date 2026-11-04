import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ACTIVITY_COOKIE, sealAdminActivityMark } from "@/lib/admin-activity";

const { state } = vi.hoisted(() => ({
  state: {
    session: null as { admin: { id: string; role: string } } | null,
    aal: { currentLevel: "aal2", nextLevel: "aal2" } as {
      currentLevel: string;
      nextLevel: string;
    } | null,
    factors: { all: [{ factor_type: "totp", status: "verified" }] } as {
      all: Array<{ factor_type: string; status: string }>;
    } | null,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  getCurrentAdmin: async () => state.session,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      mfa: {
        listFactors: async () => ({ data: state.factors }),
        getAuthenticatorAssuranceLevel: async () => ({ data: state.aal }),
      },
    },
  }),
}));
vi.mock("@/features/emails/registry", () => ({
  getEmailTemplate: (id: string) =>
    id === "order-confirmation"
      ? { renderSample: async () => ({ html: "<html><body>Pedido ejemplo</body></html>" }) }
      : null,
  renderCartRecoveryEmail: async () => ({
    html: "<html><body>Carrito abandonado ejemplo</body></html>",
  }),
}));
vi.mock("@/features/cart/admin-service", () => ({
  getAbandonedCartDetail: async (id: string) =>
    id === "cart-1"
      ? { id: "cart-1", email: "cliente@test.co", items: [{ name: "Imán Polaroid", qty: 1 }] }
      : null,
}));
vi.mock("@/features/emails/layout", () => ({
  getSiteUrl: async () => "https://lucamsshop.com",
}));
vi.mock("@/features/newsletter/unsubscribe", () => ({
  encodeUnsubscribeParam: (email: string) => Buffer.from(email).toString("base64url"),
}));

import { GET as getTemplatePreview } from "./route";
import { GET as getCartPreview } from "@/app/admin/(panel)/carritos/[id]/preview/route";

function makeAdminReq(url: string, opts: { freshCookie?: boolean } = {}) {
  const headers = new Headers();
  if (opts.freshCookie !== false) {
    const mark = sealAdminActivityMark(Date.now() - 60_000);
    headers.set("cookie", `${ADMIN_ACTIVITY_COOKIE}=${encodeURIComponent(mark)}`);
  }
  return new Request(url, { headers });
}

describe("Route Handlers de preview HTML admin ([SEC-01])", () => {
  beforeEach(() => {
    process.env.CSRF_SECRET =
      process.env.CSRF_SECRET || "test-csrf-secret-at-least-32-chars-long!!";
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    state.factors = { all: [{ factor_type: "totp", status: "verified" }] };
  });

  it("email-templates preview bloquea sesión aal1 (403) y falta de marca de actividad (401)", async () => {
    state.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    const rAal1 = await getTemplatePreview(
      makeAdminReq("http://localhost/admin/email-templates/order-confirmation/preview"),
      {
        params: Promise.resolve({ id: "order-confirmation" }),
      },
    );
    expect(rAal1.status).toBe(403);

    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    const rNoIdle = await getTemplatePreview(
      makeAdminReq("http://localhost/admin/email-templates/order-confirmation/preview", {
        freshCookie: false,
      }),
      { params: Promise.resolve({ id: "order-confirmation" }) },
    );
    expect(rNoIdle.status).toBe(401);
  });

  it("email-templates preview sirve HTML con Content-Security-Policy sandbox a SUPERADMIN aal2", async () => {
    const res = await getTemplatePreview(
      makeAdminReq("http://localhost/admin/email-templates/order-confirmation/preview"),
      { params: Promise.resolve({ id: "order-confirmation" }) },
    );
    expect(res.status).toBe(200);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("sandbox");
    expect(csp).toContain("default-src 'none'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("carritos preview bloquea aal1 / FULFILLMENT y entrega CSP sandbox a MANAGER aal2", async () => {
    state.session = { admin: { id: "f1", role: "FULFILLMENT" } };
    const deniedRole = await getCartPreview(
      makeAdminReq("http://localhost/admin/carritos/cart-1/preview"),
      { params: Promise.resolve({ id: "cart-1" }) },
    );
    expect(deniedRole.status).toBe(403);

    state.session = { admin: { id: "m1", role: "MANAGER" } };
    state.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    const deniedAal1 = await getCartPreview(
      makeAdminReq("http://localhost/admin/carritos/cart-1/preview"),
      { params: Promise.resolve({ id: "cart-1" }) },
    );
    expect(deniedAal1.status).toBe(403);

    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    const ok = await getCartPreview(
      makeAdminReq("http://localhost/admin/carritos/cart-1/preview"),
      { params: Promise.resolve({ id: "cart-1" }) },
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Security-Policy") ?? "").toContain("sandbox");
  });
});
