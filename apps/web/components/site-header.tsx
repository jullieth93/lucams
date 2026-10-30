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
import { ShoppingBag, Sparkles, Truck, User } from "lucide-react";
import { logoutAction } from "@/app/auth/logout/actions";
import { BrandMark } from "@/components/brand-mark";
import { CmsText } from "@/components/cms/cms-text";
import { GlobalSearch } from "@/components/global-search";
import { ShopMegaMenu, type MegaMenuTexts } from "@/components/shop-mega-menu";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { getCartItemCount } from "@/features/cart/service";
import { getCategoryTree, listOcasiones } from "@/lib/catalog";
import { getCurrentAdmin, getCurrentCustomer, getCurrentUser } from "@/lib/auth";
import { peekCartSession } from "@/lib/cart-session";
import { getCmsBlock, getCmsImage } from "@/lib/cms";
import { resolveCmsTokens } from "@/lib/cms-tokens";

// Resuelve un bloque CMS a string plano: mismo patrón que <CmsText>, pero
// para textos que bajan por props a un client component.
async function cmsMenuText(key: string, fallback: string): Promise<string> {
  const block = await getCmsBlock(key);
  return resolveCmsTokens(block?.body ?? fallback);
}

// <ShopMegaMenu> es client component ("use client") y no puede leer el CMS:
// sus textos se resuelven acá en el server y se pasan por props.
async function getMegaMenuTexts(): Promise<MegaMenuTexts> {
  const [
    catalog,
    helpCta,
    helpChip,
    occasionsTitle,
    viewAll,
    viewAllMobile,
    accountTitle,
    accountMobile,
    admin,
    login,
    signup,
  ] = await Promise.all([
    cmsMenuText("header.menu.catalog", "Catálogo"),
    cmsMenuText("header.menu.help-cta", "¿Te ayudamos a elegir?"),
    cmsMenuText("header.menu.help-chip", "¿Te ayudamos?"),
    cmsMenuText("header.menu.occasions-title", "Por ocasión"),
    cmsMenuText("header.menu.view-all", "Ver todo el catálogo →"),
    cmsMenuText("header.menu.view-all-mobile", "Ver todo el catálogo"),
    cmsMenuText("header.menu.account", "Tu cuenta"),
    cmsMenuText("header.menu.account-mobile", "Mi cuenta"),
    cmsMenuText("header.menu.admin", "Panel admin"),
    cmsMenuText("header.menu.login", "Ingresar"),
    cmsMenuText("header.menu.signup", "Crear cuenta"),
  ]);
  return {
    catalog,
    helpCta,
    helpChip,
    occasionsTitle,
    viewAll,
    viewAllMobile,
    accountTitle,
    accountMobile,
    admin,
    login,
    signup,
  };
}

