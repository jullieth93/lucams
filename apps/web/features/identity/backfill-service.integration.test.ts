/*
 * Integración PostgreSQL — Backfill Progresivo e Idempotente hacia `Contact`
 * (S16 · Fase 7 · ADR-193).
 *
 * Certifica:
 *   1. Modo `--dry-run` (`apply: false`) verificado con `transaction_read_only = on`
 *      y `0` escrituras.
 *   2. Paginación real por cursor (`batchSize = 2`) sobre dataset mixto cubriendo las
 *      8 entidades relacionales (`Customer`, `Order`, `SupportTicket`, `Quote`,
 *      `AbandonedCart`, `Consent`, `WarrantyClaim`, `RetractRequest`).
 *   3. Idempotencia estricta en 3 corridas consecutivas (`apply: true`): pasadas 2 y 3
 *      producen exactamente `totalMutations === 0` y `unlinkedEligibleTotal === 0`.
 *   4. Preservación del 100% de órdenes de invitado (`customerId === null`), aislamiento
 *      total de destinatarios de regalo (`isGift = true`), encolado de `[ID-01]` histórico
 *      sin auto-merge, exclusión de anonimizados Ley 1581 y cero PII en el reporte.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  countUnlinkedEligibleEntities,
  formatContactsBackfillReport,
  runContactsBackfill,
} from "./backfill-service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `bfct${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

describe.skipIf(!hasDb)(
  "runContactsBackfill — backfill progresivo, idempotente y libre de PII (ADR-193)",
  { timeout: 60_000 },
  () => {
    const cleanup = {
      categoryId: "",
      productId: "",
      customerIds: [] as string[],
      orderIds: [] as string[],
      cartIds: [] as string[],
      quoteIds: [] as string[],
      ticketIds: [] as string[],
      consentIds: [] as string[],
    };

    afterAll(async () => {
      const safe = (p: Promise<unknown>) => p.catch(() => {});

      // Descubre contactos generados para el prefijo RUN antes de limpiar FKs
      const runContacts = await prisma.contact
        .findMany({
          where: {
            OR: [
              { primaryEmail: { startsWith: RUN, mode: "insensitive" } },
              { displayName: { contains: RUN, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        })
        .catch(() => []);
      const contactIds = runContacts.map((c) => c.id);

      if (cleanup.consentIds.length > 0) {
        await safe(prisma.consent.deleteMany({ where: { id: { in: cleanup.consentIds } } }));
      }
      await safe(prisma.consent.deleteMany({ where: { version: { startsWith: RUN } } }));

      if (cleanup.ticketIds.length > 0) {
        await safe(prisma.supportTicket.deleteMany({ where: { id: { in: cleanup.ticketIds } } }));
      }

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

      if (cleanup.customerIds.length > 0) {
        await safe(prisma.customer.deleteMany({ where: { id: { in: cleanup.customerIds } } }));
      }

      if (contactIds.length > 0) {
        await safe(
          prisma.identityMergeCandidate.deleteMany({
            where: {
              OR: [
                { primaryContactId: { in: contactIds } },
                { secondaryContactId: { in: contactIds } },
              ],
            },
          }),
        );
        await safe(prisma.contactIdentity.deleteMany({ where: { contactId: { in: contactIds } } }));
        await safe(prisma.contact.deleteMany({ where: { id: { in: contactIds } } }));
      }

      if (cleanup.productId) {
        await safe(prisma.productVariant.deleteMany({ where: { productId: cleanup.productId } }));
        await safe(prisma.product.deleteMany({ where: { id: cleanup.productId } }));
      }
      if (cleanup.categoryId) {
        await safe(prisma.category.deleteMany({ where: { id: cleanup.categoryId } }));
      }
    });

    it("ejecuta --dry-run sin escribir y completa 3 corridas consecutivas con 0 mutaciones en pasadas 2 y 3", async () => {
      // Catálogo base para OrderItem -> WarrantyClaim / RetractRequest
      const category = await prisma.category.create({
        data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
        select: { id: true },
      });
      cleanup.categoryId = category.id;

      const product = await prisma.product.create({
        data: {
          slug: `${RUN}-prod`,
          name: `Producto ${RUN}`,
          description: "Test backfill identidad",
          basePrice: 52_000,
          sku: `${RUN}-SKU`.toUpperCase(),
          categoryId: category.id,
          variants: {
            create: [
              {
                name: "Clásico",
                sku: `${RUN}-VAR`.toUpperCase(),
                price: 52_000,
                stock: 30,
                attributes: {},
              },
            ],
          },
        },
        include: { variants: true },
      });
      cleanup.productId = product.id;
      const variantId = product.variants[0]!.id;

      const emailRegA = `${RUN}-ana@lucams-test.co`;
      const emailRegB = `${RUN}-beto@lucams-test.co`;
      const emailGuestSharedPhone = `${RUN}-guest-phone@lucams-test.co`;
      const emailGuestSharedDoc = `${RUN}-guest-doc@lucams-test.co`;
      const emailId01Alt = `${RUN}-alt-id01@lucams-test.co`;
      const emailLeadNewsletter = `${RUN}-news@lucams-test.co`;
      const emailAnonymized = `${RUN}-erased@deleted.lucamsshop.com`;

      const sharedPhoneRaw = "3157778899";
      const sharedPhoneE164 = "+573157778899";
      const giftRecipientPhoneRaw = "3190001122";
      const giftRecipientPhoneE164 = "+573190001122";
      const quoteWaOnlyRaw = "3184445566";
      const quoteWaOnlyE164 = "+573184445566";
      const sharedDocNumber = `901${Date.now().toString().slice(-6)}`;

      // 1. Tres Customer históricos (2 activos + 1 anonimizado Ley 1581) con contactId = null
      const custA = await prisma.customer.create({
        data: {
          email: emailRegA,
          referralCode: `${RUN}ANA`.toUpperCase().slice(0, 32),
          firstName: "Ana",
          lastName: `Registrada ${RUN}`,
          phone: sharedPhoneRaw,
          supabaseUserId: `sub-${RUN}-ana`,
          documentType: "NIT",
          documentNumber: sharedDocNumber,
          contactId: null,
        },
      });
      const custB = await prisma.customer.create({
        data: {
          email: emailRegB,
          referralCode: `${RUN}BET`.toUpperCase().slice(0, 32),
          firstName: "Beto",
          lastName: `Registrado ${RUN}`,
          phone: "3142223344",
          supabaseUserId: `sub-${RUN}-beto`,
          contactId: null,
        },
      });
      const custErased = await prisma.customer.create({
        data: {
          email: emailAnonymized,
          referralCode: `${RUN}DEL`.toUpperCase().slice(0, 32),
          firstName: "Cliente",
          lastName: "eliminado",
          supabaseUserId: `deleted-${RUN}-erased`,
          contactId: null,
        },
      });
      cleanup.customerIds.push(custA.id, custB.id, custErased.id);

      // 2. Cinco órdenes históricas sin contactId:
      //    - O1: Invitado puro que previamente compró con el mismo email que luego registró Ana (`emailRegA`)
      //    - O2: Invitado puro con otro email pero MISMO teléfono comprador (`SAME_BUYER_PHONE_E164`)
      //    - O3: Invitado puro con otro email pero MISMO NIT (`SAME_BILLING_DOCUMENT`) + Regalo a tercero
      //    - O4: Orden registrada de Beto con email distinto no regalo (`HISTORICAL_ID01_EMAIL_MISMATCH`)
      //    - O5: Orden anonimizada Ley 1581 (`@deleted.lucamsshop.com`) -> debe quedar `contactId: null`
      const baseShip = {
        fullName: `Comprador ${RUN}`,
        department: "Cundinamarca",
        city: "Bogotá",
        line1: "Calle 85 # 15-20",
      };
      const giftShip = {
        fullName: "Destinatario Sorpresa Secreto",
        department: "Antioquia",
        city: "Medellín",
        line1: "Carrera 43A # 1-50",
      };

      const orderGuestPrior = await prisma.order.create({
        data: {
          number: `LCM-${RUN}-O1`.toUpperCase(),
          customerId: null,
          contactId: null,
          email: emailRegA.toUpperCase(),
          phone: sharedPhoneRaw,
          shippingAddress: baseShip,
          subtotal: 52_000,
          shipping: 10_000,
          total: 62_000,
          status: "DELIVERED",
          paymentMethod: "WOMPI",
          items: {
            create: [{ variantId, qty: 1, unitPrice: 52_000 }],
          },
        },
        include: { items: true },
      });

      const orderGuestPhone = await prisma.order.create({
        data: {
          number: `LCM-${RUN}-O2`.toUpperCase(),
          customerId: null,
          contactId: null,
          email: emailGuestSharedPhone,
          phone: sharedPhoneRaw,
          shippingAddress: baseShip,
          subtotal: 52_000,
          shipping: 10_000,
          total: 62_000,
          status: "PAID",
          paymentMethod: "WOMPI",
        },
      });

      const orderGuestGiftAndDoc = await prisma.order.create({
        data: {
          number: `LCM-${RUN}-O3`.toUpperCase(),
          customerId: null,
          contactId: null,
          email: emailGuestSharedDoc,
          phone: "3129998877",
          billingName: `Empresa ${RUN}`,
          billingDocumentType: "NIT",
          billingDocumentNumber: sharedDocNumber,
          isGift: true,
          recipientName: "Destinatario Sorpresa Secreto",
          recipientPhone: giftRecipientPhoneRaw,
          shippingAddress: giftShip,
          subtotal: 52_000,
          shipping: 10_000,
          total: 62_000,
          status: "DELIVERED",
          paymentMethod: "COD",
          items: {
            create: [{ variantId, qty: 1, unitPrice: 52_000 }],
          },
        },
        include: { items: true },
      });

      const orderAuthId01 = await prisma.order.create({
        data: {
          number: `LCM-${RUN}-O4`.toUpperCase(),
          customerId: custB.id,
          contactId: null,
          email: emailId01Alt,
          phone: "3142223344",
          shippingAddress: baseShip,
          subtotal: 52_000,
          shipping: 10_000,
          total: 62_000,
          status: "PAID",
          paymentMethod: "WOMPI",
        },
      });

      const orderErased = await prisma.order.create({
        data: {
          number: `LCM-${RUN}-O5`.toUpperCase(),
          customerId: null,
          contactId: null,
          email: emailAnonymized,
          phone: "0000000000",
          shippingAddress: {},
          subtotal: 52_000,
          shipping: 0,
          total: 52_000,
          status: "DELIVERED",
          paymentMethod: "WOMPI",
        },
      });
      cleanup.orderIds.push(
        orderGuestPrior.id,
        orderGuestPhone.id,
        orderGuestGiftAndDoc.id,
        orderAuthId01.id,
        orderErased.id,
      );

      // 3. SupportTicket (invitado + registrado)
      const ticketGuest = await prisma.supportTicket.create({
        data: {
          email: emailGuestSharedPhone,
          name: `Invitado Soporte ${RUN}`,
          subject: `${RUN} consulta envío`,
          message: "¿Cuándo despachan mi pedido?",
          contactId: null,
        },
      });
      const ticketReg = await prisma.supportTicket.create({
        data: {
          customerId: custA.id,
          email: emailRegA,
          name: `Ana ${RUN}`,
          subject: `${RUN} consulta diseño`,
          message: "Quiero revisar el texto del borde",
          contactId: null,
        },
      });
      cleanup.ticketIds.push(ticketGuest.id, ticketReg.id);

      // 4. Quote (1 con email + 1 solo WhatsApp)
      const quoteEmail = await prisma.quote.create({
        data: {
          number: `${RUN.slice(0, 10)}-Q1`.toUpperCase(),
          customerName: `${RUN} Cotización Email`,
          customerEmail: emailLeadNewsletter,
          customerWhatsapp: "3115556677",
          city: "Bogotá",
          department: "Cundinamarca",
          subtotal: 250_000,
          total: 250_000,
          publicAccessTokenHash: `${RUN}-qh-1`,
          contactId: null,
        },
      });
      const quoteWaOnly = await prisma.quote.create({
        data: {
          number: `${RUN.slice(0, 10)}-Q2`.toUpperCase(),
          customerName: `${RUN} Cotización WhatsApp`,
          customerEmail: null,
          customerWhatsapp: quoteWaOnlyRaw,
          city: "Medellín",
          department: "Antioquia",
          subtotal: 180_000,
          total: 180_000,
          publicAccessTokenHash: `${RUN}-qh-2`,
          contactId: null,
        },
      });
      cleanup.quoteIds.push(quoteEmail.id, quoteWaOnly.id);

      // 5. AbandonedCart histórico
      const cart = await prisma.cart.create({
        data: { sessionId: `sess-${RUN}`, currency: "COP" },
      });
      cleanup.cartIds.push(cart.id);
      await prisma.abandonedCart.create({
        data: {
          cartId: cart.id,
          email: emailLeadNewsletter,
          contactId: null,
        },
      });

      // 6. Consent (1 newsletter con email + 1 cookie banner puramente anónimo que NO debe enlazarse)
      const consentNewsletter = await prisma.consent.create({
        data: {
          email: emailLeadNewsletter,
          scope: "NEWSLETTER",
          version: `${RUN}-v1`,
          accepted: true,
          contactId: null,
        },
      });
      const consentAnonCookie = await prisma.consent.create({
        data: {
          email: null,
          phone: null,
          customerId: null,
          scope: "COOKIES_ANALYTICS",
          version: `${RUN}-v1`,
          accepted: true,
          contactId: null,
        },
      });
      cleanup.consentIds.push(consentNewsletter.id, consentAnonCookie.id);

      // 7. WarrantyClaim + RetractRequest sobre órdenes de invitado
      const warranty = await prisma.warrantyClaim.create({
        data: {
          orderItemId: orderGuestPrior.items[0]!.id,
          customerId: null,
          contactId: null,
          description: "Prueba garantía backfill",
        },
      });
      const retract = await prisma.retractRequest.create({
        data: {
          orderItemId: orderGuestGiftAndDoc.items[0]!.id,
          contactId: null,
          refundAmount: 52_000,
          reason: "Retracto legal prueba backfill",
        },
      });

      // ── PASADA 0: --dry-run (READ ONLY verificado, cero escrituras) ──
      const dryRun = await runContactsBackfill(prisma, {
        apply: false,
        batchSize: 2,
        scopePrefix: RUN,
      });
      expect(dryRun.mode).toBe("DRY_RUN");
      expect(dryRun.readOnlyVerified).toBe(true);
      expect(dryRun.totalMutations).toBe(0);
      expect(dryRun.pendingBefore).toEqual({
        customers: 2,
        orders: 4,
        supportTickets: 2,
        quotes: 2,
        abandonedCarts: 1,
        consents: 1,
        warrantyClaims: 1,
        retractRequests: 1,
        unlinkedEligibleTotal: 14,
      });

      const afterDryRunPending = await countUnlinkedEligibleEntities(prisma, RUN);
      expect(afterDryRunPending.unlinkedEligibleTotal).toBe(14);

      // ── PASADA 1: apply = true con cursor pequeño (batchSize = 2) ──
      const pass1 = await runContactsBackfill(prisma, {
        apply: true,
        batchSize: 2,
        scopePrefix: RUN,
      });
      expect(pass1.mode).toBe("APPLIED");
      expect(pass1.batchesProcessed).toBeGreaterThanOrEqual(8);
      expect(pass1.entitiesLinked).toEqual({
        customers: 2,
        orders: 4,
        supportTickets: 2,
        quotes: 2,
        abandonedCarts: 1,
        consents: 1,
        warrantyClaims: 1,
        retractRequests: 1,
      });
      expect(pass1.reconciliationAfter.unlinkedEligibleTotal).toBe(0);
      expect(pass1.skipped.giftOrdersIsolated).toBe(1);
      expect(pass1.skipped.historicalId01MismatchesQueued).toBe(1);

      // Verifica preservación de órdenes de invitado (customerId sigue siendo null, pero contactId poblado)
      const refreshedGuestPrior = await prisma.order.findUniqueOrThrow({
        where: { id: orderGuestPrior.id },
      });
      const refreshedCustA = await prisma.customer.findUniqueOrThrow({
        where: { id: custA.id },
      });
      expect(refreshedGuestPrior.customerId).toBeNull();
      expect(refreshedGuestPrior.contactId).toBe(refreshedCustA.contactId);

      // Verifica que registros anonimizados Ley 1581 y cookie anónima permanecen con contactId = null
      const refreshedErasedOrder = await prisma.order.findUniqueOrThrow({
        where: { id: orderErased.id },
      });
      const refreshedErasedCust = await prisma.customer.findUniqueOrThrow({
        where: { id: custErased.id },
      });
      const refreshedAnonCookie = await prisma.consent.findUniqueOrThrow({
        where: { id: consentAnonCookie.id },
      });
      expect(refreshedErasedOrder.contactId).toBeNull();
      expect(refreshedErasedCust.contactId).toBeNull();
      expect(refreshedAnonCookie.contactId).toBeNull();

      // Verifica aislamiento absoluto del destinatario de regalo (su teléfono y nombre jamás entran a Contact)
      const leakedGiftPhone = await prisma.contactIdentity.findFirst({
        where: { normalizedValue: giftRecipientPhoneE164 },
      });
      const leakedGiftName = await prisma.contact.findFirst({
        where: { displayName: { contains: "Destinatario Sorpresa" } },
      });
      expect(leakedGiftPhone).toBeNull();
      expect(leakedGiftName).toBeNull();

      // Verifica contacto WhatsApp-only creado para Quote sin email
      const waIdentity = await prisma.contactIdentity.findFirst({
        where: { type: "WHATSAPP", normalizedValue: quoteWaOnlyE164 },
      });
      expect(waIdentity).not.toBeNull();

      // Verifica garantía y retracto vinculados al Contact comprador
      const refreshedWarranty = await prisma.warrantyClaim.findUniqueOrThrow({
        where: { id: warranty.id },
      });
      const refreshedRetract = await prisma.retractRequest.findUniqueOrThrow({
        where: { id: retract.id },
      });
      expect(refreshedWarranty.contactId).toBe(refreshedCustA.contactId);
      expect(refreshedRetract.contactId).not.toBeNull();

      // Verifica los 3 candidatos de fusión encolados en PENDING sin auto-merge
      const refreshedCustB = await prisma.customer.findUniqueOrThrow({
        where: { id: custB.id },
      });
      const refreshedOrderPhone = await prisma.order.findUniqueOrThrow({
        where: { id: orderGuestPhone.id },
      });
      const refreshedOrderDoc = await prisma.order.findUniqueOrThrow({
        where: { id: orderGuestGiftAndDoc.id },
      });
      expect(refreshedOrderPhone.contactId).not.toBe(refreshedCustA.contactId);
      expect(refreshedOrderDoc.contactId).not.toBe(refreshedCustA.contactId);

      const candidates = await prisma.identityMergeCandidate.findMany({
        where: {
          OR: [
            {
              primaryContactId: {
                in: [refreshedCustA.contactId!, refreshedCustB.contactId!],
              },
            },
            {
              secondaryContactId: {
                in: [refreshedCustA.contactId!, refreshedCustB.contactId!],
              },
            },
          ],
        },
      });
      const reasonSet = new Set(candidates.flatMap((c) => c.reasonCodes));
      expect(reasonSet.has("SAME_BUYER_PHONE_E164")).toBe(true);
      expect(reasonSet.has("SAME_BILLING_DOCUMENT")).toBe(true);
      expect(reasonSet.has("HISTORICAL_ID01_EMAIL_MISMATCH")).toBe(true);

      // Verifica cero PII en salida formateada y JSON
      const formatted = formatContactsBackfillReport(pass1);
      const serialized = JSON.stringify(pass1);
      for (const pii of [
        emailRegA,
        emailGuestSharedPhone,
        sharedPhoneRaw,
        sharedPhoneE164,
        sharedDocNumber,
        giftRecipientPhoneRaw,
        "Destinatario Sorpresa",
      ]) {
        expect(formatted).not.toContain(pii);
        expect(serialized).not.toContain(pii);
      }

      // ── PASADA 2 & PASADA 3: Idempotencia exacta (0 escrituras) ──
      const pass2 = await runContactsBackfill(prisma, {
        apply: true,
        batchSize: 2,
        scopePrefix: RUN,
      });
      expect(pass2.totalMutations).toBe(0);
      expect(pass2.contactsCreated).toBe(0);
      expect(pass2.contactsUpdated).toBe(0);
      expect(pass2.identitiesCreated).toBe(0);
      expect(pass2.identitiesUpdated).toBe(0);
      expect(pass2.mergeCandidatesCreated).toBe(0);
      expect(pass2.mergeCandidatesUpdated).toBe(0);
      expect(pass2.reconciliationAfter.unlinkedEligibleTotal).toBe(0);

      const pass3 = await runContactsBackfill(prisma, {
        apply: true,
        batchSize: 2,
        scopePrefix: RUN,
      });
      expect(pass3.totalMutations).toBe(0);
      expect(pass3.reconciliationAfter.unlinkedEligibleTotal).toBe(0);
    });
  },
);
