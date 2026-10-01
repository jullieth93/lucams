/*
 * Test UNIT de features/warranty/notify.ts — emails de garantía (Ley 1480).
 *
 * FOCO:
 *  - notifyWarrantyResolved: envía al email del pedido con idempotency key y la
 *    NOTA DEL EQUIPO (resolutionNote) va en el cuerpo — antes la "Nota para el
 *    cliente" se guardaba pero no llegaba a nadie (bandeja legacy /admin/reclamos).
 *  - notifyWarrantyRejected: envía con el MOTIVO del rechazo (antes el REJECTED
 *    no notificaba en ninguna vista).
 *  - Guards: sin reclamo, sin remedio o sin motivo → NO se envía nada.
 *  - Best-effort total: sendEmail que revienta NO propaga — loguea y sigue.
 *
 * Estrategia: mismo patrón que thread-service.test.ts — prisma mockeado
 * (warrantyClaim.findUnique + emailTemplateOverride.findMany vacío → las
 * plantillas renderizan con su copy base real vía withOverrides), sendEmail
 * mockeado y @/lib/cms con fallbacks. Offline y determinista.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() =>
  vi.fn(async (_input: unknown): Promise<unknown> => ({ sent: true, id: "email_1" })),
);
const claimFindUnique = vi.hoisted(() => vi.fn(async (_args?: unknown): Promise<unknown> => null));
const overrideFindMany = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []));
const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/resend", () => ({ sendEmail }));
vi.mock("@/lib/db", () => ({
  prisma: {
    warrantyClaim: { findUnique: claimFindUnique },
    emailTemplateOverride: { findMany: overrideFindMany },
  },
}));
vi.mock("@/lib/cms", () => ({
  getSettingValue: vi.fn(async (_key: string, fallback: string) => fallback),
  getCmsBlock: vi.fn(async () => null),
}));

import { notifyWarrantyRejected, notifyWarrantyResolved } from "./notify";

type SendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  tags?: Array<{ name: string; value: string }>;
};

/** Fila WarrantyClaim tal cual la lee loadClaim (select de notify.ts). */
function claimRow(overrides: Record<string, unknown> = {}) {
  return {
    description: "Dos imanes llegaron con la esquina despegada.",
    resolutionType: "REPLACE",
    resolutionNote: "Te enviamos el reemplazo sin costo, guía Coordinadora 123.",
    orderItem: {
      variant: { product: { name: "Fotoimanes Cuadrados" } },
      order: {
        number: "LCM-2026-1042",
        email: "camila@example.com",
        shippingAddress: { fullName: "Camila Restrepo" },
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifyWarrantyResolved", () => {
  it("envía al email del pedido con idempotency key y la nota del equipo en el cuerpo", async () => {
    claimFindUnique.mockResolvedValueOnce(claimRow());

    await notifyWarrantyResolved("wc_1");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const input = sendEmail.mock.calls[0][0] as SendInput;
    expect(input.to).toBe("camila@example.com");
    expect(input.idempotencyKey).toBe("warranty-wc_1-resolved");
    expect(input.tags).toContainEqual({ name: "type", value: "warranty_resolved" });
    expect(input.tags).toContainEqual({ name: "order_number", value: "LCM-2026-1042" });
    // La nota del equipo (resolutionNote) llega en el cuerpo — el corazón del fix.
    expect(input.html).toContain("Te enviamos el reemplazo sin costo, guía Coordinadora 123.");
    expect(input.text).toContain("Te enviamos el reemplazo sin costo, guía Coordinadora 123.");
    expect(input.subject).toContain("garantía");
  });

  it("reclamo inexistente → no envía nada", async () => {
    claimFindUnique.mockResolvedValueOnce(null);
    await notifyWarrantyResolved("wc_missing");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sin resolutionType (todavía no hay remedio) → no envía nada", async () => {
    claimFindUnique.mockResolvedValueOnce(claimRow({ resolutionType: null }));
    await notifyWarrantyResolved("wc_2");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sin nota → envía igual (la nota es opcional) y el cuerpo no la inventa", async () => {
    claimFindUnique.mockResolvedValueOnce(claimRow({ resolutionNote: null }));
    await notifyWarrantyResolved("wc_3");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const input = sendEmail.mock.calls[0][0] as SendInput;
    expect(input.html).not.toContain("guía Coordinadora");
  });

  it("best-effort: si sendEmail revienta, NO propaga — loguea el error", async () => {
    claimFindUnique.mockResolvedValueOnce(claimRow());
    sendEmail.mockRejectedValueOnce(new Error("resend down"));

    await expect(notifyWarrantyResolved("wc_4")).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "warranty.email.resolved.fail", id: "wc_4" }),
    );
  });
});

describe("notifyWarrantyRejected", () => {
  it("envía al email del pedido con idempotency key y el motivo en el cuerpo", async () => {
    claimFindUnique.mockResolvedValueOnce(
      claimRow({
        resolutionType: null, // el rechazo no aplica remedio
        resolutionNote: "El daño es por mal uso, no por defecto de fabricación.",
      }),
    );

    await notifyWarrantyRejected("wc_5");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const input = sendEmail.mock.calls[0][0] as SendInput;
    expect(input.to).toBe("camila@example.com");
    expect(input.idempotencyKey).toBe("warranty-wc_5-rejected");
    expect(input.tags).toContainEqual({ name: "type", value: "warranty_rejected" });
    expect(input.html).toContain("El daño es por mal uso, no por defecto de fabricación.");
    expect(input.text).toContain("El daño es por mal uso, no por defecto de fabricación.");
    expect(input.subject).toContain("garantía");
  });

  it("escapa el motivo en el HTML (entrada libre del admin)", async () => {
    claimFindUnique.mockResolvedValueOnce(
      claimRow({ resolutionNote: 'Motivo con <script>alert("x")</script>' }),
    );
    await notifyWarrantyRejected("wc_6");
    const input = sendEmail.mock.calls[0][0] as SendInput;
    expect(input.html).not.toContain("<script>");
    expect(input.html).toContain("&lt;script&gt;");
  });

  it("sin motivo (resolutionNote null) → no envía nada", async () => {
    claimFindUnique.mockResolvedValueOnce(claimRow({ resolutionNote: null }));
    await notifyWarrantyRejected("wc_7");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("best-effort: si sendEmail revienta, NO propaga — loguea el error", async () => {
    claimFindUnique.mockResolvedValueOnce(claimRow());
    sendEmail.mockRejectedValueOnce(new Error("resend down"));

    await expect(notifyWarrantyRejected("wc_8")).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "warranty.email.rejected.fail", id: "wc_8" }),
    );
  });
});