export async function SiteHeader() {
  const sessionId = await peekCartSession();
  const [session, authUser, admin, categoryTree, ocasiones, megaMenuTexts, siteLogo] =
    await Promise.all([
      getCurrentCustomer(),
      getCurrentUser(),
      getCurrentAdmin(),
      getCategoryTree(),
      listOcasiones(),
      getMegaMenuTexts(),
      getCmsImage("site.logo"),
    ]);
  const cartCount = sessionId ? await getCartItemCount(sessionId, session?.customer.id ?? null) : 0;
  const isAuthenticated = Boolean(authUser);

  // Chips "Por ocasión" del mega-menú (SEO-002, auditoría 2026-10-28): antes 6
  // slugs quemados con labels CMS; ahora las activas de DB con su nombre real
  // (se editan en /admin/ocasiones). La del mes en curso (monthHint) va primera;
  // el sort es estable → el resto conserva el order del admin. El menú muestra
  // hasta 6; el resto queda en el índice /ocasion.
  const currentMonth = new Date().getMonth() + 1;
  const menuOcasiones = [...ocasiones]
    .sort((a, b) => Number(b.monthHint === currentMonth) - Number(a.monthHint === currentMonth))
    .map((o) => ({ slug: o.slug, name: o.name }));

  return (
    <header className="border-brand-purple/10 sticky top-0 z-40 border-b bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 py-3">
        <BrandMark
          size="sm"
          animated
          logo={siteLogo ? { url: siteLogo.url, alt: siteLogo.alt } : null}
        />

        <nav className="flex items-center gap-1 sm:gap-3">
          {/* Entrada única al catálogo: el mega-menú (trigger "Catálogo").
              Antes había además un link plano "Catálogo" → redundante. */}
          <ShopMegaMenu
            tree={categoryTree}
            ocasiones={menuOcasiones}
            isLoggedIn={isAuthenticated}
            isAdmin={!!admin}
            texts={megaMenuTexts}
          />

          <Hint content="Te ayudamos a elegir en 4 preguntas">
            <Link
              href="/recomendador"
              className="bg-brand-purple/10 text-brand-purple-dark hover:bg-brand-purple/20 hidden min-h-10 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors sm:inline-flex"
            >
              <Sparkles className="h-3.5 w-3.5" />{" "}
              <CmsText blockKey="header.menu.help-cta" fallback="¿Te ayudamos a elegir?" />
            </Link>
          </Hint>

          <GlobalSearch />

          {/* Seguimiento de pedido sin cuenta (Lucy 2026-08-11): estaba solo en
              el footer y los invitados no lo encontraban. Ícono directo junto
              al carrito, visible en móvil y desktop. */}
          <Hint content="Rastrear mi pedido">
            <Link
              href="/rastrear"
              className="text-brand-purple-dark hover:text-brand-purple inline-flex min-h-10 min-w-10 items-center justify-center p-2"
              aria-label="Rastrear mi pedido"
            >
              <Truck className="h-5 w-5" />
            </Link>
          </Hint>

          <Link
            href="/carrito"
            className="text-brand-purple-dark hover:text-brand-purple relative inline-flex min-h-10 min-w-10 items-center justify-center p-2"
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
            href={isAuthenticated ? "/mi-cuenta" : "/login"}
            className="text-brand-purple-dark hover:text-brand-purple inline-flex min-h-10 min-w-10 items-center justify-center p-2 sm:hidden"
            aria-label={isAuthenticated ? "Mi cuenta" : "Ingresar a mi cuenta"}
          >
            <User className="h-5 w-5" />
          </Link>

          {admin && (
            <Link
              href="/admin/dashboard"
              // prefetch={false} (2026-10-22, ADR-162): un prefetch a /admin/*
              // dispara el idle-timeout del panel en el proxy y su revocación
              // mata la sesión ENTERA (tienda incluida). En Next 16 el proxy no
              // puede distinguir prefetch de navegación real (los headers Flight
              // se eliminan antes de llegar al proxy), así que la única vía
              // segura es NO prefetchar los enlaces al panel.
              prefetch={false}
              className="text-brand-purple-dark bg-brand-yellow/30 hover:bg-brand-yellow/50 hidden rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wider uppercase transition-colors sm:inline-flex"
            >
              <CmsText blockKey="header.menu.admin" fallback="Panel admin" />
            </Link>
          )}

          {isAuthenticated ? (
            <>
              <Link
                href="/mi-cuenta"
                className="text-brand-purple-dark hover:text-brand-purple hidden text-sm font-medium sm:inline"
              >
                Hola, <span className="font-semibold">{session?.customer.firstName ?? "tú"}</span>
              </Link>
              <form action={logoutAction}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-brand-purple-dark hover:text-brand-purple"
                >
                  <CmsText blockKey="header.menu.logout" fallback="Salir" />
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-brand-purple-dark hover:text-brand-purple -my-2 hidden min-h-10 items-center text-sm font-medium sm:inline-flex"
              >
                <CmsText blockKey="header.menu.login" fallback="Ingresar" />
              </Link>
              <Link
                href="/registro"
                className="bg-brand-purple hover:bg-brand-purple-dark hidden rounded-md px-3 py-1.5 text-sm font-semibold text-white transition-colors sm:inline-flex"
              >
                <CmsText blockKey="header.menu.signup" fallback="Crear cuenta" />
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
