/*
 * Emails de retracto (Bloque F3) — best-effort, capturan sus propios errores.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import { retractReceivedEmail } from "@/features/emails/templates/retract-received";
import { retractApprovedEmail } from "@/features/emails/templates/retract-approved";
import { retractRejectedEmail } from "@/features/emails/templates/retract-rejected";
import { retractRefundedEmail } from "@/features/emails/templates/retract-refunded";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Loaded = {
  orderNumber: string;
  email: string;
  customerName: string;
  productName: string;
  refundAmount: number;
  refundMethod: string | null;
  rejectionNote: string | null;
};

async function loadRetract(id: string): Promise<Loaded | null> {
  const rr = await prisma.retractRequest.findUnique({
    where: { id },
    select: {
      refundAmount: true,
      refundMethod: true,
      rejectionNote: true,
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
    rejectionNote: rr.rejectionNote,
  };
}

/**
 * H7 (auditoría v3) — al CREAR la solicitud: acuse al cliente (comprobante legal) + aviso interno a
 * Lucy (el reloj de 15 días corre desde ya). Best-effort: captura sus errores; no bloquea la acción.
 */
export async function sendRetractRequested(id: string): Promise<void> {
  try {
    const d = await loadRetract(id);
    if (!d) return;
    // 1) Acuse al cliente.
    const tpl = await retractReceivedEmail({
      orderNumber: d.orderNumber,
      customerName: d.customerName,
      productName: d.productName,
    });
    const rCustomer = await sendEmail({
      to: d.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `retract-${id}-received`,
      tags: [
        { name: "type", value: "retract_received" },
        { name: "order_number", value: d.orderNumber },
      ],
    });
    // 2) Aviso interno a Lucy con Reply-To al cliente (HTML escapado — el nombre viene del cliente).
    const contactEmail = await getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.co");
    await sendEmail({
      to: contactEmail,
      replyTo: d.email,
      subject: `⏱️ Nueva solicitud de retracto — pedido ${d.orderNumber} (reembolso ≤15 días)`,
      html: `<p>Nueva solicitud de retracto de <strong>${escapeHtml(d.customerName)}</strong> (${escapeHtml(d.email)}) — pedido <strong>${escapeHtml(d.orderNumber)}</strong>, producto <strong>${escapeHtml(d.productName)}</strong>.</p><p><strong>El reembolso vence en 15 días calendario (Ley 2439/2024).</strong> Gestiónalo en /admin/retractos.</p>`,
      text: `Nueva solicitud de retracto de ${d.customerName} (${d.email}) — pedido ${d.orderNumber}, producto ${d.productName}.\n\nEl reembolso vence en 15 días calendario (Ley 2439/2024). Gestiónalo en /admin/retractos.`,
      idempotencyKey: `retract-${id}-internal`,
      tags: [{ name: "type", value: "retract_internal" }],
    });
    logger.info({
      event: "retract.email.requested.sent",
      id,
      customer: rCustomer.sent ? "ok" : `skip:${rCustomer.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "retract.email.requested.fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
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
    logger.info({
      event: "retract.email.approved.sent",
      id,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "retract.email.approved.fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * #2 (auditoría v3) — al RECHAZAR: avisar al cliente con el motivo. Antes pasaba a REJECTED en
 * silencio y solo se enteraba entrando a mi-cuenta. Best-effort: captura sus errores; no bloquea la
 * acción del admin.
 */
export async function sendRetractRejected(id: string): Promise<void> {
  try {
    const d = await loadRetract(id);
    if (!d) return;
    const tpl = await retractRejectedEmail({
      orderNumber: d.orderNumber,
      customerName: d.customerName,
      productName: d.productName,
      // El motivo es obligatorio al rechazar (rejectRetract exige note); fallback defensivo por si
      // algún registro antiguo lo tuviera null.
      rejectionNote: d.rejectionNote ?? "No cumple las condiciones del derecho de retracto.",
    });
    const result = await sendEmail({
      to: d.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `retract-${id}-rejected`,
      tags: [
        { name: "type", value: "retract_rejected" },
        { name: "order_number", value: d.orderNumber },
      ],
    });
    logger.info({
      event: "retract.email.rejected.sent",
      id,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "retract.email.rejected.fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
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
    logger.info({
      event: "retract.email.refunded.sent",
      id,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "retract.email.refunded.fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
