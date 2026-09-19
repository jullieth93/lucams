/*
 * Registry de plantillas de email transaccional (módulo /admin/email-templates,
 * Fase 4 — feedback Lucy 2026-09-18).
 *
 * Catálogo ÚNICO de las 26 plantillas de features/emails/templates: id (nombre
 * del archivo), nombre legible, cuándo se envía (de los headers de cada
 * plantilla), la función render ya envuelta en `withOverrides` (los textos
 * clave editados en el admin aplican sin tocar el copy base) y SAMPLE DATA
 * realista por plantilla (nombres de prueba, pedidos LCM-2026-XXXX, montos en
 * centavos COP — reutiliza los fixtures de templates.test.ts y de la galería
 * interna /internal/correos).
 *
 * Consumidores:
 *  1. El módulo admin: la lista /admin/email-templates, el detalle con preview
 *     (/admin/email-templates/[id] + la ruta HTML [id]/preview) y la acción
 *     "Enviarme una prueba" (renderSample/renderBase de cada entry).
 *  2. Los SENDERS PRODUCTIVOS (features/orders/emails.ts, features/support/*,
 *     features/retract/emails.ts, etc.): importan las funciones `render*` de
 *     la sección final de este archivo — el MISMO wrapper `withOverrides` del
 *     preview, así que un override guardado en el admin aplica también al
 *     correo que recibe el cliente. El fallback es total (sin fila en DB o DB
 *     caída → copy base intacto) y la lectura va cacheada (unstable_cache,
 *     tag "email-overrides"): mismo patrón que los settings CMS que esos
 *     flujos ya consultan con getSettingValue en el mismo request, así que el
 *     cold-path de los webhooks no cambia de forma.
 *
 * ÚNICA excepción deliberada: la galería dev-only /internal/correos sigue
 * importando las plantillas base — su propósito es revisar el copy ORIGINAL
 * con variantes (invitado vs con-cuenta); el render con overrides ya lo cubre
 * el preview del admin.
 */

import { EMAIL_OVERRIDE_KEYS, withOverrides, type EmailOverrideKey } from "./overrides";
import { accountExistsNoticeEmail } from "./templates/account-exists-notice";
import { backInStockEmail } from "./templates/back-in-stock";
import { cartRecoveryEmail } from "./templates/cart-recovery";
import { designRejectedEmail } from "./templates/design-rejected";
import { newsletterWelcomeEmail } from "./templates/newsletter-welcome";
import { orderAdminNotificationEmail } from "./templates/order-admin-notification";
import { orderCancelledEmail } from "./templates/order-cancelled";
import { orderConfirmationEmail } from "./templates/order-confirmation";
import { orderDeliveredEmail } from "./templates/order-delivered";
import { orderPaymentDeclinedEmail } from "./templates/order-payment-declined";
import { orderPaymentFailedEmail } from "./templates/order-payment-failed";
import { orderReturnedEmail } from "./templates/order-returned";
import { orderShippedEmail } from "./templates/order-shipped";
import { quoteAdminNotificationEmail } from "./templates/quote-admin-notification";
import { referralRewardEmail } from "./templates/referral-reward";
import { refundIssuedEmail } from "./templates/refund-issued";
import { retractApprovedEmail } from "./templates/retract-approved";
import { retractReceivedEmail } from "./templates/retract-received";
import { retractRefundedEmail } from "./templates/retract-refunded";
import { retractRejectedEmail } from "./templates/retract-rejected";
import { reviewRequestEmail } from "./templates/review-request";
import { supportTicketClosedEmail } from "./templates/support-ticket-closed";
import { supportTicketInternalEmail } from "./templates/support-ticket-internal";
import { supportTicketReceivedEmail } from "./templates/support-ticket-received";
import { warrantyReceivedEmail } from "./templates/warranty-received";
import { warrantyResolvedEmail } from "./templates/warranty-resolved";

