/*
 * 404 — Página no encontrada.
 *
 * Empty state kawaii con mascote confundido + CTA para volver a tierra
 * conocida. Renderizado por Next.js cuando una ruta no matchea.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { LucamsLogo } from "@/components/lucams-logo";
import { CmsText } from "@/components/cms/cms-text";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="bg-brand-cream flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <div className="motion-safe:animate-[var(--animate-float)] motion-safe:[animation-duration:3s]">
        <LucamsLogo variant="full" size={140} className="drop-shadow-md" />
      </div>

      <h1 className="font-display text-brand-purple-dark mt-8 text-3xl sm:text-5xl">
        <CmsText blockKey="error.404.title" fallback="Esta página se nos perdió 👀" />
      </h1>
      <p className="text-brand-purple-dark/70 mt-3 max-w-md text-base">
        <CmsText
          blockKey="error.404.description"
          fallback="Probablemente cambiamos algo de lugar o el link tiene un typo. Te ayudamos a volver:"
        />
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/productos"
          className="bg-brand-purple hover:bg-brand-purple-dark rounded-full px-6 py-3 text-base font-semibold text-white shadow-md transition-colors"
        >
          Ver catálogo →
        </Link>
        <Link
          href="/"
          className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 rounded-full border bg-white px-6 py-3 text-base font-semibold"
        >
          Volver al inicio
        </Link>
      </div>

      <p className="text-brand-purple-dark/60 mt-10 text-sm">
        ¿Buscabas algo en particular?{" "}
        <Link href="/contacto" className="text-brand-purple font-medium hover:underline">
          Cuéntanos
        </Link>{" "}
        y te ayudamos.
      </p>
    </div>
  );
}
