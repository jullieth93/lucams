/*
 * Galería de PREVIEW de los correos transaccionales (dev-only). No es de cara al cliente.
 *
 * Motivación (auditoría v3 · Tanda 3): los correos transaccionales son plantillas de CÓDIGO
 * (features/emails/templates/*.ts) que renderizan HTML vía renderEmailLayout — NO viven en el CMS,
 * así que no aparecen en /admin/email-templates. Esta ruta los renderiza TODOS con datos de ejemplo,
 * en un iframe por correo (aislado del CSS de la app), para que Lucy los revise con el ojo sin tener
 * que disparar el flujo real ni enviar nada. Cada correo con variante INVITADO vs CON-CUENTA cuando
 * el link cambia según haya token público (#10).
 *
 * Seguridad: NUNCA debe existir en un deploy Vercel (production NI preview) — `VERCEL_ENV` está
 * definido en cualquier deploy y es undefined en dev local. Mismo patrón que
 * /internal/plantilla-preview (ADR-048). noindex por si acaso.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { backInStockEmail } from "@/features/emails/templates/back-in-stock";
import { cartRecoveryEmail } from "@/features/emails/templates/cart-recovery";
import { designRejectedEmail } from "@/features/emails/templates/design-rejected";
import { newsletterWelcomeEmail } from "@/features/emails/templates/newsletter-welcome";
import { orderCancelledEmail } from "@/features/emails/templates/order-cancelled";
import { orderConfirmationEmail } from "@/features/emails/templates/order-confirmation";
import { orderDeliveredEmail } from "@/features/emails/templates/order-delivered";
import { orderPaymentFailedEmail } from "@/features/emails/templates/order-payment-failed";
import { orderShippedEmail } from "@/features/emails/templates/order-shipped";
import { refundIssuedEmail } from "@/features/emails/templates/refund-issued";
import { retractApprovedEmail } from "@/features/emails/templates/retract-approved";
import { retractReceivedEmail } from "@/features/emails/templates/retract-received";
import { retractRefundedEmail } from "@/features/emails/templates/retract-refunded";
import { retractRejectedEmail } from "@/features/emails/templates/retract-rejected";
import { reviewRequestEmail } from "@/features/emails/templates/review-request";
import { supportTicketInternalEmail } from "@/features/emails/templates/support-ticket-internal";
import { supportTicketReceivedEmail } from "@/features/emails/templates/support-ticket-received";
import { warrantyReceivedEmail } from "@/features/emails/templates/warranty-received";
import { warrantyResolvedEmail } from "@/features/emails/templates/warranty-resolved";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Rendered = { subject: string; html: string; text: string };
type Variant = { label: string; result: Rendered };
type Card = { name: string; when: string; variants: Variant[] };
type Group = { group: string; cards: Card[] };

/** Datos de ejemplo compartidos (es-CO). */
const CUSTOMER = "Camila Restrepo";
const ORDER = "LM-1042";
const TOKEN = "a1b2c3d4e5f6";