/** Resultado común de todas las plantillas (support-internal/closed suman replyTo). */
export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type EmailTemplateEntry = {
  /** Nombre del archivo en features/emails/templates (sin .ts). Es la PK lógica de los overrides. */
  id: string;
  /** Nombre legible para Lucy. */
  name: string;
  /** Agrupación visual del módulo admin. */
  group: string;
  /** Cuándo se envía (de la cabecera de cada plantilla). */
  description: string;
  /** Campos editables inline en el detalle (hoy las 3 keys en todas). */
  editableKeys: readonly EmailOverrideKey[];
  /**
   * Tokens {campo} válidos en los overrides de ESTA plantilla: los escalares
   * (string/number) top-level del data del render — el sample data refleja los
   * campos que llegan en el envío real (verificado contra los senders). Ojo:
   * campos que en el envío real llegan null (ej. publicTrackingToken post F-11)
   * quedan LITERALES si se usan como token (interpolateOverrideTokens solo
   * interpola string/number).
   */
  tokens: readonly string[];
  /** Render con el sample data del registry, ya con overrides aplicados. */
  renderSample: () => Promise<RenderedEmail>;
  /** Render con el sample data SIN overrides — el copy base, para el editor. */
  renderBase: () => Promise<RenderedEmail>;
};

function define<TData>(cfg: {
  id: string;
  name: string;
  group: string;
  description: string;
  render: (data: TData) => Promise<RenderedEmail>;
  sampleData: TData;
  editableKeys?: readonly EmailOverrideKey[];
}): EmailTemplateEntry {
  return {
    id: cfg.id,
    name: cfg.name,
    group: cfg.group,
    description: cfg.description,
    editableKeys: cfg.editableKeys ?? EMAIL_OVERRIDE_KEYS,
    tokens: Object.keys(cfg.sampleData ?? {}).filter(
      (k) =>
        typeof (cfg.sampleData as Record<string, unknown>)[k] === "string" ||
        typeof (cfg.sampleData as Record<string, unknown>)[k] === "number",
    ),
    renderSample: () => withOverrides(cfg.id, cfg.render)(cfg.sampleData),
    renderBase: () => cfg.render(cfg.sampleData),
  };
}

// ── Sample data compartido (es-CO, mismos fixtures que templates.test.ts y
// /internal/correos; montos en centavos COP, pedidos LCM-2026-XXXX). ──
const CUSTOMER = "Camila Restrepo";
const ORDER = "LCM-2026-1042";
const TOKEN = "a1b2c3d4e5f6";
const TICKET = "tkt_9f8e7d6c5b4a";

