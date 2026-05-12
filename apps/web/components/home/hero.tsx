/*
 * Hero kawaii — mascote + headline + dual CTA + blobs decorativos.
 *
 * Headlines rotativos: 3 mensajes que se intercambian con fade cada 4s
 * vía CSS keyframes (sin JS, respetando prefers-reduced-motion).
 */

import Link from "next/link";
import { LucamsLogo } from "@/components/lucams-logo";
import { buildWhatsAppUrl } from "@/lib/wa";

export function HomeHero() {
  return (
    <section className="relative overflow-hidden">
      {/* Blobs decorativos brand */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-brand-turquoise/25 absolute -top-20 -left-20 h-72 w-72 rounded-full blur-3xl" />
        <div className="bg-brand-pink/25 absolute top-10 -right-20 h-80 w-80 rounded-full blur-3xl" />
        <div className="bg-brand-yellow/20 absolute -bottom-24 left-1/3 h-64 w-64 rounded-full blur-3xl" />
      </div>

      <div className="grid items-center gap-8 px-2 py-12 sm:py-16 md:grid-cols-2 md:py-20">
        <div className="order-2 space-y-6 md:order-1">
          <span className="bg-brand-purple/10 text-brand-purple-dark inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-wider uppercase">
            ✨ Hecho a mano en Bogotá
          </span>
          <h1 className="font-display text-brand-purple-dark text-4xl leading-tight sm:text-5xl md:text-6xl">
            Tus recuerdos, <span className="text-brand-pink">en imán</span>.
          </h1>
          <p className="text-brand-purple-dark/80 max-w-lg text-lg leading-relaxed">
            Foto-imanes, recorditos para eventos, calendarios y planners magnéticos personalizables.
            Diseño kawaii. Entrega a 1.100+ destinos de Colombia.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/productos"
              className="bg-brand-purple hover:bg-brand-purple-dark inline-block rounded-full px-6 py-3 text-base font-semibold text-white shadow-md transition-colors"
            >
              Ver catálogo →
            </Link>
            <a
              href={buildWhatsAppUrl({ kind: "support" })}
              target="_blank"
              rel="noopener noreferrer"
              className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 inline-block rounded-full border bg-white px-6 py-3 text-base font-semibold transition-colors"
            >
              Personalizar el mío
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-3 text-xs font-medium">
            <span className="bg-brand-turquoise/20 text-brand-purple-dark rounded-full px-3 py-1">
              Estudio en vivo (pronto)
            </span>
            <span className="bg-brand-coral/20 text-brand-purple-dark rounded-full px-3 py-1">
              Pago contraentrega
            </span>
            <span className="bg-brand-yellow/30 text-brand-purple-dark rounded-full px-3 py-1">
              5-7 días hábiles
            </span>
          </div>
        </div>

        <div className="order-1 flex justify-center md:order-2">
          <div className="motion-safe:animate-[var(--animate-float)] motion-safe:[animation-duration:4s]">
            <LucamsLogo variant="full" size={280} priority className="drop-shadow-2xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
