/*
 * Envío propio "LUCAMS" — mensajería interna por zonas de entrega
 * (multi-ciudad: el catálogo de ciudades/zonas vive en lib/lucams-zones.ts;
 * hoy solo Bogotá con sus 20 localidades).
 *
 * Es una OFERTA MÁS del step 2 del checkout, al lado de las transportadoras
 * Aveonline: mismo shape (ShippingSelectionInput), mismo sello HMAC de
 * offersToken y misma re-validación en finalizeCheckout (el precio y la
 * zona se recalculan SIEMPRE server-side contra las settings — el cliente
 * no puede manipularlos). Post-pago NO se genera guía Aveonline: la saga marca
 * la orden como entrega interna (trackingNumber INTERNO-<orderNumber>) y el
 * despacho/entrega se operan a mano desde /admin/pedidos.
 *
 * Nota de naming: los campos persistidos `localityId`/`localityName`
 * (checkout-session, Address.structured, Order.shippingAddress) son el nombre
 * HISTÓRICO de la "zona" genérica de entrega (localidad en Bogotá, comuna en
 * Medellín). Se conservan por compatibilidad con datos ya guardados.
 *
 * Promesa de entrega = producción a mano + hora de corte (fabricamos y
 * entregamos el mismo día del despacho): la regla vive en
 * lib/delivery-estimate.ts y es compartida con admin/guía/emails.
 */

import "server-only";
import { bogotaHour, lucamsDeliveryDays } from "@/lib/delivery-estimate";
import { getZone, getZoneCityByCode } from "@/lib/lucams-zones";
import { getLucamsShippingSettings } from "./settings";
import type { ShippingSelectionInput } from "@/features/checkout/schemas";

export const LUCAMS_CARRIER = "lucams";
// Nombre de marca CORTO del envío propio (fix QA STG 2026-10: "Envío Lucam's"
// → "LUCAMS"). Es el nombre visible en TODOS los contextos derivados del slug
// "lucams" (selector de envío, resumen de pago, /pedido, /mi-cuenta, admin y
// emails vía carrierDisplayName) — las órdenes guardan el slug, no el nombre,
// así que el cambio aplica también a pedidos históricos sin migración.
export const LUCAMS_CARRIER_NAME = "LUCAMS";

// La regla de la promesa (producción + hora de corte) vive en
// lib/delivery-estimate.ts; se re-exporta la hora Colombia por compatibilidad
// con los callers existentes (admin, guía imprimible).
export { bogotaHour };

export type LucamsDestination = {
  cityCode: string;
  /** Id de la zona de entrega (lib/lucams-zones.ts). Campo `localityId` en los
   *  modelos persistidos (nombre histórico — ver nota de naming del docblock). */
  zoneId?: string | null;
};

/**
 * Construye la oferta de envío propio para un destino, o null si no aplica
 * (apagado, ciudad fuera del catálogo, sin zona, zona inválida o zona no
 * habilitada para esa ciudad en las settings). Es la ÚNICA fuente de verdad
 * del precio/días: la usan quoteShipping (al ofrecer) y el offersToken sellado
 * HMAC que finalizeCheckout re-valida con match exacto.
 *
 * Promesa de entrega (regla única de lib/delivery-estimate.ts):
 * `deliveryDays = maxProductionDays + (hora Colombia >= cutoff ? 1 : 0)` —
 * los días de fabricación a mano del carrito corren desde hoy si el pedido
 * entra antes del cutoff (si no, desde el siguiente día hábil) y la entrega
 * es el mismo día del despacho. `opts.maxProductionDays` ausente → default
 * fail-safe (LUCAMS_DEFAULT_PRODUCTION_DAYS), nunca promete de menos.
 */
export async function buildLucamsOffer(
  destination: LucamsDestination,
  opts?: { maxProductionDays?: number; now?: Date },
): Promise<ShippingSelectionInput | null> {
  const settings = await getLucamsShippingSettings();
  if (!settings.enabled) return null;
  const city = getZoneCityByCode(destination.cityCode);
  if (!city) return null;
  const zone = getZone(city.cityCode, destination.zoneId);
  if (!zone || !(settings.zones[city.cityCode] ?? []).includes(zone.id)) return null;

  const deliveryDays = lucamsDeliveryDays({
    maxProductionDays: opts?.maxProductionDays ?? Number.NaN,
    cutoffHour: settings.cutoffHour,
    now: opts?.now,
  });
  return {
    carrier: LUCAMS_CARRIER,
    carrierName: LUCAMS_CARRIER_NAME,
    fleteCop: settings.priceCop,
    deliveryDays,
    contraentrega: false,
    // El quoteId amarra la oferta a la zona: queda sellado en el offersToken y
    // la re-validación exige match exacto (anti-manipulación). Con cityCode
    // prefijo para que ids de zona de ciudades distintas no colisionen.
    quoteId: `${LUCAMS_CARRIER}-${city.cityCode}-${zone.id}`,
  };
}

/**
 * Nombre legible de un carrier para UI/emails. Los carriers Aveonline se
 * guardan como slug lowercase ("tcc-sa"); el envío propio tiene nombre propio.
 */
export function carrierDisplayName(carrier: string | null | undefined): string {
  if (!carrier) return "—";
  if (carrier === LUCAMS_CARRIER) return LUCAMS_CARRIER_NAME;
  return carrier
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