export const EMAIL_TEMPLATE_REGISTRY: readonly EmailTemplateEntry[] = [
  // ─────────────────────────── Pedidos ───────────────────────────
  define({
    id: "order-confirmation",
    name: "Confirmación de pedido",
    group: "Pedidos",
    description:
      "Al confirmarse el pago (webhook Wompi APPROVED) o al crear un pedido contraentrega (COD).",
    render: orderConfirmationEmail,
    sampleData: {
      orderNumber: ORDER,
      customerName: CUSTOMER,
      total: 8_990_000,
      subtotal: 7_990_000,
      shipping: 1_000_000,
      discount: 0,
      shippingCarrier: "Coordinadora",
      items: [
        { name: "Fotoimanes Cuadrados (x6)", qty: 1, lineTotal: 4_990_000 },
        { name: "Imán Polaroid personalizado", qty: 2, lineTotal: 3_000_000 },
      ],
      shippingAddress: "Calle 10 # 43-25, Apto 302, Medellín, Antioquia",
      publicTrackingToken: TOKEN,
      paymentMethod: "WOMPI",
    },
  }),
  define({
    id: "order-shipped",
    name: "Pedido enviado",
    group: "Pedidos",
    description: "Al generarse la guía de envío (webhook Aveonline IN_TRANSIT).",
    render: orderShippedEmail,
    sampleData: {
      orderNumber: ORDER,
      customerName: CUSTOMER,
      carrier: "Coordinadora",
      trackingNumber: "CO987654321",
      trackingUrl: "https://coordinadora.com/rastreo/CO987654321",
      estimatedDays: 3,
      publicTrackingToken: TOKEN,
    },
  }),
  define({
    id: "order-delivered",
    name: "Pedido entregado",
    group: "Pedidos",
    description:
      "Cuando la transportadora reporta la entrega (webhook Aveonline DELIVERED). Invita a dejar reseña.",
    render: orderDeliveredEmail,
    sampleData: { orderNumber: ORDER, customerName: CUSTOMER, publicTrackingToken: TOKEN },
  }),
  define({
    id: "order-payment-declined",
    name: "Pago no aprobado (pedido vivo)",
    group: "Pedidos",
    description:
      "Cuando Wompi reporta DECLINED/ERROR y el pedido queda PENDING_PAYMENT: invita a reintentar dentro de la ventana de 24 h.",
    render: orderPaymentDeclinedEmail,
    sampleData: {
      orderNumber: ORDER,
      customerName: CUSTOMER,
      total: 8_990_000,
      reason: "Card declined",
    },
  }),
  define({
    id: "order-payment-failed",
    name: "Pago fallido (pedido cancelado)",
    group: "Pedidos",
    description:
      "Cuando Wompi reporta DECLINED/VOIDED/ERROR y el pedido ya pasó a CANCELLED. El cliente puede reintentar con otro checkout.",
    render: orderPaymentFailedEmail,
    sampleData: {
      orderNumber: ORDER,
      customerName: CUSTOMER,
      total: 8_990_000,
      reason: "El banco rechazó la transacción. Verifica los datos de tu tarjeta.",
      publicTrackingToken: TOKEN,
    },
  }),
  define({
    id: "order-cancelled",
    name: "Pedido cancelado",
    group: "Pedidos",
    description:
      "Cuando el admin cancela manualmente un pedido (incidencia, desistimiento, dirección errada).",
    render: orderCancelledEmail,
    sampleData: {
      orderNumber: ORDER,
      customerName: CUSTOMER,
      reason: "El pedido fue cancelado a solicitud tuya.",
    },
  }),
  define({
    id: "order-returned",
    name: "Pedido devuelto por la transportadora",
    group: "Pedidos",
    description:
      "Cuando Aveonline reporta RETURNED/EXCEPTION: el paquete viene de vuelta y el negocio decide el siguiente paso.",
    render: orderReturnedEmail,
    sampleData: { orderNumber: ORDER, customerName: CUSTOMER },
  }),
  define({
    id: "refund-issued",
    name: "Reembolso emitido",
    group: "Pedidos",
    description:
      "Cuando el admin marca la orden como REFUNDED (el movimiento de dinero en Wompi es manual).",
    render: refundIssuedEmail,
    sampleData: {
      orderNumber: ORDER,
      customerName: CUSTOMER,
      amount: 8_990_000,
      reason: "Producto agotado tras la compra.",
    },
  }),
  define({
    id: "order-admin-notification",
    name: "Aviso interno: pedido pagado",
    group: "Pedidos",
    description:
      "Notificación INTERNA al buzón de alertas (ALERT_EMAIL) apenas se paga un pedido. Reply-To = email del cliente.",
    render: orderAdminNotificationEmail,
    sampleData: {
      orderId: "ord_01JZXC4T9K",
      orderNumber: ORDER,
      customerName: CUSTOMER,
      customerPhone: "300 456 7890",
      customerEmail: "camila@example.com",
      city: "Medellín",
      department: "Antioquia",
      paymentMethod: "WOMPI",
      subtotal: 7_990_000,
      shipping: 1_000_000,
      shippingCarrier: "Coordinadora",
      discount: 0,
      total: 8_990_000,
      items: [
        { name: "Fotoimanes Cuadrados (x6)", qty: 1, lineTotal: 4_990_000 },
        { name: "Imán Polaroid personalizado", qty: 2, lineTotal: 3_000_000 },
      ],
    },
  }),

  // ─────────────────── Retracto (Ley 1480 / 2439) ───────────────────
  define({
    id: "retract-received",
    name: "Retracto recibido",
    group: "Retracto",
    description:
      "Acuse de recibo al CREAR la solicitud de retracto (evidencia legal de que se ejerció dentro de la ventana).",
    render: retractReceivedEmail,
    sampleData: { orderNumber: ORDER, customerName: CUSTOMER, productName: "Fotoimanes Cuadrados" },
  }),
  define({
    id: "retract-approved",
    name: "Retracto aprobado",
    group: "Retracto",
    description:
      "Cuando el admin aprueba la solicitud: instrucciones de devolución (reembolso en máx. 15 días calendario).",
    render: retractApprovedEmail,
    sampleData: { orderNumber: ORDER, customerName: CUSTOMER, productName: "Fotoimanes Cuadrados" },
  }),
  define({
    id: "retract-rejected",
    name: "Retracto rechazado",
    group: "Retracto",
    description:
      "Cuando el admin rechaza la solicitud (personalizado sin derecho de retracto, fuera de plazo, producto usado).",
    render: retractRejectedEmail,
    sampleData: {
      orderNumber: ORDER,
      customerName: CUSTOMER,
      productName: "Set personalizado con foto",
      rejectionNote:
        "El producto es personalizado (lleva tu foto), y por ley los productos hechos a la medida no tienen derecho de retracto.",
    },
  }),
  define({
    id: "retract-refunded",
    name: "Retracto reembolsado",
    group: "Retracto",
    description: "Cuando el admin marca la solicitud de retracto como REFUNDED.",
    render: retractRefundedEmail,
    sampleData: {
      orderNumber: ORDER,
      customerName: CUSTOMER,
      productName: "Fotoimanes Cuadrados",
      amount: 4_990_000,
      method: "WOMPI_VOID",
    },
  }),

  // ───────────────── Reactivación / marketing ─────────────────
  define({
    id: "cart-recovery",
    name: "Recuperación de carrito",
    group: "Reactivación y marketing",
    description:
      "~4 h después de que el cliente abandonó el carrito con email en el checkout. El link restaura la sesión del carrito.",
    render: cartRecoveryEmail,
    sampleData: {
      recoverToken: TOKEN,
      items: [
        { name: "Fotoimanes Cuadrados (x6)", qty: 1 },
        { name: "Imán Polaroid", qty: 2 },
      ],
      unsubscribeUrl: "https://lucamsshop.com/unsubscribe?u=ejemplo",
    },
  }),
  define({
    id: "back-in-stock",
    name: "¡Volvió! (aviso de stock)",
    group: "Reactivación y marketing",
    description:
      "Cuando un producto al que el cliente se suscribió («avísame cuando vuelva») vuelve a tener stock.",
    render: backInStockEmail,
    sampleData: {
      productName: "Set Corazón (x9)",
      productSlug: "set-corazon",
      unsubscribeUrl: "https://lucamsshop.com/unsubscribe?u=ejemplo",
    },
  }),
  define({
    id: "review-request",
    name: "Solicitud de reseña",
    group: "Reactivación y marketing",
    description:
      "Follow-up demorado (~7 días tras la entrega) pidiendo reseña de los productos comprados.",
    render: reviewRequestEmail,
    sampleData: {
      orderNumber: ORDER,
      customerName: CUSTOMER,
      products: [
        { name: "Fotoimanes Cuadrados", slug: "fotoimanes-cuadrados" },
        { name: "Set Corazón", slug: "set-corazon" },
      ],
      publicTrackingToken: TOKEN,
      unsubscribeUrl: "https://lucamsshop.com/unsubscribe?u=ejemplo",
    },
  }),
  define({
    id: "newsletter-welcome",
    name: "Bienvenida al newsletter",
    group: "Reactivación y marketing",
    description:
      "Tras la suscripción al boletín (single opt-in). Su asunto/preheader también son editables desde el CMS (página «emails»); si hay override en ESTE módulo, el override tiene prioridad sobre el bloque CMS.",
    render: newsletterWelcomeEmail,
    sampleData: { email: "camila@example.com", unsubscribeToken: TOKEN },
  }),
  define({
    id: "referral-reward",
    name: "Recompensa de referidos",
    group: "Reactivación y marketing",
    description:
      "A ambas partes cuando el referido paga su primer pedido: cupón personal de un solo uso para quien vino y para quien compartió.",
    render: referralRewardEmail,
    sampleData: {
      role: "referrer",
      couponCode: "CAMILA-15",
      percent: 15,
      validDays: 30,
      orderNumber: ORDER,
      firstName: "Camila",
      friendName: "Valentina",
    },
  }),

  // ─────────────────────── Moderación ───────────────────────
  define({
    id: "design-rejected",
    name: "Diseño rechazado en moderación",
    group: "Moderación",
    description:
      "Cuando Lucy rechaza el contenido de un diseño personalizado antes de imprimirlo (ilegal, ofensivo o que infringe derechos).",
    render: designRejectedEmail,
    sampleData: {
      orderNumber: ORDER,
      customerName: CUSTOMER,
      productName: "Imán Polaroid personalizado",
      reason: "La foto tiene el logo de un tercero y no podemos imprimirlo por derechos de autor.",
      publicTrackingToken: TOKEN,
    },
  }),

  // ─────────────────── Soporte y garantía ───────────────────
  define({
    id: "support-ticket-received",
    name: "Soporte: acuse al cliente",
    group: "Soporte y garantía",
    description: "Al cliente cuando abre un ticket desde /contacto.",
    render: supportTicketReceivedEmail,
    sampleData: {
      customerName: CUSTOMER,
      ticketId: TICKET,
      subject: "MI_PEDIDO",
      message: "Hola, ¿cuándo llega mi pedido LCM-2026-1042? Gracias.",
    },
  }),
  define({
    id: "support-ticket-internal",
    name: "Soporte: aviso interno",
    group: "Soporte y garantía",
    description:
      "Copia interna al buzón de soporte con todo el contexto del ticket. Reply-To = email del cliente.",
    render: supportTicketInternalEmail,
    sampleData: {
      ticketId: TICKET,
      customerName: CUSTOMER,
      customerEmail: "camila@example.com",
      subject: "MI_PEDIDO",
      message: "Hola, ¿cuándo llega mi pedido LCM-2026-1042? Gracias.",
      ip: "181.49.x.x",
    },
  }),
  define({
    id: "support-ticket-closed",
    name: "Soporte: cierre al cliente",
    group: "Soporte y garantía",
    description: "Cuando el admin marca el ticket como Cerrado en /admin/soporte.",
    render: supportTicketClosedEmail,
    sampleData: { customerName: CUSTOMER, ticketId: TICKET, subject: "MI_PEDIDO" },
  }),
  define({
    id: "warranty-received",
    name: "Garantía recibida",
    group: "Soporte y garantía",
    description: "Confirmación al cliente de que recibimos su reclamo de garantía (Ley 1480).",
    render: warrantyReceivedEmail,
    sampleData: {
      customerName: CUSTOMER,
      claimId: "wr_123456",
      orderNumber: ORDER,
      productName: "Fotoimanes Cuadrados",
      description: "Dos imanes llegaron con la esquina despegada.",
    },
  }),
  define({
    id: "warranty-resolved",
    name: "Garantía resuelta",
    group: "Soporte y garantía",
    description: "Aviso al cliente de que su reclamo de garantía quedó resuelto (Ley 1480).",
    render: warrantyResolvedEmail,
    sampleData: {
      customerName: CUSTOMER,
      claimId: "wr_123456",
      productName: "Fotoimanes Cuadrados",
      resolutionType: "REPLACE",
      note: "Te enviamos el reemplazo sin costo. Lo despachamos en máximo 2 días hábiles; desde ahí, el tiempo final lo pone la transportadora según tu ciudad.",
    },
  }),

  // ─────────────────────── Cuenta ───────────────────────
  define({
    id: "account-exists-notice",
    name: "Aviso: correo ya registrado",
    group: "Cuenta",
    description:
      "Cuando alguien intenta crear una cuenta con un correo que ya está registrado (anti-enumeración: el formulario responde lo mismo exista o no la cuenta).",
    render: accountExistsNoticeEmail,
    sampleData: undefined,
  }),

  // ─────────────────────── Cotizaciones ───────────────────────
  define({
    id: "quote-admin-notification",
    name: "Aviso interno: cotización nueva",
    group: "Cotizaciones",
    description:
      "Notificación INTERNA al buzón de alertas apenas nace una cotización (Etapa 1, modo catálogo). Reply-To = email del cliente cuando lo dejó.",
    render: quoteAdminNotificationEmail,
    sampleData: {
      quoteId: "quo_01JZXD8R2M",
      quoteNumber: "COT-2026-0187",
      customerName: CUSTOMER,
      customerWhatsapp: "3004567890",
      customerEmail: "camila@example.com",
      city: "Medellín",
      department: "Antioquia",
      notes: "Es para un regalo de aniversario, ¿podrían empacarlo para regalo?",
      total: 13_990_000,
      items: [
        { productName: "Set Corazón (x9)", variantName: null, quantity: 1, unitPrice: 13_990_000 },
      ],
    },
  }),
];

