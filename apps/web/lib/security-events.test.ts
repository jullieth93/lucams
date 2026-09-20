/*
 * Unit — recordSecurityEvent (F-07, auditoría 2026-09-19).
 *
 * Prisma mockeado: se verifica el contrato del helper — persiste con la IP
 * HASHEADA (nunca en claro, política C-8), metadata por defecto {} y es
 * FAIL-OPEN (un fallo de DB loguea pero jamás rompe el flujo principal,
 * mismo patrón que lib/admin-audit.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockLogger } = vi.hoisted(() => ({
  mockPrisma: { securityEvent: { create: vi.fn() } },
  mockLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

import { hashIp } from "@/lib/rate-limit-keys";
import { recordSecurityEvent, SECURITY_EVENT } from "./security-events";

describe("recordSecurityEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.securityEvent.create.mockResolvedValue({});
  });

  it("persiste el evento con la IP hasheada (SHA-256 truncado, nunca en claro)", async () => {
    await recordSecurityEvent({
      event: SECURITY_EVENT.ADMIN_LOGIN_FAIL,
      outcome: "failure",
      ip: "203.0.113.9",
      metadata: { code: "invalid_credentials" },
    });

    expect(mockPrisma.securityEvent.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.securityEvent.create.mock.calls[0][0].data;
    expect(data.event).toBe("auth.admin_login.fail");
    expect(data.outcome).toBe("failure");
    expect(data.ipHash).toBe(hashIp("203.0.113.9"));
    expect(data.ipHash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(data)).not.toContain("203.0.113.9");
    expect(data.actorId).toBeNull();
    expect(data.metadata).toEqual({ code: "invalid_credentials" });
  });

  it("sin IP ni metadata: ipHash null y metadata {}", async () => {
    await recordSecurityEvent({
      event: SECURITY_EVENT.WEBHOOK_INVALID_SIGNATURE,
      outcome: "rejected",
    });

    const data = mockPrisma.securityEvent.create.mock.calls[0][0].data;
    expect(data.ipHash).toBeNull();
    expect(data.metadata).toEqual({});
  });

  it("es FAIL-OPEN: si la DB falla, loguea y NO lanza (no rompe el login/webhook)", async () => {
    mockPrisma.securityEvent.create.mockRejectedValueOnce(new Error("db caída"));

    await expect(
      recordSecurityEvent({ event: SECURITY_EVENT.LOGIN_FAIL, outcome: "failure", ip: "1.2.3.4" }),
    ).resolves.toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "security_event.persist_fail" }),
    );
  });
});
