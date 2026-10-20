/*
 * Unit tests — actions del módulo /admin/carritos (Fase 4, 2026-10-13).
 *
 * Cubre la cadena action → delegación → auditoría:
 *  - saveCartRecoverySettingsAction: parsea + valida la config, delega en
 *    saveCartRecoverySettings, invalida updateTag("cms") (el cron la lee por
 *    getSettingValue cacheado) y audita; inputs fuera de rango → error sin
 *    escribir.
 *  - sendReminderAction: valida el id (cuid), delega en sendReminderToCart
 *    (mismo núcleo que el cron), audita con el status y redirige al detalle
 *    con el resultado.
 *  - bulkSendRemindersAction: lote (ids separados por coma), tally por
 *    resultado, auditoría agregada y redirect a la bandeja.
 *
 * Estrategia: services mockeados (la lógica de envío/config se testea en
 * features/cart/cart-recovery-config.integration.test.ts); guard, audit,
 * logger, next/cache y next/navigation mockeados (patrón ocasiones/actions.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auditSpy,
  mockLogger,
  updateTagSpy,
  revalidatePathSpy,
  redirectSpy,
  recoveryService,
  recoverySettings,
} = vi.hoisted(() => ({
  auditSpy: { recordAdminAction: vi.fn(async () => {}) },
  mockLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  updateTagSpy: vi.fn(),
  revalidatePathSpy: vi.fn(),
  redirectSpy: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  recoveryService: { sendReminderToCart: vi.fn() },
  recoverySettings: { saveCartRecoverySettings: vi.fn(async () => {}) },
}));

vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: auditSpy.recordAdminAction }));
vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: vi.fn(async () => ({
    user: { id: "user1" },
    admin: { id: "admin1", role: "SUPERADMIN" },
  })),
}));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/features/cart/recovery-service", () => recoveryService);
vi.mock("@/features/cart/recovery-settings", () => recoverySettings);
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathSpy,
  updateTag: updateTagSpy,
}));
vi.mock("next/navigation", () => ({ redirect: redirectSpy }));

import {
  bulkSendRemindersAction,
  saveCartRecoverySettingsAction,
  sendReminderAction,
} from "./actions";

// cuid v1 válido ("c" + 24 alfanuméricos) para las fixtures.
const ID1 = "c" + "a".repeat(24);
const ID2 = "c" + "b".repeat(24);

beforeEach(() => {
  vi.clearAllMocks();
  redirectSpy.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe("saveCartRecoverySettingsAction", () => {
  function settingsForm(overrides: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set("enabled", "1");
    fd.set("mode", "manual");
    fd.set("idleHours", "6");
    fd.set("maxReminders", "2");
    fd.set("intervalHours", "12");
    for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
    return fd;
  }

  it("guarda la config, invalida el tag cms y audita", async () => {
    const res = await saveCartRecoverySettingsAction(null, settingsForm());

    expect(recoverySettings.saveCartRecoverySettings).toHaveBeenCalledWith(
      { enabled: true, mode: "manual", idleHours: 6, maxReminders: 2, intervalHours: 12 },
      "admin1",
    );
    expect(updateTagSpy).toHaveBeenCalledWith("cms");
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin1",
        action: "cart_recovery.settings.save",
        entityType: "Setting",
        entityId: "cart-recovery",
      }),
    );
    expect(res.ok).toContain("MANUAL");
    expect(res.error).toBeUndefined();
  });

  it("módulo apagado: enabled=0 se persiste como false", async () => {
    const res = await saveCartRecoverySettingsAction(null, settingsForm({ enabled: "0" }));

    expect(recoverySettings.saveCartRecoverySettings).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
      "admin1",
    );
    expect(res.ok).toContain("APAGADO");
  });

  it("idleHours fuera de rango → error sin escribir ni auditar", async () => {
    const res = await saveCartRecoverySettingsAction(null, settingsForm({ idleHours: "0" }));

    expect(res.error).toBeTruthy();
    expect(recoverySettings.saveCartRecoverySettings).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
    expect(updateTagSpy).not.toHaveBeenCalled();
  });

  it("modo inválido → error sin escribir", async () => {
    const res = await saveCartRecoverySettingsAction(null, settingsForm({ mode: "turbo" }));

    expect(res.error).toBeTruthy();
    expect(recoverySettings.saveCartRecoverySettings).not.toHaveBeenCalled();
  });
});

describe("sendReminderAction", () => {
  it("id válido → delega en sendReminderToCart, audita y redirige con el resultado", async () => {
    recoveryService.sendReminderToCart.mockResolvedValue({ status: "sent" });
    const fd = new FormData();
    fd.set("id", ID1);
    fd.set("email", "cliente@correo.com");

    await expect(sendReminderAction(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(recoveryService.sendReminderToCart).toHaveBeenCalledWith(ID1);
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cart_recovery.reminder.send",
        entityType: "AbandonedCart",
        entityId: ID1,
        metadata: expect.objectContaining({ status: "sent" }),
      }),
    );
    expect(redirectSpy).toHaveBeenCalledWith(
      `/admin/carritos/${ID1}?sent=${encodeURIComponent("cliente@correo.com")}`,
    );
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/carritos");
  });

  it("id malformado → redirect de error sin tocar el service", async () => {
    const fd = new FormData();
    fd.set("id", "no-es-cuid");

    await expect(sendReminderAction(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(recoveryService.sendReminderToCart).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
    expect(redirectSpy).toHaveBeenCalledWith(expect.stringContaining("/admin/carritos?error="));
  });
});

describe("bulkSendRemindersAction", () => {
  it("envía el lote, audita el tally agregado y redirige a la bandeja", async () => {
    recoveryService.sendReminderToCart
      .mockResolvedValueOnce({ status: "sent" })
      .mockResolvedValueOnce({ status: "skipped", reason: "too-soon", retryAt: new Date() });
    const fd = new FormData();
    fd.set("ids", `${ID1},${ID2}`);

    await expect(bulkSendRemindersAction(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(recoveryService.sendReminderToCart).toHaveBeenCalledTimes(2);
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cart_recovery.reminder.bulk_send",
        entityType: "AbandonedCart",
        metadata: expect.objectContaining({
          count: 2,
          sent: 1,
          skipped: 1,
          recovered: 0,
          failed: 0,
        }),
      }),
    );
    expect(redirectSpy).toHaveBeenCalledWith(expect.stringContaining("/admin/carritos?bulkOk="));
  });

  it("selección vacía → redirect de error sin enviar nada", async () => {
    await expect(bulkSendRemindersAction(new FormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(recoveryService.sendReminderToCart).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
    expect(redirectSpy).toHaveBeenCalledWith(expect.stringContaining("/admin/carritos?error="));
  });
});