const REGISTRY_BY_ID = new Map(EMAIL_TEMPLATE_REGISTRY.map((t) => [t.id, t]));

/** Busca una plantilla del registry por id (nombre del archivo). */
export function getEmailTemplate(id: string): EmailTemplateEntry | null {
  return REGISTRY_BY_ID.get(id) ?? null;
}

// ───────────────────── Renders de ENVÍO REAL ─────────────────────
// Los senders productivos (features/*/…, app/(auth)/registro) importan ESTAS
// funciones, no las plantillas crudas: es la MISMA envoltura `withOverrides`
// que usa el preview del admin, así que los textos editados en
// /admin/email-templates aplican también al correo que recibe el cliente.
// Fallback total: sin fila EmailTemplateOverride o DB caída → el resultado es
// idéntico al render base (un override NUNCA rompe un envío transaccional).
// La consulta va cacheada con unstable_cache (tag "email-overrides",
// revalidate 1h; las actions del admin invalidan con updateTag) — el mismo
// patrón de los settings CMS (lib/cms) que estos flujos ya leen en el mismo
// request, así que no introduce un cold-path nuevo en los webhooks.
//
// Regla al añadir una plantilla: registrarla arriba (id = nombre de archivo)
// y exportar acá su render envuelto con el MISMO id.

