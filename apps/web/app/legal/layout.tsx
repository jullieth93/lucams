/*
 * Layout para páginas legales.
 *
 * Usa SiteHeader + SiteFooter del storefront. Restringe ancho para
 * legibilidad de texto largo (max-w-3xl).
 */

import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="contenido" tabIndex={-1} className="bg-brand-cream flex-1 px-6 py-10 sm:px-10 sm:py-16">
        <article className="prose prose-headings:font-display prose-headings:text-brand-purple-dark prose-a:text-brand-purple mx-auto max-w-3xl">
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
