/*
 * Helpers de autenticación server-side.
 *
 * Patrón documentado en ADR-030 (URLs separadas cliente vs admin):
 *   - getCurrentUser(): devuelve el auth.users de Supabase si hay sesión,
 *     null si no. Usa supabase.auth.getUser() que contacta al Auth server
 *     y valida el token — no confíes en getSession() (no verificado).
 *   - getCurrentCustomer(): además resuelve la fila Customer asociada
 *     vía supabaseUserId. Retorna null si el user no tiene Customer o
 *     no hay sesión.
 *   - getCurrentAdmin(): lo mismo para AdminUser (futuro, cuando se
 *     implemente el flujo admin).
 *
 * Uso típico:
 *   - En Server Components: leer y mostrar nombre / saludo.
 *   - En Route Handlers: verificar autenticación + extraer customerId.
 *   - En Server Actions: gate de operaciones que requieren login.
 *
 * Las funciones NO redirect — devuelven null. El caller decide si
 * redirige a /login o muestra un error.
 *
 * Referencias:
 *   - @supabase/ssr README sobre getUser() vs getSession() vs getClaims().
 *   - docs/SECURITY.md § Auth.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminUser, Customer } from "@lucams/db";

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentCustomer(): Promise<{
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  customer: Customer;
} | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const customer = await prisma.customer.findFirst({
    where: { supabaseUserId: user.id, deletedAt: null },
  });
  if (!customer) return null;

  return { user, customer };
}

/**
 * Devuelve el AdminUser asociado al user autenticado si existe Y está
 * activo (isActive=true) Y no soft-deleted (deletedAt=null).
 *
 * Cliente Y admin pueden compartir el mismo auth.user — un mismo email
 * puede ser ambas cosas. Un admin que NO sea cliente solo tendrá fila
 * en AdminUser, no en Customer.
 */
export async function getCurrentAdmin(): Promise<{
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  admin: AdminUser;
} | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const admin = await prisma.adminUser.findFirst({
    where: { supabaseUserId: user.id, isActive: true, deletedAt: null },
  });
  if (!admin) return null;

  return { user, admin };
}
