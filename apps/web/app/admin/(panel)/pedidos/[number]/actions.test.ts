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

const {
  state,
  refundOrder,
  recordAdminAction,
  processPaidOrder,
  sealManuallyResolvedWebhookEvents,
} = vi.hoisted(() => ({
  state: {
    aal: null as {
      currentLevel: string | null;
      nextLevel: string | null;
      currentAuthenticationMethods: unknown;
    } | null,
  },
  refundOrder: vi.fn(async () => ({ status: "refunded", amount: 150_000 })),
  recordAdminAction: vi.fn(async () => {}),
  processPaidOrder: vi.fn(async () => ({ status: "ok", trackingNumber: "TRK-1" })),
  sealManuallyResolvedWebhookEvents: vi.fn(async () => ({ sealed: 2 })),
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
vi.mock("@/features/orders/webhook-seal", () => ({ sealManuallyResolvedWebhookEvents }));
vi.mock("@/features/orders/saga", () => ({ processPaidOrder }));
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

import { refundOrderAction, retryShipmentAction } from "./actions";

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
  // N-17 — el checkbox bloqueante del formulario (checked → "on").
  fd.set("moneyReturned", "on");
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
      moneyReturnedConfirmed: true,
    });
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "order.refund", entityId: "order_1" }),
    );
    expect(res.success).toMatch(/Reembolso/);
  });
});

describe("refundOrderAction — confirmación obligatoria del dinero (N-17)", () => {
  it("sin el checkbox moneyReturned → RECHAZA sin tocar la orden ni auditar", async () => {
    const fd = form();
    fd.delete("moneyReturned");

    const res = await refundOrderAction(null, fd);

    expect(res.error).toMatch(/confirmar que el dinero ya fue devuelto/);
    expect(res.success).toBeUndefined();
    expect(refundOrder).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "order.refund" }),
    );
  });

  it("checkbox marcado → pasa la confirmación al servicio y la audita", async () => {
    const res = await refundOrderAction(null, form());

    expect(res.error).toBeUndefined();
    expect(refundOrder).toHaveBeenCalledWith(
      "order_1",
      expect.objectContaining({ moneyReturnedConfirmed: true }),
    );
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order.refund",
        metadata: expect.objectContaining({ moneyReturnedConfirmedBy: "adm_1" }),
      }),
    );
  });

  it("el check del dinero se evalúa DESPUÉS del step-up MFA (aal2 viejo sigue pidiendo re-auth)", async () => {
    state.aal = aal2WithTotp(15 * 60);
    const fd = form();
    fd.delete("moneyReturned");

    const res = await refundOrderAction(null, fd);

    expect(res.reauthRequired).toBe(true);
    expect(refundOrder).not.toHaveBeenCalled();
  });
});

describe("retryShipmentAction — sellado de webhooks tras resolución manual (N-13)", () => {
  function retryForm(orderId = "order_1"): FormData {
    const fd = new FormData();
    fd.set("orderId", orderId);
    return fd;
  }

  it("saga ok (guía generada) → sella los eventos relacionados y lo audita", async () => {
    processPaidOrder.mockResolvedValueOnce({ status: "ok", trackingNumber: "TRK-9" } as never);
    sealManuallyResolvedWebhookEvents.mockResolvedValueOnce({ sealed: 3 });

    const res = await retryShipmentAction(null, retryForm());

    expect(res.success).toMatch(/TRK-9/);
    expect(sealManuallyResolvedWebhookEvents).toHaveBeenCalledWith("order_1");
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order.retry_shipment",
        entityId: "order_1",
        metadata: expect.objectContaining({ sagaStatus: "ok", sealedWebhooks: 3 }),
      }),
    );
  });

  it("already_processed CON tracking (ya resuelta) → también sella", async () => {
    processPaidOrder.mockResolvedValueOnce({
      status: "already_processed",
      trackingNumber: "TRK-7",
    } as never);

    const res = await retryShipmentAction(null, retryForm());

    expect(res.success).toMatch(/TRK-7/);
    expect(sealManuallyResolvedWebhookEvents).toHaveBeenCalledWith("order_1");
  });

  it("already_processed SIN tracking (claim de otro proceso) → NO sella (aún no hay resolución)", async () => {
    processPaidOrder.mockResolvedValueOnce({ status: "already_processed" } as never);

    const res = await retryShipmentAction(null, retryForm());

    expect(res.success).toMatch(/otro proceso/);
    expect(sealManuallyResolvedWebhookEvents).not.toHaveBeenCalled();
  });

  it("saga fallida (shipment_failed) → NO sella y devuelve el error", async () => {
    processPaidOrder.mockResolvedValueOnce({
      status: "shipment_failed",
      reason: "Aveonline caído",
    } as never);

    const res = await retryShipmentAction(null, retryForm());

    expect(res.error).toMatch(/Aveonline caído/);
    expect(sealManuallyResolvedWebhookEvents).not.toHaveBeenCalled();
  });

  it("un fallo del sellado NO ensucia el éxito de la guía (best-effort)", async () => {
    processPaidOrder.mockResolvedValueOnce({ status: "ok", trackingNumber: "TRK-8" } as never);
    sealManuallyResolvedWebhookEvents.mockRejectedValueOnce(new Error("db blip"));

    const res = await retryShipmentAction(null, retryForm());

    expect(res.success).toMatch(/TRK-8/);
    expect(res.error).toBeUndefined();
  });
});
