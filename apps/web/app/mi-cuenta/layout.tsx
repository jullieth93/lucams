/*
 * Shell del área de cuenta del cliente (/mi-cuenta/*).
 *
 * Centraliza en un solo lugar: (1) el guard de sesión (getCurrentCustomer →
 * redirect a /login si no hay cliente logueado), (2) el header de marca +
 * cerrar sesión, y (3) la navegación entre secciones (AccountNav). Las pages
 * hijas solo aportan su contenido — sin re-declarar header/main/bg.
 *
 * getCurrentCustomer está memoizada por-request (cache()), así que este guard
 * y el de cada page comparten una sola resolución de sesión.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { logoutAction } from "@/app/auth/logout/actions";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentCustomer } from "@/lib/auth";
import { AccountNav } from "./account-nav";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function MiCuentaLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentCustomer();
  if (!session) {
    // #4 — preservar el deep link COMPLETO (ej. /mi-cuenta/pedidos/LC-1001) tras el login, no
    // siempre /mi-cuenta. Mismo patrón que el guard del admin (x-pathname lo pone el middleware).
    const path = (await headers()).get("x-pathname") ?? "/mi-cuenta";
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <header className="border-brand-purple/10 border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <BrandMark size="sm" animated />
          <form action={logoutAction}>
            <SubmitButton
              variant="ghost"
              size="sm"
              className="text-brand-muted hover:text-brand-purple-dark"
            >
              Cerrar sesión
            </SubmitButton>
          </form>
        </div>
      </header>

      <AccountNav />

      <main id="contenido" tabIndex={-1} className="flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
