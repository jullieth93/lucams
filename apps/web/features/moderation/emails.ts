/*
 * Envío del email de "diseño rechazado" (ADR-062 P0-2). Best-effort: un fallo de correo nunca
 * rompe la acción de moderación. Idempotente por (pedido, diseño) vía idempotencyKey de Resend.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { designRejectedEmail } from "@/features/emails/templates/design-rejected";
import type { RejectResult } from "./service";

type ShippingAddrSnapshot = { fullName?: string };

/*
 * Avisa a cada PEDIDO afectado que su diseño fue rechazado, con el motivo.
 *
 * Las COTIZACIONES quedan fuera a propósito: no tienen correo del cliente garantizado ni plantilla
 * propia, y en Etapa 1 el contacto se cierra por WhatsApp. `rejectDesign` sí las devuelve, así que
 * el admin las ve en la auditoría y puede avisar por el canal que corresponde.
 */
export async function sendDesignRejectedEmails(
  designId: string,
  result: RejectResult,
  reason: string,
): Promise<void> {
  const pedidos = result.sources
    .filter((x) => x.tipo === "pedido")
    .map((x) => ({ number: x.numero, email: x.contacto }));
  for (const o of pedidos) {
    try {
      const order = await prisma.order.findFirst({
        where: { number: o.number, deletedAt: null },
        select: { shippingAddress: true },
      });
      const name = (order?.shippingAddress as ShippingAddrSnapshot | null)?.fullName ?? "Cliente";
      const tpl = await designRejectedEmail({
        orderNumber: o.number,
        customerName: name,
        productName: result.productName,
        reason,
        // #10 — link a la vista pública por token (invitados sin login); null → /mi-cuenta.
        // F-11 — el token ya no se puede releer de la DB (solo hash); el
        // invitado rastrea con número + correo en /rastrear.
        publicTrackingToken: null,
      });
      await sendEmail({
        to: o.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        idempotencyKey: `${o.number}-design-rejected-${designId}`,
        tags: [
          { name: "type", value: "design_rejected" },
          { name: "order_number", value: o.number },
        ],
      });
    } catch (err) {
      logger.warn({
        event: "moderation.design_rejected_email_fail",
        orderNumber: o.number,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
