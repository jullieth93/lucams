/*
 * Wiring F-05 (auditoría integral 2026-09-19): las acciones de conciliación COD
 * (remesa, discrepancia, activar contraentrega) exigen aal2 RECIENTE además del
 * guard SUPERADMIN — el encabezado de actions.ts ya declaraba el estándar
 * (mismo que refundOrderAction) pero no lo implementaba. Con elevación vieja
 * devuelven el marcador `reauthRequired` SIN escribir nada (la UI abre el modal
 * TOTP y reintenta); con elevación fresca operan igual que antes.
 *
 * Se usa el módulo REAL de lib/admin-reauth (la frescura se controla con el amr
 * del stub de Supabase). Todo lo demás mockeado (sin DB ni Supabase).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  state,
  markCodRemitted,
  flagCodDiscrepancy,
  getCmsFieldByKey,
  saveCmsFieldDraft,
  recordAdminAction,
} = vi.hoisted(() => ({
  state: {
    aal: null as {
      currentLevel: string | null;
      nextLevel: string | null;
      currentAuthenticationMethods: unknown;
    } | null,
  },
  markCodRemitted: vi.fn(async () => ({
    orderNumber: "LC-0001",
    expectedAmount: 150_000,
    remittedAmount: 150_000,
  })),
  flagCodDiscrepancy: vi.fn(async () => ({
    orderNumber: "LC-0001",
    expectedAmount: 150_000,
  })),
  getCmsFieldByKey: vi.fn(async () => ({ id: "field_1", kind: "SETTING" })),
  saveCmsFieldDraft: vi.fn(async () => {}),
  recordAdminAction: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
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
vi.mock("@/features/orders/cod-reconciliation", () => ({
  markCodRemitted,
  flagCodDiscrepancy,
}));
vi.mock("@/features/cms/service", () => ({
  getCmsFieldByKey,
  saveCmsFieldDraft,
  CmsValidationError: class CmsValidationError extends Error {},
}));

import { flagCodDiscrepancyAction, markCodRemittedAction, setCodEnabledAction } from "./actions";

const NOW = new Date("2026-09-19T15:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

function aal2WithTotp(secondsAgo: number) {
  return {
    currentLevel: "aal2",
    nextLevel: "aal2",
    currentAuthenticationMethods: [
      { method: "password", timestamp: NOW_SEC - 1800 },
      { method: "totp", timestamp: NOW_SEC - secondsAgo },
    ],
  };
}

function remitForm(): FormData {
  const fd = new FormData();
  fd.set("orderId", "order_1");
  fd.set("remittedAmountPesos", "150000");
  return fd;
}

function discrepancyForm(): FormData {
  const fd = new FormData();
  fd.set("orderId", "order_1");
  fd.set("discrepancyReason", "llegó corto");
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

describe("markCodRemittedAction — step-up MFA (F-05)", () => {
  it("aal2 viejo (15 min) → reauthRequired y NO escribe la remesa ni audita", async () => {
    state.aal = aal2WithTotp(15 * 60);

    const res = await markCodRemittedAction(null, remitForm());

    expect(res.reauthRequired).toBe(true);
    expect(res.error).toMatch(/confirmar tu identidad/);
    expect(markCodRemitted).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "cod.mark_remitted" }),
    );
  });

  it("sin aal2 → reauthRequired (fail-closed)", async () => {
    state.aal = {
      currentLevel: "aal1",
      nextLevel: "aal2",
      currentAuthenticationMethods: [{ method: "password", timestamp: NOW_SEC - 30 }],
    };

    const res = await markCodRemittedAction(null, remitForm());

    expect(res.reauthRequired).toBe(true);
    expect(markCodRemitted).not.toHaveBeenCalled();
  });

  it("aal2 fresco (recién verificado en el modal) → registra la remesa y audita como antes", async () => {
    const res = await markCodRemittedAction(null, remitForm());

    expect(res.reauthRequired).toBeUndefined();
    expect(markCodRemitted).toHaveBeenCalledWith(
      "order_1",
      expect.objectContaining({ adminId: "adm_1", remittedAmount: 15_000_000 }),
    );
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cod.mark_remitted", entityId: "order_1" }),
    );
    expect(res.success).toMatch(/Remesa/);
  });
});

describe("flagCodDiscrepancyAction — step-up MFA (F-05)", () => {
  it("aal2 viejo → reauthRequired y NO re-etiqueta la discrepancia", async () => {
    state.aal = aal2WithTotp(15 * 60);

    const res = await flagCodDiscrepancyAction(null, discrepancyForm());

    expect(res.reauthRequired).toBe(true);
    expect(flagCodDiscrepancy).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "cod.flag_discrepancy" }),
    );
  });

  it("aal2 fresco → registra la discrepancia y audita como antes", async () => {
    const res = await flagCodDiscrepancyAction(null, discrepancyForm());

    expect(res.reauthRequired).toBeUndefined();
    expect(flagCodDiscrepancy).toHaveBeenCalledWith(
      "order_1",
      expect.objectContaining({ adminId: "adm_1", discrepancyReason: "llegó corto" }),
    );
    expect(res.success).toMatch(/Discrepancia registrada/);
  });
});

describe("setCodEnabledAction — step-up MFA (F-05)", () => {
  it("aal2 viejo → reauthRequired y NO activa la contraentrega", async () => {
    state.aal = aal2WithTotp(15 * 60);

    const res = await setCodEnabledAction(null, new FormData());

    expect(res.reauthRequired).toBe(true);
    expect(saveCmsFieldDraft).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "cms.setting.cod_enabled" }),
    );
  });

  it("aal2 fresco → publica el setting COD_ENABLED y audita como antes", async () => {
    const res = await setCodEnabledAction(null, new FormData());

    expect(res.reauthRequired).toBeUndefined();
    expect(saveCmsFieldDraft).toHaveBeenCalledWith({ id: "field_1", body: "true" }, "adm_1");
    expect(res.success).toMatch(/Contraentrega ACTIVADA/);
  });
});
