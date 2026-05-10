/*
 * Layout para el flujo de autenticación.
 *
 * Aplica a /login, /registro, /recuperar-password y derivados. Identidad
 * Lucams (kawaii, paleta brand, Fredoka) — OPUESTO al minimalismo blanco
 * de magneticas.cl per CLAUDE.md mandato de branding.
 *
 * Estructura:
 *  - Fondo gradiente cream → light-purple (sin imagen — vector puro).
 *  - Wordmark "Lucams" arriba en Fredoka brand-purple.
 *  - Card centered (max-w-md) con sombra suave.
 *  - Footer mínimo con link a inicio.
 *
 * Pendiente cuando lleguen assets reales:
 *  - SVG del logo (insignia mapache) en lugar del wordmark text-only.
 *  - Ilustración mascota mapache decorativa en esquina.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-cream via-white to-brand-purple/10 flex flex-col">
      <header className="px-6 py-6 sm:px-10">
        <Link
          href="/"
          className="inline-flex items-baseline gap-2 group"
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

      <main className="flex-1 flex items-center justify-center px-4 pb-12 sm:pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="px-6 py-6 text-center text-sm text-muted-foreground">
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
