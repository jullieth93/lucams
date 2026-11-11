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
import { logger, scrubPii } from "./logger";

describe("logger & scrubPii — redacción de PII y tokens (SEC-05)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redacta emails, teléfonos y tokens cuando logger recibe string directo o msg opcional", () => {
    const spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const spyWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      logger.info(
        "Pago falló para cliente@example.com tel 300 123 4567 url https://x.co/cb?token=tok_secret_999&code=pkce_123",
      );
      logger.warn(
        {
          event: "test.warn",
          detail: "Bearer eyJhbGciOiJIUzI1NiJ9.secretpayload contacto luis@example.com",
        },
        "Aviso para ana@example.com (+57 310 123 4567)",
      );

      expect(spyLog).toHaveBeenCalledTimes(1);
      const infoLine = String(spyLog.mock.calls[0][0]);
      expect(infoLine).not.toContain("cliente@example.com");
      expect(infoLine).not.toContain("300 123 4567");
      expect(infoLine).not.toContain("tok_secret_999");
      expect(infoLine).not.toContain("pkce_123");
      expect(infoLine).toContain("[EMAIL]");
      expect(infoLine).toContain("[PHONE]");
      expect(infoLine).toContain("[REDACTED]");

      expect(spyWarn).toHaveBeenCalledTimes(1);
      const warnLine = String(spyWarn.mock.calls[0][0]);
      expect(warnLine).not.toContain("luis@example.com");
      expect(warnLine).not.toContain("ana@example.com");
      expect(warnLine).not.toContain("310 123 4567");
      expect(warnLine).not.toContain("secretpayload");
      expect(warnLine).toContain("Bearer [REDACTED]");
    } finally {
      spyLog.mockRestore();
      spyWarn.mockRestore();
    }
  });

  it("scrubPii redacta parámetros sensibles en query/fragment y prefijos de llaves", () => {
    const raw = `URL https://lucamsshop.com/reset?secret=ave_999&access_token=jwt_abc#refresh_token=ref_xyz con llave ${"sb_" + "secret_" + "a9B8c7".repeat(3)}`;
    const clean = scrubPii(raw);
    expect(clean).not.toContain("ave_999");
    expect(clean).not.toContain("jwt_abc");
    expect(clean).not.toContain("ref_xyz");
    expect(clean).not.toContain("a9B8c7");
  });
});

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

  it("SEC-05: persiste únicamente pathname limpio en requestPath/routePath sin query ni fragmento", async () => {
    await captureServerError({
      message: "Webhook crash",
      requestPath:
        "/api/webhooks/aveonline?secret=super_secret_ave&token=abc&email=ana@example.com#frag",
      routePath: "/usuarios/ana%40example.com?code=pkce_123",
    });
    const data = mockPrisma.errorLog.create.mock.calls[0][0].data;
    expect(data.requestPath).toBe("/api/webhooks/aveonline");
    expect(data.routePath).toBe("/usuarios/[EMAIL]");
    expect(JSON.stringify(data)).not.toContain("super_secret_ave");
    expect(JSON.stringify(data)).not.toContain("pkce_123");
    expect(JSON.stringify(data)).not.toContain("ana@example.com");
  });
});

describe("captureClientError — scrub de PII (F-6)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redacta PII en la fila NUEVA persistida y guarda solo pathname de url (SEC-05)", async () => {
    mockPrisma.errorReport.findUnique.mockResolvedValue(null); // fingerprint nuevo
    await captureClientError({
      message: "Falló el pago de ana@example.com (+57 310 123 4567)",
      stack: "at Pago (pago.js:1)",
      url: "https://lucamsshop.com/restablecer-password?token=tok_reset_secret&email=ana@example.com#access_token=jwt_frag_999",
    });
    expect(mockPrisma.errorReport.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.errorReport.create.mock.calls[0][0].data;
    expect(data.message).toBe("Falló el pago de [EMAIL] ([PHONE])");
    expect(data.url).toBe("/restablecer-password");
    expect(JSON.stringify(data)).not.toContain("ana@example.com");
    expect(JSON.stringify(data)).not.toContain("310 123 4567");
    expect(JSON.stringify(data)).not.toContain("tok_reset_secret");
    expect(JSON.stringify(data)).not.toContain("jwt_frag_999");
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
