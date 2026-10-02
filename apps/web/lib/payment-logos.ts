/*
 * Logo por medio de pago online (Wompi) — Paquete F (2026-10-02).
 *
 * Mismo patrón que lib/carrier-logos.ts: data plana client-safe, mapeo
 * método → {src, alt, width, height}. Los métodos habilitados los decide el
 * contrato del comercio en Wompi y se eligen DENTRO del checkout hosted (no
 * hay selección en tienda); la fila de logos es informativa y debe calzar con
 * la lista textual de lib/payment-methods.ts (WOMPI_METHODS_SHORT / _PROSE) —
 * fuente única del set: Tarjeta (Visa/Mastercard), PSE, Nequi, Daviplata y
 * Bancolombia.
 *
 * Marcas de terceros: los logos se usan SOLO para identificar el medio de
 * pago ofrecido (uso nominativo — no implica respaldo ni afiliación). Son
 * badges denominativos simplificados v1 (nombre de la marca sobre su color
 * corporativo, tile redondeado como los monogramas de public/carriers/):
 * para reemplazar uno por el logo oficial basta soltar el archivo en
 * `public/payments/` y ajustar `src`/`width`/`height` acá — sin tocar los
 * componentes. Amex queda preparada como clave pero SIN badge ni entrada en
 * WOMPI_PAYMENT_LOGOS: no sabemos si el comercio la tiene habilitada.
 */

export type PaymentLogo = {
  src: string;
  alt: string;
  /** Dimensiones intrínsecas del asset — definen el aspect-ratio al
   *  renderizar con altura fija y ancho automático (sin distorsión). */
  width: number;
  height: number;
};

const PAYMENT_LOGOS: Record<string, PaymentLogo> = {
  visa: { src: "/payments/visa.svg", alt: "Visa", width: 64, height: 40 },
  mastercard: { src: "/payments/mastercard.svg", alt: "Mastercard", width: 64, height: 40 },
  pse: { src: "/payments/pse.svg", alt: "PSE", width: 64, height: 40 },
  nequi: { src: "/payments/nequi.svg", alt: "Nequi", width: 64, height: 40 },
  daviplata: { src: "/payments/daviplata.svg", alt: "Daviplata", width: 64, height: 40 },
  bancolombia: { src: "/payments/bancolombia.svg", alt: "Bancolombia", width: 64, height: 40 },
};

/**
 * Fila canónica de logos de los medios Wompi habilitados, en el MISMO orden
 * del texto WOMPI_METHODS_SHORT ("Tarjeta · PSE · Nequi · Daviplata ·
 * Bancolombia"): tarjeta se despliega en sus dos marcas. Si el contrato
 * Wompi cambia, ajustar acá Y en lib/payment-methods.ts a la vez.
 */
export const WOMPI_PAYMENT_LOGOS: readonly PaymentLogo[] = [
  PAYMENT_LOGOS.visa!,
  PAYMENT_LOGOS.mastercard!,
  PAYMENT_LOGOS.pse!,
  PAYMENT_LOGOS.nequi!,
  PAYMENT_LOGOS.daviplata!,
  PAYMENT_LOGOS.bancolombia!,
];

/**
 * Logo de un medio de pago por clave ("visa", "nequi"…; tolera mayúsculas y
 * espacios). Null si no hay badge: el caller muestra solo el texto.
 */
export function paymentLogo(method: string | null | undefined): PaymentLogo | null {
  if (!method) return null;
  const key = method
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  return PAYMENT_LOGOS[key] ?? null;
}
