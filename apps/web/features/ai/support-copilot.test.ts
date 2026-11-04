import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("server-only", () => ({}));

const fetchMock = vi.fn();
vi.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchMock(...args),
}));

import { generateSupportReplySuggestion, sanitizeSupportTextForAi } from "./support-copilot";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe("sanitizeSupportTextForAi — cero PII enviada a modelos externos (S26)", () => {
  it("redacta emails, teléfonos, cédulas/NIT, direcciones físicas, URLs y nombres propios", () => {
    const raw =
      "Hola soy Valentina Restrepo, mi correo es valentina.r@correo.com.co, cel +57 300 555 6677 o 3158889900, CC 1.020.304.050, NIT 901456789-1. Mi pedido LCM-2026-0088 va para Calle 85 # 15 - 22 en Bogotá. Link: https://lucams.co/pedido/tok_secreto_99";

    const scrubbed = sanitizeSupportTextForAi(raw, {
      knownNames: ["Valentina Restrepo"],
    });

    expect(scrubbed).not.toContain("Valentina");
    expect(scrubbed).not.toContain("Restrepo");
    expect(scrubbed).not.toContain("valentina.r@correo.com.co");
    expect(scrubbed).not.toContain("300 555 6677");
    expect(scrubbed).not.toContain("3158889900");
    expect(scrubbed).not.toContain("1.020.304.050");
    expect(scrubbed).not.toContain("901456789");
    expect(scrubbed).not.toContain("Calle 85");
    expect(scrubbed).not.toContain("tok_secreto_99");
    expect(scrubbed).toContain("[REFERENCIA_PEDIDO]");
    expect(scrubbed).toContain("[CLIENTE]");
    expect(scrubbed).toContain("[EMAIL_REDACTADO]");
    expect(scrubbed).toContain("[TELEFONO_REDACTADO]");
    expect(scrubbed).toContain("[DIRECCION_REDACTADA]");
    expect(scrubbed).toContain("[URL_REDACTADA]");
  });
});

