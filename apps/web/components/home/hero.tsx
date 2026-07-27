/*
 * Hero kawaii — mascote + headline + dual CTA + blobs decorativos.
 *
 * Todo el copy viene del CMS con fallback hardcoded. Lucy edita
 * desde /admin/contenido > Bloques: home.hero.*
 *
 * Móvil: logo más pequeño + CTAs visibles sin scroll (above the fold).
 * Desktop: layout 2-col más espacioso.
 */

import Link from "next/link";
import { LucamsLogo } from "@/components/lucams-logo";
import { CmsText } from "@/components/cms/cms-text";
import { getSettingValue } from "@/lib/cms";

export async function HomeHero() {
  // #3 — mismo toggle que usa el checkout (/admin/contenido/configuracion → SiteSetting
  // COD_ENABLED, invalida tag "cms"). Si Lucy apaga COD, el chip NO se renderiza en ningún
  // modo: prometer contraentrega apagada es peor que no decir nada (bug 2026-07: en modo
  // catálogo el fallback ignoraba el toggle y el chip quedaba visible).
  const codEnabled = (await getSettingValue("COD_ENABLED", "true")) === "true";

  return (
    <section className="relative overflow-hidden">
      {/* Blobs decorativos brand */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-brand-turquoise/25 absolute -top-20 -left-20 h-72 w-72 rounded-full blur-3xl" />
        <div className="bg-brand-pink/25 absolute top-10 -right-20 h-80 w-80 rounded-full blur-3xl" />
        <div className="bg-brand-yellow/20 absolute -bottom-24 left-1/3 h-64 w-64 rounded-full blur-3xl" />
      </div>

      <div className="grid items-center gap-4 px-2 py-6 sm:gap-8 sm:py-12 md:grid-cols-2 md:py-16 lg:py-20">
        <div className="order-1 flex justify-center md:order-2">
          <div className="motion-safe:animate-[var(--animate-float)] motion-safe:[animation-duration:4s]">
            <LucamsLogo variant="full" size={140} priority className="drop-shadow-xl md:hidden" />
            <LucamsLogo
              variant="full"
              size={280}
              priority
              className="hidden drop-shadow-2xl md:block"
            />
          </div>
        </div>

        <div className="order-2 space-y-4 text-center sm:space-y-6 md:order-1 md:text-left">
          <span className="bg-brand-purple/10 text-brand-purple-dark inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-wider uppercase">
            <CmsText blockKey="home.hero.badge" fallback="✨ Hecho a mano en Bogotá" />
          </span>
          <h1 className="font-display text-brand-purple-dark text-3xl leading-tight sm:text-5xl md:text-6xl">
            <CmsText blockKey="home.hero.title-prefix" fallback="Tus recuerdos, " />
            <span className="text-brand-pink">
              <CmsText blockKey="home.hero.title-accent" fallback="en imán" />
            </span>
            .
          </h1>
          <p className="text-brand-purple-dark/80 mx-auto max-w-lg text-base leading-relaxed sm:text-lg md:mx-0">
            <CmsText
              blockKey="home.hero.description"
              fallback="Fotoimanes, recuerdos para eventos, calendarios y planners magnéticos personalizables. Entrega a 1.100+ destinos de Colombia."
            />
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 md:justify-start">
            <Link
              href="/productos"
              className="bg-brand-purple hover:bg-brand-purple-dark inline-block rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors sm:px-6 sm:py-3 sm:text-base"
            >
              <CmsText blockKey="home.hero.cta-primary" fallback="Ver catálogo →" />
            </Link>
            {/* #1 — antes salía a WhatsApp; ahora entra al catálogo de productos PERSONALIZABLES
              (cuyos PDP abren el Estudio en vivo). La home ya no saca al cliente del flujo. */}
            <Link
              href="/productos?personalizable=1"
              className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 inline-block rounded-full border bg-white px-5 py-2.5 text-sm font-semibold transition-colors sm:px-6 sm:py-3 sm:text-base"
            >
              <CmsText blockKey="home.hero.cta-secondary" fallback="Personalizar el mío" />
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs font-medium md:justify-start">
            <span className="bg-brand-turquoise/20 text-brand-purple-dark rounded-full px-3 py-1">
              <CmsText blockKey="home.hero.chip-studio" fallback="Estudio de diseño en vivo ✨" />
            </span>
            {codEnabled && (
              <span className="bg-brand-coral/20 text-brand-purple-dark rounded-full px-3 py-1">
                {/* #3 — el chip promete contraentrega SOLO si el toggle COD_ENABLED está activo
                  (ADR-055); apagado, el chip no se muestra en absoluto (ni en catálogo ni en full). */}
                <CmsText blockKey="home.hero.chip-cod" fallback="Pago contraentrega disponible" />
              </span>
            )}
            <span className="bg-brand-yellow/30 text-brand-purple-dark rounded-full px-3 py-1">
              {/* El compromiso propio es el DESPACHO+ENTREGA (máx. 3 días hábiles: 2 de fabricación +
                  1 de entrega). El tránsito final lo pone la transportadora y cambia según la ciudad. */}
              <CmsText
                blockKey="home.hero.chip-eta"
                fallback="Entrega en máx. 3 días hábiles"
              />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
