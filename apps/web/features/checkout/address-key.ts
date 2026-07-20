/*
 * Clave normalizada de dirección de envío para el anti-abuso COD (ADR-065).
 *
 * Dos pedidos a la MISMA dirección física colisionan aunque el abusador rote
 * teléfono/email. Se computa de la ShippingAddressInput ya APLANADA que se guarda en
 * Order.shippingAddress (department + city + addressLine1 [+ zip]), normalizada: sin
 * tildes, minúsculas, solo alfanumérico. Devuelve null si faltan datos (no se indexa
 * una clave vacía → evita colapsar todos los pedidos "sin dirección" en una sola clave).
 *
 * Pura (sin server-only) para poder testearla directo. La usan createOrderFromCart
 * (poblar Order.shippingAddressKey) y —al bloquear una dirección— el admin.
 */

export function computeShippingAddressKey(shipping: unknown): string | null {
  if (!shipping || typeof shipping !== "object") return null;
  const s = shipping as {
    department?: unknown;
    city?: unknown;
    addressLine1?: unknown;
    zip?: unknown;
  };
  const department = typeof s.department === "string" ? s.department.trim() : "";
  const city = typeof s.city === "string" ? s.city.trim() : "";
  const line = typeof s.addressLine1 === "string" ? s.addressLine1.trim() : "";
  // Necesita al menos depto + ciudad + línea; el zip suma precisión si está.
  if (!department || !city || !line) return null;
  const zip = typeof s.zip === "string" ? s.zip.trim() : "";
  const key = [department, city, line, zip]
    .join("|")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // quita tildes (marcas diacríticas)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return key.length >= 8 ? key : null;
}
