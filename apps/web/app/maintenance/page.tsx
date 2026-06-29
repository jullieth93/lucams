/*
 * /maintenance — Página mostrada cuando el sitio está en modo
 * mantenimiento (env var NEXT_PUBLIC_MAINTENANCE_MODE=1).
 *
 * El gate vive en proxy.ts (sub-bloque F lo cablea para redirect
 * global excepto /admin/* y /api/health/*).
 *
 * Mascote durmiendo + copy editable desde CMS.
 */

import type { Metadata } from "next";
import { LucamsLogo } from "@/components/lucams-logo";
import { CmsText } from "@/components/cms/cms-text";

export const metadata: Metadata = {
  title: "En mantenimiento",
  robots: { index: false, follow: false },
};

// CSP por nonce (C3): requiere render dinámico (los scripts necesitan el nonce).
export const dynamic = "force-dynamic";

export default function MaintenancePage() {
  return (
    <div className="bg-brand-cream flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <div className="motion-safe:animate-[var(--animate-float)] motion-safe:[animation-duration:4s]">
        <LucamsLogo variant="full" size={160} className="drop-shadow-md" />
      </div>
      <h1 className="font-display text-brand-purple-dark mt-8 text-3xl sm:text-5xl">
        <CmsText blockKey="maintenance.title" fallback="Estamos puliendo unos detalles ✨" />
      </h1>
      <p className="text-brand-purple-dark/70 mt-4 max-w-md text-base">
        <CmsText
          blockKey="maintenance.description"
          fallback="Volvemos en unas horas con todo brillando. Mientras tanto, escríbenos por WhatsApp si necesitas ayuda urgente."
        />
      </p>
      <p className="text-brand-purple-dark/50 mt-8 text-xs">
        Mantenimiento programado · {new Date().toLocaleString("es-CO", { dateStyle: "medium" })}
      </p>
    </div>
  );
}
