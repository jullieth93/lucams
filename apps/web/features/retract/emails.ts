/*
 * Emails de retracto (Bloque F3) — best-effort, capturan sus propios errores.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { retractApprovedEmail } from "@/features/emails/templates/retract-approved";
import { retractRefundedEmail } from "@/features/emails/templates/retract-refunded";

type Loaded = {
  orderNumber: string;
  email: string;
  customerName: string;
  productName: string;
  refundAmount: number;
  refundMethod: string | null;
};

async function loadRetract(id: string): Promise<Loaded | null> {
  const rr = await prisma.retractRequest.findUnique({
    where: { id },
    select: {
      refundAmount: true,
      refundMethod: true,
      orderItem: {
        select: {
          variant: { select: { product: { select: { name: true } } } },
          order: { select: { number: true, email: true, shippingAddress: true } },
        },
      },
    },
  });
  if (!rr) return null;
  const ship = rr.orderItem.order.shippingAddress as { fullName?: string } | null;
  return {
    orderNumber: rr.orderItem.order.number,
    email: rr.orderItem.order.email,
    customerName: ship?.fullName ?? "Cliente",
    productName: rr.orderItem.variant.product.name,
    refundAmount: rr.refundAmount,
    refundMethod: rr.refundMethod,
  };
}

export async function sendRetractApproved(id: string): Promise<void> {
  try {
    const d = await loadRetract(id);
    if (!d) return;
    const tpl = await retractApprovedEmail({
      orderNumber: d.orderNumber,
      customerName: d.customerName,
      productName: d.productName,
    });
    const result = await sendEmail({
      to: d.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `retract-${id}-approved`,
      tags: [
        { name: "type", value: "retract_approved" },
        { name: "order_number", value: d.orderNumber },
      ],
    });
    logger.info({ event: "retract.email.approved.sent", id, result: result.sent ? "ok" : `skip:${result.reason}` });
  } catch (err) {
    logger.error({ event: "retract.email.approved.fail", id, err: err instanceof Error ? err.message : String(err) });
  }
}

export async function sendRetractRefunded(id: string): Promise<void> {
  try {
    const d = await loadRetract(id);
    if (!d) return;
    const tpl = await retractRefundedEmail({
      orderNumber: d.orderNumber,
      customerName: d.customerName,
      productName: d.productName,
      amount: d.refundAmount,
      method: d.refundMethod ?? "WOMPI_VOID",
    });
    const result = await sendEmail({
      to: d.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `retract-${id}-refunded`,
      tags: [
        { name: "type", value: "retract_refunded" },
        { name: "order_number", value: d.orderNumber },
      ],
    });
    logger.info({ event: "retract.email.refunded.sent", id, result: result.sent ? "ok" : `skip:${result.reason}` });
  } catch (err) {
    logger.error({ event: "retract.email.refunded.fail", id, err: err instanceof Error ? err.message : String(err) });
  }
}
