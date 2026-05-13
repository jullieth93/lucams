/*
 * Loading skeleton para PDP /producto/[slug].
 */

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LucamsLogo } from "@/components/lucams-logo";

export default function Loading() {
  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="bg-brand-purple/10 mb-6 h-3 w-48 animate-pulse rounded" />

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="space-y-3">
              <div className="from-brand-turquoise/15 via-brand-cream to-brand-pink/15 aspect-square w-full animate-pulse rounded-xl bg-gradient-to-br" />
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-brand-purple/10 aspect-square w-full animate-pulse rounded-md"
                  />
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <div className="bg-brand-purple/10 h-3 w-20 animate-pulse rounded" />
                <div className="bg-brand-purple/10 h-8 w-3/4 animate-pulse rounded" />
                <div className="bg-brand-purple/10 h-6 w-32 animate-pulse rounded-full" />
              </div>
              <div className="bg-brand-purple/10 h-9 w-40 animate-pulse rounded" />
              <div className="space-y-2">
                <div className="bg-brand-purple/10 h-3 w-full animate-pulse rounded" />
                <div className="bg-brand-purple/10 h-3 w-5/6 animate-pulse rounded" />
                <div className="bg-brand-purple/10 h-3 w-2/3 animate-pulse rounded" />
              </div>
              <div className="bg-brand-purple/10 h-11 w-full animate-pulse rounded-md" />
              <div className="bg-brand-turquoise/10 h-10 w-full animate-pulse rounded-md" />
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center text-center">
            <LucamsLogo variant="full" size={60} className="opacity-50" />
            <p className="text-brand-purple-dark/55 mt-2 text-xs">Cargando producto…</p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
