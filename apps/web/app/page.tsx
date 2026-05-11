/*
 * Home page — placeholder Lucams_shop.
 *
 * Esta es la página inicial del scaffolding Fase 1. Se reemplazará en Fase 2
 * (storefront público) con el hero real + categorías destacadas + productos.
 *
 * Por ahora confirma que:
 *  - Tipografías Fredoka (display) + Inter (body) cargan vía next/font/google.
 *  - Tokens Lucams (brand-purple, brand-turquoise, brand-pink, brand-yellow)
 *    están disponibles como utilidades Tailwind v4.
 *  - Identidad de marca kawaii visible desde el primer commit.
 *  - SiteHeader dinámico — muestra login/registro o nombre+logout según sesión.
 */

import { RaccoonFace } from "@/components/brand-mark";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center bg-brand-cream px-6 py-16">
      <div className="max-w-2xl text-center">
        <span
          aria-hidden="true"
          className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full bg-brand-purple shadow-lg ring-4 ring-brand-yellow motion-safe:animate-[var(--animate-float)] motion-safe:[animation-duration:3s]"
        >
          <RaccoonFace />
        </span>

        <h1 className="text-4xl font-display text-brand-purple-dark sm:text-5xl">
          Lucams<span className="text-brand-pink">_shop</span>
        </h1>

        <p className="mt-4 text-lg leading-relaxed text-foreground/80">
          E-commerce colombiano de imanes magnéticos personalizados.
          <br />
          <span className="font-medium text-brand-purple-dark">
            Tus recuerdos, en imán.
          </span>
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm font-medium">
          <span className="rounded-full bg-brand-turquoise/20 px-4 py-1.5 text-brand-purple-dark">
            Estudio de personalización en vivo
          </span>
          <span className="rounded-full bg-brand-coral/20 px-4 py-1.5 text-brand-purple-dark">
            Pago contraentrega
          </span>
          <span className="rounded-full bg-brand-yellow/30 px-4 py-1.5 text-brand-purple-dark">
            1.100+ destinos en Colombia
          </span>
        </div>

        <p className="mt-12 text-sm text-muted-foreground">
          <span aria-hidden="true" className="text-brand-coral">●</span>{" "}
          Sitio en desarrollo. Volvemos pronto con el catálogo completo.
          <br />
          Mientras tanto, escribinos en{" "}
          <a
            href="https://www.instagram.com/lucams_shop"
            className="text-brand-purple underline-offset-4 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram @lucams_shop
          </a>
          .
        </p>
      </div>
      </main>
    </div>
  );
}
