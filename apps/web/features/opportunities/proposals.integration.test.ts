import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { expireStalePendingOrders } from "@/features/orders/expire-pending";
import { createPublicB2bOpportunity, OpportunityValidationError } from "./service";
import {
  getPublicProposalByToken,
  saveOpportunityProposalDraft,
  sendOpportunityProposal,
} from "./proposals-service";
import {
  confirmDirectTransferByAdmin,
  convertApprovedProposalToOrder,
  reportDirectTransferByClient,
} from "./proposal-conversion-service";

vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

function futureIsoDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

describe.skipIf(!HAS_DB)(
  "ADR-210 · Configurador B2B multicategoría, Propuestas versionadas, Portal privado y Pago Directo",
  () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const prevBrebKey = process.env.DIRECT_PAYMENT_BREB_KEY;

    let categoryId: string | null = null;
    let productId: string | null = null;
    let variantId: string | null = null;
    let adminId: string | null = null;
    const createdAdminEmail = `itest-admin-b2b-${suffix}@lucams.test`;
    const createdOppIds: string[] = [];
    const createdOrderIds: string[] = [];
    const createdContactIds: string[] = [];
    const createdOrgIds: string[] = [];
    const createdCustomerEmails: string[] = [];

    afterAll(async () => {
      if (prevBrebKey === undefined) {
        delete process.env.DIRECT_PAYMENT_BREB_KEY;
      } else {
        process.env.DIRECT_PAYMENT_BREB_KEY = prevBrebKey;
      }

      if (createdOrderIds.length > 0) {
        await prisma.notification
          .deleteMany({
            where: { dedupKey: { contains: createdOrderIds[0] } },
          })
          .catch(() => {});
        await prisma.task
          .deleteMany({ where: { orderId: { in: createdOrderIds } } })
          .catch(() => {});
        await prisma.opportunity
          .updateMany({
            where: { id: { in: createdOppIds } },
            data: { convertedOrderId: null },
          })
          .catch(() => {});
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
      }

      if (createdOppIds.length > 0) {
        await prisma.task
          .deleteMany({ where: { opportunityId: { in: createdOppIds } } })
          .catch(() => {});
        await prisma.opportunityProposal
          .deleteMany({ where: { opportunityId: { in: createdOppIds } } })
          .catch(() => {});
        await prisma.opportunity
          .deleteMany({ where: { id: { in: createdOppIds } } })
          .catch(() => {});
      }

      if (createdContactIds.length > 0) {
        await prisma.contactActivity
          .deleteMany({ where: { contactId: { in: createdContactIds } } })
          .catch(() => {});
        await prisma.consent
          .deleteMany({ where: { contactId: { in: createdContactIds } } })
          .catch(() => {});
        await prisma.contact
          .deleteMany({ where: { id: { in: createdContactIds } } })
          .catch(() => {});
      }

      if (createdCustomerEmails.length > 0) {
        await prisma.customer
          .deleteMany({ where: { email: { in: createdCustomerEmails } } })
          .catch(() => {});
      }

      if (createdOrgIds.length > 0) {
        await prisma.organization
          .deleteMany({ where: { id: { in: createdOrgIds } } })
          .catch(() => {});
      }

      if (variantId) {
        await prisma.productVariant.delete({ where: { id: variantId } }).catch(() => {});
      }
      if (productId) {
        await prisma.wholesaleTier.deleteMany({ where: { productId } }).catch(() => {});
        await prisma.product.delete({ where: { id: productId } }).catch(() => {});
      }
      if (categoryId) {
        await prisma.category.delete({ where: { id: categoryId } }).catch(() => {});
      }
      if (adminId) {
        await prisma.adminUser.delete({ where: { id: adminId } }).catch(() => {});
      }
    });

    it("ejecuta el flujo completo: configurador público -> propuestas v1/v2 con piso BOM -> aprobación -> Pago Directo con retención -> Order FULFILLING + Opportunity WON", async () => {
      process.env.DIRECT_PAYMENT_BREB_KEY = "@lucamstestb2b";

      const admin = await prisma.adminUser.create({
        data: {
          email: createdAdminEmail,
          supabaseUserId: randomUUID(),
          role: "SUPERADMIN",
          isActive: true,
        },
      });
      adminId = admin.id;

      const category = await prisma.category.create({
        data: {
          name: `itest Cat B2B ${suffix}`,
          slug: `itest-cat-b2b-${suffix}`,
          isActive: true,
        },
      });
      categoryId = category.id;

      // Producto pack x6 piezas físicas: costo BOM = $4.000/pack (400_000 centavos), base = $24.000/pack,
      // tramo mayorista desde 50 piezas físicas = $18.000/pack (1_800_000 centavos).
      const product = await prisma.product.create({
        data: {
          name: `itest Pack Polaroid B2B ${suffix}`,
          slug: `itest-pack-b2b-${suffix}`,
          sku: `ITEST-B2B-${suffix}`,
          description: "Pack corporativo de prueba",
          basePrice: 2_400_000,
          cost: 412_300,
          categoryId: category.id,
          isActive: true,
          isPersonalizable: true,
          fulfillmentMode: "MADE_TO_ORDER",
          productionDays: 2,
          warrantyMonths: 6,
          images: ["https://example.com/polaroid.webp"],
          wholesaleTiers: {
            create: [{ minQty: 50, unitPrice: 1_800_000 }],
          },
        },
      });
      productId = product.id;

      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: "Pack x6 Con imán",
          sku: `ITEST-B2B-V1-${suffix}`,
          price: 2_400_000,
          stock: 0,
          isActive: true,
          attributes: { quantity: 6, magnet: true },
        },
      });
      variantId = variant.id;

      const buyerEmail = `itest-corp-${suffix}@lucams.test`;
      createdCustomerEmails.push(buyerEmail);
      const eventDate = futureIsoDate(15);

      // 1. Rechaza < 25 piezas físicas reales (3 packs x 6 = 18 piezas < 25).
      await expect(
        createPublicB2bOpportunity(
          {
            contactName: "itest Valentina Rojas",
            organizationName: `itest Grupo Andino ${suffix}`,
            nit: `900${suffix.slice(-6)}-2`,
            email: buyerEmail,
            whatsapp: "3104445566",
            eventType: "CORPORATE_GIFT",
            expectedUnits: 30,
            eventDate,
            city: "Bogotá",
            department: "Cundinamarca",
            cityCode: "11001",
            departmentCode: "11",
            configMode: "CATALOG_LINES",
            configuredLinesJson: JSON.stringify([
              { productId: product.id, variantId: variant.id, commercialQty: 3 },
            ]),
            artworkMode: "ASSORTED_BATCH",
            packagingType: "INDIVIDUAL_FAVOR",
            notes: "Regalo fin de año",
            acceptHabeasData: true,
            acceptNewsletter: false,
          },
          {
            ip: "127.0.0.1",
            userAgent: "vitest",
            privacyPolicyVersion: "v3 · 2026-11-05",
          },
        ),
      ).rejects.toThrow(OpportunityValidationError);

      // 2. Acepta 10 packs x 6 = 60 piezas físicas (>= 25) y persiste snapshot sin filtrar costo BOM.
      const opp = await createPublicB2bOpportunity(
        {
          contactName: "itest Valentina Rojas",
          organizationName: `itest Grupo Andino ${suffix}`,
          nit: "",
          email: buyerEmail,
          whatsapp: "3104445566",
          eventType: "CORPORATE_GIFT",
          expectedUnits: 60,
          eventDate,
          city: "Bogotá",
          department: "Cundinamarca",
          cityCode: "11001",
          departmentCode: "11",
          configMode: "CATALOG_LINES",
          configuredLinesJson: JSON.stringify([
            { productId: product.id, variantId: variant.id, commercialQty: 10 },
          ]),
          artworkMode: "ASSORTED_BATCH",
          packagingType: "INDIVIDUAL_FAVOR",
          notes: "Regalo corporativo con tarjeta individual",
          acceptHabeasData: true,
          acceptNewsletter: false,
        },
        {
          ip: "127.0.0.1",
          userAgent: "vitest",
          privacyPolicyVersion: "v3 · 2026-11-05",
        },
      );
      createdOppIds.push(opp.id);
      createdContactIds.push(opp.contactId);

      const savedOpp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } });
      if (savedOpp.organizationId) createdOrgIds.push(savedOpp.organizationId);
      expect(savedOpp.expectedUnits).toBe(60);
      const reqCfg = savedOpp.requestedConfig as Record<string, unknown>;
      expect(reqCfg.mode).toBe("CATALOG_LINES");
      expect(JSON.stringify(reqCfg)).not.toContain("412300");

      // 3. Bloquea precio debajo del costo BOM ($3.000 < $4.000) para MANAGER.
      const validUntilDate = futureIsoDate(10);
      await expect(
        saveOpportunityProposalDraft(
          {
            opportunityId: opp.id,
            proposalId: "",
            validUntilDate,
            proofMode: "AFTER_PAYMENT",
            artworkMode: "ASSORTED_BATCH",
            packagingType: "INDIVIDUAL_FAVOR",
            estimatedProductionDays: 5,
            shippingMode: "PACTED_MANUAL",
            shippingCarrier: "",
            shippingService: "Entrega corporativa Bogotá",
            packageCount: 1,
            departmentCode: "11",
            cityCode: "11001",
            shippingPesos: 15000,
            discountPesos: 0,
            allowDirectTransfer: true,
            allowBelowCostOverride: true,
            clientNotes: "Incluye revisión de arte",
            termsNotes: "",
            items: [
              {
                variantId: variant.id,
                qty: 10,
                designUnits: 1,
                unitPricePesos: 3000,
                packagingNote: "Bolsita individual",
                designId: "",
              },
            ],
          },
          { id: admin.id, role: "MANAGER" },
        ),
      ).rejects.toThrow(OpportunityValidationError);

      // 4. Emite v1 y luego v2 -> v1 queda SUPERSEDED y su token deja de resolver.
      const draftV1 = await saveOpportunityProposalDraft(
        {
          opportunityId: opp.id,
          proposalId: "",
          validUntilDate,
          proofMode: "AFTER_PAYMENT",
          artworkMode: "ASSORTED_BATCH",
          packagingType: "INDIVIDUAL_FAVOR",
          estimatedProductionDays: 5,
          shippingMode: "PACTED_MANUAL",
          shippingCarrier: "",
          shippingService: "Entrega corporativa Bogotá",
          packageCount: 1,
          departmentCode: "11",
          cityCode: "11001",
          shippingPesos: 15000,
          discountPesos: 0,
          allowDirectTransfer: true,
          allowBelowCostOverride: false,
          clientNotes: "Versión inicial",
          termsNotes: "",
          items: [
            {
              variantId: variant.id,
              qty: 10,
              designUnits: 1,
              unitPricePesos: 18000,
              packagingNote: "Bolsita individual",
              designId: "",
            },
          ],
        },
        { id: admin.id, role: "MANAGER" },
      );
      const sentV1 = await sendOpportunityProposal({
        proposalId: draftV1.id,
        actorAdminId: admin.id,
        sendEmailToClient: false,
      });

      const draftV2 = await saveOpportunityProposalDraft(
        {
          opportunityId: opp.id,
          proposalId: "",
          validUntilDate,
          proofMode: "AFTER_PAYMENT",
          artworkMode: "ASSORTED_BATCH",
          packagingType: "INDIVIDUAL_FAVOR",
          estimatedProductionDays: 4,
          shippingMode: "PACTED_MANUAL",
          shippingCarrier: "",
          shippingService: "Entrega corporativa Bogotá",
          packageCount: 1,
          departmentCode: "11",
          cityCode: "11001",
          shippingPesos: 10000,
          discountPesos: 10000,
          allowDirectTransfer: true,
          allowBelowCostOverride: false,
          clientNotes: "Versión final con descuento negociado",
          termsNotes: "Entrega única en oficina principal",
          items: [
            {
              variantId: variant.id,
              qty: 10,
              designUnits: 1,
              unitPricePesos: 17000,
              packagingNote: "Bolsita individual con sticker",
              designId: "",
            },
          ],
        },
        { id: admin.id, role: "MANAGER" },
      );
      expect(draftV2.version).toBe(2);
      // Total v2: (10 * $17.000) - $10.000 + $10.000 = $170.000 COP (17_000_000 centavos)
      expect(draftV2.totalCents).toBe(17_000_000);

      const sentV2 = await sendOpportunityProposal({
        proposalId: draftV2.id,
        actorAdminId: admin.id,
        sendEmailToClient: false,
      });

      const supersededLookup = await getPublicProposalByToken(sentV1.plainToken);
      expect(supersededLookup).toBeNull();

      const publicV2 = await getPublicProposalByToken(sentV2.plainToken);
      expect(publicV2).not.toBeNull();
      expect(publicV2?.version).toBe(2);
      expect(JSON.stringify(publicV2)).not.toContain("unitCostSnapshotCents");

      // 5. El cliente aprueba en /propuesta/[token] eligiendo DIRECT_TRANSFER y dirección DANE exacta.
      const conversion = await convertApprovedProposalToOrder({
        rawToken: sentV2.plainToken,
        paymentChoice: "DIRECT_TRANSFER",
        recipientFullName: "Valentina Rojas",
        recipientPhone: "3104445566",
        address: {
          kind: "urban",
          deptCode: "11",
          cityCode: "11001",
          department: "Bogotá D.C.",
          city: "Bogotá D.C.",
          localityId: "chapinero",
          neighborhood: "Chicó",
          viaType: "Calle",
          viaNumber: "93",
          cruceNumber: "14-20",
          destinationType: "oficina",
          officeNumber: "502",
          companyName: "Grupo Andino",
        },
        acceptProof: false,
        acceptTermsAndHabeas: true,
        sessionCustomerId: null,
        sessionCustomerEmail: null,
        ip: "127.0.0.1",
        userAgent: "vitest",
        redirectBaseUrl: "http://localhost:4000",
      });

      expect(conversion.kind).toBe("awaiting_direct_transfer");
      createdOrderIds.push(conversion.orderId);

      // 6. Aunque el pedido lleve > 48h creado, expireStalePendingOrders respeta paymentExpiresAt vigente.
      await prisma.order.update({
        where: { id: conversion.orderId },
        data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      });
      await expireStalePendingOrders();
      const stillPending = await prisma.order.findUniqueOrThrow({
        where: { id: conversion.orderId },
      });
      expect(stillPending.status).toBe("PENDING_PAYMENT");
      expect(stillPending.b2bArtworkReady).toBe(false);

      // 7. El cliente reporta pago Bre-B y SUPERADMIN confirma con retención en la fuente ($4.250 COP).
      await reportDirectTransferByClient({
        rawToken: sentV2.plainToken,
        method: "BRE_B",
        reference: "CUS88990011",
        notes: "Practicamos ReteFuente compras 2,5 % ($4.250 COP)",
      });

      // Cuadre descuadrado falla:
      await expect(
        confirmDirectTransferByAdmin({
          orderId: conversion.orderId,
          actorAdminId: admin.id,
          receivedCashCents: 16_000_000,
          withholdingCents: 0,
        }),
      ).rejects.toThrow(OpportunityValidationError);

      // Cuadre exacto ($165.750 banco + $4.250 retención = $170.000 total):
      const confirmed = await confirmDirectTransferByAdmin({
        orderId: conversion.orderId,
        actorAdminId: admin.id,
        receivedCashCents: 16_575_000,
        withholdingCents: 425_000,
        notes: "Verificado en extracto empresarial",
      });
      expect(confirmed.orderNumber).toBe(conversion.orderNumber);

      // 8. Verifica estado final del ecosistema tras processPaidOrder:
      const finalOrder = await prisma.order.findUniqueOrThrow({
        where: { id: conversion.orderId },
      });
      expect(finalOrder.status).toBe("FULFILLING");
      expect(finalOrder.trackingNumber).toBe(`B2B-${finalOrder.number}`);
      expect(finalOrder.withholdingCents).toBe(425_000);
      const loyaltyTxns = await prisma.loyaltyTxn.count({
        where: { orderId: finalOrder.id },
      });
      expect(loyaltyTxns).toBe(0);

      const finalOpp = await prisma.opportunity.findUniqueOrThrow({
        where: { id: opp.id },
      });
      expect(finalOpp.stage).toBe("WON");
      expect(finalOpp.convertedOrderId).toBe(finalOrder.id);

      const openOppTasks = await prisma.task.count({
        where: { opportunityId: opp.id, status: "OPEN" },
      });
      expect(openOppTasks).toBe(0);
    });
  },
);
