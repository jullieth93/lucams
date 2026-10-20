/*
 * Feature flag — «Quiero documento tributario» en /checkout/datos.
 *
 * Decisión del owner (2026-10-20): la tienda es persona natural SIN trámites
 * DIAN, así que el checkbox promete un documento que no se opera (riesgo Ley
 * 1480 — publicidad/oferta engañosa). Apagado:
 *   · datos-form.tsx no renderiza la sección de facturación,
 *   · saveDatosAction ignora un `wantsInvoice` manipulado a mano,
 *   · BillingSchema no exige los campos aunque wantsInvoice llegue en true.
 *
 * El pipeline de datos queda INTACTO para reactivarlo (basta flip a true):
 * wantsInvoice=false llega como siempre y el snapshot de Order
 * (billingDocumentType/Number/Name) se sigue escribiendo cuando aplique.
 * Órdenes históricas CON billing: el detalle admin (/admin/pedidos/[number])
 * las muestra en el bloque «Documento de venta», independiente del flag.
 */
export const BILLING_DOCUMENT_ENABLED = false;
