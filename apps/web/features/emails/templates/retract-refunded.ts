/*
 * Template: reembolso de retracto procesado (Bloque F3). Se envía cuando el admin
 * marca la solicitud REFUNDED. El dinero se mueve manualmente (Wompi/transferencia).
 */

import { renderEmailLayout } from "../layout";
import { formatCOP } from "@/lib/format";

export type RetractRefundedData = {
  orderNumber: string;
  customerName: string;
  productName: string;
  amount: number; // COP centavos
  method: string; // "WOMPI_VOID" | "BANK_TRANSFER"
};

export async function retractRefundedEmail(data: RetractRefundedData) {
  const amount = formatCOP(data.amount);
  const methodLabel =
    data.method === "BANK_TRANSFER" ? "transferencia bancaria" : "reversa a tu medio de pago";

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">Procesamos tu reembolso 💜</h1>
<p>Hola ${escapeHtml(data.customerName)}, completamos el reembolso por la devolución de
<strong>${escapeHtml(data.productName)}</strong> (pedido ${escapeHtml(data.orderNumber)}).</p>
<p style="font-size:18px;color:#3D2E5C;"><strong>Monto reembolsado: ${amount}</strong></p>
<p style="margin-top:8px;">Método: ${escapeHtml(methodLabel)}. Puede tardar <strong>unos días hábiles</strong> en reflejarse, según tu banco.</p>
<p style="font-size:13px;color:#3D2E5C;opacity:0.65;margin-top:18px;">Gracias por tu confianza. Si algo no cuadra, respóndenos este correo o escríbenos por WhatsApp.</p>
`;

  const text = `Procesamos tu reembolso

Hola ${data.customerName},

Completamos el reembolso por la devolución de "${data.productName}" (pedido ${data.orderNumber}).

Monto reembolsado: ${amount}
Método: ${methodLabel}. Puede tardar unos días hábiles en reflejarse, según tu banco.

Gracias por tu confianza.`;

  return {
    subject: `Reembolso de tu retracto procesado — pedido ${data.orderNumber} 💜`,
    html: await renderEmailLayout({
      preview: `Reembolsamos ${amount} por tu devolución.`,
      bodyHtml,
    }),
    text,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
