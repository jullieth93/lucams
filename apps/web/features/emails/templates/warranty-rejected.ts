/*
 * Template: garantía RECHAZADA (Ley 1480). Se envía cuando el admin rechaza el
 * reclamo en /admin/garantias (mal uso, fuera de garantía, daño no cubierto).
 * Antes de esta plantilla el cliente NO recibía aviso: el reclamo pasaba a
 * REJECTED en silencio (y la bandeja legacy /admin/reclamos tampoco notificaba —
 * su "Nota para el cliente" se perdía). Email TRANSACCIONAL (respuesta a una
 * gestión que el cliente inició) → sin link de baja. Tono empático es-CO tuteo,
 * con el motivo explícito y una salida por WhatsApp — mismo criterio que
 * retract-rejected.
 */

import { renderEmailLayout, escapeHtml } from "../layout";
import { getSettingValue } from "@/lib/cms";

export type WarrantyRejectedData = {
  customerName: string;
  claimId: string;
  orderNumber: string;
  productName: string;
  /** Motivo escrito por el admin (viene del panel → se escapa antes de incrustarlo). */
  reason: string;
};

export async function warrantyRejectedEmail(data: WarrantyRejectedData) {
  const short = data.claimId.slice(0, 8).toUpperCase();
  const waNumber = await getSettingValue("WA_NUMBER", "573208873826");
  const waLink = `https://wa.me/${waNumber.replace(/\D/g, "")}`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Sobre tu reclamo de garantía</h1>
<p>Hola <strong>${escapeHtml(data.customerName)}</strong>,</p>
<p>Revisamos con cuidado tu reclamo de garantía <strong style="font-family:monospace;background:#FFF8F0;padding:2px 6px;border-radius:4px;">#${short}</strong> de <strong>${escapeHtml(data.productName)}</strong> (pedido ${escapeHtml(data.orderNumber)}) y en esta ocasión <strong>no procede</strong>.</p>
<div style="margin:14px 0;padding:12px 14px;background:#FFF3F7;border-left:4px solid #E85B9F;border-radius:8px;">
  <p style="margin:0;font-size:14px;color:#3D2E5C;white-space:pre-wrap;"><strong>Motivo:</strong> ${escapeHtml(data.reason)}</p>
</div>
<p style="margin-top:14px;">Si crees que hay algo que no tuvimos en cuenta o quieres que lo revisemos de nuevo, respóndenos este correo o escríbenos — lo miramos juntos. 💜</p>
<p><a href="${waLink}" style="color:#C42B76;font-weight:600;">Escríbenos por WhatsApp →</a></p>
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">La garantía legal cubre defectos de fabricación durante el término informado del producto; no cubre daños por mal uso o desgaste normal (Ley 1480, art. 8 y 11).</p>
`;

  const text = `Sobre tu reclamo de garantía

Hola ${data.customerName},

Revisamos con cuidado tu reclamo de garantía #${short} de ${data.productName} (pedido ${data.orderNumber}) y en esta ocasión no procede.

Motivo: ${data.reason}

Si crees que hay algo que no tuvimos en cuenta o quieres que lo revisemos de nuevo, respóndenos este correo o escríbenos — lo miramos juntos.

Escríbenos por WhatsApp: ${waLink}

La garantía legal cubre defectos de fabricación durante el término informado del producto; no cubre daños por mal uso o desgaste normal (Ley 1480, art. 8 y 11).`;

  return {
    subject: `Sobre tu reclamo de garantía — #${short}`,
    html: await renderEmailLayout({
      preview: `Revisamos tu reclamo de garantía #${short}.`,
      bodyHtml,
    }),
    text,
  };
}
