/*
 * Unit tests de los senders de email de Order (Paquete H, 2026-10-02):
 *
 *  · sendOrderConfirmation — bifurcación del CTA "Ver mi pedido":
 *      - registrado            → /mi-cuenta/pedidos/<number> (sin rotar token)
 *      - invitado NO-COD       → rota token fresco y CTA a /pedido/<token>
 *      - invitado COD          → /rastrear (SIN rotar: el token original del
 *                                redirect de checkout debe seguir vivo)
 *  · sendOrderConfirmation y notifyNewOrderToAdmin — desglose de la variante
 *    (describeVariantAttributes) bajo el nombre de cada línea.
 *
 * Sin DB ni Resend: prisma y sendEmail mockeados; las plantillas renderizan de
 * verdad (mismo patrón que templates.test.ts / registry.test.ts).
 */

import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_SITE_URL = "https://lucamsshop.com";
// E3 — firma del token de reseña (/resena/<token>) que emite sendOrderDelivered.
process.env.CSRF_SECRET = "test-csrf-secret-reviews";

const state = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  sent: [] as Array<{ to: string | string[]; subject: string; html: string; text: string }>,
  orderUpdates: [] as Array<{ where: { id: string }; data: Record<string, unknown> }>,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findFirst: vi.fn(async () => state.order),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        state.orderUpdates.push(args);
        return {};
      }),
    },
    emailTemplateOverride: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/resend", () => ({
  sendEmail: vi.fn(
    async (input: { to: string | string[]; subject: string; html: string; text: string }) => {
      state.sent.push(input);
      return { sent: true, id: "email_1" };
    },
  ),
}));

vi.mock("@/lib/cms", () => ({
  getSettingValue: vi.fn(async (key: string, fallback: string) => {
    switch (key) {
      case "SITE_URL":
        return "https://lucamsshop.com";
      case "CONTACT_EMAIL":
        return "hola@lucamsshop.com";
      case "COPYRIGHT_YEAR":
        return "2026";
      case "COPYRIGHT_TAGLINE":
        return "Hecho con 💜 en Bogotá";
      default:
        return fallback;
    }
  }),
  getCmsBlock: vi.fn(async () => null),
}));

vi.mock("@/features/notifications/service", () => ({ notify: vi.fn(async () => {}) }));

import { notifyNewOrderToAdmin, sendOrderConfirmation, sendOrderDelivered } from "./emails";
import { verifyReviewToken } from "@/features/reviews/review-token";

const BREAKDOWN_TEXT = "12 fotos · 6×8 cm · Sin imán (adhesivo)";

