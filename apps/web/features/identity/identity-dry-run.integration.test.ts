/*
 * Integración PostgreSQL — Perfilador READ ONLY de Identidad Canónica (S13 · Fase 5 · ADR-193).
 *
 * Verifica sobre base real de pruebas:
 *   1. Exactitud matemática del conteo fuente, forense y proyección `Contact` / `IdentityMergeCandidate`
 *      tanto acotado (`scopePrefix`) como por deltas sobre la base completa.
 *   2. Garantía dura `READ ONLY` en PostgreSQL (`transaction_read_only = on` / SQLSTATE 25006):
 *      cualquier intento de escritura dentro de la transacción del dry-run es rechazado por el motor.
 *   3. Aislamiento de destinatarios de regalo (`Order.isGift = true`), exclusión de registros
 *      anonimizados Ley 1581 (`@deleted.lucamsshop.com`) y cero PII en JSON/consola.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  formatIdentityDryRunReport,
  runIdentityDryRun,
} from "../../../../packages/db/scripts/lib/identity-dry-run.mjs";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `iddry${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

describe.skipIf(!hasDb)(
  "runIdentityDryRun — perfilamiento READ ONLY y colisiones ADR-193",
  { timeout: 45_000 },
  () => {
    const cleanup = {
      categoryId: "" as string,
      productId: "" as string,
      customerIds: [] as string[],
      orderIds: [] as string[],
      cartIds: [] as string[],
      quoteIds: [] as string[],
      ticketIds: [] as string[],
      consentIds: [] as string[],
    };

    afterAll(async () => {
      const safe = (p: Promise<unknown>) => p.catch(() => {});

      if (cleanup.consentIds.length > 0) {
        await safe(prisma.consent.deleteMany({ where: { id: { in: cleanup.consentIds } } }));
      }
      await safe(prisma.consent.deleteMany({ where: { version: { startsWith: RUN } } }));

      if (cleanup.ticketIds.length > 0) {
        await safe(prisma.supportTicket.deleteMany({ where: { id: { in: cleanup.ticketIds } } }));
      }
      await safe(prisma.supportTicket.deleteMany({ where: { subject: { startsWith: RUN } } }));

      if (cleanup.quoteIds.length > 0) {
        await safe(prisma.quote.deleteMany({ where: { id: { in: cleanup.quoteIds } } }));
      }

      if (cleanup.cartIds.length > 0) {
        await safe(prisma.abandonedCart.deleteMany({ where: { cartId: { in: cleanup.cartIds } } }));
        await safe(prisma.cart.deleteMany({ where: { id: { in: cleanup.cartIds } } }));
      }

      if (cleanup.orderIds.length > 0) {
        await safe(
          prisma.retractRequest.deleteMany({
            where: { orderItem: { orderId: { in: cleanup.orderIds } } },
          }),
        );
        await safe(
          prisma.warrantyClaim.deleteMany({
            where: { orderItem: { orderId: { in: cleanup.orderIds } } },
          }),
        );
        await safe(prisma.orderItem.deleteMany({ where: { orderId: { in: cleanup.orderIds } } }));
        await safe(prisma.order.deleteMany({ where: { id: { in: cleanup.orderIds } } }));
      }

      if (cleanup.productId) {
        await safe(prisma.productVariant.deleteMany({ where: { productId: cleanup.productId } }));
        await safe(prisma.product.deleteMany({ where: { id: cleanup.productId } }));
      }
      if (cleanup.categoryId) {
        await safe(prisma.category.deleteMany({ where: { id: cleanup.categoryId } }));
      }

      if (cleanup.customerIds.length > 0) {
        await safe(prisma.customer.deleteMany({ where: { id: { in: cleanup.customerIds } } }));
      }
    });

    it("cuantifica colisiones reales sin tocar filas, rechaza escrituras por SQLSTATE 25006 y no emite PII", async () => {
      // Línea base global antes de sembrar datos sintéticos
      const baselineGlobal = await runIdentityDryRun(prisma);
      expect(baselineGlobal.readOnlyVerified).toBe(true);
      expect(baselineGlobal.scoped).toBe(false);

      // Catálogo mínimo para OrderItem -> WarrantyClaim / RetractRequest
      const category = await prisma.category.create({
        data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
        select: { id: true },
      });
      cleanup.categoryId = category.id;

      const product = await prisma.product.create({
        data: {
          slug: `${RUN}-prod`,
          name: `Producto ${RUN}`,
          description: "Test dry-run identidad",
          basePrice: 45_000,
          sku: `${RUN}-SKU`.toUpperCase(),
          categoryId: category.id,
          variants: {
            create: [
              {
                name: "Estándar",
                sku: `${RUN}-VAR`.toUpperCase(),
                price: 45_000,
                stock: 20,
                attributes: {},
              },
            ],
          },
        },
        select: { id: true, variants: { select: { id: true } } },
      });
      cleanup.productId = product.id;
      const variantId = product.variants[0]!.id;

      // 1. Customer A activa (con teléfono familiar y cédula DIAN)
      const custAna = await prisma.customer.create({
        data: {
          email: `${RUN}-ana@test.local`,
          supabaseUserId: `${RUN}-uid-ana`,
          referralCode: `${RUN}ANA`.toUpperCase().slice(0, 32),
          firstName: "Ana",
          lastName: "Secreta",
          phone: "+57 300 411 2233",
          documentType: "CC",
          documentNumber: `99${RUN.slice(-6)}`,
        },
        select: { id: true, documentNumber: true },
      });
      cleanup.customerIds.push(custAna.id);
      const sharedDocNumber = custAna.documentNumber!;

      // 2. Customer C activa compartiendo teléfono familiar con Customer A
      const custCarlos = await prisma.customer.create({
        data: {
          email: `${RUN}-carlos@test.local`,
          supabaseUserId: `${RUN}-uid-carlos`,
          referralCode: `${RUN}CAR`.toUpperCase().slice(0, 32),
          firstName: "Carlos",
          lastName: "Familia",
          phone: "3004112233",
        },
        select: { id: true },
      });
      cleanup.customerIds.push(custCarlos.id);

      // 3. Customer D suprimida por Ley 1581 (@deleted.lucamsshop.com + deletedAt)
      const custDeleted = await prisma.customer.create({
        data: {
          email: `deleted-${RUN}@deleted.lucamsshop.com`,
          supabaseUserId: `${RUN}-uid-del`,
          referralCode: `${RUN}DEL`.toUpperCase().slice(0, 32),
          deletedAt: new Date(),
          deletedBy: `${RUN}-self-delete`,
        },
        select: { id: true },
      });
      cleanup.customerIds.push(custDeleted.id);

      // Órdenes sintéticas:
      // O1: Orden normal de Ana
      const ordAnaNormal = await prisma.order.create({
        data: {
          number: `${RUN}-O1`.toUpperCase(),
          customerId: custAna.id,
          email: `${RUN}-ana@test.local`,
          phone: "3004112233",
          shippingAddress: { fullName: "Ana Secreta", city: "Bogotá", department: "Cundinamarca" },
          subtotal: 45_000,
          shipping: 0,
          total: 45_000,
          paymentMethod: "WOMPI",
          status: "PAID",
          billingDocumentType: "CC",
          billingDocumentNumber: sharedDocNumber,
          items: { create: [{ variantId, qty: 1, unitPrice: 45_000 }] },
        },
        select: { id: true },
      });
      cleanup.orderIds.push(ordAnaNormal.id);

      // O2: Orden de regalo de Ana (recipientPhone aislado)
      const ordAnaGift = await prisma.order.create({
        data: {
          number: `${RUN}-O2`.toUpperCase(),
          customerId: custAna.id,
          email: `${RUN}-ana@test.local`,
          phone: "3004112233",
          isGift: true,
          recipientName: "Homenajeado Confidencial",
          recipientPhone: "3997776655",
          shippingAddress: {
            fullName: "Homenajeado Confidencial",
            city: "Medellín",
            department: "Antioquia",
          },
          subtotal: 45_000,
          shipping: 0,
          total: 45_000,
          paymentMethod: "WOMPI",
          status: "DELIVERED",
          deliveredAt: new Date(),
          items: { create: [{ variantId, qty: 1, unitPrice: 45_000 }] },
        },
        select: { id: true },
      });
      cleanup.orderIds.push(ordAnaGift.id);

      // O3: Orden histórica [ID-01] (autenticada en sesión de Ana, no regalo, con email de guestB)
      const ordAnaId01 = await prisma.order.create({
        data: {
          number: `${RUN}-O3`.toUpperCase(),
          customerId: custAna.id,
          email: `${RUN}-guestb@test.local`,
          phone: "3004112233",
          isGift: false,
          shippingAddress: { fullName: "Ana Secreta", city: "Bogotá", department: "Cundinamarca" },
          subtotal: 45_000,
          shipping: 0,
          total: 45_000,
          paymentMethod: "COD",
          status: "PAID",
          items: { create: [{ variantId, qty: 1, unitPrice: 45_000 }] },
        },
        select: { id: true },
      });
      cleanup.orderIds.push(ordAnaId01.id);

      // O4: Orden invitada previa con el mismo email de Ana -> vínculo contextual Nivel 2 (0 Contact nuevo)
      const ordAnaPriorGuest = await prisma.order.create({
        data: {
          number: `${RUN}-O4`.toUpperCase(),
          customerId: null,
          email: `${RUN}-ana@test.local`,
          phone: "3004112233",
          shippingAddress: { fullName: "Ana Invitada", city: "Bogotá", department: "Cundinamarca" },
          subtotal: 45_000,
          shipping: 0,
          total: 45_000,
          paymentMethod: "WOMPI",
          status: "DELIVERED",
          deliveredAt: new Date(),
          items: { create: [{ variantId, qty: 1, unitPrice: 45_000 }] },
        },
        select: { id: true },
      });
      cleanup.orderIds.push(ordAnaPriorGuest.id);

      // O5: Orden invitada pura de Guest B con la misma cédula DIAN de Ana + reclamo garantía y retracto
      const ordGuestB = await prisma.order.create({
        data: {
          number: `${RUN}-O5`.toUpperCase(),
          customerId: null,
          email: `${RUN}-guestb@test.local`,
          phone: "3148889900",
          billingDocumentType: "CC",
          billingDocumentNumber: sharedDocNumber,
          shippingAddress: { fullName: "Invitado B", city: "Cali", department: "Valle del Cauca" },
          subtotal: 45_000,
          shipping: 0,
          total: 45_000,
          paymentMethod: "WOMPI",
          status: "DELIVERED",
          deliveredAt: new Date(),
          items: { create: [{ variantId, qty: 1, unitPrice: 45_000 }] },
        },
        select: { id: true, items: { select: { id: true } } },
      });
      cleanup.orderIds.push(ordGuestB.id);

      await prisma.warrantyClaim.create({
        data: {
          orderItemId: ordGuestB.items[0]!.id,
          customerId: null,
          description: "Imán despegado en esquina",
        },
      });
      await prisma.retractRequest.create({
        data: {
          orderItemId: ordGuestB.items[0]!.id,
          refundAmount: 45_000,
          reason: "Cambio de decisión",
        },
      });

      // O6: Orden terminal anonimizada Ley 1581 -> debe quedar sin Contact (null preservado)
      const ordDeleted = await prisma.order.create({
        data: {
          number: `${RUN}-O6`.toUpperCase(),
          customerId: null,
          email: `deleted-${RUN}@deleted.lucamsshop.com`,
          phone: "0000000000",
          shippingAddress: {},
          subtotal: 45_000,
          shipping: 0,
          total: 45_000,
          paymentMethod: "COD",
          status: "DELIVERED",
          deliveredAt: new Date(),
          items: { create: [{ variantId, qty: 1, unitPrice: 45_000 }] },
        },
        select: { id: true },
      });
      cleanup.orderIds.push(ordDeleted.id);

      // SupportTicket invitado + SupportTicket anonimizado Ley 1581
      const tktGuest = await prisma.supportTicket.create({
        data: {
          email: `${RUN}-ticket@test.local`,
          name: `${RUN} Visitante Soporte`,
          subject: `${RUN} Consulta envío`,
          message: "¿Cuánto tarda a Bucaramanga?",
        },
        select: { id: true },
      });
      const tktDeleted = await prisma.supportTicket.create({
        data: {
          email: `deleted-${RUN}@deleted.lucamsshop.com`,
          name: "Titular suprimido",
          subject: `${RUN} Ticket suprimido`,
          message: "[suprimido por solicitud del titular — Ley 1581]",
        },
        select: { id: true },
      });
      cleanup.ticketIds.push(tktGuest.id, tktDeleted.id);

      // Quote solo por WhatsApp (sin email)
      const quoteWa = await prisma.quote.create({
        data: {
          number: `${RUN.slice(0, 10)}-Q1`.toUpperCase(),
          customerName: `${RUN} Empresa Evento`,
          customerWhatsapp: "3182221100",
          customerEmail: null,
          city: "Barranquilla",
          department: "Atlántico",
          subtotal: 300_000,
          total: 300_000,
          publicAccessTokenHash: `${RUN}-quote-hash-1`,
        },
        select: { id: true },
      });
      cleanup.quoteIds.push(quoteWa.id);

      // AbandonedCart invitado
      const cart = await prisma.cart.create({
        data: { sessionId: `${RUN}-sess-cart`, currency: "COP" },
        select: { id: true },
      });
      cleanup.cartIds.push(cart.id);
      await prisma.abandonedCart.create({
        data: {
          cartId: cart.id,
          email: `${RUN}-cart@test.local`,
        },
      });

      // Consent NEWSLETTER activo
      const consent = await prisma.consent.create({
        data: {
          email: `${RUN}-news@test.local`,
          scope: "NEWSLETTER",
          accepted: true,
          version: `${RUN}-v1`,
        },
        select: { id: true },
      });
      cleanup.consentIds.push(consent.id);

      // ── 1. Verificación exacta con scopePrefix = RUN ──
      const scopedReport = await runIdentityDryRun(prisma, { scopePrefix: RUN });
      expect(scopedReport.readOnlyVerified).toBe(true);
      expect(scopedReport.scoped).toBe(true);

      expect(scopedReport.sourceCounts).toEqual({
        activeCustomers: 2,
        softDeletedCustomers: 1,
        activeOrders: 6,
        softDeletedOrders: 0,
        registeredOrders: 3,
        guestOrders: 3,
        giftOrdersTotal: 1,
        supportTicketsTotal: 2,
        registeredSupportTickets: 0,
        guestSupportTickets: 2,
        activeQuotes: 1,
        softDeletedQuotes: 0,
        quotesWithEmail: 0,
        quotesPhoneOnly: 1,
        abandonedCartsTotal: 1,
        consentsTotal: 1,
        activeNewsletterUniqueEmails: 1,
        warrantyClaimsTotal: 1,
        retractRequestsTotal: 1,
      });

      expect(scopedReport.forensics).toEqual({
        authOrderEmailMismatchTotal: 1,
        authOrderEmailMismatchGift: 0,
        authOrderEmailMismatchNonGift: 1,
        sharedPhonesAcrossActiveCustomers: 1,
        sharedPhonesAcrossContacts: 1,
        sharedTaxDocsAcrossContacts: 1,
        giftRecipientPhonesIsolated: 1,
        anonymizedRecordsPreservedNull: {
          orders: 1,
          supportTickets: 1,
          abandonedCarts: 0,
          consents: 0,
          warrantyClaims: 0,
          retractRequests: 0,
        },
      });

      expect(scopedReport.simulatedProjection.totalContacts).toBe(7);
      expect(scopedReport.simulatedProjection.contactsWithCustomerAccount).toBe(2);
      expect(scopedReport.simulatedProjection.contactsGuestOrLeadOnly).toBe(5);
      expect(scopedReport.simulatedProjection.contactsBySource).toEqual({
        CUSTOMER_AUTH: 2,
        GUEST_ORDER: 1,
        SUPPORT_TICKET: 1,
        QUOTE: 1,
        ABANDONED_CART: 1,
        NEWSLETTER: 1,
      });
      expect(scopedReport.simulatedProjection.mergeCandidatesTotalPairs).toBe(2);
      expect(scopedReport.simulatedProjection.mergeCandidatesByReason).toEqual({
        SAME_BUYER_PHONE_E164: 1,
        SAME_BILLING_DOCUMENT: 1,
        HISTORICAL_ID01_EMAIL_MISMATCH: 1,
      });

      // ── 2. Ejecución global sin filtro (segura frente a workers paralelos de Vitest) ──
      const afterGlobal = await runIdentityDryRun(prisma);
      expect(afterGlobal.readOnlyVerified).toBe(true);
      expect(afterGlobal.scoped).toBe(false);
      expect(afterGlobal.sourceCounts.activeCustomers).toBeGreaterThanOrEqual(
        scopedReport.sourceCounts.activeCustomers,
      );
      expect(afterGlobal.sourceCounts.softDeletedCustomers).toBeGreaterThanOrEqual(
        scopedReport.sourceCounts.softDeletedCustomers,
      );
      expect(afterGlobal.sourceCounts.activeOrders).toBeGreaterThanOrEqual(
        scopedReport.sourceCounts.activeOrders,
      );
      expect(afterGlobal.simulatedProjection.totalContacts).toBeGreaterThanOrEqual(
        scopedReport.simulatedProjection.totalContacts,
      );

      // ── 3. Prueba dura READ ONLY: cualquier escritura dentro de la transacción falla con 25006 ──
      await expect(
        runIdentityDryRun(prisma, {
          scopePrefix: RUN,
          afterReadProbe: async (tx) => {
            await tx.supportTicket.create({
              data: {
                email: `${RUN}-illegal@test.local`,
                name: "Intento de escritura prohibido",
                subject: `${RUN}-illegal`,
                message: "Debe abortar por transaction_read_only = on",
              },
            });
          },
        }),
      ).rejects.toThrow(/read-only transaction|25006/i);

      const illegalCount = await prisma.supportTicket.count({
        where: { email: `${RUN}-illegal@test.local` },
      });
      expect(illegalCount).toBe(0);

      // ── 4. Garantía cero PII en JSON y en reporte formateado ──
      const combinedOutput = `${JSON.stringify(scopedReport)}\n${formatIdentityDryRunReport(scopedReport)}`;
      for (const piiSnippet of [
        "@",
        RUN,
        "Secreta",
        "Homenajeado",
        "3004112233",
        "3997776655",
        "3148889900",
        "3182221100",
        sharedDocNumber,
      ]) {
        expect(combinedOutput).not.toContain(piiSnippet);
      }
    });
  },
);
