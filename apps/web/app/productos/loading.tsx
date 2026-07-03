/*
 * Loading skeleton para /productos.
 *
 * Aparece automáticamente mientras Next streamea el contenido SSR.
 * Mantiene la estructura del page (sidebar + grid) para evitar layout
 * shift al transicionar.
 */

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LucamsLogo } from "@/components/lucams-logo";

export default function Loading() {
  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8">
            <div className="bg-brand-purple/10 h-10 w-64 animate-pulse rounded-md" />
            <div className="bg-brand-purple/10 mt-3 h-4 w-96 max-w-full animate-pulse rounded-md" />
          </header>

          <div className="flex flex-col gap-6 lg:flex-row">
            <aside className="border-brand-purple/10 hidden h-fit w-72 flex-shrink-0 rounded-xl border bg-white p-5 lg:block">
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="bg-brand-purple/10 h-3 w-20 animate-pulse rounded" />
                    <div className="bg-brand-purple/10 h-9 w-full animate-pulse rounded-md" />
                  </div>
                ))}
              </div>
            </aside>

            <div className="flex-1">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="border-brand-purple/10 overflow-hidden rounded-xl border bg-white"
                  >
                    <div className="from-brand-turquoise/15 via-brand-cream to-brand-pink/15 aspect-square w-full animate-pulse bg-gradient-to-br" />
                    <div className="space-y-2 p-3">
                      <div className="bg-brand-purple/10 h-3 w-1/3 animate-pulse rounded" />
                      <div className="bg-brand-purple/10 h-4 w-full animate-pulse rounded" />
                      <div className="bg-brand-purple/10 h-5 w-1/2 animate-pulse rounded" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex flex-col items-center text-center">
                <LucamsLogo variant="full" size={70} className="opacity-50" />
                <p className="text-brand-muted mt-2 text-xs">Lucams está armando esto…</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