export const renderOrderConfirmationEmail = withOverrides(
  "order-confirmation",
  orderConfirmationEmail,
);
export const renderOrderShippedEmail = withOverrides("order-shipped", orderShippedEmail);
export const renderOrderDeliveredEmail = withOverrides("order-delivered", orderDeliveredEmail);
export const renderOrderPaymentDeclinedEmail = withOverrides(
  "order-payment-declined",
  orderPaymentDeclinedEmail,
);
export const renderOrderPaymentFailedEmail = withOverrides(
  "order-payment-failed",
  orderPaymentFailedEmail,
);
export const renderOrderCancelledEmail = withOverrides("order-cancelled", orderCancelledEmail);
export const renderOrderReturnedEmail = withOverrides("order-returned", orderReturnedEmail);
export const renderRefundIssuedEmail = withOverrides("refund-issued", refundIssuedEmail);
export const renderOrderAdminNotificationEmail = withOverrides(
  "order-admin-notification",
  orderAdminNotificationEmail,
);

export const renderRetractReceivedEmail = withOverrides("retract-received", retractReceivedEmail);
export const renderRetractApprovedEmail = withOverrides("retract-approved", retractApprovedEmail);
export const renderRetractRejectedEmail = withOverrides("retract-rejected", retractRejectedEmail);
export const renderRetractRefundedEmail = withOverrides("retract-refunded", retractRefundedEmail);

