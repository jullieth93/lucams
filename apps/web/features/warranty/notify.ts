/*
 * Emails de garantía (Ley 1480) — best-effort, capturan sus propios errores.
 *   - al crear: confirmación al cliente + aviso interno a Lucy (para que sepa que llegó).
 *   - al resolver: aviso al cliente con el remedio aplicado.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import { warrantyReceivedEmail } from "@/features/emails/templates/warranty-received";
import { warrantyResolvedEmail } from "@/features/emails/templates/warranty-resolved";

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
  description: string;
  resolutionType: string | null;
  resolutionNote: string | null;
};

async function loadClaim(id: string): Promise<Loaded | null> {
  const c = await prisma.warrantyClaim.findUnique({
    where: { id },
    select: {
      description: true,
      resolutionType: true,
      resolutionNote: true,
      orderItem: {
        select: {
          variant: { select: { product: { select: { name: true } } } },
          order: { select: { number: true, email: true, shippingAddress: true } },
        },
      },
    },
  });
  if (!c) return null;
  const ship = c.orderItem.order.shippingAddress as { fullName?: string } | null;
  return {
    orderNumber: c.orderItem.order.number,
    email: c.orderItem.order.email,
    customerName: ship?.fullName ?? "Cliente",
    productName: c.orderItem.variant.product.name,
    description: c.description,
    resolutionType: c.resolutionType,
    resolutionNote: c.resolutionNote,
  };
}

export async function notifyWarrantyClaimCreated(id: string): Promise<void> {
  try {
    const d = await loadClaim(id);
    if (!d) return;
    // 1) Confirmación al cliente.
    const tpl = await warrantyReceivedEmail({
      customerName: d.customerName,
      claimId: id,
      orderNumber: d.orderNumber,
      productName: d.productName,
      description: d.description,
    });
    const rCustomer = await sendEmail({
      to: d.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `warranty-${id}-received`,
      tags: [
        { name: "type", value: "warranty_received" },
        { name: "order_number", value: d.orderNumber },
      ],
    });
    // 2) Aviso interno a Lucy (para que sepa que llegó un reclamo), con Reply-To al cliente.
    const contactEmail = await getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.co");
    await sendEmail({
      to: contactEmail,
      replyTo: d.email,
      subject: `⚠️ Nuevo reclamo de garantía — pedido ${d.orderNumber}`,
      // Quick win auditoría v3: escapar el texto del cliente (nombre/descripción) — es entrada libre
      // que iba directo al HTML del buzón de Lucy (inyección de HTML en el correo interno).
      html: `<p>Nuevo reclamo de garantía de <strong>${escapeHtml(d.customerName)}</strong> (${escapeHtml(d.email)}) — pedido <strong>${escapeHtml(d.orderNumber)}</strong>, producto <strong>${escapeHtml(d.productName)}</strong>.</p><p style="white-space:pre-wrap">${escapeHtml(d.description)}</p><p>Gestiónalo en /admin/garantias.</p>`,
      text: `Nuevo reclamo de garantía de ${d.customerName} (${d.email}) — pedido ${d.orderNumber}, producto ${d.productName}.\n\n${d.description}\n\nGestiónalo en /admin/garantias.`,
      idempotencyKey: `warranty-${id}-internal`,
      tags: [{ name: "type", value: "warranty_internal" }],
    });
    logger.info({
      event: "warranty.email.created.sent",
      id,
      customer: rCustomer.sent ? "ok" : `skip:${rCustomer.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "warranty.email.created.fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function notifyWarrantyResolved(id: string): Promise<void> {
  try {
    const d = await loadClaim(id);
    if (!d || !d.resolutionType) return;
    const tpl = await warrantyResolvedEmail({
      customerName: d.customerName,
      claimId: id,
      productName: d.productName,
      resolutionType: d.resolutionType,
      note: d.resolutionNote,
    });
    const result = await sendEmail({
      to: d.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      idempotencyKey: `warranty-${id}-resolved`,
      tags: [
        { name: "type", value: "warranty_resolved" },
        { name: "order_number", value: d.orderNumber },
      ],
    });
    logger.info({
      event: "warranty.email.resolved.sent",
      id,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "warranty.email.resolved.fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
