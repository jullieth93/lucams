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
import { buildWhatsAppUrl } from "@/lib/wa";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const waSupportUrl = await buildWhatsAppUrl({ kind: "support" });
  return (
    <div className="from-brand-cream to-brand-purple/10 relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br via-white">
      {/* Blobs de color para profundidad — pointer-events-none */}
      <div
        aria-hidden="true"
        className="bg-brand-pink/15 pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden="true"
        className="bg-brand-turquoise/15 pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full blur-3xl"
      />

      <header className="relative z-10 px-6 py-6 sm:px-10">
        <BrandMark size="md" animated />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-12 sm:pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="text-muted-foreground relative z-10 px-6 py-6 text-center text-sm">
        <p>
          ¿Necesitas ayuda?{" "}
          <a
            className="text-brand-pink hover:text-brand-coral font-medium underline-offset-4 hover:underline"
            href={waSupportUrl}
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