export const renderCartRecoveryEmail = withOverrides("cart-recovery", cartRecoveryEmail);
export const renderBackInStockEmail = withOverrides("back-in-stock", backInStockEmail);
export const renderReviewRequestEmail = withOverrides("review-request", reviewRequestEmail);
export const renderNewsletterWelcomeEmail = withOverrides(
  "newsletter-welcome",
  newsletterWelcomeEmail,
);
export const renderReferralRewardEmail = withOverrides("referral-reward", referralRewardEmail);

export const renderDesignRejectedEmail = withOverrides("design-rejected", designRejectedEmail);

export const renderSupportTicketReceivedEmail = withOverrides(
  "support-ticket-received",
  supportTicketReceivedEmail,
);
export const renderSupportTicketInternalEmail = withOverrides(
  "support-ticket-internal",
  supportTicketInternalEmail,
);
export const renderSupportTicketClosedEmail = withOverrides(
  "support-ticket-closed",
  supportTicketClosedEmail,
);
export const renderWarrantyReceivedEmail = withOverrides(
  "warranty-received",
  warrantyReceivedEmail,
);
export const renderWarrantyResolvedEmail = withOverrides(
  "warranty-resolved",
  warrantyResolvedEmail,
);

export const renderQuoteAdminNotificationEmail = withOverrides(
  "quote-admin-notification",
  quoteAdminNotificationEmail,
);

// account-exists-notice no recibe data (no hay tokens disponibles): el
// wrapper queda pre-armado y se invoca sin argumentos, como la plantilla base.
const accountExistsNoticeWithOverrides = withOverrides(
  "account-exists-notice",
  accountExistsNoticeEmail,
);
export function renderAccountExistsNoticeEmail() {
  return accountExistsNoticeWithOverrides(undefined);
}
