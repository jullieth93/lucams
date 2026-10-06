/*
 * Resolución del Customer EFECTIVO de un pedido (bug STG 2026-10, pedido
 * LCM-2026-0010: se digitó el contacto crittan01@gmail.com pero la Order
 * quedó amarrada al Customer de la sesión activa, r.julliethhr@gmail.com).
 *
 * Regla: el customerId que llega del checkout es el del Customer de SESIÓN.
 * Si el email del contacto digitado difiere (case-insensitive) del email de
 * ese Customer, el pedido NO es de esa cuenta — se re-vincula al Customer
 * dueño del email digitado (si existe) o queda como guest (customerId null).
 *
 * ¿Por qué no CREAR el Customer cuando no existe? El schema exige
 * Customer.supabaseUserId NOT NULL (la fila nace del registro/login Supabase),
 * así que no hay forma válida de crear un Customer "solo email" desde el
 * checkout. El pedido guest conserva el email en Order.email y, si esa
 * persona se registra después, sus pedidos se le atribuyen por email.
 *
 * Módulo sin "server-only" (mismo patrón que checkout/address-key.ts) para
 * poder testearlo directo con un client stub.
 */

import type { Prisma } from "@/lib/db";

/** Comparación de emails de identidad: case-insensitive y sin espacios laterales. */
export function emailsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type CustomerClient = Pick<Prisma.TransactionClient, "customer">;

/**
 * Devuelve el customerId con el que debe nacer el pedido:
 *  - guest sin sesión (sessionCustomerId null) → null, sin cambios.
 *  - el email del contacto coincide con el del Customer de sesión → ese id.
 *  - difiere → el Customer (no borrado) dueño del email digitado, o null si
 *    no existe (pedido guest; el email viaja en Order.email).
 */
export async function resolveOrderCustomerId(
  client: CustomerClient,
  sessionCustomerId: string | null,
  contactEmail: string,
): Promise<string | null> {
  if (!sessionCustomerId) return null;

  const sessionCustomer = await client.customer.findFirst({
    where: { id: sessionCustomerId, deletedAt: null },
    select: { id: true, email: true },
  });
  if (sessionCustomer && emailsEqual(sessionCustomer.email, contactEmail)) {
    return sessionCustomer.id;
  }

  // El contacto digitado no es la cuenta de la sesión (o ese Customer ya no
  // existe): el pedido pertenece al dueño del email digitado, si lo hay.
  const byEmail = await client.customer.findFirst({
    where: { email: { equals: contactEmail.trim(), mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  });
  return byEmail?.id ?? null;
}