describe.skipIf(!HAS_DB)(
  "generateSupportReplySuggestion — plantilla legal e invocación Gemini sin PII (S26)",
  () => {
    const createdTicketIds: string[] = [];
    const createdOrderIds: string[] = [];
    const createdDesignIds: string[] = [];
    const createdProductIds: string[] = [];
    const createdVariantIds: string[] = [];
    const createdCategoryIds: string[] = [];

    beforeEach(() => {
      fetchMock.mockReset();
    });

    afterAll(async () => {
      if (createdTicketIds.length > 0) {
        await prisma.supportTicket
          .deleteMany({ where: { id: { in: createdTicketIds } } })
          .catch(() => {});
      }
      if (createdOrderIds.length > 0) {
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
      }
      if (createdDesignIds.length > 0) {
        await prisma.design.deleteMany({ where: { id: { in: createdDesignIds } } }).catch(() => {});
      }
      if (createdVariantIds.length > 0) {
        await prisma.productVariant
          .deleteMany({ where: { id: { in: createdVariantIds } } })
          .catch(() => {});
      }
      if (createdProductIds.length > 0) {
        await prisma.product
          .deleteMany({ where: { id: { in: createdProductIds } } })
          .catch(() => {});
      }
      if (createdCategoryIds.length > 0) {
        await prisma.category
          .deleteMany({ where: { id: { in: createdCategoryIds } } })
          .catch(() => {});
      }
      vi.unstubAllEnvs();
    });

    it("degrada a smart_template sin GEMINI_API_KEY y envía 0 bytes de PII cuando GEMINI_API_KEY está activa", async () => {
      const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const category = await prisma.category.create({
        data: {
          name: `itest Categoría Copiloto ${suffix}`,
          slug: `itest-cat-copiloto-${suffix}`,
        },
      });
      createdCategoryIds.push(category.id);

      const product = await prisma.product.create({
        data: {
          name: `itest Pack Fotoimanes ${suffix}`,
          slug: `itest-pack-copiloto-${suffix}`,
          sku: `ITEST-PROD-COP-${suffix}`,
          description: "Pack personalizado",
          basePrice: 4500000,
          isPersonalizable: true,
          categoryId: category.id,
        },
      });
      createdProductIds.push(product.id);

      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: `ITEST-COP-${suffix}`,
          name: "Pack x9",
          price: 4500000,
          stock: 10,
          isActive: true,
          attributes: {},
        },
      });
      createdVariantIds.push(variant.id);

      const design = await prisma.design.create({
        data: {
          sessionId: `itest-sess-${suffix}`,
          productId: product.id,
          status: "USED_IN_ORDER",
          canvasData: { slots: [] },
        },
      });
      createdDesignIds.push(design.id);

      const orderNumber = `LCM-2026-9${suffix.slice(-3)}`;
      const secretEmail = `camila.privada.${suffix}@correo.co`;
      const secretPhone = "3117778899";
      const secretAddress = "Carrera 15 # 93 - 60 Apto 502";

      const order = await prisma.order.create({
        data: {
          number: orderNumber,
          email: secretEmail,
          phone: secretPhone,
          status: "DELIVERED",
          paymentMethod: "WOMPI",
          subtotal: 4500000,
          shipping: 1000000,
          discount: 0,
          total: 5500000,
          deliveredAt: new Date(),
          shippingAddress: {
            fullName: "Camila Montoya",
            addressLine1: secretAddress,
            city: "Bogotá",
            department: "Cundinamarca",
          },
          items: {
            create: [
              {
                variantId: variant.id,
                qty: 1,
                unitPrice: 4500000,
                warrantyMonths: 2,
                designId: design.id,
              },
            ],
          },
        },
      });
      createdOrderIds.push(order.id);

      const ticket = await prisma.supportTicket.create({
        data: {
          name: "Camila Montoya",
          email: secretEmail,
          subject: "GARANTIA_DEVOLUCION",
          orderNumber,
          message: `Hola soy Camila Montoya (${secretEmail}, cel ${secretPhone}), vivo en ${secretAddress} y quiero devolver mi pedido ${orderNumber} porque un imán llegó partido.`,
          status: "OPEN",
        },
      });
      createdTicketIds.push(ticket.id);

      // 1) Sin GEMINI_API_KEY -> smart_template explica Ley 1480 art. 47.3 + garantía 2 meses
      vi.stubEnv("GEMINI_API_KEY", "");
      const templateRes = await generateSupportReplySuggestion(ticket.id);
      expect(templateRes).not.toBeNull();
      expect(templateRes?.source).toBe("smart_template");
      expect(templateRes?.draftBody).toContain("¡Hola Camila!");
      expect(templateRes?.draftBody).toContain("artículo 47 numeral 3");
      expect(templateRes?.draftBody).toContain("2 meses");
      expect(fetchMock).not.toHaveBeenCalled();

      // 2) Con GEMINI_API_KEY -> llama a Gemini SIN enviar email, teléfono, dirección ni nombre
      vi.stubEnv("GEMINI_API_KEY", "fake-gemini-key-for-unit-test");
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      bodyWithoutGreeting:
                        "Lamentamos mucho que un imán de tu pedido [REFERENCIA_PEDIDO] haya sufrido daño en el transporte. Por favor envíanos una foto por este hilo para activar tu garantía de reposición sin costo.",
                      reasoningSummary:
                        "Caso de daño en transporte cubierto por garantía legal de 2 meses.",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });

      const geminiRes = await generateSupportReplySuggestion(ticket.id);
      expect(geminiRes?.source).toBe("gemini");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const requestInit = fetchMock.mock.calls[0]?.[1] as { body?: string };
      const sentBody = String(requestInit?.body ?? "");
      expect(sentBody).not.toContain("Camila");
      expect(sentBody).not.toContain("Montoya");
      expect(sentBody).not.toContain(secretEmail);
      expect(sentBody).not.toContain(secretPhone);
      expect(sentBody).not.toContain("Carrera 15");
      expect(sentBody).not.toContain(orderNumber);

      // Y la respuesta final rehidrata localmente el saludo y el número de pedido para el agente
      expect(geminiRes?.draftBody).toContain("¡Hola Camila!");
      expect(geminiRes?.draftBody).toContain(orderNumber);
    });
  },
);
