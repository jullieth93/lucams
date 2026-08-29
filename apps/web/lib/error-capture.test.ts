/*
 * Unit — scrub de PII en captureServerError / captureClientError (auditoría
 * 2026-08-24, F-6): lo que persiste en ErrorLog/ErrorReport pasa por el mismo
 * scrubPii del logger (emails/teléfonos → [EMAIL]/[PHONE]) ANTES del insert.
 * Prisma y rateLimit mockeados — se verifica el payload que recibiría la DB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    errorLog: { create: vi.fn() },
    errorReport: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, count: 1, resetAt: new Date() })),
}));

import { captureClientError, captureServerError } from "./error-capture";

describe("captureServerError — scrub de PII (F-6)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redacta emails y teléfonos embebidos en message y stack antes de persistir", async () => {
    await captureServerError({
      message: "Key (email)=(cliente@example.com) already exists. Tel 300 123 4567",
      stack: "Error: Key (email)=(cliente@example.com)\n    at X (x.js:1)",
      routePath: "/registro",
    });
    expect(mockPrisma.errorLog.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.errorLog.create.mock.calls[0][0].data;
    expect(data.message).toBe("Key (email)=([EMAIL]) already exists. Tel [PHONE]");
    expect(data.stack).toContain("[EMAIL]");
    expect(JSON.stringify(data)).not.toContain("cliente@example.com");
    expect(JSON.stringify(data)).not.toContain("300 123 4567");
  });

  it("sigue truncando a 2000/4000 y tolera stack ausente", async () => {
    await captureServerError({ message: "boom".repeat(1000) });
    const data = mockPrisma.errorLog.create.mock.calls[0][0].data;
    expect(data.message.length).toBeLessThanOrEqual(2000);
    expect(data.stack).toBeNull();
  });
});

describe("captureClientError — scrub de PII (F-6)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redacta PII en la fila NUEVA persistida (payload de ruta pública)", async () => {
    mockPrisma.errorReport.findUnique.mockResolvedValue(null); // fingerprint nuevo
    await captureClientError({
      message: "Falló el pago de ana@example.com (+57 310 123 4567)",
      stack: "at Pago (pago.js:1)",
      url: "https://lucamsshop.com/checkout/pago",
    });
    expect(mockPrisma.errorReport.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.errorReport.create.mock.calls[0][0].data;
    expect(data.message).toBe("Falló el pago de [EMAIL] ([PHONE])");
    expect(JSON.stringify(data)).not.toContain("ana@example.com");
    expect(JSON.stringify(data)).not.toContain("310 123 4567");
  });

  it("dos mensajes que solo difieren en la PII embebida buscan el MISMO fingerprint", async () => {
    // El fingerprint se calcula sobre el message YA redactado → la deduplicación no se
    // rompe porque cada cliente genere un message distinto (mismo bug, distinta PII).
    mockPrisma.errorReport.findUnique.mockResolvedValue({ id: "row-1", status: "OPEN" });
    await captureClientError({ message: "Error para ana@example.com" });
    await captureClientError({ message: "Error para luis@example.com" });
    const fingerprints = mockPrisma.errorReport.findUnique.mock.calls.map(
      (c) => c[0].where.fingerprint,
    );
    expect(fingerprints).toHaveLength(2);
    expect(fingerprints[0]).toBe(fingerprints[1]);
    // Nunca crea fila (findUnique devolvió existente): solo incrementa.
    expect(mockPrisma.errorReport.create).not.toHaveBeenCalled();
    expect(mockPrisma.errorReport.update).toHaveBeenCalledTimes(2);
  });
});
