/*
 * submitTokenReviewAction (reseña por token firmado, sin login).
 *
 * Cubre: creación guest PENDING (customerId null + marcador createdBy), asociación
 * al Customer cuando el correo matchea, doble uso rechazado (por customer y por
 * marcador de pedido), Turnstile obligatorio, token inválido/expirado, producto
 * fuera del token y P2002 del índice parcial.
 *
 * Mocks en el borde (patrón registro/actions.test.ts): headers, prisma,
 * Turnstile, rate-limit y logger. El token se genera REAL (createReviewToken
 * con CSRF_SECRET pineada) para ejercitar firma+verificación de punta a punta.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyTurnstileToken = vi.hoisted(() =>
  vi.fn(async (): Promise<{ success: boolean; reason?: string }> => ({ success: true })),
);
const rateLimit = vi.hoisted(() => vi.fn(async () => ({ allowed: true })));
const orderFindFirst = vi.hoisted(() => vi.fn());
const customerFindFirst = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{ id: string; firstName: string | null; lastName: string | null } | null> =>
      null,
  ),
);
const reviewFindFirst = vi.hoisted(() => vi.fn(async (): Promise<{ id: string } | null> => null));
const reviewCreate = vi.hoisted(() => vi.fn(async () => ({ id: "rev-1" })));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "1.2.3.4" }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/rate-limit-keys", () => ({
  ipKey: (...a: string[]) => a.join(":"),
}));
vi.mock("@/lib/db", async () => {
  const { Prisma } = await import("@lucams/db");
  return {
    Prisma,
    prisma: {
      order: { findFirst: orderFindFirst },
      customer: { findFirst: customerFindFirst },
      review: { findFirst: reviewFindFirst, create: reviewCreate },
    },
  };
});

import { Prisma } from "@lucams/db";
import { submitTokenReviewAction } from "./token-actions";
import { createReviewToken } from "./review-token";

const SECRET = "test-csrf-secret-0123456789abcdef";
const ORDER_ID = "corder000000000000000001";
const PRODUCT_ID = "cprod0000000000000000001";
const OTHER_PRODUCT_ID = "cprod0000000000000000002";

const ORDER_ROW = {
  id: ORDER_ID,
  number: "LCM-2026-1042",
  customerId: null as string | null,
  shippingAddress: { fullName: "Camila Restrepo" },
};

function makeToken(overrides: Partial<Parameters<typeof createReviewToken>[0]> = {}): string {
  return createReviewToken({
    orderId: ORDER_ID,
    orderNumber: "LCM-2026-1042",
    email: "camila@example.com",
    productIds: [PRODUCT_ID, OTHER_PRODUCT_ID],
    ...overrides,
  });
}

function reviewForm(token: string, productId: string = PRODUCT_ID): FormData {
  const fd = new FormData();
  fd.set("token", token);
  fd.set("productId", productId);
  fd.set("slug", "fotoimanes-cuadrados");
  fd.set("rating", "5");
  fd.set("comment", "Me encantaron los imanes, llegaron rapidísimo y se ven hermosos.");
  fd.set("cf-turnstile-response", "tok");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CSRF_SECRET = SECRET;
  verifyTurnstileToken.mockResolvedValue({ success: true });
  rateLimit.mockResolvedValue({ allowed: true });
  orderFindFirst.mockResolvedValue(ORDER_ROW);
  customerFindFirst.mockResolvedValue(null);
  reviewFindFirst.mockResolvedValue(null);
  reviewCreate.mockResolvedValue({ id: "rev-1" });
});

describe("submitTokenReviewAction", () => {
  it("invitado puro: crea la reseña PENDING con customerId null y marcador del pedido", async () => {
    const res = await submitTokenReviewAction(null, reviewForm(makeToken()));

    expect(res).toEqual({ success: true });
    expect(reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: PRODUCT_ID,
        customerId: null,
        rating: 5,
        isApproved: false,
        authorName: "Camila Restrepo",
        createdBy: "review-token:LCM-2026-1042",
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/producto/fotoimanes-cuadrados");
  });

  it("el correo del token matchea un Customer → la reseña queda asociada a él", async () => {
    customerFindFirst.mockResolvedValue({ id: "cust-1", firstName: "Camila", lastName: null });

    const res = await submitTokenReviewAction(null, reviewForm(makeToken()));

    expect(res).toEqual({ success: true });
    expect(reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ customerId: "cust-1" }),
    });
  });

  it("pedido con Customer propio → usa ese (no busca por correo)", async () => {
    orderFindFirst.mockResolvedValue({ ...ORDER_ROW, customerId: "cust-pedido" });
    customerFindFirst.mockResolvedValue({ id: "cust-pedido", firstName: "Ana", lastName: null });

    const res = await submitTokenReviewAction(null, reviewForm(makeToken()));

    expect(res).toEqual({ success: true });
    expect(customerFindFirst).toHaveBeenCalledWith({
      where: { id: "cust-pedido", deletedAt: null },
      select: expect.anything(),
    });
    expect(reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ customerId: "cust-pedido" }),
    });
  });

  it("doble uso (mismo customer + producto) → rechazado con mensaje amable", async () => {
    customerFindFirst.mockResolvedValue({ id: "cust-1", firstName: null, lastName: null });
    reviewFindFirst.mockResolvedValueOnce({ id: "rev-previa" }); // pre-check por customer

    const res = await submitTokenReviewAction(null, reviewForm(makeToken()));

    expect(res.error).toMatch(/ya dejaste una reseña/i);
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("doble uso guest (marcador review-token del pedido + producto) → rechazado", async () => {
    reviewFindFirst.mockResolvedValueOnce({ id: "rev-previa" }); // pre-check por marcador

    const res = await submitTokenReviewAction(null, reviewForm(makeToken()));

    expect(res.error).toMatch(/ya recibimos tu reseña/i);
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("P2002 del índice parcial (race de doble submit con customer) → mensaje amable", async () => {
    customerFindFirst.mockResolvedValue({ id: "cust-1", firstName: null, lastName: null });
    reviewCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const res = await submitTokenReviewAction(null, reviewForm(makeToken()));

    expect(res.error).toMatch(/ya dejaste una reseña/i);
  });

  it("Turnstile fallido → error y NO se crea nada", async () => {
    verifyTurnstileToken.mockResolvedValue({ success: false, reason: "no-token" });

    const res = await submitTokenReviewAction(null, reviewForm(makeToken()));

    expect(res.error).toMatch(/robot/i);
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("rate-limit por IP → error y NO se crea nada", async () => {
    rateLimit.mockResolvedValue({ allowed: false });

    const res = await submitTokenReviewAction(null, reviewForm(makeToken()));

    expect(res.error).toMatch(/demasiados intentos/i);
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("token manipulado o expirado → error de link inválido", async () => {
    const res = await submitTokenReviewAction(null, reviewForm(`${makeToken()}x`));
    expect(res.error).toMatch(/venció o no es válido/i);
    expect(reviewCreate).not.toHaveBeenCalled();

    const expired = createReviewToken(
      {
        orderId: ORDER_ID,
        orderNumber: "LCM-2026-1042",
        email: "camila@example.com",
        productIds: [PRODUCT_ID],
      },
      Date.now() - 31 * 24 * 60 * 60 * 1000, // emitido hace 31 días → expirado
    );
    const res2 = await submitTokenReviewAction(null, reviewForm(expired));
    expect(res2.error).toMatch(/venció o no es válido/i);
  });

  it("producto fuera del token → rechazado", async () => {
    const res = await submitTokenReviewAction(
      null,
      reviewForm(makeToken({ productIds: [OTHER_PRODUCT_ID] }), PRODUCT_ID),
    );
    expect(res.error).toMatch(/no hace parte del pedido/i);
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("pedido reembolsado/borrado tras el envío del correo → ya no admite reseñas", async () => {
    orderFindFirst.mockResolvedValue(null);

    const res = await submitTokenReviewAction(null, reviewForm(makeToken()));

    expect(res.error).toMatch(/ya no admite reseñas/i);
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("comentario con caracteres de control → saneado antes de guardar", async () => {
    const fd = reviewForm(makeToken());
    fd.set("comment", "  Muy   buenos,\x07\n\nllegaron\tbien  ");

    const res = await submitTokenReviewAction(null, fd);

    expect(res).toEqual({ success: true });
    expect(reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ comment: "Muy buenos, llegaron bien" }),
    });
  });
});
