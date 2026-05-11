/*
 * SiteHeader — header dinámico para páginas de storefront.
 *
 * Renderiza el wordmark Lucams + navegación de cuenta dependiendo de si
 * hay sesión activa:
 *   - Sin sesión: links a /login y /registro.
 *   - Con sesión Customer: saludo "Hola, <nombre>" + link a /mi-cuenta
 *     + botón de logout (form con server action).
 *
 * NO usar en /(auth)/* ni /mi-cuenta — esas pages tienen su propio header
 * (auth flow tiene fondo gradiente; mi-cuenta tiene su layout).
 *
 * Diseño: kawaii Lucams (Fredoka, brand-purple-dark text, brand-pink links).
 */

import Link from "next/link";
import { logoutAction } from "@/app/auth/logout/actions";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";

export async function SiteHeader() {
  const [session, admin] = await Promise.all([
    getCurrentCustomer(),
    getCurrentAdmin(),
  ]);

  return (
    <header className="px-6 py-4 sm:px-10 border-b border-brand-purple/10 bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <BrandMark size="sm" animated />

        <nav className="flex items-center gap-2 sm:gap-4">
          {admin && (
            <Link
              href="/admin/dashboard"
              className="hidden sm:inline-flex text-xs font-semibold uppercase tracking-wider text-brand-purple-dark bg-brand-yellow/30 hover:bg-brand-yellow/50 px-3 py-1.5 rounded-md transition-colors"
            >
              Panel admin
            </Link>
          )}
          {session ? (
            <>
              <Link
                href="/mi-cuenta"
                className="text-sm font-medium text-brand-purple-dark hover:text-brand-purple"
              >
                Hola,{" "}
                <span className="font-semibold">
                  {session.customer.firstName ?? "tú"}
                </span>
              </Link>
              <form action={logoutAction}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-brand-purple-dark hover:text-brand-purple"
                >
                  Cerrar sesión
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-brand-purple-dark hover:text-brand-purple"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/registro"
                className="rounded-md bg-brand-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-purple-dark transition-colors"
              >
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