async function buildGroups(): Promise<Group[]> {
  const [
    orderConfGuest,
    orderConfAccount,
    orderConfCod,
    shipped,
    delivered,
    paymentFailed,
    cancelled,
    refundIssued,
    retractReceived,
    retractApproved,
    retractRejected,
    retractRefunded,
    reviewGuest,
    reviewAccount,
    cartRecovery,
    backInStock,
    newsletterWelcome,
    designRejectedGuest,
    designRejectedAccount,
    supportReceived,
    supportInternal,
    warrantyReceived,
    warrantyResolved,
  ] = await Promise.all([
    orderConfirmationEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      total: 89_900,
      subtotal: 79_900,
      shipping: 10_000,
      discount: 0,
      shippingCarrier: "Coordinadora",
      items: [
        { name: "Fotoimanes Cuadrados (x6)", qty: 1, lineTotal: 49_900 },
        { name: "Imán Polaroid personalizado", qty: 2, lineTotal: 30_000 },
      ],
      shippingAddress: "Calle 10 # 43-25, Apto 302, Medellín, Antioquia",
      publicTrackingToken: TOKEN,
      paymentMethod: "WOMPI",
    }),
    orderConfirmationEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      total: 129_900,
      subtotal: 139_900,
      shipping: 10_000,
      discount: 20_000,
      shippingCarrier: "Coordinadora",
      items: [{ name: "Set Corazón (x9)", qty: 1, lineTotal: 139_900 }],
      shippingAddress: "Carrera 7 # 82-15, Bogotá, Cundinamarca",
      publicTrackingToken: null,
      paymentMethod: "WOMPI",
    }),
    orderConfirmationEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      total: 59_900,
      subtotal: 49_900,
      shipping: 10_000,
      shippingCarrier: "Coordinadora",
      items: [{ name: "Imanes redondos (x4)", qty: 1, lineTotal: 49_900 }],
      shippingAddress: "Calle 10 # 43-25, Medellín, Antioquia",
      publicTrackingToken: TOKEN,
      paymentMethod: "COD",
    }),
    orderShippedEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      carrier: "Coordinadora",
      trackingNumber: "CO987654321",
      trackingUrl: "https://coordinadora.com/rastreo/CO987654321",
      estimatedDays: 3,
      publicTrackingToken: TOKEN,
    }),
    orderDeliveredEmail({ orderNumber: ORDER, customerName: CUSTOMER, publicTrackingToken: TOKEN }),
    orderPaymentFailedEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      total: 89_900,
      reason: "El banco rechazó la transacción. Verifica los datos de tu tarjeta.",
      publicTrackingToken: TOKEN,
    }),
    orderCancelledEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      reason: "El pedido fue cancelado a solicitud tuya.",
    }),
    refundIssuedEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      amount: 89_900,
      reason: "Producto agotado tras la compra.",
    }),
    retractReceivedEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      productName: "Fotoimanes Cuadrados",
    }),
    retractApprovedEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      productName: "Fotoimanes Cuadrados",
    }),
    retractRejectedEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      productName: "Set personalizado con foto",
      rejectionNote:
        "El producto es personalizado (lleva tu foto), y por ley los productos hechos a la medida no tienen derecho de retracto.",
    }),
    retractRefundedEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      productName: "Fotoimanes Cuadrados",
      amount: 49_900,
      method: "WOMPI_VOID",
    }),
    reviewRequestEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      products: [
        { name: "Fotoimanes Cuadrados", slug: "fotoimanes-cuadrados" },
        { name: "Set Corazón", slug: "set-corazon" },
      ],
      publicTrackingToken: TOKEN,
    }),
    reviewRequestEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      products: [{ name: "Fotoimanes Cuadrados", slug: "fotoimanes-cuadrados" }],
      publicTrackingToken: null,
    }),
    cartRecoveryEmail({
      recoverToken: TOKEN,
      items: [
        { name: "Fotoimanes Cuadrados (x6)", qty: 1 },
        { name: "Imán Polaroid", qty: 2 },
      ],
    }),
    backInStockEmail({ productName: "Set Corazón (x9)", productSlug: "set-corazon" }),
    newsletterWelcomeEmail({ email: "camila@example.com", unsubscribeToken: TOKEN }),
    designRejectedEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      productName: "Imán Polaroid personalizado",
      reason: "La foto tiene el logo de un tercero y no podemos imprimirlo por derechos de autor.",
      publicTrackingToken: TOKEN,
    }),
    designRejectedEmail({
      orderNumber: ORDER,
      customerName: CUSTOMER,
      productName: "Imán Polaroid personalizado",
      reason: "La foto tiene el logo de un tercero y no podemos imprimirlo por derechos de autor.",
      publicTrackingToken: null,
    }),
    supportTicketReceivedEmail({
      customerName: CUSTOMER,
      ticketId: "tkt_9f8e7d6c5b4a",
      subject: "MI_PEDIDO",
      message: "Hola, ¿cuándo llega mi pedido LM-1042? Gracias.",
    }),
    supportTicketInternalEmail({
      ticketId: "tkt_9f8e7d6c5b4a",
      customerName: CUSTOMER,
      customerEmail: "camila@example.com",
      subject: "MI_PEDIDO",
      message: "Hola, ¿cuándo llega mi pedido LM-1042? Gracias.",
      ip: "181.49.x.x",
    }),
    warrantyReceivedEmail({
      customerName: CUSTOMER,
      claimId: "wr_123456",
      orderNumber: ORDER,
      productName: "Fotoimanes Cuadrados",
      description: "Dos imanes llegaron con la esquina despegada.",
    }),
    warrantyResolvedEmail({
      customerName: CUSTOMER,
      claimId: "wr_123456",
      productName: "Fotoimanes Cuadrados",
      resolutionType: "REPLACE",
      note: "Te enviamos el reemplazo sin costo. Lo despachamos en máximo 2 días hábiles; desde ahí, el tiempo final lo pone la transportadora según tu ciudad.",
    }),
  ]);

  return [
    {
      group: "Pedido",
      cards: [
        {
          name: "Confirmación de pedido",
          when: "Al confirmarse el pago (o al crear el pedido COD).",
          variants: [
            { label: "Invitado (link por token)", result: orderConfGuest },
            { label: "Con cuenta + cupón", result: orderConfAccount },
            { label: "Contraentrega (COD)", result: orderConfCod },
          ],
        },
        {
          name: "Pedido enviado",
          when: "Al generar la guía de envío.",
          variants: [{ label: "Con guía + rastreo", result: shipped }],
        },
        {
          name: "Pedido entregado",
          when: "Al marcarse como entregado.",
          variants: [{ label: "Invitado", result: delivered }],
        },
        {
          name: "Pago fallido",
          when: "Cuando Wompi rechaza el pago.",
          variants: [{ label: "Rechazo del banco", result: paymentFailed }],
        },
        {
          name: "Pedido cancelado",
          when: "Al cancelar un pedido ya pagado.",
          variants: [{ label: "A solicitud del cliente", result: cancelled }],
        },
        {
          name: "Reembolso emitido",
          when: "Al emitir un reembolso desde el admin.",
          variants: [{ label: "Producto agotado", result: refundIssued }],
        },
      ],
    },
    {
      group: "Retracto (Ley 2439)",
      cards: [
        {
          name: "Retracto recibido",
          when: "Al crear la solicitud de retracto (acuse legal).",
          variants: [{ label: "Acuse", result: retractReceived }],
        },
        {
          name: "Retracto aprobado",
          when: "Cuando el admin aprueba el retracto.",
          variants: [{ label: "Instrucciones de devolución", result: retractApproved }],
        },
        {
          name: "Retracto rechazado ✦ nuevo",
          when: "Cuando el admin rechaza el retracto (antes era silencioso).",
          variants: [{ label: "Con motivo", result: retractRejected }],
        },
        {
          name: "Retracto reembolsado",
          when: "Al procesar el reembolso del retracto.",
          variants: [{ label: "Reembolso Wompi", result: retractRefunded }],
        },
      ],
    },
    {
      group: "Reactivación / marketing",
      cards: [
        {
          name: "Solicitud de reseña",
          when: "Cron 7-30 días tras la entrega.",
          variants: [
            { label: "Invitado (link por token) ✦", result: reviewGuest },
            { label: "Con cuenta", result: reviewAccount },
          ],
        },
        {
          name: "Recuperación de carrito",
          when: "Cron para carritos abandonados.",
          variants: [{ label: "Con items", result: cartRecovery }],
        },
        {
          name: "Volvió el producto",
          when: "Cuando un producto agotado vuelve a stock.",
          variants: [{ label: "Aviso", result: backInStock }],
        },
        {
          name: "Bienvenida newsletter",
          when: "Al suscribirse al boletín.",
          variants: [{ label: "Bienvenida", result: newsletterWelcome }],
        },
      ],
    },
    {
      group: "Moderación",
      cards: [
        {
          name: "Diseño rechazado",
          when: "Cuando Lucy rechaza un diseño en moderación.",
          variants: [
            { label: "Invitado (link por token) ✦", result: designRejectedGuest },
            { label: "Con cuenta", result: designRejectedAccount },
          ],
        },
      ],
    },
    {
      group: "Soporte y garantía",
      cards: [
        {
          name: "Soporte — acuse al cliente",
          when: "Al abrir un ticket de soporte.",
          variants: [{ label: "Acuse", result: supportReceived }],
        },
        {
          name: "Soporte — aviso interno",
          when: "Copia interna a Lucy con Reply-To al cliente.",
          variants: [{ label: "Interno", result: supportInternal }],
        },
        {
          name: "Garantía recibida",
          when: "Al abrir una reclamación de garantía.",
          variants: [{ label: "Acuse", result: warrantyReceived }],
        },
        {
          name: "Garantía resuelta",
          when: "Al resolver la garantía.",
          variants: [{ label: "Reemplazo", result: warrantyResolved }],
        },
      ],
    },
  ];
}

