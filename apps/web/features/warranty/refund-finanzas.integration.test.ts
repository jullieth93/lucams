/*
 * Integración — Reembolso real en WarrantyClaim (#6) con PostgreSQL real:
 *  - Orden multi-ítem DELIVERED ($100.000 = $30.000 + $70.000).
 *  - Garantía parcial REFUND sobre ítem 1 por $25.000 (BANK_TRANSFER, confirmada).
 *  - Verifica deducción exacta en Finanzas (`getPeriodAggregates`, `COLLECTED_WARRANTY_REFUND_WHERE`),
 *    exportación CSV contable (`listCollectedOrdersForExport` + `buildAccountingOrdersCsv`),
 *    y LTV en Contacto 360 (`listContactsForActor` + `getContact360ForActor`).
 *  - Regla crítica anti-doble-descuento: al transicionar la orden completa a `REFUNDED`,
 *    el `WarrantyClaim.refundAmount` NO se vuelve a descontar en Finanzas, CSV ni LTV.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { approveWarrantyClaim, resolveWarrantyClaim, WarrantyError } from "./service";
import {
  buildAccountingOrdersCsv,
  COLLECTED_WARRANTY_REFUND_WHERE,
  getPeriodAggregates,
  listCollectedOrdersForExport,
} from "@/features/finanzas/service";
import {
  getContact360ForActor,
  listContactsForActor,
} from "@/features/identity/contact-360-service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `itest-wref-${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

let categoryId = "";
let productId = "";
let variantAId = "";
let variantBId = "";
let contactId = "";
let orderId = "";
let orderNumber = "";
let orderItemAId = "";
let orderItemBId = "";
let warrantyClaimId = "";

describe.skipIf(!hasDb)(
  "reembolso real de WarrantyClaim en Finanzas, CSV y LTV — PostgreSQL real",
  { timeout: 30_000 },
  () => {
    beforeAll(async () => {
      const cat = await prisma.category.create({
        data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
      });
      categoryId = cat.id;

      const prod = await prisma.product.create({
        data: {
          slug: `${RUN}-prod`,
          name: `Producto ${RUN}`,
          description: "Producto de prueba garantía reembolso",
          basePrice: 3_000_000,
          sku: `${RUN}-PROD`.toUpperCase(),
          categoryId,
          fulfillmentMode: "PHYSICAL_STOCK",
        },
      });
      productId = prod.id;

      variantAId = (
        await prisma.productVariant.create({
          data: {
            productId,
            name: "Item A",
            sku: `${RUN}-VA`.toUpperCase(),
            price: 3_000_000,
            stock: 10,
            attributes: {},
          },
        })
      ).id;
      variantBId = (
        await prisma.productVariant.create({
          data: {
            productId,
            name: "Item B",
            sku: `${RUN}-VB`.toUpperCase(),
            price: 7_000_000,
            stock: 10,
            attributes: {},
          },
        })
      ).id;

      const contact = await prisma.contact.create({
        data: {
          displayName: `Cliente ${RUN}`,
          primaryEmail: `${RUN}@lucams.test`,
          source: "ORDER",
        },
      });
      contactId = contact.id;

      orderNumber = `LCM-WREF-${Date.now().toString().slice(-6)}`;
      const now = new Date();
      const order = await prisma.order.create({
        data: {
          number: orderNumber,
          contactId,
          email: `${RUN}@lucams.test`,
          phone: "3001234567",
          shippingAddress: { fullName: `Cliente ${RUN}`, city: "Bogotá" },
          subtotal: 10_000_000, // $100.000 COP
          discount: 0,
          shipping: 0,
          tax: 0,
          total: 10_000_000,
          status: "DELIVERED",
          paymentMethod: "WOMPI",
          deliveredAt: now,
          items: {
            create: [
              { variantId: variantAId, qty: 1, unitPrice: 3_000_000, warrantyMonths: 12 },
              { variantId: variantBId, qty: 1, unitPrice: 7_000_000, warrantyMonths: 12 },
            ],
          },
        },
        include: { items: true },
      });
      orderId = order.id;
      orderItemAId = order.items.find((i) => i.variantId === variantAId)!.id;
      orderItemBId = order.items.find((i) => i.variantId === variantBId)!.id;

      const claim = await prisma.warrantyClaim.create({
        data: {
          orderItemId: orderItemAId,
          contactId,
          description: "Imán con falla de laminado en una esquina",
          status: "PENDING",
        },
      });
      warrantyClaimId = claim.id;
    });

    afterAll(async () => {
      const safe = (p: Promise<unknown>) => p.catch(() => {});
      if (orderId) {
        await safe(prisma.warrantyClaim.deleteMany({ where: { orderItem: { orderId } } }));
        await safe(prisma.orderItem.deleteMany({ where: { orderId } }));
        await safe(prisma.order.deleteMany({ where: { id: orderId } }));
      }
      if (contactId) await safe(prisma.contact.deleteMany({ where: { id: contactId } }));
      const variantIds = [variantAId, variantBId].filter(Boolean);
      if (variantIds.length > 0) {
        await safe(prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } }));
      }
      if (productId) await safe(prisma.product.deleteMany({ where: { id: productId } }));
      if (categoryId) await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
    });

    it("descuenta reembolso parcial de garantía en Finanzas, CSV y LTV, y no duplica si la orden pasa a REFUNDED", async () => {
      // 1) Aprobar reclamo con remedio REFUND
      await approveWarrantyClaim(warrantyClaimId, "superadmin-test", "REFUND");

      // 2) Intentar resolver por encima del valor de la línea ($35.000 > $30.000) → rechazado
      await expect(
        resolveWarrantyClaim(warrantyClaimId, "superadmin-test", "Excede línea", {
          refundAmount: 3_500_000,
          refundMethod: "BANK_TRANSFER",
          refundConfirmed: true,
        }),
      ).rejects.toBeInstanceOf(WarrantyError);

      // 3) Capturar baseline global de Finanzas ANTES de resolver el reembolso
      const periodBefore = await getPeriodAggregates("7d");
      const warrantyAggBefore = await prisma.warrantyClaim.aggregate({
        where: COLLECTED_WARRANTY_REFUND_WHERE,
        _sum: { refundAmount: true },
      });

      // 4) Resolver reembolso parcial de $25.000 (2_500_000 centavos) sobre ítem A ($30.000)
      await resolveWarrantyClaim(warrantyClaimId, "superadmin-test", "Transferencia #TRX-01", {
        refundAmount: 2_500_000,
        refundMethod: "BANK_TRANSFER",
        refundConfirmed: true,
      });

      const resolvedClaim = await prisma.warrantyClaim.findUniqueOrThrow({
        where: { id: warrantyClaimId },
      });
      expect(resolvedClaim.status).toBe("RESOLVED");
      expect(resolvedClaim.refundAmount).toBe(2_500_000);
      expect(resolvedClaim.refundMethod).toBe("BANK_TRANSFER");
      expect(resolvedClaim.refundedAt).toBeInstanceOf(Date);

      // 5) Finanzas (getPeriodAggregates + COLLECTED_WARRANTY_REFUND_WHERE):
      //    descuenta exactamente 2_500_000 centavos (invariante a órdenes/retractos de otros tests paralelos).
      const periodAfter = await getPeriodAggregates("7d");
      const warrantyAggAfter = await prisma.warrantyClaim.aggregate({
        where: COLLECTED_WARRANTY_REFUND_WHERE,
        _sum: { refundAmount: true },
      });
      const ourOrderWarrantyAgg = await prisma.warrantyClaim.aggregate({
        where: { AND: [COLLECTED_WARRANTY_REFUND_WHERE, { orderItem: { orderId } }] },
        _sum: { refundAmount: true },
      });
      expect(ourOrderWarrantyAgg._sum.refundAmount).toBe(2_500_000);
      expect(periodAfter.warrantyRefundedCents - periodBefore.warrantyRefundedCents).toBe(
        2_500_000,
      );
      const nonRetractDeduction = (p: Awaited<ReturnType<typeof getPeriodAggregates>>) =>
        p.totalCents - p.netTotalCents - p.retractRefundedCents;
      expect(nonRetractDeduction(periodAfter) - nonRetractDeduction(periodBefore)).toBe(2_500_000);
      expect(
        (warrantyAggAfter._sum.refundAmount ?? 0) - (warrantyAggBefore._sum.refundAmount ?? 0),
      ).toBe(2_500_000);

      // 6) Exportación CSV contable: incluye reembolso_garantia_cop = 25000 y total_neto_cop = 75000
      const exportRows = await listCollectedOrdersForExport("7d");
      const ourExportRow = exportRows.find((r) => r.number === orderNumber);
      expect(ourExportRow).toBeDefined();
      expect(ourExportRow?.totalCents).toBe(10_000_000);
      expect(ourExportRow?.warrantyRefundedCents).toBe(2_500_000);

      const csv = buildAccountingOrdersCsv([ourExportRow!]);
      const [headerLine, dataLine] = csv
        .replace(/^\uFEFF/, "")
        .trim()
        .split("\r\n");
      const headers = headerLine.split(",");
      const values = dataLine.split(",");
      expect(values[headers.indexOf("total_bruto_cop")]).toBe("100000");
      expect(values[headers.indexOf("reembolso_garantia_cop")]).toBe("25000");
      expect(values[headers.indexOf("total_neto_cop")]).toBe("75000");

      // 7) LTV en Contacto 360 (detalle + directorio SQL): $100.000 - $25.000 = $75.000
      const c360 = await getContact360ForActor(contactId, "SUPERADMIN");
      expect(c360?.kpis.grossPaidCents).toBe(10_000_000);
      expect(c360?.kpis.warrantyRefundedCents).toBe(2_500_000);
      expect(c360?.kpis.netLtvCents).toBe(7_500_000);

      const dir = await listContactsForActor({ q: `${RUN}@lucams.test` }, "SUPERADMIN");
      const dirItem = dir.items.find((c) => c.id === contactId);
      expect(dirItem?.netLtvCents).toBe(7_500_000);

      // 8) Regla crítica anti-doble-descuento: si la orden completa pasa a REFUNDED,
      //    sale de COLLECTED_REVENUE_ORDER_WHERE y NO vuelve a descontar el WarrantyClaim.refundAmount.
      await prisma.order.update({
        where: { id: orderId },
        data: { status: "REFUNDED" },
      });

      const periodAfterFullRefund = await getPeriodAggregates("7d");
      const warrantyAggAfterFullRefund = await prisma.warrantyClaim.aggregate({
        where: COLLECTED_WARRANTY_REFUND_WHERE,
        _sum: { refundAmount: true },
      });
      const ourOrderWarrantyAggAfterFull = await prisma.warrantyClaim.aggregate({
        where: { AND: [COLLECTED_WARRANTY_REFUND_WHERE, { orderItem: { orderId } }] },
        _sum: { refundAmount: true },
      });
      // El agregado de garantías sobre órdenes cobradas vuelve al baseline exacto (cero doble descuento).
      expect(ourOrderWarrantyAggAfterFull._sum.refundAmount).toBeNull();
      expect(warrantyAggAfterFullRefund._sum.refundAmount ?? 0).toBe(
        warrantyAggBefore._sum.refundAmount ?? 0,
      );
      expect(periodAfterFullRefund.warrantyRefundedCents).toBe(periodBefore.warrantyRefundedCents);
      expect(nonRetractDeduction(periodAfterFullRefund)).toBe(nonRetractDeduction(periodBefore));

      // La orden REFUNDED ya no aparece en el CSV de órdenes cobradas
      const exportAfterFullRefund = await listCollectedOrdersForExport("7d");
      expect(exportAfterFullRefund.find((r) => r.number === orderNumber)).toBeUndefined();

      // LTV del contacto baja a 0 (ni negativo ni doble descuento sobre otras órdenes)
      const c360AfterFull = await getContact360ForActor(contactId, "SUPERADMIN");
      expect(c360AfterFull?.kpis.grossPaidCents).toBe(0);
      expect(c360AfterFull?.kpis.warrantyRefundedCents).toBe(0);
      expect(c360AfterFull?.kpis.netLtvCents).toBe(0);

      const dirAfterFull = await listContactsForActor({ q: `${RUN}@lucams.test` }, "SUPERADMIN");
      expect(dirAfterFull.items.find((c) => c.id === contactId)?.netLtvCents).toBe(0);

      // Además, intentar aprobar/resolver otro reclamo REFUND sobre la orden ya REFUNDED es bloqueado.
      const claimB = await prisma.warrantyClaim.create({
        data: {
          orderItemId: orderItemBId,
          contactId,
          description: "Segundo reclamo sobre orden ya reembolsada",
          status: "APPROVED",
          resolutionType: "REFUND",
        },
      });
      await expect(
        resolveWarrantyClaim(claimB.id, "superadmin-test", "Intento doble", {
          refundAmount: 100_000,
          refundMethod: "WOMPI_VOID",
          refundConfirmed: true,
        }),
      ).rejects.toMatchObject({ reason: "REFUND_EXCEEDS_AVAILABLE" });
    });
  },
);
