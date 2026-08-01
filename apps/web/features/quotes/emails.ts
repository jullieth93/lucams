/*
 * Email transaccional INTERNO: aviso al admin cuando nace una cotización.
 *
 * Por qué existe (Etapa 1, modo catálogo): la venta se cierra por WhatsApp,
 * pero si el cliente crea la cotización y NO pulsa "Enviar por WhatsApp",
 * el negocio nunca se enteraba — la Quote solo era visible entrando a
 * /admin/cotizaciones. Este correo avisa apenas se crea.
 *
 * Patrón: try/catch interno — un fallo de email NUNCA debe propagarse y
 * romper la creación de la cotización (único embudo de la Etapa 1). Solo
 * loggear. Mismo criterio que features/orders/emails.ts.
 *
 * Idempotencia (doble defensa):
 *  1. La action solo lo dispara en la rama "se creó nueva": el doble envío
 *     simultáneo muere antes con DUPLICATE_SUBMIT (reclamo atómico del
 *     carrito) y el secuencial con CART_NOT_FOUND — ninguno llega acá.
 *  2. idempotencyKey de Resend derivado del quote id, por si un retry
 *     residual llegara a disparar dos veces (mismo criterio que los emails
 *     de Order: `${number}-${evento}`).
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import { quoteAdminNotificationEmail } from "@/features/emails/templates/quote-admin-notification";

/** Envia el aviso de cotización nueva al admin. Best-effort: nunca lanza. */
export async function sendQuoteAdminNotification(quoteId: string): Promise<void> {
  try {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, deletedAt: null },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (!quote) return;

    // Mismo destinatario que las alertas operativas y el resumen diario:
    // setting ALERT_EMAIL del CMS (editable en el admin), fallback al buzón
    // principal. Es aviso interno, NUNCA va al cliente.
    const to = await getSettingValue("ALERT_EMAIL", "hola@lucamsshop.com");
    const tpl = await quoteAdminNotificationEmail({
      quoteId: quote.id,
      quoteNumber: quote.number,
      customerName: quote.customerName,
      customerWhatsapp: quote.customerWhatsapp,
      customerEmail: quote.customerEmail,
      city: quote.city,
      department: quote.department,
      notes: quote.notes,
      total: quote.total,
      items: quote.items.map((it) => ({
        productName: it.productName,
        variantName: it.variantName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
    });

    const result = await sendEmail({
      to,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      // Reply-To = email del cliente cuando lo dejó, para responderle directo
      // (mismo criterio que support-ticket-internal); si no, manda EMAIL_REPLY_TO.
      replyTo: tpl.replyTo,
      idempotencyKey: `quote:admin-notification:${quote.id}`,
      tags: [
        { name: "type", value: "quote_admin_notification" },
        { name: "quote_number", value: quote.number },
      ],
    });
    logger.info({
      event: "quote.email.admin_notification.sent",
      number: quote.number,
      to,
      result: result.sent ? "ok" : `skip:${result.reason}`,
    });
  } catch (err) {
    logger.error({
      event: "quote.email.admin_notification.fail",
      quoteId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
