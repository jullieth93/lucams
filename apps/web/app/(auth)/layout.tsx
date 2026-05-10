/*
 * Layout para el flujo de autenticación.
 *
 * Identidad Lucams (kawaii, paleta brand, Fredoka) — opuesto al
 * minimalismo blanco de magneticas.cl.
 *
 * Decoración:
 *  - Fondo gradiente cream → white → light-purple (sin imagen — vector puro).
 *  - Wordmark "Lucams shop" arriba.
 *  - Mascota mapache animada en esquina (placeholder emoji 🦝 + animación
 *    CSS sutil — wiggle/peek). Reemplazable por SVG/imagen real más tarde.
 *  - Footer mínimo con link a WhatsApp.
 *
 * Animaciones respetan `prefers-reduced-motion` (todas usan `motion-safe:`).
 */

import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-brand-cream via-white to-brand-purple/10 flex flex-col">
      {/* Decoración: blobs suaves de color de fondo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-pink/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-brand-turquoise/15 blur-3xl"
      />

      <header className="relative z-10 px-6 py-6 sm:px-10">
        <Link
          href="/"
          className="inline-flex items-baseline gap-2 group transition-transform hover:-translate-y-0.5"
          aria-label="Inicio Lucams_shop"
        >
          <span className="font-display text-2xl font-bold tracking-tight text-brand-purple-dark group-hover:text-brand-purple transition-colors">
            Lucams
          </span>
          <span className="font-display text-lg text-brand-pink group-hover:text-brand-coral transition-colors">
            shop
          </span>
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-12 sm:pb-16">
        <div className="relative w-full max-w-md">
          {/* Mascota decorativa — emoji 🦝 con bounce sutil. Placeholder
              hasta tener asset real. Solo desktop+ (sm:) para no robar
              espacio en móvil. */}
          <span
            aria-hidden="true"
            className="hidden sm:block absolute -top-12 -right-4 text-5xl motion-safe:animate-bounce motion-safe:[animation-duration:3s] origin-bottom"
            style={{ filter: "drop-shadow(0 4px 6px rgba(124, 106, 173, 0.2))" }}
          >
            🦝
          </span>
          {children}
        </div>
      </main>

      <footer className="relative z-10 px-6 py-6 text-center text-sm text-muted-foreground">
        <p>
          ¿Necesitas ayuda?{" "}
          <a
            className="font-medium text-brand-pink hover:text-brand-coral underline-offset-4 hover:underline"
            href="https://wa.me/573150718723"
            target="_blank"
            rel="noopener noreferrer"
          >
            Escríbenos por WhatsApp
          </a>
        </p>
      </footer>
    </div>
  );
}
