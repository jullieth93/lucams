import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getCrmBehavioralIntelligence } from "./intelligence-service";

vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)(
  "Inteligencia conductual CRM — RFM, margen neto, UTM, rechazos Wompi e intención (S27)",
  () => {
    const createdOrderIds: string[] = [];
    const createdOppIds: string[] = [];
    const createdContactIds: string[] = [];
    const createdVariantIds: string[] = [];
    const createdProductIds: string[] = [];
    const createdCategoryIds: string[] = [];
    const createdBisIds: string[] = [];

    afterAll(async () => {
      if (createdBisIds.length > 0) {
        await prisma.backInStockSubscription
          .deleteMany({ where: { id: { in: createdBisIds } } })
          .catch(() => {});
      }
      if (createdOppIds.length > 0) {
        await prisma.opportunity
          .deleteMany({ where: { id: { in: createdOppIds } } })
          .catch(() => {});
      }
      if (createdOrderIds.length > 0) {
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
      }
      if (createdContactIds.length > 0) {
        await prisma.contactActivity
          .deleteMany({ where: { contactId: { in: createdContactIds } } })
          .catch(() => {});
        await prisma.contact
          .deleteMany({ where: { id: { in: createdContactIds } } })
          .catch(() => {});
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
    });

    it("calcula niveles RFM, margen neto, atribución UTM, rechazos Wompi, demanda agotada y venta asistida CRM", async () => {
      const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const utmChannel = `ig_crm_${suffix}`;

      const category = await prisma.category.create({
        data: {
          name: `itest Cat Inteligencia ${suffix}`,
          slug: `itest-cat-intel-${suffix}`,
        },
      });
      createdCategoryIds.push(category.id);

      // Producto con costo unitario = 15.000 COP (1_500_000 centavos) y stock 0 (agotado con demanda)
      const product = await prisma.product.create({
        data: {
          name: `itest Imán Polaroid ${suffix}`,
          slug: `itest-iman-intel-${suffix}`,
          sku: `ITEST-INTEL-${suffix}`,
          description: "Imán de prueba inteligencia",
          basePrice: 4500000,
          cost: 1500000,
          categoryId: category.id,
        },
      });
      createdProductIds.push(product.id);

      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: `ITEST-VAR-INTEL-${suffix}`,
          name: "Set x6",
          price: 4500000,
          stock: 0,
          isActive: true,
          attributes: {},
        },
      });
      createdVariantIds.push(variant.id);

      // Suscripción "Avísame cuando vuelva" sobre el producto agotado
      const bis = await prisma.backInStockSubscription.create({
        data: {
          productId: product.id,
          email: `itest-bis-${suffix}@lucams.test`,
        },
      });
      createdBisIds.push(bis.id);

      // Contacto Campeón (3 compras recientes) con acompañamiento CRM previo
      const champion = await prisma.contact.create({
        data: {
          primaryEmail: `itest-champ-${suffix}@lucams.test`,
          displayName: "itest Sofía Campeona",
          source: "GUEST_ORDER",
        },
      });
      createdContactIds.push(champion.id);

      // Actividad CRM 1 día antes de las compras
      await prisma.contactActivity.create({
        data: {
          contactId: champion.id,
          kind: "WHATSAPP",
          body: "Asesoría personalizada de fotos antes del pedido",
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });

      // 3 pedidos pagados en nuestro canal UTM exclusivo:
      // Cada pedido: subtotal 45.000 + envío 10.000 = 55.000 COP; margen esperado = 55.000 - 10.000 - 15.000 = 30.000 COP (3_000_000 centavos)
      for (let i = 1; i <= 3; i += 1) {
        const ord = await prisma.order.create({
          data: {
            number: `LCM-INT-${suffix.slice(-5)}-${i}`,
            contactId: champion.id,
            email: champion.primaryEmail!,
            phone: "3002223344",
            status: "PAID",
            paymentMethod: "WOMPI",
            subtotal: 4500000,
            shipping: 1000000,
            discount: 0,
            total: 5500000,
            utmSource: utmChannel,
            shippingAddress: { city: "Bogotá", department: "Cundinamarca" },
            items: {
              create: [{ variantId: variant.id, qty: 1, unitPrice: 4500000 }],
            },
          },
        });
        createdOrderIds.push(ord.id);
      }

      // 1 orden pendiente con intento Wompi rechazado por medio único de prueba
      const declinedMethod = `NEQUI_ITEST_${suffix.slice(-4)}`;
      const failedOrder = await prisma.order.create({
        data: {
          number: `LCM-INTF-${suffix.slice(-5)}`,
          contactId: champion.id,
          email: champion.primaryEmail!,
          phone: "3002223344",
          status: "PENDING_PAYMENT",
          paymentMethod: "WOMPI",
          subtotal: 4500000,
          shipping: 1000000,
          discount: 0,
          total: 5500000,
          shippingAddress: { city: "Bogotá", department: "Cundinamarca" },
          wompiAttempts: {
            create: [
              {
                sequence: 1,
                reference: `LCM-INTF-${suffix.slice(-5)}`,
                amountInCents: 5500000,
                status: "FAILED",
                transactions: {
                  create: [
                    {
                      externalId: `wompi-tx-${suffix}`,
                      amountInCents: 5500000,
                      status: "DECLINED",
                      paymentMethodType: declinedMethod,
                    },
                  ],
                },
              },
            ],
          },
        },
      });
      createdOrderIds.push(failedOrder.id);

      // 1 oportunidad B2B ganada
      const wonOpp = await prisma.opportunity.create({
        data: {
          number: `OP-W${suffix.slice(-5)}`,
          title: "itest Regalo Fin de Año",
          contactId: champion.id,
          stage: "WON",
          eventType: "CORPORATE_GIFT",
          expectedUnits: 50,
          expectedAmountCop: 20000000,
        },
      });
      createdOppIds.push(wonOpp.id);

      const report = await getCrmBehavioralIntelligence(30);

      // 1. Canal UTM exclusivo registra 3 pedidos, 165.000 COP brutos y 90.000 COP de margen neto
      const myChannel = report.channelAttribution.find((c) => c.channel === utmChannel);
      expect(myChannel).toBeDefined();
      expect(myChannel?.ordersCount).toBe(3);
      expect(myChannel?.uniqueContactsCount).toBe(1);
      expect(myChannel?.grossRevenueCents).toBe(16500000);
      expect(myChannel?.estimatedMarginCents).toBe(9000000);

      // 2. Nivel RFM Campeones contiene al menos nuestra campeona
      const championsTier = report.rfm.tiers.find((t) => t.key === "champions");
      expect(championsTier).toBeDefined();
      expect(championsTier!.contactsCount).toBeGreaterThanOrEqual(1);
      expect(championsTier!.estimatedMarginCents).toBeGreaterThanOrEqual(9000000);

      // 3. Rechazo Wompi capturado por método de pago
      const myDeclined = report.dropOffs.declinedPaymentsByMethod.find(
        (d) => d.paymentMethodType === declinedMethod,
      );
      expect(myDeclined).toEqual({
        paymentMethodType: declinedMethod,
        failedTransactionsCount: 1,
        affectedOrdersCount: 1,
        failedAmountCents: 5500000,
      });

      // 4. Señal de intención vs stock agotado
      const myIntent = report.intentSignals.find((s) => s.productId === product.id);
      if (myIntent) {
        expect(myIntent.pendingBackInStockCount).toBe(1);
        expect(myIntent.availableStock).toBe(0);
        expect(myIntent.stockAlert).toBe("OUT_OF_STOCK_DEMAND");
      }

      // 5. Venta asistida CRM (>= 3 órdenes asistidas y >= 1 oportunidad B2B ganada)
      expect(report.assistedRecovery.crmTouchedOrdersCount).toBeGreaterThanOrEqual(3);
      expect(report.assistedRecovery.crmTouchedRevenueCents).toBeGreaterThanOrEqual(16500000);
      expect(report.assistedRecovery.wonOpportunitiesCount).toBeGreaterThanOrEqual(1);
      expect(report.assistedRecovery.wonOpportunitiesRevenueCents).toBeGreaterThanOrEqual(20000000);
    });
  },
);
