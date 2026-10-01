/*
 * Test PURO de features/emails/templates/order-admin-notification.ts.
 *
 * FOCO: el link wa.me y el tel: del CLIENTE llevan el indicativo de país
 * resuelto (bug sistémico: el checkout guarda 10 dígitos CO ^3\d{9}$ y los
 * links salían wa.me/300… sin 57 → inválidos) y, cuando el teléfono no es
 * parseable, la plantilla NO emite links rotos.
 *
 * Mismo patrón que templates.test.ts: @/lib/cms mockeado (settings del layout)
 * → render determinista y offline. lib/wa es puro para estos helpers, así que
 * el render ejercita la integración real template ↔ helper.
 */

import { describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_SITE_URL = "https://lucamsshop.com";

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

import { orderAdminNotificationEmail } from "./order-admin-notification";

function data(
  overrides: Partial<Parameters<typeof orderAdminNotificationEmail>[0]> = {},
): Parameters<typeof orderAdminNotificationEmail>[0] {
  return {
    orderId: "ord_01",
    orderNumber: "LCM-2026-1042",
    customerName: "Camila Restrepo",
    customerPhone: "3002182026",
    customerEmail: "camila@example.com",
    city: "Medellín",
    department: "Antioquia",
    paymentMethod: "WOMPI",
    subtotal: 7_990_000,
    shipping: 1_000_000,
    shippingCarrier: "Coordinadora",
    discount: 0,
    total: 8_990_000,
    items: [{ name: "Fotoimanes Cuadrados (x6)", qty: 1, lineTotal: 7_990_000 }],
    ...overrides,
  };
}

describe("order-admin-notification — teléfono del cliente con indicativo", () => {
  it("10 dígitos CO → wa.me/57… y tel:+57… (nunca wa.me/300…)", async () => {
    const r = await orderAdminNotificationEmail(data());
    expect(r.html).toContain("https://wa.me/573002182026?text=");
    expect(r.html).toContain('href="tel:+573002182026"');
    expect(r.html).not.toContain("wa.me/3002182026");
    expect(r.html).not.toContain('tel:+3002182026"');
    expect(r.text).toContain("https://wa.me/573002182026");
  });

  it("teléfono con formato (+57 300 218-2026) → mismos links normalizados", async () => {
    const r = await orderAdminNotificationEmail(data({ customerPhone: "+57 300 218-2026" }));
    expect(r.html).toContain("https://wa.me/573002182026?text=");
    expect(r.html).toContain('href="tel:+573002182026"');
  });

  it("teléfono no parseable → sin link wa.me y teléfono como texto plano (sin tel:+ roto)", async () => {
    const r = await orderAdminNotificationEmail(data({ customerPhone: "123" }));
    expect(r.html).not.toContain("wa.me/");
    expect(r.html).not.toContain('href="tel:');
    // El número crudo sigue visible para que Lucy lo lea.
    expect(r.html).toContain("123");
  });
});
