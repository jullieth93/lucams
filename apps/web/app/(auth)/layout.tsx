/*
 * Layout para el flujo de autenticación.
 *
 * Identidad Lucams (kawaii, paleta brand, Fredoka) — opuesto al
 * minimalismo blanco de magneticas.cl.
 *
 * Decoración:
 *  - Fondo gradiente cream → white → light-purple.
 *  - <AuthScene variant="light">: blobs de marca en deriva lenta + destellos
 *    que titilan (CSS puro en globals.css — sin JS, reduced-motion safe).
 *  - BrandMark animado en el header (insignia + wordmark unificados).
 *  - Entrada animada de la tarjeta (.auth-card-in).
 *  - Footer mínimo con link a WhatsApp.
 */

import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { AuthScene } from "@/components/auth/auth-scene";
import { buildWhatsAppUrl } from "@/lib/wa";
import { getAuthTexts } from "./auth-texts.server";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // Roadmap B7 — textos del marco de auth administrables desde /admin/contenido.
  const [waSupportUrl, texts] = await Promise.all([
    buildWhatsAppUrl({ kind: "support" }),
    getAuthTexts(),
  ]);
  return (
    <div className="from-brand-cream to-brand-purple/10 relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br via-white">
      {/* Fondo vivo compartido: blobs en deriva + destellos (CSS, reduced-motion safe) */}
      <AuthScene variant="light" />

      <header className="relative z-10 px-6 py-6 sm:px-10">
        <BrandMark size="md" animated />
      </header>

      <main
        id="contenido"
        tabIndex={-1}
        className="relative z-10 flex flex-1 items-center justify-center px-4 pb-12 sm:pb-16"
      >
        {/* Entrada animada de la tarjeta (auth-card-in, globals.css) */}
        <div className="auth-card-in w-full max-w-md">{children}</div>
      </main>

      <footer className="text-muted-foreground relative z-10 px-6 py-6 text-center text-sm">
        <p>
          {texts.layout.helpText}{" "}
          <a
            className="text-brand-pink-ink hover:text-brand-coral-ink font-medium underline-offset-4 hover:underline"
            href={waSupportUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {texts.layout.helpCta}
          </a>
        </p>
      </footer>
    </div>
  );
}
