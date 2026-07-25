/*
 * SiteHeader — header dinámico para storefront.
 *
 * Estructura:
 *   - Wordmark + mascote (BrandMark)
 *   - Nav: "Catálogo" con mega-menú (categorías visuales) + búsqueda Cmd+K
 *   - Acciones: carrito (con badge contador) + auth links / cuenta
 *   - Chip "Panel admin" si el usuario es AdminUser activo
 *
 * NO usar en /(auth)/* ni /mi-cuenta ni /admin — esos layouts traen su
 * propio header.
 */

import Link from "next/link";
import { ShoppingBag, Sparkles, User } from "lucide-react";
import { logoutAction } from "@/app/auth/logout/actions";
import { BrandMark } from "@/components/brand-mark";
import { GlobalSearch } from "@/components/global-search";
import { ShopMegaMenu } from "@/components/shop-mega-menu";
import { Button } from "@/components/ui/button";
import { getCartItemCount } from "@/features/cart/service";
import { getCategoryTree } from "@/lib/catalog";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import { peekCartSession } from "@/lib/cart-session";

export async function SiteHeader() {
  const sessionId = await peekCartSession();
  const [session, admin, cartCount, categoryTree] = await Promise.all([
    getCurrentCustomer(),
    getCurrentAdmin(),
    sessionId ? getCartItemCount(sessionId) : Promise.resolve(0),
    getCategoryTree(),
  ]);

  return (
    <header className="border-brand-purple/10 sticky top-0 z-40 border-b bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 py-3">
        <BrandMark size="sm" animated />

        <nav className="flex items-center gap-1 sm:gap-3">
          {/* Entrada única al catálogo: el mega-menú (trigger "Catálogo").
              Antes había además un link plano "Catálogo" → redundante. */}
          <ShopMegaMenu tree={categoryTree} isLoggedIn={!!session} />

          <Link
            href="/recomendador"
            className="bg-brand-purple/10 text-brand-purple-dark hover:bg-brand-purple/20 hidden items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:inline-flex"
            title="Te ayudamos a elegir en 4 preguntas"
          >
            <Sparkles className="h-3.5 w-3.5" /> ¿Te ayudamos a elegir?
          </Link>

          <GlobalSearch />

          <Link
            href="/carrito"
            className="text-brand-purple-dark hover:text-brand-purple relative inline-flex items-center p-1.5"
            aria-label={`Carrito (${cartCount} ítems)`}
          >
            <ShoppingBag className="h-5 w-5" />
            {/* A11Y — el contador iba blanco sobre brand-pink: 3.27:1, bajo el 4.5:1 que WCAG
              1.4.3 AA exige para texto de 10px. Se baja al tono de tinta que ya usan los badges de
              product-card (ADR-044): 5.31:1. La paleta no cambia. */}
            {cartCount > 0 && (
              <span className="bg-brand-pink-ink absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white tabular-nums">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>

          {/* FB1 (feedback Lucy) — acceso a la cuenta VISIBLE en móvil: los enlaces de texto de
            abajo son solo sm+, así que en el teléfono no había forma de llegar a login/mi-cuenta.
            El ícono lleva a la cuenta si hay sesión, o a login si no. En desktop se oculta (ya están
            los enlaces de texto). */}
          <Link
            href={session ? "/mi-cuenta" : "/login"}
            className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center p-1.5 sm:hidden"
            aria-label={session ? "Mi cuenta" : "Ingresar a mi cuenta"}
          >
            <User className="h-5 w-5" />
          </Link>

          {admin && (
            <Link
              href="/admin/dashboard"
              className="text-brand-purple-dark bg-brand-yellow/30 hover:bg-brand-yellow/50 hidden rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wider uppercase transition-colors sm:inline-flex"
            >
              Panel admin
            </Link>
          )}

          {session ? (
            <>
              <Link
                href="/mi-cuenta"
                className="text-brand-purple-dark hover:text-brand-purple hidden text-sm font-medium sm:inline"
              >
                Hola, <span className="font-semibold">{session.customer.firstName ?? "tú"}</span>
              </Link>
              <form action={logoutAction}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-brand-purple-dark hover:text-brand-purple"
                >
                  Salir
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-brand-purple-dark hover:text-brand-purple hidden text-sm font-medium sm:inline"
              >
                Ingresar
              </Link>
              <Link
                href="/registro"
                className="bg-brand-purple hover:bg-brand-purple-dark hidden rounded-md px-3 py-1.5 text-sm font-semibold text-white transition-colors sm:inline-flex"
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
