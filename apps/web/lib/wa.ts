/*
 * Helpers centralizados para WhatsApp wa.me.
 *
 * Mensajes pre-armados configurables desde el CMS admin
 * (/admin/contenido/configuracion, categoría WhatsApp). Si el setting
 * no existe en DB, cae al fallback hardcoded.
 *
 * Decisión (mandato CLAUDE.md #6): no usamos Twilio API por ahora —
 * todo va por wa.me con mensaje pre-armado. Si en futuro se migra a
 * Twilio Conversations o WhatsApp Business API, esta función queda
 * como el único punto de cambio.
 *
 * NOTA: `buildWhatsAppUrl` y `buildWhatsAppMessage` son ASYNC porque
 * leen del CMS. Solo usables en server components.
 */

import "server-only";
import { getSettingValue } from "@/lib/cms";

const FALLBACK_NUMBER = "573208873826"; // Lucy WhatsApp temporal — ver .env.example

export function getWhatsAppNumber(): string {
  return process.env.NEXT_PUBLIC_WA_NUMBER || FALLBACK_NUMBER;
}

export type WhatsAppContext =
  | { kind: "product"; productName: string; sku: string }
  | { kind: "personalize"; productName: string; sku: string }
  | { kind: "support"; subject?: string }
  | { kind: "order"; orderNumber: string }
  | {
      kind: "quote";
      quoteNumber: string;
      customerName: string;
      itemsSummary: string;
      total: string;
    }
  | { kind: "wholesale" }
  | { kind: "custom"; text: string };

// Plantillas hardcoded de respaldo. Misma copia que seed-cms.mjs.
// Variables interpoladas con sintaxis `{varName}`.
const FALLBACK_TEMPLATES = {
  product: 'Hola Lucams 👋 Quiero saber más sobre "{productName}" (SKU {sku}).',
  personalize:
    'Hola Lucams 👋 Quiero personalizar "{productName}" (SKU {sku}). Te paso fotos y referencias por aquí ✨',
  support: "Hola Lucams 👋 Tengo una consulta y quería hablar por aquí.",
  support_subject: "Hola Lucams 👋 Tengo una consulta sobre: {subject}",
  order: "Hola Lucams 👋 Quiero consultar el estado de mi pedido {orderNumber}.",
  // Etapa 1 (modo catálogo): mensaje de la cotización con número, items con
  // cantidades, total formateado COP y nombre del cliente. itemsSummary llega
  // pre-armado (una línea por item) desde features/quotes/service.ts.
  quote:
    "Hola Lucams 👋 Soy {customerName}. Acabo de hacer la cotización {quoteNumber} en la tienda:\n{itemsSummary}\nTotal: {total}\nQuedo atento/a para concretar 🙌",
  wholesale:
    "Hola Lucams 👋 Estoy interesado/a en pedido al por mayor / corporativo. ¿Me puedes contar?",
} as const;

/**
 * Reemplaza placeholders `{varName}` con el valor correspondiente.
 * Si la variable no existe en `vars`, deja el placeholder original.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}

export async function buildWhatsAppMessage(ctx: WhatsAppContext): Promise<string> {
  switch (ctx.kind) {
    case "product": {
      const tpl = await getSettingValue("WA_MSG_PRODUCT", FALLBACK_TEMPLATES.product);
      return interpolate(tpl, { productName: ctx.productName, sku: ctx.sku });
    }
    case "personalize": {
      const tpl = await getSettingValue("WA_MSG_PERSONALIZE", FALLBACK_TEMPLATES.personalize);
      return interpolate(tpl, { productName: ctx.productName, sku: ctx.sku });
    }
    case "support": {
      if (ctx.subject) {
        const tpl = await getSettingValue(
          "WA_MSG_SUPPORT_SUBJECT",
          FALLBACK_TEMPLATES.support_subject,
        );
        return interpolate(tpl, { subject: ctx.subject });
      }
      return await getSettingValue("WA_MSG_SUPPORT", FALLBACK_TEMPLATES.support);
    }
    case "order": {
      const tpl = await getSettingValue("WA_MSG_ORDER", FALLBACK_TEMPLATES.order);
      return interpolate(tpl, { orderNumber: ctx.orderNumber });
    }
    case "quote": {
      const tpl = await getSettingValue("WA_MSG_QUOTE", FALLBACK_TEMPLATES.quote);
      return interpolate(tpl, {
        quoteNumber: ctx.quoteNumber,
        customerName: ctx.customerName,
        itemsSummary: ctx.itemsSummary,
        total: ctx.total,
      });
    }
    case "wholesale":
      return await getSettingValue("WA_MSG_WHOLESALE", FALLBACK_TEMPLATES.wholesale);
    case "custom":
      return ctx.text;
  }
}

/**
 * Construye URL completa wa.me con mensaje pre-armado.
 * Server-side por el async (lee del CMS).
 */
export async function buildWhatsAppUrl(
  ctx: WhatsAppContext,
  opts?: { number?: string },
): Promise<string> {
  const number = opts?.number ?? getWhatsAppNumber();
  const message = await buildWhatsAppMessage(ctx);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
