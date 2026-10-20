/*
 * URL pública de rastreo por transportadora (2026-08-11).
 *
 * Problema: Order.trackingUrl guarda `rutaguia` de Aveonline = el PDF del
 * documento de guía (la etiqueta de impresión). Usarlo como botón "Rastrear"
 * le descargaba al cliente un PDF en vez de mostrarle el seguimiento.
 *
 * Las páginas de rastreo de las transportadoras colombianas son FORM-based
 * (digitar la guía a mano) — no hay deep-link confiable con la guía embebida,
 * así que el botón principal de "Rastrear" apunta a nuestra vista
 * /pedido/<token> (guía + estados en vivo vía webhook) y este helper da el
 * portal oficial como enlace secundario. Guía se muestra al lado para copiar.
 */

const CARRIER_TRACKING_PAGES: Record<string, { name: string; url: string }> = {
  // URLs verificadas en vivo (HTTP 200) el 2026-10-20 — envia.com.co estaba
  // MUERTO (sin respuesta) y el dominio real de Envía es envia.co (hallazgo
  // del owner, confirmado con curl). saferbo.com redirige a una tienda de
  // zapatos (dominio vendido): Saferbo queda SIN URL a propósito → el caller
  // cae a nuestra vista /pedido/<token> como única opción.
  servientrega: {
    name: "Servientrega",
    url: "https://www.servientrega.com/wps/portal/Colombia/transacciones/personas/rastrear",
  },
  envia: {
    name: "Envía",
    url: "https://envia.co/tracking",
  },
  "tcc-sa": {
    name: "TCC",
    url: "https://tcc.com.co/rastreo/",
  },
  tcc: {
    name: "TCC",
    url: "https://tcc.com.co/rastreo/",
  },
  "coordinadora-mercantil": {
    name: "Coordinadora Mercantil",
    url: "https://coordinadora.com/rastreo/",
  },
  coordinadora: {
    name: "Coordinadora Mercantil",
    url: "https://coordinadora.com/rastreo/",
  },
  interrapidisimo: {
    // /rastreo/ da 404 tras redirects — el portal raíz es el único destino vivo.
    name: "Interrapidísimo",
    url: "https://www.interrapidisimo.com/",
  },
  "go-envios": {
    name: "Go Envíos",
    url: "https://www.goenvios.com/rastreo",
  },
  goenvios: {
    name: "Go Envíos",
    url: "https://www.goenvios.com/rastreo",
  },
  "99minutos": {
    name: "99minutos",
    url: "https://tracking.99minutos.com/",
  },
  domina: {
    // Sin página de rastreo pública (/rastreo, /tracking, /seguimiento → 404).
    name: "Domina",
    url: "https://domina.com.co/",
  },
};

/**
 * Portal oficial de rastreo de la transportadora (el cliente digita la guía
 * ahí). Null si no conocemos esa transportadora — el caller cae a nuestra
 * vista /pedido/<token> como única opción.
 */
export function carrierTrackingPageUrl(carrier: string | null | undefined): string | null {
  if (!carrier) return null;
  const key = carrier.toLowerCase().trim().replace(/\s+/g, "-");
  return CARRIER_TRACKING_PAGES[key]?.url ?? null;
}
