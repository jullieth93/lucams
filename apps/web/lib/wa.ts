/*
 * Helpers centralizados para WhatsApp wa.me.
 *
 * Todas las páginas que generen deeplinks de WhatsApp (PDP, contacto,
 * soporte, post-orden) deben pasar por acá para que el número quede
 * consistente y el formato de mensaje siga el tono kawaii Lucams.
 *
 * Decisión (mandato CLAUDE.md #6): no usamos Twilio API por ahora —
 * todo va por wa.me con mensaje pre-armado. Si en futuro se migra a
 * Twilio Conversations o WhatsApp Business API, esta función queda
 * como el único punto de cambio.
 */

const FALLBACK_NUMBER = "573150718723"; // Lucy WhatsApp temporal — ver .env.example

export function getWhatsAppNumber(): string {
  return process.env.NEXT_PUBLIC_WA_NUMBER || FALLBACK_NUMBER;
}

export type WhatsAppContext =
  | { kind: "product"; productName: string; sku: string }
  | { kind: "personalize"; productName: string; sku: string }
  | { kind: "support"; subject?: string }
  | { kind: "order"; orderNumber: string }
  | { kind: "wholesale" }
  | { kind: "custom"; text: string };

export function buildWhatsAppMessage(ctx: WhatsAppContext): string {
  switch (ctx.kind) {
    case "product":
      return `Hola Lucams 👋 Quiero saber más sobre "${ctx.productName}" (SKU ${ctx.sku}).`;
    case "personalize":
      return `Hola Lucams 👋 Quiero personalizar "${ctx.productName}" (SKU ${ctx.sku}). Te paso fotos y referencias por aquí ✨`;
    case "support":
      return ctx.subject
        ? `Hola Lucams 👋 Tengo una consulta sobre: ${ctx.subject}`
        : `Hola Lucams 👋 Tengo una consulta y quería hablar por aquí.`;
    case "order":
      return `Hola Lucams 👋 Quiero consultar el estado de mi pedido ${ctx.orderNumber}.`;
    case "wholesale":
      return `Hola Lucams 👋 Estoy interesado/a en pedido al por mayor / corporativo. ¿Me podés contar?`;
    case "custom":
      return ctx.text;
  }
}

/**
 * Construye URL completa wa.me con mensaje pre-armado.
 * Retorna null si no hay número configurado.
 */
export function buildWhatsAppUrl(ctx: WhatsAppContext, opts?: { number?: string }): string {
  const number = opts?.number ?? getWhatsAppNumber();
  const message = buildWhatsAppMessage(ctx);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
