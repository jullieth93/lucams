/*
 * Wiring F-10 (auditoría pre-lanzamiento 2026-09-04): refundOrderAction exige
 * aal2 RECIENTE además del guard SUPERADMIN. Con elevación vieja NO toca el
 * servicio de reembolso y devuelve el marcador `reauthRequired` que dispara el
 * modal TOTP en la UI; con elevación fresca opera igual que antes.
 *
 * Se usa el módulo REAL de lib/admin-reauth (la frescura se controla con el amr
 * del stub de Supabase) para que el test cubra guard + check juntos. Todo lo
 * demás mockeado (sin DB ni Supabase).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, refundOrder, recordAdminAction } = vi.hoisted(() => ({
  state: {
    aal: null as {
      currentLevel: string | null;
      nextLevel: string | null;
      currentAuthenticationMethods: unknown;
    } | null,
  },
  refundOrder: vi.fn(async () => ({ status: "refunded", amount: 150_000 })),
  recordAdminAction: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: vi.fn(async () => ({
    user: { id: "sb_user_1" },
    admin: { id: "adm_1", role: "SUPERADMIN" },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.aal }) } },
  }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction }));
vi.mock("@/features/orders/service", () => ({
  refundOrder,
  transitionOrder: vi.fn(),
}));
vi.mock("@/features/orders/saga", () => ({ processPaidOrder: vi.fn() }));
vi.mock("@/features/orders/emails", () => ({
  sendOrderShipped: vi.fn(),
  sendOrderDelivered: vi.fn(),
  sendOrderCancelled: vi.fn(),
}));
vi.mock("@/features/moderation/service", () => ({ orderHasUnmoderatedDesigns: vi.fn() }));
vi.mock("@/features/anti-abuse/blocklist-service", () => ({
  addBlockedIdentity: vi.fn(),
  BlocklistError: class BlocklistError extends Error {},
}));

import { refundOrderAction } from "./actions";

const NOW = new Date("2026-09-04T15:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

function aal2WithTotp(secondsAgo: number) {
  return {
    currentLevel: "aal2",
    nextLevel: "aal2",
    currentAuthenticationMethods: [
      { method: "password", timestamp: NOW_SEC - 1800 },
      { method: "otp", timestamp: NOW_SEC - secondsAgo },
    ],
  };
}

function form(orderId = "order_1", reason = "producto defectuoso"): FormData {
  const fd = new FormData();
  fd.set("orderId", orderId);
  fd.set("reason", reason);
  return fd;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  state.aal = aal2WithTotp(60);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("refundOrderAction — step-up MFA (F-10)", () => {
  it("aal2 viejo (15 min) → reauthRequired y NO toca el reembolso", async () => {
    state.aal = aal2WithTotp(15 * 60);

    const res = await refundOrderAction(null, form());

    expect(res.reauthRequired).toBe(true);
    expect(res.error).toMatch(/confirmar tu identidad/);
    expect(refundOrder).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "order.refund" }),
    );
  });

  it("sin aal2 → reauthRequired (fail-closed)", async () => {
    state.aal = {
      currentLevel: "aal1",
      nextLevel: "aal2",
      currentAuthenticationMethods: [{ method: "password", timestamp: NOW_SEC - 30 }],
    };

    const res = await refundOrderAction(null, form());

    expect(res.reauthRequired).toBe(true);
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it("aal2 fresco (recién verificado en el modal) → reembolsa y audita como antes", async () => {
    const res = await refundOrderAction(null, form());

    expect(res.reauthRequired).toBeUndefined();
    expect(refundOrder).toHaveBeenCalledWith("order_1", {
      adminId: "adm_1",
      reason: "producto defectuoso",
    });
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "order.refund", entityId: "order_1" }),
    );
    expect(res.success).toMatch(/Reembolso/);
  });
});
