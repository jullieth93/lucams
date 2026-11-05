import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getOrderForActor, listOrdersForActor } from "./service";

const RUN = `s17pii_${crypto.randomBytes(4).toString("hex")}`;

describe("S17 — Enmascaramiento server-side y anti-oráculo PII en getOrderForActor / listOrdersForActor", () => {
  let orderId = "";
  const orderNumber = `LCM-2026-${RUN.toUpperCase()}`;
  const rawEmail = `${RUN}.secreto@apellido-unico.co`;
  const rawPhone = "+573198761234";

  beforeAll(async () => {
    const order = await prisma.order.create({
      data: {
        number: orderNumber,
        email: rawEmail,
        phone: rawPhone,
        shippingAddressKey: `bogota|bogota|calle99secreta${RUN}|110111`,
        shippingAddress: {
          fullName: "Natalia Secreto Ospina",
          email: rawEmail,
          phone: "3198761234",
          documentType: "CC",
          documentNumber: "1098765432",
          addressLine1: `Calle 99 Secreta # 12-34 (${RUN})`,
          city: "Bogotá",
          department: "Bogotá D.C.",
        },
        billingDocumentType: "CC",
        billingDocumentNumber: "1098765432",
        billingName: "Natalia Secreto Ospina",
        recipientName: "Camilo Secreto",
        recipientPhone: "+573015554433",
        giftMessage: "Para que recuerdes este viaje siempre",
        notes: "Código citófono 7788",
        labelPath: `shipping-labels/${RUN}.pdf`,
        subtotal: 6500000,
        shipping: 1200000,
        total: 7700000,
        status: "PAID",
        paymentMethod: "WOMPI",
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    if (orderId) {
      await prisma.order.deleteMany({ where: { id: orderId } });
    }
  });

  it("getOrderForActor(PRINT_WORKSHOP) no expone ningún campo PII en el payload RSC devuelto", async () => {
    const workshopView = await getOrderForActor(orderNumber, "PRINT_WORKSHOP");
    expect(workshopView).not.toBeNull();
    const json = JSON.stringify(workshopView);

    expect(json).not.toContain(rawEmail);
    expect(json).not.toContain("apellido-unico");
    expect(json).not.toContain("3198761234");
    expect(json).not.toContain("3015554433");
    expect(json).not.toContain("1098765432");
    expect(json).not.toContain("Secreto");
    expect(json).not.toContain("Calle 99 Secreta");
    expect(json).not.toContain("7788");
    expect(json).not.toContain(`shipping-labels/${RUN}.pdf`);
    // El mensaje impreso de regalo sí llega al taller:
    expect(json).toContain("Para que recuerdes este viaje siempre");

    // Mientras que CUSTOMER_SUPPORT y FINANCE_ANALYST reciben los datos completos:
    const supportView = await getOrderForActor(orderNumber, "CUSTOMER_SUPPORT");
    expect(supportView?.email).toBe(rawEmail);
    expect(supportView?.billingDocumentNumber).toBe("1098765432");
  });

  it("listOrdersForActor(PRINT_WORKSHOP) bloquea búsqueda por email/teléfono/nombre (anti-oráculo) pero permite buscar por número de pedido", async () => {
    const byEmailWorkshop = await listOrdersForActor({ q: rawEmail }, "PRINT_WORKSHOP");
    expect(byEmailWorkshop.items.find((o) => o.id === orderId)).toBeUndefined();

    const byPhoneWorkshop = await listOrdersForActor({ q: "3198761234" }, "PRINT_WORKSHOP");
    expect(byPhoneWorkshop.items.find((o) => o.id === orderId)).toBeUndefined();

    const byNameWorkshop = await listOrdersForActor({ q: "Natalia Secreto" }, "PRINT_WORKSHOP");
    expect(byNameWorkshop.items.find((o) => o.id === orderId)).toBeUndefined();

    const byNumberWorkshop = await listOrdersForActor({ q: orderNumber }, "PRINT_WORKSHOP");
    const foundMasked = byNumberWorkshop.items.find((o) => o.id === orderId);
    expect(foundMasked).toBeDefined();
    expect(JSON.stringify(foundMasked)).not.toContain(rawEmail);

    // En cambio CUSTOMER_SUPPORT sí puede buscar al cliente por su email:
    const byEmailSupport = await listOrdersForActor({ q: rawEmail }, "CUSTOMER_SUPPORT");
    expect(byEmailSupport.items.find((o) => o.id === orderId)?.email).toBe(rawEmail);
  });
});
