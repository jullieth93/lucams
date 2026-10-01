/*
 * review-request-service: emisión del token firmado de reseña (2026-10).
 *
 * Cubre:
 *  - El email sale con reviewToken VÁLIDO (verificable con verifyReviewToken y
 *    payload = pedido + productos únicos del pedido).
 *  - Si la emisión del token falla (CSRF_SECRET ausente), el correo NO se
 *    sacrifica: sale con reviewToken=null (fallback /rastrear) y se loguea.
 *
 * Mocks en el borde (patrón registro/actions.test.ts): prisma, Resend, el
 * render del registry y los helpers de unsubscribe/site-url.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const orderFindMany = vi.hoisted(() => vi.fn());
const orderUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const sendEmail = vi.hoisted(() => vi.fn(async () => ({ sent: true as const, id: "mail-1" })));
const renderReviewRequestEmail = vi.hoisted(() =>
  vi.fn(
    async (
      _data: Record<string, unknown>,
    ): Promise<{ subject: string; html: string; text: string }> => ({
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    }),
  ),
);
const loggerError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: { order: { findMany: orderFindMany, update: orderUpdate } },
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: loggerError },
}));
vi.mock("@/lib/resend", () => ({ sendEmail }));
vi.mock("@/features/emails/registry", () => ({ renderReviewRequestEmail }));
vi.mock("@/features/emails/layout", () => ({
  getSiteUrl: async () => "https://lucamsshop.com",
}));
vi.mock("@/features/newsletter/unsubscribe", () => ({
  buildCommercialEmailHeaders: () => ({}),
  encodeUnsubscribeParam: (email: string) => `enc-${email}`,
}));

import { sendReviewRequests } from "./review-request-service";
import { verifyReviewToken } from "./review-token";

const SECRET = "test-csrf-secret-0123456789abcdef";
const NOW = new Date("2026-10-01T12:00:00Z");

const ORDER = {
  id: "corder000000000000000001",
  number: "LCM-2026-1042",
  email: "camila@example.com",
  shippingAddress: { fullName: "Camila Restrepo" },
  items: [
    {
      variant: {
        product: { id: "cprod0000000000000000001", name: "Fotoimanes", slug: "fotoimanes" },
      },
    },
    // Mismo producto en otra línea (variante distinta) → dedupe por slug.
    {
      variant: {
        product: { id: "cprod0000000000000000001", name: "Fotoimanes", slug: "fotoimanes" },
      },
    },
    {
      variant: {
        product: { id: "cprod0000000000000000002", name: "Set Corazón", slug: "set-corazon" },
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CSRF_SECRET = SECRET;
  orderFindMany.mockResolvedValue([ORDER]);
  sendEmail.mockResolvedValue({ sent: true as const, id: "mail-1" });
});

describe("sendReviewRequests — token de reseña", () => {
  it("emite un reviewToken válido con el pedido y sus productos únicos", async () => {
    const res = await sendReviewRequests(NOW);
    expect(res).toEqual({ sent: 1, considered: 1 });

    expect(renderReviewRequestEmail).toHaveBeenCalledTimes(1);
    const data = renderReviewRequestEmail.mock.calls[0]![0] as {
      orderNumber: string;
      products: Array<{ id: string; name: string; slug: string }>;
      reviewToken: string | null;
    };
    expect(data.orderNumber).toBe("LCM-2026-1042");
    // Productos deduplicados por slug (3 líneas → 2 productos).
    expect(data.products).toHaveLength(2);

    expect(typeof data.reviewToken).toBe("string");
    const payload = verifyReviewToken(data.reviewToken!, NOW.getTime() + 1000);
    expect(payload).toMatchObject({
      orderId: ORDER.id,
      orderNumber: ORDER.number,
      email: ORDER.email,
      productIds: ["cprod0000000000000000001", "cprod0000000000000000002"],
    });

    // El correo se envía y el pedido queda marcado (idempotencia del cron).
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: ORDER.id },
      data: { reviewRequestedAt: NOW },
    });
  });

  it("si la emisión del token falla, el correo sale igual con reviewToken=null y se loguea", async () => {
    delete process.env.CSRF_SECRET;

    const res = await sendReviewRequests(NOW);
    expect(res).toEqual({ sent: 1, considered: 1 });

    const data = renderReviewRequestEmail.mock.calls[0]![0] as { reviewToken: string | null };
    expect(data.reviewToken).toBeNull();
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ event: "review_request.token_fail", orderId: ORDER.id }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
