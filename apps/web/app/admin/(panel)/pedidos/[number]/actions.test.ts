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
  transitionOrder,
  recordAdminAction,
  processPaidOrder,
  sealManuallyResolvedWebhookEvents,
  orderFindUnique,
  orderUpdate,
  orderUpdateMany,
  renderJobFindUnique,
  renderJobUpdate,
  processRenderJobs,
  addBlockedIdentity,
} = vi.hoisted(() => ({
  state: {
    role: "SUPERADMIN" as string,
    aal: null as {
      currentLevel: string | null;
      nextLevel: string | null;
      currentAuthenticationMethods: unknown;
    } | null,
  },
  refundOrder: vi.fn(async () => ({
    status: "refunded",
    amount: 150_000,
    orderNumber: "LCM-2026-0001",
  })),
  transitionOrder: vi.fn(async () => ({ id: "order_1", number: "LCM-2026-0001" })),
  recordAdminAction: vi.fn(async () => {}),
  processPaidOrder: vi.fn(async () => ({ status: "ok", trackingNumber: "TRK-1" })),
  sealManuallyResolvedWebhookEvents: vi.fn(async () => ({ sealed: 2 })),
  orderFindUnique: vi.fn(async () => ({
    id: "order_1",
    number: "LCM-2026-0001",
    paymentMethod: "COD",
    shippingAddressKey: "bogota|calle85|110221",
    noShowAt: null,
  })),
  orderUpdate: vi.fn(async () => ({})),
  orderUpdateMany: vi.fn(async () => ({ count: 1 })),
  renderJobFindUnique: vi.fn(),
  renderJobUpdate: vi.fn(async () => ({})),
  processRenderJobs: vi.fn(async () => ({ processed: 1 })),
  addBlockedIdentity: vi.fn(async () => ({})),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findUnique: orderFindUnique,
      update: orderUpdate,
      updateMany: orderUpdateMany,
    },
    renderJob: { findUnique: renderJobFindUnique, update: renderJobUpdate },
  },
}));
vi.mock("@/features/personalization/render-job-service", () => ({
  processRenderJobs,
  RENDER_JOB_KICK_BUDGET_MS: 8_000,
}));
vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: vi.fn(async (opts?: { roles?: readonly string[] }) => {
    if (opts?.roles && !opts.roles.includes(state.role)) {
      throw new Error(`FORBIDDEN:${state.role}`);
    }
    return {
      user: { id: "sb_user_1" },
      admin: { id: "adm_1", role: state.role },
    };
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.aal }) } },
  }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction }));
vi.mock("@/features/orders/service", () => ({
  refundOrder,
  transitionOrder,
}));
vi.mock("@/features/orders/webhook-seal", () => ({ sealManuallyResolvedWebhookEvents }));
vi.mock("@/features/orders/saga", () => ({ processPaidOrder }));
vi.mock("@/features/orders/emails", () => ({
  sendOrderShipped: vi.fn(),
  sendOrderDelivered: vi.fn(),
  sendOrderCancelled: vi.fn(),
}));
vi.mock("@/features/moderation/service", () => ({
  orderHasUnmoderatedDesigns: vi.fn(async () => false),
}));
vi.mock("@/features/anti-abuse/blocklist-service", () => ({
  addBlockedIdentity,
  BlocklistError: class BlocklistError extends Error {},
}));

import {
  blockOrderAddressAction,
  markOrderReconciledAction,
  refundOrderAction,
  retryRenderJobAction,
  retryShipmentAction,
  transitionOrderAction,
} from "./actions";

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
  state.role = "SUPERADMIN";
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

describe("markOrderReconciledAction — cierre manual de reconciliación (2026-10-05)", () => {
  function reconForm(orderId = "order_1", note = "Refund emitido en Wompi y confirmado"): FormData {
    const fd = new FormData();
    fd.set("orderId", orderId);
    fd.set("note", note);
    return fd;
  }

  it("sin nota de resolución → RECHAZA sin tocar la orden ni auditar", async () => {
    const res = await markOrderReconciledAction(null, reconForm("order_1", "   "));

    expect(res.error).toMatch(/nota de resolución/);
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("flag prendido → apaga needsReconciliation, persiste nota/quién/cuándo y audita", async () => {
    const res = await markOrderReconciledAction(null, reconForm());

    expect(res.error).toBeUndefined();
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order_1", needsReconciliation: true },
      data: expect.objectContaining({
        needsReconciliation: false,
        reconciliationNote: "Refund emitido en Wompi y confirmado",
        reconciledBy: "adm_1",
        reconciledAt: NOW,
      }),
    });
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order.reconcile",
        entityId: "order_1",
        metadata: { note: "Refund emitido en Wompi y confirmado" },
      }),
    );
    expect(res.success).toMatch(/gestionada/);
  });

  it("flag ya apagado (count 0) → error claro, sin auditoría", async () => {
    orderUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await markOrderReconciledAction(null, reconForm());

    expect(res.error).toMatch(/no está marcado para reconciliar/);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});

