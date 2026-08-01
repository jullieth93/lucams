/*
 * Helpers centralizados para WhatsApp wa.me.
 *
 * Mensajes pre-armados configurables desde el CMS admin
 * (/admin/contenido/paginas/global, sección WhatsApp). Si el setting
 * no existe en DB, cae al fallback hardcoded.
 *
 * El número de destino también sale del CMS (setting WA_NUMBER, editable
 * en /admin/contenido → Ajustes del sitio → WhatsApp). La env
 * NEXT_PUBLIC_WA_NUMBER queda como fallback y, en última instancia, el
 * número hardcoded de abajo.
 *
 * Decisión (mandato CLAUDE.md #6): no usamos Twilio API por ahora —
 * todo va por wa.me con mensaje pre-armado. Si en futuro se migra a
 * Twilio Conversations o WhatsApp Business API, esta función queda
 * como el único punto de cambio.
 *
 * NOTA: `buildWhatsAppUrl`, `buildWhatsAppMessage` y `getWhatsAppNumber`
 * son ASYNC porque leen del CMS. Solo usables en server components.
 */

import "server-only";
import { getSettingValue } from "@/lib/cms";

const FALLBACK_NUMBER = "573208873826"; // Lucy WhatsApp temporal — ver .env.example

/**
 * Número wa.me de destino. Fuente de verdad: setting WA_NUMBER del CMS.
 * Fallback: NEXT_PUBLIC_WA_NUMBER y, en última instancia, FALLBACK_NUMBER.
 *
 * wa.me exige SOLO dígitos: si la admin guarda "+57 320 887 3826" en el CMS (o la
 * env trae '+'/espacios/guiones), el link wa.me/{number} se rompe. Se sanitiza acá
 * —punto único donde se resuelve el número— para que CMS y env queden cubiertos.
 */
export async function getWhatsAppNumber(): Promise<string> {
  const raw = await getSettingValue(
    "WA_NUMBER",
    process.env.NEXT_PUBLIC_WA_NUMBER || FALLBACK_NUMBER,
  );
  return raw.replace(/\D/g, "");
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
      quoteUrl: string;
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
  // Formato de WhatsApp: *negrita*, _cursiva_, ~tachado~ y ```monoespaciado```.
  // Fuente: https://faq.whatsapp.com/539178204879377 (consultado 2026-07-25).
  // Llegaba todo plano y costaba leerlo de un vistazo; ahora el número de cotización y el total
  // —lo que Lucy y el cliente buscan primero— resaltan sobre el detalle.
  quote:
    "Hola Lucams 👋 Soy *{customerName}*.\n\nAcabo de hacer la cotización *{quoteNumber}* en la tienda:\n\n{itemsSummary}\n\n*Total: {total}*\n\n_Ver el detalle:_ {quoteUrl}\n\nQuedo atento/a para concretar 🙌",
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
        quoteUrl: ctx.quoteUrl,
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
  const number = opts?.number ?? (await getWhatsAppNumber());
  const message = await buildWhatsAppMessage(ctx);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
