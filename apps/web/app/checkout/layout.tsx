/*
 * Layout para /checkout/* — header minimal sin nav (cliente debe enfocarse
 * en completar la compra), footer mínimo con badges de confianza.
 *
 * NO usamos SiteHeader/SiteFooter completos para reducir distracciones
 * (best practice e-commerce: en checkout esconder mega-menú + categorías).
 */

import Link from "next/link";
import { ArrowLeft, Lock, MessageCircle } from "lucide-react";
import { LucamsLogo } from "@/components/lucams-logo";
import { isCatalogMode } from "@/lib/store-mode";
import { getCheckoutTexts } from "./checkout-texts.server";

export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  // Roadmap B8 — textos del marco del checkout administrables desde /admin/contenido.
  const texts = await getCheckoutTexts();

  return (
    <div className="from-brand-cream via-brand-cream/50 flex min-h-full flex-col bg-gradient-to-br to-white">
      {/* Header minimal */}
      <header className="border-brand-purple/10 sticky top-0 z-40 border-b bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            aria-label={texts.layout.backHome}
          >
            <LucamsLogo className="h-8 w-8" />
            <span className="font-display text-brand-purple-dark hidden text-lg font-bold sm:inline">
              Lucams
            </span>
          </Link>

          <Link
            href="/carrito"
            className="text-brand-purple-dark/70 hover:text-brand-purple-dark inline-flex items-center gap-1.5 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{texts.layout.backCart}</span>
            <span className="sm:hidden">{texts.layout.cartShort}</span>
          </Link>

          <div className="text-brand-muted hidden items-center gap-1.5 text-xs font-medium md:inline-flex">
            <Lock className="h-3.5 w-3.5" />
            {/* Modo catálogo no procesa pagos: el badge promete cotización, no
                "compra" (mismo gate por modo que el footer de abajo). */}
            {isCatalogMode() ? texts.layout.secureCatalog : texts.layout.secure}
          </div>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>

      {/* Footer minimal con badges */}
      <footer className="border-brand-purple/10 mt-auto border-t bg-white/60 py-5 backdrop-blur-sm">
        <div className="text-brand-muted mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 text-xs sm:justify-between sm:px-6">
          <div className="flex items-center gap-1.5">
            {isCatalogMode() ? (
              <>
                <MessageCircle className="h-3 w-3" />
                {texts.layout.footerCatalog}
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" />
                {texts.layout.footerPayments}
              </>
            )}
          </div>
          <div className="flex gap-4">
            <Link href="/legal/terminos" className="hover:text-brand-purple-dark">
              {texts.layout.linkTerminos}
            </Link>
            <Link href="/legal/privacidad" className="hover:text-brand-purple-dark">
              {texts.layout.linkPrivacidad}
            </Link>
            <Link href="/legal/garantias" className="hover:text-brand-purple-dark">
              {texts.layout.linkGarantias}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