describe("retryRenderJobAction — reintento 1-clic de RenderJob FAILED (S11)", () => {
  function retryJobForm(designId = "des_1", orderNumber = "LCM-2026-0001") {
    const fd = new FormData();
    fd.set("designId", designId);
    fd.set("orderNumber", orderNumber);
    return fd;
  }

  it("resetea el job FAILED, dispara processRenderJobs y audita en AdminActionLog", async () => {
    renderJobFindUnique
      .mockResolvedValueOnce({ id: "job_1", status: "FAILED", totalUnits: 12, doneUnits: 4 })
      .mockResolvedValueOnce({ status: "DONE", totalUnits: 12, doneUnits: 12, error: null });

    const res = await retryRenderJobAction(null, retryJobForm());

    expect(renderJobUpdate).toHaveBeenCalledWith({
      where: { designId: "des_1" },
      data: {
        status: "PENDING",
        attempts: 0,
        error: null,
        startedAt: null,
        finishedAt: null,
      },
    });
    expect(processRenderJobs).toHaveBeenCalledWith({ onlyDesignId: "des_1", budgetMs: 8_000 });
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order.render_job_retry",
        entityType: "Design",
        entityId: "des_1",
        metadata: expect.objectContaining({
          orderNumber: "LCM-2026-0001",
          resultStatus: "DONE",
        }),
      }),
    );
    expect(res.success).toMatch(/Archivos 300 DPI generados/);
  });

  it("no toca ni audita si el job NO está en estado FAILED", async () => {
    renderJobFindUnique.mockResolvedValueOnce({
      id: "job_1",
      status: "DONE",
      totalUnits: 4,
      doneUnits: 4,
    });

    const res = await retryRenderJobAction(null, retryJobForm());

    expect(res.success).toMatch(/ya está en curso o completado/);
    expect(renderJobUpdate).not.toHaveBeenCalled();
    expect(processRenderJobs).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});

describe("Bloque 5 — segregación por etapa en transitionOrderAction y step-up MFA en blockOrderAddressAction", () => {
  function transitionForm(to: string, reason = "avance operativo"): FormData {
    const fd = new FormData();
    fd.set("orderId", "order_1");
    fd.set("to", to);
    fd.set("reason", reason);
    return fd;
  }

  it("PRINT_WORKSHOP puede pasar a FULFILLING pero NO a SHIPPED ni CANCELLED", async () => {
    state.role = "PRINT_WORKSHOP";

    const okRes = await transitionOrderAction(null, transitionForm("FULFILLING"));
    expect(okRes.success).toMatch(/En preparación/i);
    expect(transitionOrder).toHaveBeenCalledWith(
      "order_1",
      "FULFILLING",
      expect.objectContaining({ actorAdminId: "adm_1" }),
    );

    transitionOrder.mockClear();
    const deniedShipped = await transitionOrderAction(null, transitionForm("SHIPPED"));
    expect(deniedShipped.error).toMatch(/no tiene permiso/i);
    expect(transitionOrder).not.toHaveBeenCalled();

    const deniedCancel = await transitionOrderAction(null, transitionForm("CANCELLED"));
    expect(deniedCancel.error).toMatch(/Operaciones o Administradora/i);
    expect(transitionOrder).not.toHaveBeenCalled();
  });

  it("FULFILLMENT puede despachar (SHIPPED) pero NO cancelar (CANCELLED)", async () => {
    state.role = "FULFILLMENT";

    const shipped = await transitionOrderAction(null, transitionForm("SHIPPED"));
    expect(shipped.success).toMatch(/Enviado/i);
    expect(transitionOrder).toHaveBeenCalledWith(
      "order_1",
      "SHIPPED",
      expect.objectContaining({ actorAdminId: "adm_1" }),
    );

    transitionOrder.mockClear();
    const deniedCancel = await transitionOrderAction(null, transitionForm("CANCELLED"));
    expect(deniedCancel.error).toMatch(/Operaciones o Administradora/i);
    expect(transitionOrder).not.toHaveBeenCalled();
  });

  it("OPERATIONS_MANAGER puede cancelar y registra orderNumber en auditoría", async () => {
    state.role = "OPERATIONS_MANAGER";

    const res = await transitionOrderAction(null, transitionForm("CANCELLED", "solicitud cliente"));
    expect(res.success).toMatch(/Cancelado/i);
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order.transition",
        entityId: "order_1",
        metadata: expect.objectContaining({
          orderNumber: "LCM-2026-0001",
          to: "CANCELLED",
          reason: "solicitud cliente",
        }),
      }),
    );
  });

  it("blockOrderAddressAction exige FINANCE_COD (FINANCE_ANALYST / SUPERADMIN) + step-up MFA reciente", async () => {
    const fd = new FormData();
    fd.set("orderId", "order_1");

    // 1. Rol no autorizado (OPERATIONS_MANAGER) rebota en el guard RBAC
    state.role = "OPERATIONS_MANAGER";
    await expect(blockOrderAddressAction(null, fd)).rejects.toThrow(/FORBIDDEN:OPERATIONS_MANAGER/);

    // 2. FINANCE_ANALYST con aal2 vencido (15 min) pide re-auth sin bloquear la dirección
    state.role = "FINANCE_ANALYST";
    state.aal = aal2WithTotp(15 * 60);
    const staleRes = await blockOrderAddressAction(null, fd);
    expect(staleRes.reauthRequired).toBe(true);
    expect(addBlockedIdentity).not.toHaveBeenCalled();

    // 3. FINANCE_ANALYST con aal2 fresco bloquea la dirección server-side y audita orderNumber
    state.aal = aal2WithTotp(45);
    const freshRes = await blockOrderAddressAction(null, fd);
    expect(freshRes.reauthRequired).toBeUndefined();
    expect(freshRes.success).toMatch(/Dirección bloqueada/);
    expect(addBlockedIdentity).toHaveBeenCalledWith({
      kind: "ADDRESS",
      value: "bogota|calle85|110221",
      reason: "Dirección del pedido LCM-2026-0001",
      createdBy: "adm_1",
    });
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cod.blocklist.add_address",
        entityId: "order_1",
        metadata: { orderNumber: "LCM-2026-0001" },
      }),
    );
  });
});
