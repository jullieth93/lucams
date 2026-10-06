/*
 * FLUJO REGALO ("compro yo, lo recibe otra persona" — 2026-10-05).
 *
 * Resuelve a nombre/teléfono de QUIÉN va la guía de la transportadora: si el
 * pedido tiene destinatario distinto (Order.recipientName/recipientPhone, del
 * toggle "¿Lo recibe otra persona?" del checkout), la guía va a SU nombre y
 * teléfono — es quien recibe el paquete y atiende al mensajero (clave en COD:
 * quien paga el efectivo al entregar). Sin destinatario, el comportamiento de
 * siempre: el contacto del comprador (snapshot shippingAddress).
 *
 * Lo que NO cambia a propósito:
 *  - El correo de la guía (dscorreop) sigue siendo el del COMPRADOR: es quien
 *    pagó y a quien Aveonline notifica el estado del envío.
 *  - La facturación/documentos tributarios: siempre a nombre del comprador.
 */

export type ShipmentRecipient = {
  contactName: string;
  phone: string;
};

export function resolveShipmentRecipient(
  order: { recipientName: string | null; recipientPhone: string | null },
  ship: { fullName?: string; phone?: string },
): ShipmentRecipient {
  return {
    contactName: order.recipientName?.trim() ? order.recipientName : (ship.fullName ?? ""),
    phone: order.recipientPhone?.trim() ? order.recipientPhone : (ship.phone ?? ""),
  };
}
