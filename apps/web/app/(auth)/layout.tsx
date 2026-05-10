/*
 * Layout para el flujo de autenticación.
 *
 * Identidad Lucams (kawaii, paleta brand, Fredoka) — opuesto al
 * minimalismo blanco de magneticas.cl.
 *
 * Decoración:
 *  - Fondo gradiente cream → white → light-purple.
 *  - Blobs de color (brand-pink + brand-turquoise) difuminados para
 *    profundidad — pointer-events-none para no robar clicks.
 *  - BrandMark animado en el header (insignia + wordmark unificados).
 *    Reemplaza el emoji flotante decorativo previo (feedback Lucy:
 *    "queda muy al lado y no se nota — simular el logo en movimiento").
 *  - Footer mínimo con link a WhatsApp.
 *
 * Animaciones respetan `prefers-reduced-motion` vía `motion-safe:`.
 */

import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-brand-cream via-white to-brand-purple/10 flex flex-col">
      {/* Blobs de color para profundidad — pointer-events-none */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-pink/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-brand-turquoise/15 blur-3xl"
      />

      <header className="relative z-10 px-6 py-6 sm:px-10">
        <BrandMark size="md" animated />
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-12 sm:pb-16">
        <div className="w-full max-w-md">{children}</div>
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