function orderFixture(over: Record<string, unknown> = {}) {
  return {
    id: "ord_1",
    number: "LCM-2026-1042",
    email: "camila@example.com",
    phone: "3004567890",
    customerId: null as string | null,
    paymentMethod: "WOMPI" as string,
    total: 8_990_000,
    subtotal: 7_990_000,
    shipping: 1_000_000,
    discount: 0,
    shippingCarrier: "coordinadora",
    shippingAddress: {
      fullName: "Camila Restrepo",
      addressLine1: "Calle 10 # 43-25",
      city: "Medellín",
      department: "Antioquia",
    },
    items: [
      {
        unitPrice: 7_990_000,
        qty: 1,
        variant: {
          sku: "FI-12-SIN",
          attributes: { photoSlots: 12, sizeCm: "6×8", magnet: false },
          product: { id: "prod_1", name: "Fotoimanes Cuadrados" },
        },
        design: null,
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  state.order = null;
  state.sent = [];
  state.orderUpdates = [];
});

describe("sendOrderConfirmation — destino del CTA «Ver mi pedido» (Paquete H)", () => {
  it("registrado → /mi-cuenta/pedidos/<number>, sin tocar el token", async () => {
    state.order = orderFixture({ customerId: "cust_1" });

    const sent = await sendOrderConfirmation("ord_1");

    expect(sent).toBe(true);
    const html = state.sent[0].html;
    expect(html).toContain("https://lucamsshop.com/mi-cuenta/pedidos/LCM-2026-1042");
    expect(html).not.toContain("/rastrear");
    expect(state.orderUpdates).toHaveLength(0);
  });

  it("invitado WOMPI → rota un token fresco (hash en DB) y el CTA va a /pedido/<token>", async () => {
    state.order = orderFixture({ customerId: null, paymentMethod: "WOMPI" });

    const sent = await sendOrderConfirmation("ord_1");

    expect(sent).toBe(true);
    const html = state.sent[0].html;
    const match = html.match(/\/pedido\/([0-9a-f]{32})/);
    expect(match, "el HTML lleva un link /pedido/<token>").toBeTruthy();
    const token = match![1];
    // El hash persistido corresponde EXACTAMENTE al token entregado en el email.
    expect(state.orderUpdates).toHaveLength(1);
    expect(state.orderUpdates[0].where).toEqual({ id: "ord_1" });
    expect(state.orderUpdates[0].data.publicAccessTokenHash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    // El plano nunca se persiste.
    expect(JSON.stringify(state.orderUpdates[0].data)).not.toContain(token);
  });

  it("invitado COD → /rastrear y NO rota (el link /pedido/<token> del checkout sigue vivo)", async () => {
    state.order = orderFixture({ customerId: null, paymentMethod: "COD" });

    const sent = await sendOrderConfirmation("ord_1");

    expect(sent).toBe(true);
    const html = state.sent[0].html;
    expect(html).toContain("https://lucamsshop.com/rastrear");
    expect(html).not.toContain("/pedido/");
    expect(state.orderUpdates).toHaveLength(0);
  });

  it("cada línea muestra el desglose de su variante (fotos · tamaño · imán)", async () => {
    state.order = orderFixture({ customerId: "cust_1" });

    await sendOrderConfirmation("ord_1");

    expect(state.sent[0].html).toContain(BREAKDOWN_TEXT);
    expect(state.sent[0].text).toContain(BREAKDOWN_TEXT);
  });
});

describe("notifyNewOrderToAdmin — desglose de variantes en el aviso (Paquete H)", () => {
  it("cada línea del email admin muestra el desglose de su variante", async () => {
    state.order = orderFixture({});

    await notifyNewOrderToAdmin("ord_1");

    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].html).toContain(BREAKDOWN_TEXT);
    expect(state.sent[0].text).toContain(BREAKDOWN_TEXT);
  });
});

describe("sendOrderDelivered — CTA de reseña con token real (E3)", () => {
  it("el CTA «Dejar una reseña ⭐» apunta a /resena/<token> con un token HMAC VÁLIDO del pedido", async () => {
    state.order = orderFixture({ customerId: null });

    await sendOrderDelivered("ord_1");

    expect(state.sent).toHaveLength(1);
    const html = state.sent[0].html;
    expect(html).toContain("Dejar una reseña ⭐");
    expect(html).not.toContain("/rastrear");
    const match = html.match(/\/resena\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/);
    expect(match, "el HTML lleva un link /resena/<token>").toBeTruthy();
    // El token abre y trae el pedido + productos + email del comprador.
    const payload = verifyReviewToken(match![1]);
    expect(payload).toMatchObject({
      orderId: "ord_1",
      orderNumber: "LCM-2026-1042",
      email: "camila@example.com",
      productIds: ["prod_1"],
    });
  });

  it("si la emisión del token FALLA (sin CSRF_SECRET) y es REGISTRADO → «Ver mi pedido» a /mi-cuenta/pedidos/<number>", async () => {
    const prev = process.env.CSRF_SECRET;
    delete process.env.CSRF_SECRET;
    try {
      state.order = orderFixture({ customerId: "cust_1" });

      await sendOrderDelivered("ord_1");

      expect(state.sent).toHaveLength(1);
      const html = state.sent[0].html;
      expect(html).toContain("Ver mi pedido");
      expect(html).toContain("https://lucamsshop.com/mi-cuenta/pedidos/LCM-2026-1042");
      expect(html).not.toContain("Dejar una reseña");
      expect(html).not.toContain("/resena/");
    } finally {
      process.env.CSRF_SECRET = prev;
    }
  });

  it("si la emisión del token FALLA y es INVITADO → «Ver mi pedido» a /rastrear", async () => {
    const prev = process.env.CSRF_SECRET;
    delete process.env.CSRF_SECRET;
    try {
      state.order = orderFixture({ customerId: null });

      await sendOrderDelivered("ord_1");

      expect(state.sent).toHaveLength(1);
      const html = state.sent[0].html;
      expect(html).toContain("Ver mi pedido");
      expect(html).toContain("https://lucamsshop.com/rastrear");
      expect(html).not.toContain("/resena/");
    } finally {
      process.env.CSRF_SECRET = prev;
    }
  });

  it("el token falla pero el correo NO se sacrifica (sale igual, con fallback)", async () => {
    const prev = process.env.CSRF_SECRET;
    delete process.env.CSRF_SECRET;
    try {
      state.order = orderFixture({});

      await sendOrderDelivered("ord_1");

      expect(state.sent).toHaveLength(1);
      expect(state.sent[0].to).toBe("camila@example.com");
    } finally {
      process.env.CSRF_SECRET = prev;
    }
  });
});
