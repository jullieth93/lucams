/*
 * 404 — Página no encontrada.
 *
 * Empty state kawaii con mascote confundido + CTA para volver a tierra
 * conocida. Renderizado por Next.js cuando una ruta no matchea.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { LucamsLogo } from "@/components/lucams-logo";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-cream px-6 py-16 text-center">
      <div className="motion-safe:animate-[var(--animate-float)] motion-safe:[animation-duration:3s]">
        <LucamsLogo variant="full" size={140} className="drop-shadow-md" />
      </div>

      <h1 className="mt-8 font-display text-3xl text-brand-purple-dark sm:text-5xl">
        Esta página se nos perdió 👀
      </h1>
      <p className="mt-3 max-w-md text-base text-brand-purple-dark/70">
        Probablemente cambiamos algo de lugar o el link tiene un typo.
        Te ayudamos a volver:
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/productos"
          className="rounded-full bg-brand-purple px-6 py-3 text-base font-semibold text-white shadow-md transition-colors hover:bg-brand-purple-dark"
        >
          Ver catálogo →
        </Link>
        <Link
          href="/"
          className="rounded-full border border-brand-purple/30 bg-white px-6 py-3 text-base font-semibold text-brand-purple-dark hover:bg-brand-purple/5"
        >
          Volver al inicio
        </Link>
      </div>

      <p className="mt-10 text-sm text-brand-purple-dark/60">
        ¿Buscabas algo en particular?{" "}
        <Link href="/contacto" className="font-medium text-brand-purple hover:underline">
          Contanos
        </Link>{" "}
        y te ayudamos.
      </p>
    </div>
  );
}
