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
  servientrega: {
    name: "Servientrega",
    url: "https://www.servientrega.com/wps/portal/Colombia/transacciones/personas/rastrear",
  },
  envia: {
    name: "Envía",
    url: "https://www.envia.com.co/",
  },
  "tcc-sa": {
    name: "TCC",
    url: "https://www.tcc.com.co/",
  },
  tcc: {
    name: "TCC",
    url: "https://www.tcc.com.co/",
  },
  "coordinadora-mercantil": {
    name: "Coordinadora Mercantil",
    url: "https://coordinadora.com/",
  },
  coordinadora: {
    name: "Coordinadora Mercantil",
    url: "https://coordinadora.com/",
  },
  interrapidisimo: {
    name: "Interrapidísimo",
    url: "https://www.interrapidisimo.com/",
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