export default async function CorreosPreviewPage() {
  // Tooling interno: jamás en un deploy Vercel (ver cabecera). Falla cerrado.
  if (process.env.VERCEL_ENV) notFound();

  const groups = await buildGroups();
  const total = groups.reduce((n, g) => n + g.cards.reduce((m, c) => m + c.variants.length, 0), 0);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#FFF8F0",
        minHeight: "100vh",
        padding: "24px 20px 64px",
        color: "#3D2E5C",
      }}
    >
      <header style={{ maxWidth: 1180, margin: "0 auto 24px" }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, opacity: 0.6, margin: 0 }}>
          HERRAMIENTA INTERNA · SOLO DEV
        </p>
        <h1 style={{ fontSize: 28, margin: "4px 0 8px" }}>🦝 Preview de correos</h1>
        <p style={{ fontSize: 14, opacity: 0.8, margin: 0, maxWidth: 720 }}>
          Los {total} correos transaccionales renderizados con datos de ejemplo. Lo que ves acá es
          lo que le llega al cliente. Las variantes <strong>Invitado</strong> vs{" "}
          <strong>Con cuenta</strong> muestran cómo cambia el botón «Ver mi pedido» según haya o no
          sesión (✦ = tocado o creado en la Tanda 3).
        </p>
      </header>

      {groups.map((g) => (
        <section key={g.group} style={{ maxWidth: 1180, margin: "0 auto 40px" }}>
          <h2
            style={{
              fontSize: 20,
              borderBottom: "2px solid #E85B9F",
              paddingBottom: 6,
              marginBottom: 18,
            }}
          >
            {g.group}
          </h2>
          <div
            style={{
              display: "grid",
              gap: 20,
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            }}
          >
            {g.cards.map((card) =>
              card.variants.map((v) => (
                <article
                  key={`${card.name}-${v.label}`}
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    border: "1px solid rgba(124,106,173,0.18)",
                    overflow: "hidden",
                    boxShadow: "0 2px 10px rgba(61,46,92,0.06)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid #f0e9df" }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{card.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>{card.when}</div>
                    <div
                      style={{
                        display: "inline-block",
                        marginTop: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        background: "#5DD9D122",
                        color: "#2b7a74",
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {v.label}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 8, opacity: 0.85 }}>
                      <strong>Asunto:</strong> {v.result.subject}
                    </div>
                  </div>
                  <iframe
                    title={`${card.name} — ${v.label}`}
                    srcDoc={v.result.html}
                    sandbox=""
                    style={{ width: "100%", height: 520, border: 0, background: "#fff" }}
                  />
                </article>
              )),
            )}
          </div>
        </section>
      ))}
    </main>
  );
}
