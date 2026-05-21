/*
 * Layout para /checkout/* — header minimal sin nav (cliente debe enfocarse
 * en completar la compra), footer mínimo con badges de confianza.
 *
 * NO usamos SiteHeader/SiteFooter completos para reducir distracciones
 * (best practice e-commerce: en checkout esconder mega-menú + categorías).
 */

import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { LucamsLogo } from "@/components/lucams-logo";

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="from-brand-cream via-brand-cream/50 flex min-h-full flex-col bg-gradient-to-br to-white">
      {/* Header minimal */}
      <header className="border-brand-purple/10 sticky top-0 z-40 border-b bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            aria-label="Volver al inicio"
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
            <span className="hidden sm:inline">Volver al carrito</span>
            <span className="sm:hidden">Carrito</span>
          </Link>

          <div className="text-brand-purple-dark/55 hidden items-center gap-1.5 text-xs font-medium md:inline-flex">
            <Lock className="h-3.5 w-3.5" />
            Compra segura
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>

      {/* Footer minimal con badges */}
      <footer className="border-brand-purple/10 mt-auto border-t bg-white/60 py-5 backdrop-blur-sm">
        <div className="text-brand-purple-dark/65 mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 text-xs sm:justify-between sm:px-6">
          <div className="flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            Pago seguro Wompi · Envío Aveonline
          </div>
          <div className="flex gap-4">
            <Link href="/legal/terminos" className="hover:text-brand-purple-dark">
              Términos
            </Link>
            <Link href="/legal/privacidad" className="hover:text-brand-purple-dark">
              Privacidad
            </Link>
            <Link href="/legal/garantias" className="hover:text-brand-purple-dark">
              Garantías
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
