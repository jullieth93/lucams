/*
 * Resolución determinista del Customer propietario de un pedido ([ID-01],
 * auditoría 2026-11 · SUPERSEDE la mitad de atribución por email de ADR-127,
 * alineándose con ADR-155 «la identidad del cliente la deriva la SESIÓN»).
 *
 * Por qué NO re-vincular `Order.customerId` al dueño del `contactEmail`:
 *   1. Robo de Puntos Lucams: si `Customer A` (autenticado) digita el correo de
 *      `Customer B` en `/checkout/datos`, reasignar `orderCustomerId = B.id`
 *      hacía que `quoteRedemptionForOrder` / `reserveRedeemedPoints` descontaran
 *      los Puntos Lucams de `B` para pagar el pedido de `A`.
 *   2. Fuga de datos personales y diseños privados (Ley 1581): el pedido con
 *      fotos del Estudio de `A`, dirección y documento aparecía en
 *      `/mi-cuenta/pedidos` de `B` (y si quedara con `customerId = null`,
 *      `claimGuestOrdersForCustomer` también se lo adjudicaría a `B` al iniciar
 *      sesión).
 *   3. El bug original de perfil de `LCM-2026-0010` (no pisar el documento
 *      tributario del perfil cuando el correo difiere) ya está cubierto por el
 *      guard explícito de `ADR-155` en `features/checkout/service.ts`.
 *
 * Regla vigente:
 *   - Sin sesión (`sessionCustomerId === null`) → `null` (pedido invitado; el
 *     correo viaja en `Order.email` y solo se reclama tras verificar posesión
 *     del buzón vía OTP/login en `claimGuestOrdersForCustomer`).
 *   - Con sesión (`sessionCustomerId` activo y no borrado) → `sessionCustomer.id`,
 *     incluso si el comprador indicó un correo de contacto secundario/laboral
 *     en `Order.email`.
 *   - Si el `Customer` de la sesión fue eliminado (`deletedAt != null`) → `null`
 *     (jamás cae a buscar otro `Customer` por email sin prueba de posesión).
 */

import type { Prisma } from "@/lib/db";

/** Comparación de emails de identidad: case-insensitive y sin espacios laterales. */
export function emailsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type CustomerClient = Pick<Prisma.TransactionClient, "customer">;

/**
 * Devuelve el `customerId` propietario del pedido derivado exclusivamente de la
 * sesión autenticada verificada (nunca de `contactEmail` sin autenticar).
 */
export async function resolveOrderCustomerId(
  client: CustomerClient,
  sessionCustomerId: string | null,
  _contactEmail?: string,
): Promise<string | null> {
  if (!sessionCustomerId) return null;

  const sessionCustomer = await client.customer.findFirst({
    where: { id: sessionCustomerId, deletedAt: null },
    select: { id: true },
  });
  return sessionCustomer?.id ?? null;
}
